import type { SessionMode } from "./session-catalog.js";

export function buildMainSessionKey(agentId: string): string {
  return `${agentId}:main`;
}

export function buildIsolatedSessionKey(
  agentId: string,
  sourceEventId: string,
): string {
  return `${agentId}:${sourceEventId}`;
}

export function buildThreadSessionKey(agentId: string, threadTs: string): string {
  return `${agentId}:${threadTs}`;
}

export function buildDmThreadFallbackSessionKey(
  agentId: string,
  channelId: string,
): string {
  return `${agentId}:${channelId}`;
}

export function buildSlashThreadSessionKey(
  agentId: string,
  threadTs: string,
): string {
  return buildThreadSessionKey(agentId, threadTs);
}

export function buildSlashSessionKey(input: {
  agentId: string;
  channelId: string;
  threadTs: string;
  sourceEventId: string;
  sessionMode: SessionMode;
}): string {
  if (input.sessionMode === "main") {
    return buildMainSessionKey(input.agentId);
  }

  if (input.sessionMode === "isolated") {
    return buildIsolatedSessionKey(input.agentId, input.sourceEventId);
  }

  if (input.threadTs.trim().length === 0) {
    return buildDmThreadFallbackSessionKey(input.agentId, input.channelId);
  }

  return buildSlashThreadSessionKey(input.agentId, input.threadTs);
}

export function buildMessageSessionKey(input: {
  agentId: string;
  channelId: string;
  threadTs: string;
  sourceEventId: string;
  sessionMode: SessionMode;
  isDirectMessage: boolean;
}): string {
  if (input.sessionMode === "main") {
    return buildMainSessionKey(input.agentId);
  }

  if (input.sessionMode === "isolated") {
    return buildIsolatedSessionKey(input.agentId, input.sourceEventId);
  }

  if (input.isDirectMessage) {
    return buildDmThreadFallbackSessionKey(input.agentId, input.channelId);
  }

  return buildThreadSessionKey(input.agentId, input.threadTs);
}

export function buildProactiveSessionKey(input: {
  agentId: string;
  triggerId: string;
  sourceEventId: string;
  sessionMode: SessionMode;
}): string {
  if (input.sessionMode === "main") {
    return buildMainSessionKey(input.agentId);
  }

  if (input.sessionMode === "thread") {
    return `${input.agentId}:proactive:${input.triggerId}:thread`;
  }

  return `${input.agentId}:proactive:${input.triggerId}:${input.sourceEventId}`;
}
