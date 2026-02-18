import type {
  AgentConfig,
  AgentIngressBindingMatch,
} from "./agent-config.js";
import type { InboundSlackMessage } from "./slack-transport.js";
import type { SessionMode } from "./session-catalog.js";

export type MessageEntrypoint = "app_mention" | "thread_reply" | "direct_message";

export type ActiveAgentIngressRow = {
  id: string;
  channel_id: string | null;
  config: AgentConfig;
};

export type ResolvedMessageIngress = {
  agentId: string;
  entrypoint: MessageEntrypoint;
  sessionMode: SessionMode;
  route: "binding";
};

export type ResolveMessageIngressOptions = {
  threadOwnerAgentId?: string | null;
};

type IngressBinding = {
  kind: "message";
  surface: "slack";
  entrypoint: MessageEntrypoint;
  enabled: boolean;
  sessionMode: SessionMode;
  match: AgentIngressBindingMatch;
};

function defaultSessionModeForEntrypoint(entrypoint: MessageEntrypoint): SessionMode {
  return entrypoint === "direct_message" ? "main" : "thread";
}

function parseIngressBindings(config: AgentConfig): IngressBinding[] {
  const bindings: IngressBinding[] = [];

  for (const rawBinding of config.ingressBindings ?? []) {
    if (!rawBinding || typeof rawBinding !== "object") {
      continue;
    }

    if (
      rawBinding.kind !== "message" ||
      rawBinding.surface !== "slack" ||
      rawBinding.entrypoint === "slash_command"
    ) {
      continue;
    }

    const enabled = rawBinding.enabled ?? true;
    if (!enabled) {
      continue;
    }

    const entrypoint = rawBinding.entrypoint;
    bindings.push({
      kind: "message",
      surface: "slack",
      entrypoint,
      enabled,
      sessionMode:
        rawBinding.sessionMode ??
        defaultSessionModeForEntrypoint(entrypoint),
      match: rawBinding.match ?? {},
    });
  }

  return bindings;
}

function deriveMessageEntrypoint(
  message: InboundSlackMessage,
): MessageEntrypoint | null {
  if (message.surface === "app_mention") {
    return "app_mention";
  }

  if (message.isDirectMessage) {
    return "direct_message";
  }

  if (message.threadTs !== message.messageTs) {
    return "thread_reply";
  }

  return null;
}

function bindingMatchesMessage(
  binding: IngressBinding,
  agent: ActiveAgentIngressRow,
  message: InboundSlackMessage,
  entrypoint: MessageEntrypoint,
  options: ResolveMessageIngressOptions,
): boolean {
  if (binding.entrypoint !== entrypoint) {
    return false;
  }

  const matchChannelId = binding.match.channelId;
  if (matchChannelId && matchChannelId !== message.channelId) {
    return false;
  }

  const matchUserId = binding.match.userId;
  if (matchUserId && matchUserId !== message.userId) {
    return false;
  }

  const matchIsDirectMessage = binding.match.isDirectMessage;
  if (
    matchIsDirectMessage !== undefined &&
    matchIsDirectMessage !== message.isDirectMessage
  ) {
    return false;
  }

  const matchThreadOwnedByAgent = binding.match.threadOwnedByAgent;
  if (matchThreadOwnedByAgent === true && entrypoint !== "thread_reply") {
    return false;
  }
  if (matchThreadOwnedByAgent === true) {
    return options.threadOwnerAgentId === agent.id;
  }
  if (matchThreadOwnedByAgent === false && options.threadOwnerAgentId === agent.id) {
    return false;
  }

  return true;
}

type ResolvedBindingCandidate = ResolvedMessageIngress & {
  channelAffinityScore: number;
};

function sortResolvedMatches(a: ResolvedBindingCandidate, b: ResolvedBindingCandidate): number {
  if (a.channelAffinityScore !== b.channelAffinityScore) {
    return b.channelAffinityScore - a.channelAffinityScore;
  }

  return a.agentId.localeCompare(b.agentId);
}

export function resolveMessageIngress(
  message: InboundSlackMessage,
  agents: ReadonlyArray<ActiveAgentIngressRow>,
  options: ResolveMessageIngressOptions = {},
): ResolvedMessageIngress | null {
  const entrypoint = deriveMessageEntrypoint(message);
  if (!entrypoint) {
    return null;
  }

  const resolvedFromBindings: ResolvedBindingCandidate[] = [];
  for (const agent of agents) {
    const bindings = parseIngressBindings(agent.config);
    for (const binding of bindings) {
      if (!bindingMatchesMessage(binding, agent, message, entrypoint, options)) {
        continue;
      }

      resolvedFromBindings.push({
        agentId: agent.id,
        entrypoint,
        sessionMode: binding.sessionMode,
        route: "binding",
        channelAffinityScore: agent.channel_id === message.channelId ? 1 : 0,
      });
    }
  }

  if (resolvedFromBindings.length > 0) {
    resolvedFromBindings.sort(sortResolvedMatches);
    const winner = resolvedFromBindings[0];
    if (!winner) {
      return null;
    }

    return {
      agentId: winner.agentId,
      entrypoint: winner.entrypoint,
      sessionMode: winner.sessionMode,
      route: winner.route,
    };
  }

  return null;
}
