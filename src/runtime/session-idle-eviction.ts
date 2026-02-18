export type SessionIdleCloseReason = "idle_eviction" | "shutdown";

export type SessionIdleEvent = Readonly<{
  agentId: string;
  sessionKey: string;
  reason: SessionIdleCloseReason;
  lastActivityAt: string;
  closedAt: string;
}>;

export type SessionIdleEvictionCoordinator = {
  recordActivity: (input: { agentId: string; sessionKey: string }) => void;
  shutdown: () => Promise<void>;
};

type SessionIdleEvictionConfig = {
  enabled: boolean;
  idleTimeoutMs: number;
  onSessionIdle: (event: SessionIdleEvent) => Promise<void> | void;
  now?: () => Date;
};

type SessionTracker = {
  agentId: string;
  sessionKey: string;
  lastActivityAt: Date;
  timer: NodeJS.Timeout;
};

function sessionMapKey(agentId: string, sessionKey: string): string {
  return `${agentId}:${sessionKey}`;
}

function normalizeRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Session idle eviction ${label} must be non-empty`);
  }

  return trimmed;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function createSessionIdleEvictionCoordinator(
  config: SessionIdleEvictionConfig,
): SessionIdleEvictionCoordinator {
  const now = config.now ?? (() => new Date());
  const trackers = new Map<string, SessionTracker>();

  async function closeSession(
    tracker: SessionTracker,
    reason: SessionIdleCloseReason,
  ): Promise<void> {
    await config.onSessionIdle({
      agentId: tracker.agentId,
      sessionKey: tracker.sessionKey,
      reason,
      lastActivityAt: tracker.lastActivityAt.toISOString(),
      closedAt: now().toISOString(),
    });
  }

  function logCloseError(
    tracker: SessionTracker,
    reason: SessionIdleCloseReason,
    error: unknown,
  ): void {
    console.error(
      `[gravity][warning] session idle eviction callback failed (agentId=${tracker.agentId} sessionKey=${tracker.sessionKey} reason=${reason}): ${normalizeErrorMessage(error)}`,
    );
  }

  function scheduleEviction(tracker: SessionTracker): void {
    tracker.timer = setTimeout(() => {
      trackers.delete(sessionMapKey(tracker.agentId, tracker.sessionKey));
      void closeSession(tracker, "idle_eviction").catch((error) => {
        logCloseError(tracker, "idle_eviction", error);
      });
    }, config.idleTimeoutMs);
    tracker.timer.unref?.();
  }

  return {
    recordActivity(input) {
      if (!config.enabled) {
        return;
      }

      const agentId = normalizeRequired(input.agentId, "agentId");
      const sessionKey = normalizeRequired(input.sessionKey, "sessionKey");
      const key = sessionMapKey(agentId, sessionKey);
      const existing = trackers.get(key);

      if (existing) {
        clearTimeout(existing.timer);
        existing.lastActivityAt = now();
        scheduleEviction(existing);
        return;
      }

      const tracker: SessionTracker = {
        agentId,
        sessionKey,
        lastActivityAt: now(),
        timer: setTimeout(() => undefined, 0),
      };
      scheduleEviction(tracker);
      trackers.set(key, tracker);
    },
    async shutdown() {
      const pending = [...trackers.values()];
      trackers.clear();

      for (const tracker of pending) {
        clearTimeout(tracker.timer);
        try {
          await closeSession(tracker, "shutdown");
        } catch (error) {
          logCloseError(tracker, "shutdown", error);
        }
      }
    },
  };
}
