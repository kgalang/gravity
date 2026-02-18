import process from "node:process";
import { loadConfig } from "./runtime/config.js";
import { parseAgentConfig } from "./runtime/agent-config.js";
import { createDb, destroyDb, gravitySchema } from "./runtime/db.js";
import {
  createEventIdempotencyGuard,
  createKyselyEventIdempotencyRepository,
  type EventIdempotencyGuard,
} from "./runtime/event-idempotency.js";
import {
  runPiAgentTurn,
  summarizeAgentResponseForRunLog,
  type RunPiAgentTurnResult,
} from "./runtime/pi-agent-runner.js";
import {
  createProactiveTriggerScheduler,
  type ProactiveTriggerFireEvent,
  type ProactiveTriggerScheduler,
} from "./runtime/proactive-trigger-scheduler.js";
import {
  composeRunLifecycleLoggers,
  createConsoleRunLifecycleLogger,
  createRunContext,
  withRunLifecycle,
} from "./runtime/run-lifecycle.js";
import {
  createKyselyRunLogRepository,
  createRunLogStore,
  type RunLogStore,
} from "./runtime/run-log-store.js";
import {
  resolveMessageIngress,
  type ActiveAgentIngressRow,
  type MessageEntrypoint,
} from "./runtime/ingress-binding-resolver.js";
import {
  createKyselySessionCatalogRepository,
  createSessionCatalog,
  type SessionMode,
  type SessionCatalog,
} from "./runtime/session-catalog.js";
import {
  type InboundSlackMessage,
  type InboundSlackSlashCommand,
  type SlackSlashCommandAckResponse,
  SlackTransport,
} from "./runtime/slack-transport.js";
import {
  createDefaultSlashCommandAgentMap,
  resolveAgentIdForSlashCommand,
} from "./runtime/slash-command-router.js";
import {
  normalizeProactiveTrigger,
  normalizeSlackMessageTrigger,
  normalizeSlackSlashCommandTrigger,
  normalizeSystemTrigger,
  type NormalizedTrigger,
} from "./runtime/trigger-normalizer.js";

process.loadEnvFile();

const lifecycleLogger = createConsoleRunLifecycleLogger();

const bootstrapTrigger = normalizeSystemTrigger();
const bootstrapRunContext = createRunContext({
  agentId: "system-bootstrap",
  sessionKey: "system-bootstrap:main",
  triggerKind: bootstrapTrigger.triggerKind,
  surface: bootstrapTrigger.surface,
  entrypoint: bootstrapTrigger.entrypoint,
});

let livenessTicker: NodeJS.Timeout | null = null;
let slackTransport: SlackTransport | null = null;
let dbClient: ReturnType<typeof createDb> | null = null;
let runLogStore: RunLogStore | null = null;
let sessionCatalog: SessionCatalog | null = null;
let eventIdempotencyGuard: EventIdempotencyGuard | null = null;
let proactiveTriggerScheduler: ProactiveTriggerScheduler | null = null;
let anthropicApiKey: string | null = null;
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  if (livenessTicker !== null) {
    clearInterval(livenessTicker);
    livenessTicker = null;
  }

  if (proactiveTriggerScheduler !== null) {
    await proactiveTriggerScheduler.stop();
    proactiveTriggerScheduler = null;
  }

  if (slackTransport !== null) {
    await slackTransport.stop();
    slackTransport = null;
  }

  if (dbClient !== null) {
    await destroyDb(dbClient);
    dbClient = null;
  }

  runLogStore = null;
  sessionCatalog = null;
  eventIdempotencyGuard = null;
  anthropicApiKey = null;

  console.log(`[gravity] received ${signal}; shutdown complete`);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

const slashCommandAgentMap = createDefaultSlashCommandAgentMap();
const enableSlackMessageEvents = true;

function logDebug(event: string, payload: Record<string, unknown>): void {
  console.log(`[gravity][debug] ${event} ${JSON.stringify(payload)}`);
}

function createSlashRunId(sourceEventId: string): string {
  return `slack:${sourceEventId}`;
}

function createSlashSessionKey(agentId: string, sourceEventId: string): string {
  return `${agentId}:${sourceEventId}`;
}

function createMessageRunId(sourceEventId: string): string {
  return `slack:${sourceEventId}`;
}

function createProactiveRunId(sourceEventId: string): string {
  return sourceEventId;
}

function createMessageSessionKey(input: {
  agentId: string;
  message: InboundSlackMessage;
  sessionMode: SessionMode;
}): string {
  if (input.sessionMode === "main") {
    return `${input.agentId}:main`;
  }

  if (input.sessionMode === "isolated") {
    return `${input.agentId}:${input.message.sourceEventId}`;
  }

  if (input.message.isDirectMessage) {
    return `${input.agentId}:${input.message.channelId}`;
  }

  return `${input.agentId}:${input.message.threadTs}`;
}

function createProactiveSessionKey(input: {
  agentId: string;
  triggerId: string;
  sourceEventId: string;
  sessionMode: SessionMode;
}): string {
  if (input.sessionMode === "main") {
    return `${input.agentId}:main`;
  }

  if (input.sessionMode === "thread") {
    return `${input.agentId}:proactive:${input.triggerId}:thread`;
  }

  return `${input.agentId}:proactive:${input.triggerId}:${input.sourceEventId}`;
}

async function tryAcquireSourceEventLease(
  sourceEventId: string,
  context: "slash" | "message" | "proactive",
): Promise<boolean> {
  if (!eventIdempotencyGuard) {
    throw new Error("Event idempotency guard is not initialized");
  }

  const acquired = await eventIdempotencyGuard.tryAcquire(sourceEventId);
  if (!acquired) {
    console.log(
      `[gravity] ${context} ignored (duplicate sourceEventId=${sourceEventId})`,
    );
  }

  return acquired;
}

function releaseSourceEventLease(sourceEventId: string): void {
  if (!eventIdempotencyGuard) {
    return;
  }

  eventIdempotencyGuard.release(sourceEventId);
}

async function ensureActiveSlackSession(input: {
  catalog: SessionCatalog;
  sessionKey: string;
  agentId: string;
  mode: SessionMode;
  channelId: string;
  threadTs: string | null;
  ownerUserId: string | null;
  openedByTrigger: NormalizedTrigger["triggerKind"];
}): Promise<void> {
  await input.catalog.ensureSessionActive({
    sessionKey: input.sessionKey,
    agentId: input.agentId,
    mode: input.mode,
    surface: "slack",
    channelId: input.channelId,
    threadTs: input.threadTs,
    ownerUserId: input.ownerUserId,
    openedByTrigger: input.openedByTrigger,
  });
}

type ExecuteAgentRunInput = {
  db: ReturnType<typeof createDb>;
  runLogStore: RunLogStore;
  runId: string;
  agentId: string;
  sessionKey: string;
  prompt: string;
  trigger: NormalizedTrigger;
  lifecycleMetadata: {
    query: string;
    sourceEventId?: string | null;
    channelId?: string | null;
    threadTs?: string | null;
    userId?: string | null;
    policyDecisions?: Record<string, unknown>;
  };
  onResponse: (
    responseText: string,
    runResult: RunPiAgentTurnResult,
  ) => Promise<void> | void;
};

async function executeAgentRun(
  input: ExecuteAgentRunInput,
): Promise<RunPiAgentTurnResult> {
  let resultSummary: string | null = null;
  const runContext = createRunContext({
    runId: input.runId,
    agentId: input.agentId,
    sessionKey: input.sessionKey,
    triggerKind: input.trigger.triggerKind,
    surface: input.trigger.surface,
    entrypoint: input.trigger.entrypoint,
  });
  const persistenceLogger = input.runLogStore.createLifecycleLogger({
    query: input.lifecycleMetadata.query,
    sourceEventId: input.lifecycleMetadata.sourceEventId,
    channelId: input.lifecycleMetadata.channelId,
    threadTs: input.lifecycleMetadata.threadTs,
    userId: input.lifecycleMetadata.userId,
    policyDecisions: input.lifecycleMetadata.policyDecisions,
    getResultSummary: () => resultSummary,
  });

  return withRunLifecycle(
    runContext,
    composeRunLifecycleLoggers([lifecycleLogger, persistenceLogger]),
    async () => {
      const runResult = await runPiAgentTurn({
        db: input.db,
        agentId: input.agentId,
        sessionKey: input.sessionKey,
        prompt: input.prompt,
        anthropicApiKey,
      });

      const responseText = runResult.responseText;
      resultSummary = summarizeAgentResponseForRunLog(responseText);
      await input.onResponse(responseText, runResult);
      return runResult;
    },
  );
}

function buildSlashCommandQuery(command: InboundSlackSlashCommand): string {
  return `${command.command} ${command.text}`.trim();
}

function buildSlashCommandEchoResponse(
  command: InboundSlackSlashCommand,
  agentId: string,
): SlackSlashCommandAckResponse {
  const normalizedText = command.text.length > 0 ? command.text : "(no text)";
  return {
    response_type: "ephemeral",
    text: `Gravity routed ${command.command} to ${agentId}. Replying in thread for: ${normalizedText}`,
  };
}

function buildUnmappedSlashCommandEchoResponse(
  command: InboundSlackSlashCommand,
): SlackSlashCommandAckResponse {
  return {
    response_type: "ephemeral",
    text: `Gravity has no route configured for ${command.command}.`,
  };
}

type SlashCommandDecision = {
  agentId: string | null;
  query: string;
  ackResponse: SlackSlashCommandAckResponse;
};

type MessageDecision = {
  agentId: string | null;
  entrypoint: MessageEntrypoint | null;
  sessionMode: SessionMode | null;
  sessionKeyOverride: string | null;
  query: string;
  route: "binding" | "unmapped";
};

function resolveSlashCommandDecision(
  command: InboundSlackSlashCommand,
): SlashCommandDecision {
  const query = buildSlashCommandQuery(command);
  const agentId = resolveAgentIdForSlashCommand(
    command.command,
    slashCommandAgentMap,
  );
  if (!agentId) {
    return {
      agentId: null,
      query,
      ackResponse: buildUnmappedSlashCommandEchoResponse(command),
    };
  }

  return {
    agentId,
    query,
    ackResponse: buildSlashCommandEchoResponse(command, agentId),
  };
}

function handleSlashCommandAcknowledge(
  command: InboundSlackSlashCommand,
): SlackSlashCommandAckResponse {
  return resolveSlashCommandDecision(command).ackResponse;
}

function buildMessageQuery(message: InboundSlackMessage): string {
  return message.text.trim();
}

async function loadActiveAgentIngressRows(
  dbClient: ReturnType<typeof createDb>,
): Promise<ActiveAgentIngressRow[]> {
  const rows = await gravitySchema(dbClient)
    .selectFrom("agents")
    .select(["id", "channel_id", "config"])
    .where("status", "=", "active")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    channel_id: row.channel_id,
    config: parseAgentConfig(row.config, {
      warn: console.warn,
      context: `agentId=${row.id}`,
    }),
  }));
}

type ActiveThreadSession = {
  session_key: string;
  agent_id: string;
};

async function findActiveThreadSession(
  dbClient: ReturnType<typeof createDb>,
  channelId: string,
  threadTs: string,
): Promise<ActiveThreadSession | null> {
  const row = await gravitySchema(dbClient)
    .selectFrom("sessions")
    .select(["session_key", "agent_id"])
    .where("status", "=", "active")
    .where("channel_id", "=", channelId)
    .where("thread_ts", "=", threadTs)
    .orderBy("last_activity_at", "desc")
    .executeTakeFirst();

  return row ?? null;
}

async function resolveMessageDecision(
  message: InboundSlackMessage,
): Promise<MessageDecision> {
  if (!dbClient) {
    throw new Error("DB client is not initialized");
  }

  const query = buildMessageQuery(message);
  if (query.length === 0) {
    return {
      agentId: null,
      entrypoint: null,
      sessionMode: null,
      sessionKeyOverride: null,
      query,
      route: "unmapped",
    };
  }

  const activeThreadSession =
    message.threadTs !== message.messageTs
      ? await findActiveThreadSession(dbClient, message.channelId, message.threadTs)
      : null;

  const activeAgents = await loadActiveAgentIngressRows(dbClient);
  const resolved = resolveMessageIngress(message, activeAgents, {
    threadOwnerAgentId: activeThreadSession?.agent_id ?? null,
  });

  logDebug("message.resolve", {
    sourceEventId: message.sourceEventId,
    surface: message.surface,
    channelId: message.channelId,
    threadTs: message.threadTs,
    messageTs: message.messageTs,
    userId: message.userId,
    isDirectMessage: message.isDirectMessage,
    activeThreadSessionKey: activeThreadSession?.session_key ?? null,
    activeThreadOwnerAgentId: activeThreadSession?.agent_id ?? null,
    activeAgentCount: activeAgents.length,
    resolvedAgentId: resolved?.agentId ?? null,
    resolvedEntrypoint: resolved?.entrypoint ?? null,
    resolvedSessionMode: resolved?.sessionMode ?? null,
    resolvedRoute: resolved?.route ?? null,
  });

  if (!resolved) {
    return {
      agentId: null,
      entrypoint: null,
      sessionMode: null,
      sessionKeyOverride: null,
      query,
      route: "unmapped",
    };
  }

  const sessionKeyOverride =
    activeThreadSession?.agent_id === resolved.agentId
      ? activeThreadSession.session_key
      : null;

  return {
    agentId: resolved.agentId,
    entrypoint: resolved.entrypoint,
    sessionMode: resolved.sessionMode,
    sessionKeyOverride,
    query,
    route: resolved.route,
  };
}

type PreparedProactiveDelivery = {
  channelId: string;
  threadTs: string | null;
  ownerUserId: string | null;
  policyDecisions: Record<string, unknown>;
};

function truncatePromptForRootMessage(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= 4000) {
    return trimmed;
  }

  return `${trimmed.slice(0, 3997)}...`;
}

async function prepareProactiveDelivery(
  event: ProactiveTriggerFireEvent,
  transport: SlackTransport,
): Promise<PreparedProactiveDelivery> {
  const promptForRootMessage = truncatePromptForRootMessage(event.prompt);
  const rootText = [
    `Running proactive ${event.kind} trigger \`${event.triggerId}\` for ${event.agentId}. Replying in thread.`,
    "Prompt:",
    promptForRootMessage,
  ].join("\n");

  if (event.delivery.mode === "channel_thread") {
    const threadTs = await transport.postChannelMessage(
      event.delivery.channelId,
      rootText,
    );
    return {
      channelId: event.delivery.channelId,
      threadTs,
      ownerUserId: null,
      policyDecisions: {
        proactive_kind: event.kind,
        proactive_trigger_id: event.triggerId,
        delivery_mode: "channel_thread",
        delivery_channel_id: event.delivery.channelId,
      },
    };
  }

  const directMessage = await transport.postDirectMessage(
    event.delivery.userId,
    rootText,
  );
  return {
    channelId: directMessage.channelId,
    threadTs: null,
    ownerUserId: event.delivery.userId,
    policyDecisions: {
      proactive_kind: event.kind,
      proactive_trigger_id: event.triggerId,
      delivery_mode: "dm",
      delivery_user_id: event.delivery.userId,
    },
  };
}

async function deliverProactiveResponse(input: {
  transport: SlackTransport;
  delivery: PreparedProactiveDelivery;
  responseText: string;
}): Promise<void> {
  if (input.delivery.threadTs) {
    await input.transport.postThreadReply(
      input.delivery.channelId,
      input.delivery.threadTs,
      input.responseText,
    );
    return;
  }

  await input.transport.postChannelMessage(
    input.delivery.channelId,
    input.responseText,
  );
}

async function handleProactiveTrigger(
  event: ProactiveTriggerFireEvent,
): Promise<void> {
  if (!runLogStore) {
    throw new Error("Run log store is not initialized");
  }
  if (!sessionCatalog) {
    throw new Error("Session catalog is not initialized");
  }
  if (!dbClient) {
    throw new Error("DB client is not initialized");
  }

  const activeRunLogStore = runLogStore;
  const activeSessionCatalog = sessionCatalog;
  const activeDbClient = dbClient;
  const activeSlackTransport = slackTransport;
  if (!activeSlackTransport) {
    console.log(
      `[gravity] proactive trigger skipped (slack transport unavailable agentId=${event.agentId} triggerId=${event.triggerId})`,
    );
    return;
  }

  const acquired = await tryAcquireSourceEventLease(
    event.sourceEventId,
    "proactive",
  );
  if (!acquired) {
    return;
  }

  try {
    const normalizedTrigger = normalizeProactiveTrigger(event.kind);
    const runId = createProactiveRunId(event.sourceEventId);
    const sessionKey = createProactiveSessionKey({
      agentId: event.agentId,
      triggerId: event.triggerId,
      sourceEventId: event.sourceEventId,
      sessionMode: event.sessionMode,
    });
    const delivery = await prepareProactiveDelivery(event, activeSlackTransport);

    logDebug("proactive.fire", {
      sourceEventId: event.sourceEventId,
      firedAt: event.firedAt.toISOString(),
      agentId: event.agentId,
      triggerId: event.triggerId,
      kind: event.kind,
      sessionMode: event.sessionMode,
      sessionKey,
      deliveryMode: event.delivery.mode,
      channelId: delivery.channelId,
      threadTs: delivery.threadTs,
      ownerUserId: delivery.ownerUserId,
    });

    await ensureActiveSlackSession({
      catalog: activeSessionCatalog,
      sessionKey,
      agentId: event.agentId,
      mode: event.sessionMode,
      channelId: delivery.channelId,
      threadTs: delivery.threadTs,
      ownerUserId: delivery.ownerUserId,
      openedByTrigger: normalizedTrigger.triggerKind,
    });

    const runResult = await executeAgentRun({
      db: activeDbClient,
      runLogStore: activeRunLogStore,
      runId,
      agentId: event.agentId,
      sessionKey,
      prompt: event.prompt,
      trigger: normalizedTrigger,
      lifecycleMetadata: {
        query: event.prompt,
        sourceEventId: event.sourceEventId,
        channelId: delivery.channelId,
        threadTs: delivery.threadTs,
        userId: delivery.ownerUserId,
        policyDecisions: delivery.policyDecisions,
      },
      onResponse: async (responseText) => {
        await deliverProactiveResponse({
          transport: activeSlackTransport,
          delivery,
          responseText,
        });
        await ensureActiveSlackSession({
          catalog: activeSessionCatalog,
          sessionKey,
          agentId: event.agentId,
          mode: event.sessionMode,
          channelId: delivery.channelId,
          threadTs: delivery.threadTs,
          ownerUserId: delivery.ownerUserId,
          openedByTrigger: normalizedTrigger.triggerKind,
        });
      },
    });

    console.log(
      `[gravity] proactive handled ${JSON.stringify({
        sourceEventId: event.sourceEventId,
        agentId: event.agentId,
        triggerId: event.triggerId,
        kind: event.kind,
        runId,
        sessionKey,
        channelId: delivery.channelId,
        threadTs: delivery.threadTs,
        ownerUserId: delivery.ownerUserId,
        modelId: runResult.modelId,
      })}`,
    );
  } finally {
    releaseSourceEventLease(event.sourceEventId);
  }
}

async function handleInboundSlashCommand(
  command: InboundSlackSlashCommand,
): Promise<void> {
  const decision = resolveSlashCommandDecision(command);
  logDebug("slash.resolve", {
    sourceEventId: command.sourceEventId,
    command: command.command,
    channelId: command.channelId,
    userId: command.userId,
    resolvedAgentId: decision.agentId,
    ackResponseType: decision.ackResponse.response_type,
  });

  if (!decision.agentId) {
    console.log(
      `[gravity] slash command ignored (unmapped command=${command.command} sourceEventId=${command.sourceEventId})`,
    );
    return;
  }

  if (!runLogStore) {
    throw new Error("Run log store is not initialized");
  }
  if (!sessionCatalog) {
    throw new Error("Session catalog is not initialized");
  }
  if (!dbClient) {
    throw new Error("DB client is not initialized");
  }
  if (!slackTransport) {
    throw new Error("Slack transport is not initialized");
  }
  if (!eventIdempotencyGuard) {
    throw new Error("Event idempotency guard is not initialized");
  }

  const acquired = await tryAcquireSourceEventLease(command.sourceEventId, "slash");
  if (!acquired) {
    return;
  }

  const activeDbClient = dbClient;
  const activeRunLogStore = runLogStore;
  const activeSlackTransport = slackTransport;
  const activeAgentId = decision.agentId;
  const activeSessionCatalog = sessionCatalog;
  const normalizedTrigger = normalizeSlackSlashCommandTrigger();

  try {
    const runId = createSlashRunId(command.sourceEventId);
    const sessionKey = createSlashSessionKey(activeAgentId, command.sourceEventId);
    const fullPrompt = command.text.trim();
    const threadRootText = [
      `Running ${command.command} for <@${command.userId}>. Replying in thread.`,
      "Question:",
      fullPrompt.length > 0 ? fullPrompt : "(no question provided)",
    ].join("\n");
    const threadTs = await activeSlackTransport.postChannelMessage(
      command.channelId,
      threadRootText,
    );

    logDebug("slash.session.init", {
      sourceEventId: command.sourceEventId,
      agentId: activeAgentId,
      sessionKey,
      channelId: command.channelId,
      threadTs,
      userId: command.userId,
    });

    await ensureActiveSlackSession({
      catalog: activeSessionCatalog,
      sessionKey,
      agentId: activeAgentId,
      mode: "thread",
      channelId: command.channelId,
      threadTs,
      ownerUserId: command.userId,
      openedByTrigger: normalizedTrigger.triggerKind,
    });

    const runResult = await executeAgentRun({
      db: activeDbClient,
      runLogStore: activeRunLogStore,
      runId,
      agentId: activeAgentId,
      sessionKey,
      prompt: command.text,
      trigger: normalizedTrigger,
      lifecycleMetadata: {
        query: decision.query,
        sourceEventId: command.sourceEventId,
        channelId: command.channelId,
        threadTs,
        userId: command.userId,
        policyDecisions: {
          trigger: "slash_command",
          response_type: decision.ackResponse.response_type,
        },
      },
      onResponse: async (responseText) => {
        await activeSlackTransport.postThreadReply(
          command.channelId,
          threadTs,
          responseText,
        );
        await ensureActiveSlackSession({
          catalog: activeSessionCatalog,
          sessionKey,
          agentId: activeAgentId,
          mode: "thread",
          channelId: command.channelId,
          threadTs,
          ownerUserId: command.userId,
          openedByTrigger: normalizedTrigger.triggerKind,
        });
      },
    });

    logDebug("slash.session.thread-bound", {
      sourceEventId: command.sourceEventId,
      agentId: activeAgentId,
      sessionKey,
      channelId: command.channelId,
      threadTs,
    });

    console.log(
      `[gravity] slash handled ${JSON.stringify({
        ...command,
        agentId: activeAgentId,
        runId,
        sessionKey,
        threadTs,
        modelId: runResult.modelId,
        responseType: decision.ackResponse.response_type,
      })}`,
    );
  } finally {
    releaseSourceEventLease(command.sourceEventId);
  }
}

async function deliverMessageResponse(input: {
  message: InboundSlackMessage;
  entrypoint: MessageEntrypoint;
  responseText: string;
}): Promise<void> {
  if (!slackTransport) {
    throw new Error("Slack transport is not initialized");
  }

  if (input.entrypoint === "direct_message") {
    await slackTransport.postChannelMessage(
      input.message.channelId,
      input.responseText,
    );
    return;
  }

  await slackTransport.postThreadReply(
    input.message.channelId,
    input.message.threadTs,
    input.responseText,
  );
}

async function handleInboundMessage(message: InboundSlackMessage): Promise<void> {
  const decision = await resolveMessageDecision(message);

  logDebug("message.decision", {
    sourceEventId: message.sourceEventId,
    surface: message.surface,
    channelId: message.channelId,
    threadTs: message.threadTs,
    messageTs: message.messageTs,
    userId: message.userId,
    agentId: decision.agentId,
    entrypoint: decision.entrypoint,
    sessionMode: decision.sessionMode,
    sessionKeyOverride: decision.sessionKeyOverride,
    route: decision.route,
  });

  if (!decision.agentId || !decision.entrypoint || !decision.sessionMode) {
    console.log(
      `[gravity] message ignored (surface=${message.surface} channelId=${message.channelId} sourceEventId=${message.sourceEventId})`,
    );
    return;
  }

  if (!runLogStore) {
    throw new Error("Run log store is not initialized");
  }
  if (!sessionCatalog) {
    throw new Error("Session catalog is not initialized");
  }
  if (!dbClient) {
    throw new Error("DB client is not initialized");
  }
  if (!eventIdempotencyGuard) {
    throw new Error("Event idempotency guard is not initialized");
  }

  const acquired = await tryAcquireSourceEventLease(
    message.sourceEventId,
    "message",
  );
  if (!acquired) {
    return;
  }

  const activeDbClient = dbClient;
  const activeRunLogStore = runLogStore;
  const activeSessionCatalog = sessionCatalog;
  const resolvedAgentId = decision.agentId;
  const resolvedEntrypoint = decision.entrypoint;
  const resolvedSessionMode = decision.sessionMode;
  const normalizedTrigger = normalizeSlackMessageTrigger(resolvedEntrypoint);

  try {
    const runId = createMessageRunId(message.sourceEventId);
    const sessionKey =
      decision.sessionKeyOverride ??
      createMessageSessionKey({
        agentId: resolvedAgentId,
        message,
        sessionMode: resolvedSessionMode,
      });

    logDebug("message.session.bind", {
      sourceEventId: message.sourceEventId,
      agentId: resolvedAgentId,
      entrypoint: resolvedEntrypoint,
      route: decision.route,
      sessionMode: resolvedSessionMode,
      sessionKey,
      usedSessionKeyOverride: decision.sessionKeyOverride !== null,
    });

    await ensureActiveSlackSession({
      catalog: activeSessionCatalog,
      sessionKey,
      agentId: resolvedAgentId,
      mode: resolvedSessionMode,
      channelId: message.channelId,
      threadTs: message.threadTs,
      ownerUserId: message.userId,
      openedByTrigger: normalizedTrigger.triggerKind,
    });

    const runResult = await executeAgentRun({
      db: activeDbClient,
      runLogStore: activeRunLogStore,
      runId,
      agentId: resolvedAgentId,
      sessionKey,
      prompt: message.text,
      trigger: normalizedTrigger,
      lifecycleMetadata: {
        query: decision.query,
        sourceEventId: message.sourceEventId,
        channelId: message.channelId,
        threadTs: message.threadTs,
        userId: message.userId,
        policyDecisions: {
          trigger: resolvedEntrypoint,
          route: decision.route,
          session_mode: resolvedSessionMode,
        },
      },
      onResponse: async (responseText) => {
        await deliverMessageResponse({
          message,
          entrypoint: resolvedEntrypoint,
          responseText,
        });
        await ensureActiveSlackSession({
          catalog: activeSessionCatalog,
          sessionKey,
          agentId: resolvedAgentId,
          mode: resolvedSessionMode,
          channelId: message.channelId,
          threadTs: message.threadTs,
          ownerUserId: message.userId,
          openedByTrigger: normalizedTrigger.triggerKind,
        });
      },
    });

    console.log(
      `[gravity] message handled ${JSON.stringify({
        ...message,
        agentId: resolvedAgentId,
        runId,
        sessionKey,
        entrypoint: resolvedEntrypoint,
        route: decision.route,
        sessionMode: resolvedSessionMode,
        modelId: runResult.modelId,
      })}`,
    );
  } finally {
    releaseSourceEventLease(message.sourceEventId);
  }
}

try {
  await withRunLifecycle(bootstrapRunContext, lifecycleLogger, async () => {
    const config = loadConfig(process.env);
    const startedAt = new Date().toISOString();

    console.log(`[gravity] bootstrap started at ${startedAt}`);
    console.log(`[gravity] env=${config.env}`);
    console.log(`[gravity] database=${config.databaseUrl}`);
    anthropicApiKey = config.anthropicApiKey;
    console.log("[gravity] runtime scaffold active");
    dbClient = createDb(config.databaseUrl);
    runLogStore = createRunLogStore(createKyselyRunLogRepository(dbClient));
    sessionCatalog = createSessionCatalog(
      createKyselySessionCatalogRepository(dbClient),
    );
    eventIdempotencyGuard = createEventIdempotencyGuard(
      createKyselyEventIdempotencyRepository(dbClient),
    );
    console.log("[gravity] run log store active (gravity.runs)");
    console.log("[gravity] session catalog active (gravity.sessions)");
    console.log("[gravity] event idempotency guard active (source_event_id)");

    if (config.slackAppToken && config.slackBotToken) {
      console.log(
        "[gravity] slack trigger policy: slash + app_mention + thread/DM message (via ingress bindings)",
      );
      slackTransport = new SlackTransport({
        appToken: config.slackAppToken,
        botToken: config.slackBotToken,
        enableMessageEvents: enableSlackMessageEvents,
        onInboundMessage: handleInboundMessage,
        onInboundSlashCommand: handleInboundSlashCommand,
        onSlashCommandAcknowledge: handleSlashCommandAcknowledge,
      });
      await slackTransport.start();
    } else {
      console.log(
        "[gravity] slack transport disabled (set SLACK_APP_TOKEN and SLACK_BOT_TOKEN to enable)",
      );
    }

    proactiveTriggerScheduler = createProactiveTriggerScheduler({
      db: dbClient,
      onTrigger: handleProactiveTrigger,
    });
    await proactiveTriggerScheduler.start();
    console.log(
      `[gravity] proactive trigger scheduler active (${proactiveTriggerScheduler.activeTriggerCount()} trigger(s))`,
    );

    livenessTicker = setInterval(() => {
      const now = new Date().toISOString();
      console.log(`[gravity] liveness ${now}`);
    }, config.livenessIntervalSeconds * 1000);
  });
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown bootstrap failure";
  console.error(`[gravity] bootstrap failed: ${message}`);
  process.exit(1);
}
