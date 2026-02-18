import type { Kysely } from "kysely";
import type { GravityDatabase } from "./db.js";
import { gravitySchema } from "./db.js";
import type { InboundSlackMessage } from "./slack-transport.js";

type AgentChannelRow = {
  id: string;
  channel_id: string | null;
};

export type RoutedInboundSlackMessage = InboundSlackMessage & {
  agentId: string;
};

export function buildChannelAgentMap(
  rows: ReadonlyArray<AgentChannelRow>,
  log: (line: string) => void = console.log,
): Map<string, string> {
  const routes = new Map<string, string>();

  for (const row of rows) {
    const normalizedChannelId = row.channel_id?.trim();
    if (!normalizedChannelId) {
      continue;
    }

    const existingAgentId = routes.get(normalizedChannelId);
    if (existingAgentId) {
      log(
        `[gravity] duplicate active channel route detected (channelId=${normalizedChannelId}); keeping agentId=${existingAgentId}, ignoring agentId=${row.id}`,
      );
      continue;
    }

    routes.set(normalizedChannelId, row.id);
  }

  return routes;
}

export function resolveInboundSlackRoute(
  message: InboundSlackMessage,
  channelAgentMap: ReadonlyMap<string, string>,
): RoutedInboundSlackMessage | null {
  const agentId = channelAgentMap.get(message.channelId);
  if (!agentId) {
    return null;
  }

  return {
    ...message,
    agentId,
  };
}

export class AgentRegistry {
  private channelAgentMap = new Map<string, string>();

  constructor(
    private readonly db: Kysely<GravityDatabase>,
    private readonly log: (line: string) => void = console.log,
  ) {}

  async refresh(): Promise<void> {
    const rows = await gravitySchema(this.db)
      .selectFrom("agents")
      .select(["id", "channel_id"])
      .where("status", "=", "active")
      .where("channel_id", "is not", null)
      .execute();

    this.channelAgentMap = buildChannelAgentMap(rows, this.log);
    this.log(
      `[gravity] loaded ${this.channelAgentMap.size} active channel routes`,
    );
  }

  resolveInboundMessage(
    message: InboundSlackMessage,
  ): RoutedInboundSlackMessage | null {
    return resolveInboundSlackRoute(message, this.channelAgentMap);
  }

  getChannelMapSnapshot(): ReadonlyMap<string, string> {
    return new Map(this.channelAgentMap);
  }
}
