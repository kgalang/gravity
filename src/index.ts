import process from "node:process";
import type { Kysely } from "kysely";
import {
  AgentRegistry,
  type RoutedInboundSlackMessage,
} from "./runtime/agent-registry.js";
import { loadConfig } from "./runtime/config.js";
import { createDb, destroyDb, type GravityDatabase } from "./runtime/db.js";
import {
  createConsoleRunLifecycleLogger,
  createRunContext,
  withRunLifecycle,
} from "./runtime/run-lifecycle.js";
import {
  type InboundSlackMessage,
  SlackTransport,
} from "./runtime/slack-transport.js";

process.loadEnvFile();

const lifecycleLogger = createConsoleRunLifecycleLogger();

const bootstrapRunContext = createRunContext({
  agentId: "system-bootstrap",
  sessionKey: "system-bootstrap:main",
  source: "system",
});

let livenessTicker: NodeJS.Timeout | null = null;
let slackTransport: SlackTransport | null = null;
let runtimeDb: Kysely<GravityDatabase> | null = null;
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

  if (runtimeDb !== null) {
    await destroyDb(runtimeDb);
    runtimeDb = null;
  }

  console.log(`[gravity] received ${signal}; shutdown complete`);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

function logRoutedSlackMessage(message: RoutedInboundSlackMessage): void {
  console.log(`[gravity] slack routed ${JSON.stringify(message)}`);
}

function createSlackInboundMessageHandler(
  agentRegistry: AgentRegistry,
): (message: InboundSlackMessage) => void {
  return (message) => {
    const routedMessage = agentRegistry.resolveInboundMessage(message);
    if (!routedMessage) {
      console.log(
        `[gravity] slack inbound ignored (unmapped channelId=${message.channelId} sourceEventId=${message.sourceEventId})`,
      );
      return;
    }

    logRoutedSlackMessage(routedMessage);
  };
}

try {
  await withRunLifecycle(bootstrapRunContext, lifecycleLogger, async () => {
    const config = loadConfig(process.env);
    const startedAt = new Date().toISOString();

    console.log(`[gravity] bootstrap started at ${startedAt}`);
    console.log(`[gravity] env=${config.env}`);
    console.log(`[gravity] database=${config.databaseUrl}`);
    console.log("[gravity] runtime scaffold active");

    runtimeDb = createDb(config.databaseUrl);
    const agentRegistry = new AgentRegistry(runtimeDb);
    await agentRegistry.refresh();

    if (config.slackAppToken && config.slackBotToken) {
      slackTransport = new SlackTransport({
        appToken: config.slackAppToken,
        botToken: config.slackBotToken,
        onInboundMessage: createSlackInboundMessageHandler(agentRegistry),
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
  if (runtimeDb !== null) {
    await destroyDb(runtimeDb);
    runtimeDb = null;
  }
  const message =
    error instanceof Error ? error.message : "Unknown bootstrap failure";
  console.error(`[gravity] bootstrap failed: ${message}`);
  process.exit(1);
}
