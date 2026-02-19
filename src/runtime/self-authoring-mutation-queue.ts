export type SelfAuthoringMutationQueueResult<T> =
  | Readonly<{
      status: "enqueued";
      queueSeq: number;
      completion: Promise<T>;
    }>
  | Readonly<{
      status: "deduped_duplicate";
      queueSeq: null;
      completion: null;
    }>
  | Readonly<{
      status: "queue_overflow";
      queueSeq: null;
      completion: null;
      maxDepth: number;
    }>;

export type SelfAuthoringMutationQueue = Readonly<{
  enqueue: <T>(input: {
    lockScopeKey: string;
    triggerKey: string;
    task: () => Promise<T>;
  }) => SelfAuthoringMutationQueueResult<T>;
}>;

type QueueItem<T = unknown> = {
  queueSeq: number;
  triggerKey: string;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

type ScopeQueueState = {
  active: boolean;
  nextQueueSeq: number;
  pending: QueueItem[];
  activeOrQueuedTriggerKeys: Set<string>;
  completedTriggerKeys: Set<string>;
  completedTriggerOrder: string[];
};

type CreateSelfAuthoringMutationQueueInput = Readonly<{
  maxDepth: number;
  completedTriggerCacheSize?: number;
}>;

function getScopeState(
  scopes: Map<string, ScopeQueueState>,
  lockScopeKey: string,
): ScopeQueueState {
  const existing = scopes.get(lockScopeKey);
  if (existing) {
    return existing;
  }

  const created: ScopeQueueState = {
    active: false,
    nextQueueSeq: 1,
    pending: [],
    activeOrQueuedTriggerKeys: new Set<string>(),
    completedTriggerKeys: new Set<string>(),
    completedTriggerOrder: [],
  };
  scopes.set(lockScopeKey, created);
  return created;
}

function addCompletedTrigger(input: {
  state: ScopeQueueState;
  triggerKey: string;
  maxSize: number;
}): void {
  const { state, triggerKey, maxSize } = input;

  if (!state.completedTriggerKeys.has(triggerKey)) {
    state.completedTriggerKeys.add(triggerKey);
    state.completedTriggerOrder.push(triggerKey);
  }

  while (state.completedTriggerOrder.length > maxSize) {
    const evicted = state.completedTriggerOrder.shift();
    if (!evicted) {
      continue;
    }
    state.completedTriggerKeys.delete(evicted);
  }
}

function queueDepth(state: ScopeQueueState): number {
  return state.pending.length + (state.active ? 1 : 0);
}

export function createSelfAuthoringMutationQueue(
  input: CreateSelfAuthoringMutationQueueInput,
): SelfAuthoringMutationQueue {
  const maxDepth = Math.max(1, Math.floor(input.maxDepth));
  const completedTriggerCacheSize = Math.max(
    1,
    Math.floor(input.completedTriggerCacheSize ?? 4096),
  );
  const scopes = new Map<string, ScopeQueueState>();

  async function drain(lockScopeKey: string): Promise<void> {
    const state = getScopeState(scopes, lockScopeKey);
    if (state.active) {
      return;
    }

    state.active = true;
    try {
      while (state.pending.length > 0) {
        const item = state.pending.shift();
        if (!item) {
          continue;
        }

        try {
          const value = await item.task();
          item.resolve(value);
        } catch (error) {
          item.reject(error);
        } finally {
          state.activeOrQueuedTriggerKeys.delete(item.triggerKey);
          addCompletedTrigger({
            state,
            triggerKey: item.triggerKey,
            maxSize: completedTriggerCacheSize,
          });
        }
      }
    } finally {
      state.active = false;
    }
  }

  return {
    enqueue<T>({
      lockScopeKey,
      triggerKey,
      task,
    }: {
      lockScopeKey: string;
      triggerKey: string;
      task: () => Promise<T>;
    }) {
      const state = getScopeState(scopes, lockScopeKey);

      if (
        state.activeOrQueuedTriggerKeys.has(triggerKey) ||
        state.completedTriggerKeys.has(triggerKey)
      ) {
        return {
          status: "deduped_duplicate",
          queueSeq: null,
          completion: null,
        };
      }

      if (queueDepth(state) >= maxDepth) {
        return {
          status: "queue_overflow",
          queueSeq: null,
          completion: null,
          maxDepth,
        };
      }

      const queueSeq = state.nextQueueSeq;
      state.nextQueueSeq += 1;
      state.activeOrQueuedTriggerKeys.add(triggerKey);

      let resolveCompletion: ((value: T) => void) | null = null;
      let rejectCompletion: ((error: unknown) => void) | null = null;
      const completion = new Promise<T>((resolve, reject) => {
        resolveCompletion = resolve;
        rejectCompletion = reject;
      });

      state.pending.push({
        queueSeq,
        triggerKey,
        task,
        resolve: (value) => {
          resolveCompletion?.(value as T);
        },
        reject: (error) => {
          rejectCompletion?.(error);
        },
      });

      void drain(lockScopeKey);

      return {
        status: "enqueued",
        queueSeq,
        completion,
      };
    },
  };
}
