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
  createSelfAuthoringMutationCoordinator,
  formatSelfAuthoringOutcome,
  type SelfAuthoringMutationCoordinator,
  type SelfAuthoringMutationOutcome,
} from "./runtime/self-authoring-mutation-coordinator.js";
import {
  buildIsolatedSessionKey,
  buildMessageSessionKey,
  buildProactiveSessionKey,
  buildSlashSessionKey,
} from "./runtime/session-key.js";
import {
  createKyselySessionCatalogRepository,
  createSessionCatalog,
  type SessionMode,
  type SessionCatalog,
} from "./runtime/session-catalog.js";
import {
  createSessionHistoryStore,
  type SessionHistoryStore,
  type SessionLogRole,
} from "./runtime/session-history-store.js";
import {
  createSessionIdleEvictionCoordinator,
  type SessionIdleEvictionCoordinator,
} from "./runtime/session-idle-eviction.js";
import {
  createKyselyAgentMemoryPathLoader,
  createSessionEndMemoryHook,
  runSessionIdleCloseFlow,
  type SessionEndMemoryHook,
} from "./runtime/session-end-memory-hook.js";
import {
  createKyselySlackThreadBackfillRepository,
  createSessionStartupBackfill,
  type SessionStartupBackfill,
} from "./runtime/session-startup-backfill.js";
import { createKyselySkillVersionAuditStore } from "./runtime/skill-version-audit-store.js";
import {
  type InboundSlackMessage,
  type InboundSlackSlashCommand,
  type SlackThreadHistoryMessage,
  normalizeSlashCommand,
  type SlackSlashCommandAckResponse,
  SlackTransport,
} from "./runtime/slack-transport.js";
import type { SessionRuntimeConfig } from "./runtime/config.js";
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
let sessionHistoryStore: SessionHistoryStore | null = null;
let sessionIdleEvictionCoordinator: SessionIdleEvictionCoordinator | null = null;
let sessionEndMemoryHook: SessionEndMemoryHook | null = null;
let sessionStartupBackfill: SessionStartupBackfill | null = null;
let sessionRuntimeConfig: SessionRuntimeConfig | null = null;
let eventIdempotencyGuard: EventIdempotencyGuard | null = null;
let proactiveTriggerScheduler: ProactiveTriggerScheduler | null = null;
let selfAuthoringMutationCoordinator: SelfAuthoringMutationCoordinator | null = null;
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

  if (sessionIdleEvictionCoordinator !== null) {
    await sessionIdleEvictionCoordinator.shutdown();
    sessionIdleEvictionCoordinator = null;
  }

  if (dbClient !== null) {
    await destroyDb(dbClient);
    dbClient = null;
  }

  runLogStore = null;
  sessionCatalog = null;
  sessionHistoryStore = null;
  sessionEndMemoryHook = null;
  sessionStartupBackfill = null;
  sessionRuntimeConfig = null;
  eventIdempotencyGuard = null;
  anthropicApiKey = null;
  selfAuthoringMutationCoordinator = null;

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
let executorManager = createExecutorManager();

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

function sessionLogRoleForTrigger(
  triggerKind: RunTriggerKind,
): SessionLogRole {
  if (triggerKind === "message") {
    return "user";
  }

  return "system";
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
  sessionHistoryStore: SessionHistoryStore;
  sessionLogRole: SessionLogRole;
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
    messageTs?: string | null;
    userId?: string | null;
    policyDecisions?: Record<string, unknown>;
  };
  onResponse: (
    responseText: string,
    runResult: RunPiAgentTurnResult,
  ) =>
    | Promise<{
        messageTs?: string | null;
      } | void>
    | {
        messageTs?: string | null;
      }
    | void;
};

async function executeAgentRun(
  input: ExecuteAgentRunInput,
): Promise<RunPiAgentTurnResult> {
  const activeSessionRuntimeConfig = sessionRuntimeConfig;
  if (!activeSessionRuntimeConfig) {
    throw new Error("Session runtime config is not initialized");
  }

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
    getPolicyDecisions: () => input.lifecycleMetadata.policyDecisions ?? {},
    getResultSummary: () => resultSummary,
  });

  await input.sessionHistoryStore.appendSessionLog({
    agentId: input.agentId,
    sessionKey: input.sessionKey,
    role: input.sessionLogRole,
    text: input.prompt,
    sourceEventId: input.lifecycleMetadata.sourceEventId,
    runId: input.runId,
    channelId: input.lifecycleMetadata.channelId,
    threadTs: input.lifecycleMetadata.threadTs,
    messageTs: input.lifecycleMetadata.messageTs,
    userId: input.lifecycleMetadata.userId,
    metadata: {
      triggerKind: input.trigger.triggerKind,
      entrypoint: input.trigger.entrypoint,
      surface: input.trigger.surface,
      phase: "run_input",
    },
  });
  sessionIdleEvictionCoordinator?.recordActivity({
    agentId: input.agentId,
    sessionKey: input.sessionKey,
  });

  return withRunLifecycle(
    runContext,
    composeRunLifecycleLoggers([lifecycleLogger, persistenceLogger]),
    async () => {
      const runResult = await runPiAgentTurn({
        db: input.db,
        runId: input.runId,
        agentId: input.agentId,
        agentRuntime: resolveAgentRuntimePolicy(input.agentId),
        sessionKey: input.sessionKey,
        sourceEventId: input.lifecycleMetadata.sourceEventId,
        prompt: input.prompt,
        anthropicApiKey,
        executorManager,
        sessionHistoryStore: input.sessionHistoryStore,
        sessionConfig: activeSessionRuntimeConfig,
      });
      input.lifecycleMetadata.policyDecisions = {
        ...(input.lifecycleMetadata.policyDecisions ?? {}),
        sandbox: {
          decision: runResult.sandbox.decision,
          reason: runResult.sandbox.reason,
          requested_runtime: runResult.sandbox.requestedRuntime,
          effective_runtime: runResult.sandbox.effectiveRuntime,
          rollback_applied: runResult.sandbox.rollbackApplied,
          outcome: runResult.sandbox.outcome,
          run_id: input.runId,
          agent_id: input.agentId,
          session_key: input.sessionKey,
        },
      };

      const responseText = runResult.responseText;
      resultSummary = summarizeAgentResponseForRunLog(responseText);
      const responseMetadata = await input.onResponse(responseText, runResult);
      await input.sessionHistoryStore.appendSessionLog({
        agentId: input.agentId,
        sessionKey: input.sessionKey,
        role: "assistant",
        text: responseText,
        sourceEventId: input.lifecycleMetadata.sourceEventId,
        runId: input.runId,
        channelId: input.lifecycleMetadata.channelId,
        threadTs: input.lifecycleMetadata.threadTs,
        messageTs: responseMetadata?.messageTs ?? null,
        userId: null,
        metadata: {
          triggerKind: input.trigger.triggerKind,
          entrypoint: input.trigger.entrypoint,
          surface: input.trigger.surface,
          phase: "run_output",
        },
      });
      sessionIdleEvictionCoordinator?.recordActivity({
        agentId: input.agentId,
        sessionKey: input.sessionKey,
      });
      return runResult;
    },
  );
}

type ExecuteSelfAuthoringRunInput = {
  runLogStore: RunLogStore;
  sessionHistoryStore: SessionHistoryStore;
  sessionLogRole: SessionLogRole;
  coordinator: SelfAuthoringMutationCoordinator;
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
    messageTs?: string | null;
    userId?: string | null;
    policyDecisions?: Record<string, unknown>;
  };
  onResponse: (
    responseText: string,
    outcome: SelfAuthoringMutationOutcome,
  ) =>
    | Promise<{
        messageTs?: string | null;
      } | void>
    | {
        messageTs?: string | null;
      }
    | void;
};

function summarizeSelfAuthoringOutcome(outcome: SelfAuthoringMutationOutcome): string {
  if (outcome.status === "completed") {
    return `self-authoring completed (applied=${outcome.appliedCount} audits=${outcome.auditRecords.length})`;
  }

  if (outcome.status === "mutation_policy_denied") {
    return `self-authoring denied (${outcome.deniedTargets.length} denied target(s))`;
  }

  if (outcome.status === "deduped_duplicate") {
    return "self-authoring deduped duplicate trigger";
  }

  if (outcome.status === "queue_overflow") {
    return `self-authoring queue overflow (maxDepth=${outcome.maxDepth})`;
  }

  return `self-authoring failed (${outcome.errorMessage})`;
}

type SelfAuthoringFailedOutcome = Extract<
  SelfAuthoringMutationOutcome,
  { status: "failed" }
>;

class SelfAuthoringRunFailedError extends Error {
  readonly outcome: SelfAuthoringFailedOutcome;

  constructor(outcome: SelfAuthoringFailedOutcome) {
    super(`self-authoring failed (${outcome.errorMessage})`);
    this.name = "SelfAuthoringRunFailedError";
    this.outcome = outcome;
  }
}

async function executeSelfAuthoringRun(
  input: ExecuteSelfAuthoringRunInput,
): Promise<SelfAuthoringMutationOutcome> {
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
    getPolicyDecisions: () => input.lifecycleMetadata.policyDecisions ?? {},
    getResultSummary: () => resultSummary,
  });

  await input.sessionHistoryStore.appendSessionLog({
    agentId: input.agentId,
    sessionKey: input.sessionKey,
    role: input.sessionLogRole,
    text: input.prompt,
    sourceEventId: input.lifecycleMetadata.sourceEventId,
    runId: input.runId,
    channelId: input.lifecycleMetadata.channelId,
    threadTs: input.lifecycleMetadata.threadTs,
    messageTs: input.lifecycleMetadata.messageTs,
    userId: input.lifecycleMetadata.userId,
    metadata: {
      triggerKind: input.trigger.triggerKind,
      entrypoint: input.trigger.entrypoint,
      surface: input.trigger.surface,
      phase: "self_authoring_input",
    },
  });
  sessionIdleEvictionCoordinator?.recordActivity({
    agentId: input.agentId,
    sessionKey: input.sessionKey,
  });

  try {
    return await withRunLifecycle(
      runContext,
      composeRunLifecycleLoggers([lifecycleLogger, persistenceLogger]),
      async () => {
        const outcome = await input.coordinator.execute({
          agentId: input.agentId,
          sessionKey: input.sessionKey,
          runId: input.runId,
          sourceEventId: input.lifecycleMetadata.sourceEventId ?? null,
          userId: input.lifecycleMetadata.userId ?? null,
          prompt: input.prompt,
          triggerKind: input.trigger.triggerKind,
          surface: input.trigger.surface,
          entrypoint: input.trigger.entrypoint,
        });

        const finalOutcome: SelfAuthoringMutationOutcome = outcome ?? {
          status: "failed",
          triggerKey: "none",
          queueSeq: -1,
          stageHistory: ["failed"],
          errorMessage: "self-authoring intent was not detected",
        };
        const responseText = formatSelfAuthoringOutcome(finalOutcome);
        resultSummary = summarizeSelfAuthoringOutcome(finalOutcome);
        const responseMetadata = await input.onResponse(responseText, finalOutcome);
        await input.sessionHistoryStore.appendSessionLog({
          agentId: input.agentId,
          sessionKey: input.sessionKey,
          role: "assistant",
          text: responseText,
          sourceEventId: input.lifecycleMetadata.sourceEventId,
          runId: input.runId,
          channelId: input.lifecycleMetadata.channelId,
          threadTs: input.lifecycleMetadata.threadTs,
          messageTs: responseMetadata?.messageTs ?? null,
          userId: null,
          metadata: {
            triggerKind: input.trigger.triggerKind,
            entrypoint: input.trigger.entrypoint,
            surface: input.trigger.surface,
            phase: "self_authoring_output",
            selfAuthoringStatus: finalOutcome.status,
          },
        });
        sessionIdleEvictionCoordinator?.recordActivity({
          agentId: input.agentId,
          sessionKey: input.sessionKey,
        });
        if (finalOutcome.status === "failed") {
          throw new SelfAuthoringRunFailedError(finalOutcome);
        }
        return finalOutcome;
      },
    );
  } catch (error) {
    if (error instanceof SelfAuthoringRunFailedError) {
      return error.outcome;
    }
    throw error;
  }
}

function buildSlashCommandQuery(command: InboundSlackSlashCommand): string {
  return `${command.command} ${command.text}`.trim();
}

function buildSlashCommandEchoResponse(
  command: InboundSlackSlashCommand,
  agentId: string,
): SlackSlashCommandAckResponse {
  const normalizedText = command.text.length > 0 ? command.text : "(no text)";
  const routeLabel = command.command === "/pearlboy" ? "pearlboy" : agentId;
  return {
    response_type: "ephemeral",
    text: `Gravity routed ${command.command} to ${routeLabel}. Replying in thread for: ${normalizedText}`,
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
  sessionMode: SessionMode | null;
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
      sessionMode: null,
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
      sessionMode: compiledSlashListener.sessionMode,
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
    sessionMode: compiledSlashListener.sessionMode,
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
  if (!quietHours || quietHours.enabled === false) {
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

  // DM thread replies are treated as direct_message so channel-owned main sessions
  // keep handling follow-ups even when users start Slack thread UI off bot messages.
  if (message.isDirectMessage) {
    return "direct_message";
  }

  if (message.threadTs !== message.messageTs) {
    return "thread_reply";
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
}): Promise<string> {
  if (input.delivery.threadTs) {
    return input.transport.postThreadReply(
      input.delivery.channelId,
      input.delivery.threadTs,
      input.responseText,
    );
  }

  return input.transport.postChannelMessage(
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
  if (!sessionHistoryStore) {
    throw new Error("Session history store is not initialized");
  }
  if (!dbClient) {
    throw new Error("DB client is not initialized");
  }

  const activeRunLogStore = runLogStore;
  const activeSessionCatalog = sessionCatalog;
  const activeSessionHistoryStore = sessionHistoryStore;
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
      sessionHistoryStore: activeSessionHistoryStore,
      sessionLogRole: sessionLogRoleForTrigger(normalizedTrigger.triggerKind),
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
        messageTs: null,
        userId: delivery.ownerUserId,
        policyDecisions: {
          ...delivery.policyDecisions,
          proactive_origin: event.origin,
        },
      },
      onResponse: async (responseText) => {
        const responseMessageTs = await deliverProactiveResponse({
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
        return { messageTs: responseMessageTs };
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
  if (!sessionHistoryStore) {
    throw new Error("Session history store is not initialized");
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
  const activeSessionHistoryStore = sessionHistoryStore;
  const activeSlackTransport = slackTransport;
  const activeAgentId = decision.agentId;
  const resolvedSessionMode = decision.sessionMode;
  const activeSessionCatalog = sessionCatalog;
  const normalizedTrigger = decision.trigger;
  const activeScheduler = proactiveTriggerScheduler;

  if (!resolvedSessionMode) {
    throw new Error(
      `Slash command ${command.command} missing compiled session mode for agent ${activeAgentId}`,
    );
  }

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
        getPolicyDecisions: () => ({
          trigger: "slash_command",
          response_type: decision.ackResponse.response_type,
          manual_wake: true,
          manual_wake_trigger_id: manualWakeDecision.triggerId ?? null,
          manual_wake_scheduler_available: Boolean(activeScheduler),
        }),
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
    const activeSelfAuthoringCoordinator = selfAuthoringMutationCoordinator;
    const isSelfAuthoringIntent =
      activeSelfAuthoringCoordinator?.detectIntent(command.text) ?? false;
    const fullPrompt = command.text.trim();
    const threadRootText = isSelfAuthoringIntent
      ? [
          `Running self-authoring update for ${activeAgentId}. Replying in thread.`,
          "Instruction:",
          fullPrompt.length > 0 ? fullPrompt : "(no instruction provided)",
        ].join("\n")
      : [
          `Running ${command.command} for <@${command.userId}>. Replying in thread.`,
          "Question:",
          fullPrompt.length > 0 ? fullPrompt : "(no question provided)",
        ].join("\n");
    const threadTs = await activeSlackTransport.postChannelMessage(
      command.channelId,
      threadRootText,
    );
    const sessionKey = buildSlashSessionKey({
      agentId: activeAgentId,
      channelId: command.channelId,
      threadTs,
      sourceEventId: command.sourceEventId,
      sessionMode: resolvedSessionMode,
    });

    logDebug("slash.session.init", {
      sourceEventId: command.sourceEventId,
      agentId: activeAgentId,
      sessionKey,
      channelId: command.channelId,
      threadTs,
      userId: command.userId,
      sessionMode: resolvedSessionMode,
    });

    await ensureActiveSlackSession({
      catalog: activeSessionCatalog,
      sessionKey,
      agentId: activeAgentId,
      mode: resolvedSessionMode,
      channelId: command.channelId,
      threadTs,
      ownerUserId: command.userId,
      openedByTrigger: normalizedTrigger.triggerKind,
    });

    if (isSelfAuthoringIntent) {
      if (!activeSelfAuthoringCoordinator) {
        throw new Error("Self-authoring mutation coordinator is not initialized");
      }

      const outcome = await executeSelfAuthoringRun({
        runLogStore: activeRunLogStore,
        sessionHistoryStore: activeSessionHistoryStore,
        sessionLogRole: sessionLogRoleForTrigger(normalizedTrigger.triggerKind),
        coordinator: activeSelfAuthoringCoordinator,
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
          messageTs: null,
          userId: command.userId,
          policyDecisions: {
            trigger: "slash_command",
            response_type: decision.ackResponse.response_type,
            session_mode: resolvedSessionMode,
            self_authoring: true,
          },
        },
        onResponse: async (responseText) => {
          const responseMessageTs = await activeSlackTransport.postThreadReply(
            command.channelId,
            threadTs,
            responseText,
          );
          await ensureActiveSlackSession({
            catalog: activeSessionCatalog,
            sessionKey,
            agentId: activeAgentId,
            mode: resolvedSessionMode,
            channelId: command.channelId,
            threadTs,
            ownerUserId: command.userId,
            openedByTrigger: normalizedTrigger.triggerKind,
          });
          return { messageTs: responseMessageTs };
        },
      });

      console.log(
        `[gravity] slash self-authoring handled ${JSON.stringify({
          sourceEventId: command.sourceEventId,
          agentId: activeAgentId,
          runId,
          sessionKey,
          threadTs,
          status: outcome.status,
        })}`,
      );
      return;
    }

    const runResult = await executeAgentRun({
      db: activeDbClient,
      runLogStore: activeRunLogStore,
      sessionHistoryStore: activeSessionHistoryStore,
      sessionLogRole: sessionLogRoleForTrigger(normalizedTrigger.triggerKind),
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
        messageTs: null,
        userId: command.userId,
        policyDecisions: {
          trigger: "slash_command",
          response_type: decision.ackResponse.response_type,
          session_mode: resolvedSessionMode,
        },
      },
      onResponse: async (responseText) => {
        const responseMessageTs = await activeSlackTransport.postThreadReply(
          command.channelId,
          threadTs,
          responseText,
        );
        await ensureActiveSlackSession({
          catalog: activeSessionCatalog,
          sessionKey,
          agentId: activeAgentId,
          mode: resolvedSessionMode,
          channelId: command.channelId,
          threadTs,
          ownerUserId: command.userId,
          openedByTrigger: normalizedTrigger.triggerKind,
        });
        return { messageTs: responseMessageTs };
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
}): Promise<string> {
  if (!slackTransport) {
    throw new Error("Slack transport is not initialized");
  }

  if (input.entrypoint === "direct_message") {
    return slackTransport.postChannelMessage(
      input.message.channelId,
      input.responseText,
    );
  }

  return slackTransport.postThreadReply(
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
  if (!sessionHistoryStore) {
    throw new Error("Session history store is not initialized");
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
  const activeSessionHistoryStore = sessionHistoryStore;
  const activeSessionCatalog = sessionCatalog;
  const resolvedAgentId = decision.agentId;
  const resolvedEntrypoint = decision.entrypoint;
  const resolvedSessionMode = decision.sessionMode;
  const normalizedTrigger = decision.trigger;
  const activeSelfAuthoringCoordinator = selfAuthoringMutationCoordinator;
  const isSelfAuthoringIntent =
    activeSelfAuthoringCoordinator?.detectIntent(message.text) ?? false;

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

    if (isSelfAuthoringIntent) {
      if (!activeSelfAuthoringCoordinator) {
        throw new Error("Self-authoring mutation coordinator is not initialized");
      }

      const outcome = await executeSelfAuthoringRun({
        runLogStore: activeRunLogStore,
        sessionHistoryStore: activeSessionHistoryStore,
        sessionLogRole: sessionLogRoleForTrigger(normalizedTrigger.triggerKind),
        coordinator: activeSelfAuthoringCoordinator,
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
          messageTs: message.messageTs,
          userId: message.userId,
          policyDecisions: {
            trigger: resolvedEntrypoint,
            route: decision.route,
            session_mode: resolvedSessionMode,
            self_authoring: true,
          },
        },
        onResponse: async (responseText) => {
          const responseMessageTs = await deliverMessageResponse({
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
          return { messageTs: responseMessageTs };
        },
      });

      console.log(
        `[gravity] message self-authoring handled ${JSON.stringify({
          sourceEventId: message.sourceEventId,
          agentId: resolvedAgentId,
          runId,
          sessionKey,
          entrypoint: resolvedEntrypoint,
          route: decision.route,
          sessionMode: resolvedSessionMode,
          status: outcome.status,
        })}`,
      );
      return;
    }

    const runResult = await executeAgentRun({
      db: activeDbClient,
      runLogStore: activeRunLogStore,
      sessionHistoryStore: activeSessionHistoryStore,
      sessionLogRole: sessionLogRoleForTrigger(normalizedTrigger.triggerKind),
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
        messageTs: message.messageTs,
        userId: message.userId,
        policyDecisions: {
          trigger: resolvedEntrypoint,
          route: decision.route,
          session_mode: resolvedSessionMode,
        },
      },
      onResponse: async (responseText) => {
        const responseMessageTs = await deliverMessageResponse({
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
        return { messageTs: responseMessageTs };
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
    sessionRuntimeConfig = config.session;
    for (const warning of config.runtimeWarnings) {
      console.warn(`[gravity][warning] ${warning}`);
    }
    anthropicApiKey = config.anthropicApiKey;
    console.log("[gravity] runtime scaffold active");
    executorManager = createExecutorManager({
      sandboxEnabled: config.sandbox.enabled,
      forceHostRuntime: config.sandbox.forceHost,
    });
    console.log(
      `[gravity] executor manager active (sandboxEnabled=${config.sandbox.enabled} forceHostRuntime=${config.sandbox.forceHost})`,
    );
    dbClient = createDb(config.databaseUrl);
    runLogStore = createRunLogStore(createKyselyRunLogRepository(dbClient));
    sessionCatalog = createSessionCatalog(
      createKyselySessionCatalogRepository(dbClient),
    );
    sessionHistoryStore = createSessionHistoryStore({
      cwd: process.cwd(),
      workspaceRoot: agentRegistry.config.paths.workspaceRoot,
    });
    const activeDbClient = dbClient;
    if (!activeDbClient) {
      throw new Error("DB client failed to initialize");
    }
    const activeSessionHistoryStore = sessionHistoryStore;
    if (!activeSessionHistoryStore) {
      throw new Error("Session history store failed to initialize");
    }
    sessionEndMemoryHook = createSessionEndMemoryHook({
      enabled: config.session.idleEviction.memoryHookEnabled,
      anthropicApiKey,
      sessionHistoryStore: activeSessionHistoryStore,
      loadAgentMemoryPath: createKyselyAgentMemoryPathLoader(activeDbClient),
      runSilentTurn: async ({ agentId, sessionKey, sourceEventId, prompt }) =>
        runPiAgentTurn({
          db: activeDbClient,
          runId: sourceEventId,
          agentId,
          agentRuntime: resolveAgentRuntimePolicy(agentId),
          sessionKey,
          sourceEventId,
          prompt,
          anthropicApiKey,
          executorManager,
          sessionHistoryStore: activeSessionHistoryStore,
          sessionConfig: config.session,
        }),
    });
    sessionIdleEvictionCoordinator = createSessionIdleEvictionCoordinator({
      enabled: config.session.idleEviction.enabled,
      idleTimeoutMs: config.session.idleEviction.timeoutMs,
      onSessionIdle: async (event) => {
        await runSessionIdleCloseFlow({
          event,
          memoryHook: sessionEndMemoryHook,
          closeSessionIfUnchanged: async ({
            sessionKey,
            expectedLastActivityAt,
            closedAt,
          }) => {
            if (sessionCatalog) {
              return sessionCatalog.closeSessionIfUnchanged({
                sessionKey,
                expectedLastActivityAt,
                closedAt,
              });
            }
            return false;
          },
        });
      },
    });
    eventIdempotencyGuard = createEventIdempotencyGuard(
      createKyselyEventIdempotencyRepository(dbClient),
    );
    selfAuthoringMutationCoordinator = config.selfAuthoring.enabled
      ? createSelfAuthoringMutationCoordinator({
          cwd: process.cwd(),
          queueMaxDepth: config.selfAuthoring.queueMaxDepth,
          auditStore: createKyselySkillVersionAuditStore(dbClient),
        })
      : null;
    console.log("[gravity] run log store active (gravity.runs)");
    console.log("[gravity] session catalog active (gravity.sessions)");
    console.log("[gravity] session history store active (workspace dual-history)");
    console.log("[gravity] event idempotency guard active (source_event_id)");
    if (selfAuthoringMutationCoordinator) {
      console.log(
        `[gravity] self-authoring mutation coordinator active (queueMaxDepth=${config.selfAuthoring.queueMaxDepth})`,
      );
    } else {
      console.log("[gravity] self-authoring mutation coordinator disabled");
    }

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

    const activeSlackTransport = slackTransport;
    sessionStartupBackfill = createSessionStartupBackfill({
      enabled: config.session.startupBackfillEnabled,
      repository: createKyselySlackThreadBackfillRepository(dbClient),
      source: activeSlackTransport
        ? {
            fetchThreadMessages: async (request): Promise<
              ReadonlyArray<SlackThreadHistoryMessage>
            > =>
              activeSlackTransport.fetchThreadMessages({
                channelId: request.channelId,
                threadTs: request.threadTs,
                oldestMessageTs: request.oldestMessageTs,
              }),
          }
        : null,
      historyStore: activeSessionHistoryStore,
    });
    const startupBackfillResult = await sessionStartupBackfill.reconcile();
    console.log(
      `[gravity] session startup backfill scanned ${startupBackfillResult.sessionsScanned} session(s), appended ${startupBackfillResult.messagesAppended} message(s)`,
    );

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
