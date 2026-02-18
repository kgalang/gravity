import process from "node:process";
import { loadConfig } from "./runtime/config.js";
import { createDb, destroyDb } from "./runtime/db.js";
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
  type InboundSlackSlashCommand,
  type SlackSlashCommandAckResponse,
  SlackTransport,
} from "./runtime/slack-transport.js";
import {
  createDefaultSlashCommandAgentMap,
  resolveAgentIdForSlashCommand,
} from "./runtime/slash-command-router.js";

process.loadEnvFile();

const lifecycleLogger = createConsoleRunLifecycleLogger();

const bootstrapRunContext = createRunContext({
  agentId: "system-bootstrap",
  sessionKey: "system-bootstrap:main",
  source: "system",
});

let livenessTicker: NodeJS.Timeout | null = null;
let slackTransport: SlackTransport | null = null;
let dbClient: ReturnType<typeof createDb> | null = null;
let runLogStore: RunLogStore | null = null;
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

  if (slackTransport !== null) {
    await slackTransport.stop();
    slackTransport = null;
  }

  if (dbClient !== null) {
    await destroyDb(dbClient);
    dbClient = null;
  }

  runLogStore = null;

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
const enableSlackMessageEvents = false;

function createSlashRunId(sourceEventId: string): string {
  return `slack:${sourceEventId}`;
}

function createSlashSessionKey(agentId: string, sourceEventId: string): string {
  return `${agentId}:${sourceEventId}`;
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
    response_type: "in_channel",
    text: `Gravity routed ${command.command} to ${agentId}. Input: ${normalizedText}`,
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

async function handleInboundSlashCommand(
  command: InboundSlackSlashCommand,
): Promise<void> {
  const decision = resolveSlashCommandDecision(command);
  if (!decision.agentId) {
    console.log(
      `[gravity] slash command ignored (unmapped command=${command.command} sourceEventId=${command.sourceEventId})`,
    );
    return;
  }

  if (!runLogStore) {
    throw new Error("Run log store is not initialized");
  }

  const runId = createSlashRunId(command.sourceEventId);
  const sessionKey = createSlashSessionKey(decision.agentId, command.sourceEventId);
  let resultSummary: string | null = null;

  const runContext = createRunContext({
    runId,
    agentId: decision.agentId,
    sessionKey,
    source: "slack",
  });

  const persistenceLogger = runLogStore.createLifecycleLogger({
    query: decision.query,
    sourceEventId: command.sourceEventId,
    channelId: command.channelId,
    userId: command.userId,
    policyDecisions: {
      trigger: "slash_command",
      response_type: decision.ackResponse.response_type,
    },
    getResultSummary: () => resultSummary,
  });

  await withRunLifecycle(
    runContext,
    composeRunLifecycleLoggers([lifecycleLogger, persistenceLogger]),
    async () => {
      resultSummary = decision.ackResponse.text;
      console.log(
        `[gravity] slash routed ${JSON.stringify({ ...command, agentId: decision.agentId, runId, sessionKey, responseType: decision.ackResponse.response_type })}`,
      );
    },
  );
}

try {
  await withRunLifecycle(bootstrapRunContext, lifecycleLogger, async () => {
    const config = loadConfig(process.env);
    const startedAt = new Date().toISOString();

    console.log(`[gravity] bootstrap started at ${startedAt}`);
    console.log(`[gravity] env=${config.env}`);
    console.log(`[gravity] database=${config.databaseUrl}`);
    console.log("[gravity] runtime scaffold active");
    dbClient = createDb(config.databaseUrl);
    runLogStore = createRunLogStore(createKyselyRunLogRepository(dbClient));
    console.log("[gravity] run log store active (gravity.runs)");

    if (config.slackAppToken && config.slackBotToken) {
      console.log(
        "[gravity] slack trigger policy: slash commands only (app_mention/message disabled)",
      );
      slackTransport = new SlackTransport({
        appToken: config.slackAppToken,
        botToken: config.slackBotToken,
        enableMessageEvents: enableSlackMessageEvents,
        onInboundSlashCommand: handleInboundSlashCommand,
        onSlashCommandAcknowledge: handleSlashCommandAcknowledge,
      });
      await slackTransport.start();
    } else {
      console.log(
        "[gravity] slack transport disabled (set SLACK_APP_TOKEN and SLACK_BOT_TOKEN to enable)",
      );
    }

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
