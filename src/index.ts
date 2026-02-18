import process from "node:process";
import {
  agentRegistry,
  compiledDeclarations,
  type CompiledMessageEntrypoint,
  type CompiledMessageListener,
  type CompiledTriggerDimensions,
} from "../agents/index.js";
import { loadConfig } from "./runtime/config.js";
import { createDb, destroyDb, gravitySchema } from "./runtime/db.js";
import {
  createEventIdempotencyGuard,
  createKyselyEventIdempotencyRepository,
  type EventIdempotencyGuard,
} from "./runtime/event-idempotency.js";
import {
  createExecutorManager,
  type ExecutorRuntime,
} from "./runtime/executor-manager.js";
import {
  runPiAgentTurn,
  summarizeAgentResponseForRunLog,
  type RunPiAgentTurnResult,
} from "./runtime/pi-agent-runner.js";
import {
  createProactiveTriggerScheduler,
  type ProactiveQuietHours,
  type ProactiveTriggerFireEvent,
  type ProactiveTriggerScheduler,
  type ResolvedProactiveTrigger,
} from "./runtime/proactive-trigger-scheduler.js";
import {
  composeRunLifecycleLoggers,
  createConsoleRunLifecycleLogger,
  createRunContext,
  type RunEntrypoint,
  type RunSurface,
  type RunTriggerKind,
  withRunLifecycle,
} from "./runtime/run-lifecycle.js";
import {
  createKyselyRunLogRepository,
  createRunLogStore,
  type RunLogStore,
} from "./runtime/run-log-store.js";
import {
  buildIsolatedSessionKey,
  buildMessageSessionKey,
  buildProactiveSessionKey,
  buildSlashThreadSessionKey,
} from "./runtime/session-key.js";
import {
  createKyselySessionCatalogRepository,
  createSessionCatalog,
  type SessionMode,
  type SessionCatalog,
} from "./runtime/session-catalog.js";
import {
  type InboundSlackMessage,
  type InboundSlackSlashCommand,
  normalizeSlashCommand,
  type SlackSlashCommandAckResponse,
  SlackTransport,
} from "./runtime/slack-transport.js";
type NormalizedTrigger = {
  triggerKind: RunTriggerKind;
  surface: RunSurface;
  entrypoint: RunEntrypoint;
};

process.loadEnvFile();

const lifecycleLogger = createConsoleRunLifecycleLogger();

const bootstrapTrigger: NormalizedTrigger = {
  triggerKind: "system",
  surface: "system",
  entrypoint: "system",
};
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

const enableSlackMessageEvents = true;
const executorManager = createExecutorManager({ enableSandbox: false });

type MessageEntrypoint = CompiledMessageEntrypoint;

function logDebug(event: string, payload: Record<string, unknown>): void {
  console.log(`[gravity][debug] ${event} ${JSON.stringify(payload)}`);
}

function toNormalizedTrigger(
  dimensions: CompiledTriggerDimensions,
): NormalizedTrigger {
  return {
    triggerKind: dimensions.triggerKind,
    surface: dimensions.surface,
    entrypoint: dimensions.entrypoint,
  };
}

function createSlashRunId(sourceEventId: string): string {
  return `slack:${sourceEventId}`;
}

function createMessageRunId(sourceEventId: string): string {
  return `slack:${sourceEventId}`;
}

function createProactiveRunId(sourceEventId: string): string {
  return sourceEventId;
}

function resolveAgentRuntimePolicy(agentId: string): ExecutorRuntime {
  const runtime = agentRegistry.agentsById.get(agentId)?.runtime;
  return runtime ?? "host";
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
        agentRuntime: resolveAgentRuntimePolicy(input.agentId),
        sessionKey: input.sessionKey,
        prompt: input.prompt,
        anthropicApiKey,
        executorManager,
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
  trigger: NormalizedTrigger | null;
  ackResponse: SlackSlashCommandAckResponse;
  manualWake: {
    triggerId?: string;
  } | null;
};

type MessageDecision = {
  agentId: string | null;
  entrypoint: MessageEntrypoint | null;
  sessionMode: SessionMode | null;
  trigger: NormalizedTrigger | null;
  sessionKeyOverride: string | null;
  query: string;
  route: "binding" | "unmapped";
};

function resolveSlashCommandDecision(
  command: InboundSlackSlashCommand,
): SlashCommandDecision {
  const query = buildSlashCommandQuery(command);
  const compiledSlashListener =
    compiledDeclarations.ingress.slashCommands[
      normalizeSlashCommand(command.command)
    ];
  if (!compiledSlashListener) {
    return {
      agentId: null,
      query,
      trigger: null,
      ackResponse: buildUnmappedSlashCommandEchoResponse(command),
      manualWake: null,
    };
  }
  const agentId = compiledSlashListener.agentId;
  const trigger = toNormalizedTrigger(compiledSlashListener.trigger);

  const normalizedText = command.text.trim();
  const wakeTokens = normalizedText.split(/\s+/).filter((token) => token.length > 0);
  const isWakeCommand = wakeTokens[0] === "!wake";
  const wakeTriggerId = wakeTokens.length > 1 ? wakeTokens[1] : undefined;
  const manualWake =
    isWakeCommand && wakeTokens.length <= 2
      ? {
          triggerId: wakeTriggerId,
        }
      : null;
  if (manualWake) {
    const triggerLabel = manualWake.triggerId
      ? ` trigger \`${manualWake.triggerId}\``
      : " all heartbeat triggers";
    return {
      agentId,
      query,
      trigger,
      manualWake,
      ackResponse: {
        response_type: "ephemeral",
        text: `Gravity requested manual proactive wake for ${agentId}${triggerLabel}.`,
      },
    };
  }

  return {
    agentId,
    query,
    trigger,
    ackResponse: buildSlashCommandEchoResponse(command, agentId),
    manualWake: null,
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

async function loadActiveAgentChannels(
  dbClient: ReturnType<typeof createDb>,
): Promise<Map<string, string | null>> {
  const rows = await gravitySchema(dbClient)
    .selectFrom("agents")
    .select(["id", "channel_id"])
    .where("status", "=", "active")
    .execute();

  const byAgentId = new Map<string, string | null>();
  for (const row of rows) {
    byAgentId.set(row.id, row.channel_id);
  }
  return byAgentId;
}

async function loadActiveAgentIds(
  dbClient: ReturnType<typeof createDb>,
): Promise<Set<string>> {
  const rows = await gravitySchema(dbClient)
    .selectFrom("agents")
    .select(["id"])
    .where("status", "=", "active")
    .execute();

  return new Set(rows.map((row) => row.id));
}

function toProactiveQuietHours(
  quietHours: typeof compiledDeclarations.proactive.triggers[number]["quietHours"],
): ProactiveQuietHours | undefined {
  if (!quietHours) {
    return undefined;
  }

  return {
    timezone: quietHours.timezone,
    startHour: quietHours.startHour,
    endHour: quietHours.endHour,
    ...(quietHours.daysOfWeek
      ? {
          daysOfWeek: [...quietHours.daysOfWeek],
        }
      : {}),
  };
}

function compileProactiveTriggersForActiveAgents(
  activeAgentIds: ReadonlySet<string>,
): ResolvedProactiveTrigger[] {
  const triggers: ResolvedProactiveTrigger[] = [];
  for (const trigger of compiledDeclarations.proactive.triggers) {
    if (!activeAgentIds.has(trigger.agentId)) {
      continue;
    }

    const quietHours = toProactiveQuietHours(trigger.quietHours);
    if (trigger.kind === "cron") {
      triggers.push({
        agentId: trigger.agentId,
        triggerId: trigger.triggerId,
        kind: "cron",
        schedule: trigger.schedule,
        prompt: trigger.prompt,
        sessionMode: trigger.sessionMode,
        delivery: trigger.delivery,
        ...(quietHours ? { quietHours } : {}),
      });
      continue;
    }

    triggers.push({
      agentId: trigger.agentId,
      triggerId: trigger.triggerId,
      kind: "heartbeat",
      intervalSeconds: trigger.intervalSeconds,
      prompt: trigger.prompt,
      sessionMode: trigger.sessionMode,
      delivery: trigger.delivery,
      ...(quietHours ? { quietHours } : {}),
    });
  }

  return triggers;
}

async function loadActiveCompiledProactiveTriggers(
  dbClient: ReturnType<typeof createDb>,
): Promise<ReadonlyArray<ResolvedProactiveTrigger>> {
  const activeAgentIds = await loadActiveAgentIds(dbClient);
  return compileProactiveTriggersForActiveAgents(activeAgentIds);
}

function deriveMessageEntrypoint(
  message: InboundSlackMessage,
): MessageEntrypoint | null {
  if (message.surface === "app_mention") {
    return "app_mention";
  }

  if (message.threadTs !== message.messageTs) {
    return "thread_reply";
  }

  if (message.isDirectMessage) {
    return "direct_message";
  }

  return null;
}

function messageListenerMatches(input: {
  listener: CompiledMessageListener;
  message: InboundSlackMessage;
  entrypoint: MessageEntrypoint;
  threadOwnerAgentId: string | null;
}): boolean {
  const { listener, message, entrypoint, threadOwnerAgentId } = input;

  if (listener.entrypoint !== entrypoint) {
    return false;
  }

  const match = listener.match;
  if (!match) {
    return true;
  }

  const matchChannelId = match.channelId;
  if (matchChannelId && matchChannelId !== message.channelId) {
    return false;
  }

  const matchUserId = match.userId;
  if (matchUserId && matchUserId !== message.userId) {
    return false;
  }

  const matchIsDirectMessage = match.isDirectMessage;
  if (
    matchIsDirectMessage !== undefined &&
    matchIsDirectMessage !== message.isDirectMessage
  ) {
    return false;
  }

  const matchThreadOwnedByAgent = match.threadOwnedByAgent;
  if (matchThreadOwnedByAgent === true && entrypoint !== "thread_reply") {
    return false;
  }
  if (matchThreadOwnedByAgent === true) {
    return threadOwnerAgentId === listener.agentId;
  }
  if (matchThreadOwnedByAgent === false && threadOwnerAgentId === listener.agentId) {
    return false;
  }

  return true;
}

type ResolvedCompiledMessageIngress = {
  agentId: string;
  entrypoint: MessageEntrypoint;
  sessionMode: SessionMode;
  trigger: NormalizedTrigger;
  route: "binding";
};

function resolveMessageIngressFromDeclarations(input: {
  message: InboundSlackMessage;
  activeAgentChannels: ReadonlyMap<string, string | null>;
  threadOwnerAgentId: string | null;
}): ResolvedCompiledMessageIngress | null {
  const entrypoint = deriveMessageEntrypoint(input.message);
  if (!entrypoint) {
    return null;
  }

  const listeners = compiledDeclarations.ingress.messageByEntrypoint[entrypoint];
  const candidates: Array<
    ResolvedCompiledMessageIngress & {
      channelAffinityScore: number;
    }
  > = [];

  for (const listener of listeners) {
    const channelAffinity = input.activeAgentChannels.get(listener.agentId);
    if (channelAffinity === undefined) {
      continue;
    }

    if (
      !messageListenerMatches({
        listener,
        message: input.message,
        entrypoint,
        threadOwnerAgentId: input.threadOwnerAgentId,
      })
    ) {
      continue;
    }

    candidates.push({
      agentId: listener.agentId,
      entrypoint,
      sessionMode: listener.sessionMode,
      trigger: toNormalizedTrigger(listener.trigger),
      route: "binding",
      channelAffinityScore:
        channelAffinity === input.message.channelId ? 1 : 0,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.channelAffinityScore !== b.channelAffinityScore) {
      return b.channelAffinityScore - a.channelAffinityScore;
    }
    return a.agentId.localeCompare(b.agentId);
  });

  const winner = candidates[0];
  if (!winner) {
    return null;
  }

  return {
    agentId: winner.agentId,
    entrypoint: winner.entrypoint,
    sessionMode: winner.sessionMode,
    trigger: winner.trigger,
    route: winner.route,
  };
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
      trigger: null,
      sessionKeyOverride: null,
      query,
      route: "unmapped",
    };
  }

  const activeThreadSession =
    message.threadTs !== message.messageTs
      ? await findActiveThreadSession(dbClient, message.channelId, message.threadTs)
      : null;

  const activeAgents = await loadActiveAgentChannels(dbClient);
  const resolved = resolveMessageIngressFromDeclarations({
    message,
    activeAgentChannels: activeAgents,
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
    activeAgentCount: activeAgents.size,
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
      trigger: null,
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
    trigger: resolved.trigger,
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
    const normalizedTrigger: NormalizedTrigger = {
      triggerKind: event.trigger.triggerKind,
      surface: event.trigger.surface,
      entrypoint: event.trigger.entrypoint,
    };
    const runId = createProactiveRunId(event.sourceEventId);
    const sessionKey = buildProactiveSessionKey({
      agentId: event.agentId,
      triggerId: event.triggerId,
      sourceEventId: event.sourceEventId,
      sessionMode: event.sessionMode,
    });
    const delivery = await prepareProactiveDelivery(event, activeSlackTransport);

    logDebug("proactive.fire", {
      sourceEventId: event.sourceEventId,
      firedAt: event.firedAt.toISOString(),
      origin: event.origin,
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
        policyDecisions: {
          ...delivery.policyDecisions,
          proactive_origin: event.origin,
        },
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
        origin: event.origin,
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

  if (!decision.agentId || !decision.trigger) {
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
  const normalizedTrigger = decision.trigger;
  const activeScheduler = proactiveTriggerScheduler;

  try {
    if (decision.manualWake) {
      const manualWakeDecision = decision.manualWake;
      const runId = createSlashRunId(command.sourceEventId);
      const sessionKey = buildIsolatedSessionKey(
        activeAgentId,
        command.sourceEventId,
      );
      let resultSummary = "manual wake requested";
      const persistenceLogger = activeRunLogStore.createLifecycleLogger({
        query: decision.query,
        sourceEventId: command.sourceEventId,
        channelId: command.channelId,
        userId: command.userId,
        policyDecisions: {
          trigger: "slash_command",
          response_type: decision.ackResponse.response_type,
          manual_wake: true,
          manual_wake_trigger_id: manualWakeDecision.triggerId ?? null,
          manual_wake_scheduler_available: Boolean(activeScheduler),
        },
        getResultSummary: () => resultSummary,
      });
      const runContext = createRunContext({
        runId,
        agentId: activeAgentId,
        sessionKey,
        triggerKind: normalizedTrigger.triggerKind,
        surface: normalizedTrigger.surface,
        entrypoint: normalizedTrigger.entrypoint,
      });
      const firedCount = await withRunLifecycle(
        runContext,
        composeRunLifecycleLoggers([lifecycleLogger, persistenceLogger]),
        async () => {
          if (!activeScheduler) {
            console.log(
              `[gravity] manual wake ignored (scheduler unavailable sourceEventId=${command.sourceEventId} agentId=${activeAgentId})`,
            );
            resultSummary = "manual wake ignored (scheduler unavailable)";
            return 0;
          }

          const fired = await activeScheduler.wake({
            agentId: activeAgentId,
            kind: "heartbeat",
            triggerId: manualWakeDecision.triggerId,
            bypassQuietHours: true,
          });
          resultSummary = `manual wake fired ${fired} trigger(s)`;
          return fired;
        },
      );
      console.log(
        `[gravity] manual wake handled ${JSON.stringify({
          sourceEventId: command.sourceEventId,
          agentId: activeAgentId,
          runId,
          sessionKey,
          triggerId: manualWakeDecision.triggerId ?? null,
          firedCount,
        })}`,
      );
      return;
    }

    const runId = createSlashRunId(command.sourceEventId);
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
    const sessionKey = buildSlashThreadSessionKey(activeAgentId, threadTs);

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

  if (
    !decision.agentId ||
    !decision.entrypoint ||
    !decision.sessionMode ||
    !decision.trigger
  ) {
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
  const normalizedTrigger = decision.trigger;

  try {
    const runId = createMessageRunId(message.sourceEventId);
    const sessionKey =
      decision.sessionKeyOverride ??
      buildMessageSessionKey({
        agentId: resolvedAgentId,
        channelId: message.channelId,
        threadTs: message.threadTs,
        sourceEventId: message.sourceEventId,
        sessionMode: resolvedSessionMode,
        isDirectMessage: message.isDirectMessage,
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
      loadTriggers: loadActiveCompiledProactiveTriggers,
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
