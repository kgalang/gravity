import { randomUUID } from "node:crypto";

export type RunSource = "slack" | "cron" | "heartbeat" | "system";
export type RunLifecycleStage = "started" | "completed" | "failed";

export type RunLifecycleContext = {
  runId: string;
  agentId: string;
  sessionKey: string;
  source: RunSource;
};

export type RunLifecycleEvent = {
  event: "run.lifecycle";
  stage: RunLifecycleStage;
  timestamp: string;
  runId: string;
  agentId: string;
  sessionKey: string;
  source: RunSource;
  durationMs?: number;
  errorMessage?: string;
};

export type RunLifecycleLogger = (
  event: RunLifecycleEvent,
) => void | Promise<void>;

export type CreateRunContextInput = {
  agentId: string;
  sessionKey: string;
  source: RunSource;
  runId?: string;
};

export function createRunContext(
  input: CreateRunContextInput,
): RunLifecycleContext {
  return {
    runId: input.runId ?? randomUUID(),
    agentId: input.agentId,
    sessionKey: input.sessionKey,
    source: input.source,
  };
}

export function createConsoleRunLifecycleLogger(
  write: (line: string) => void = console.log,
): RunLifecycleLogger {
  return (event) => {
    write(`[gravity] ${JSON.stringify(event)}`);
  };
}

export function composeRunLifecycleLoggers(
  loggers: ReadonlyArray<RunLifecycleLogger>,
): RunLifecycleLogger {
  return async (event) => {
    for (const logger of loggers) {
      await logger(event);
    }
  };
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

export async function withRunLifecycle<T>(
  context: RunLifecycleContext,
  logger: RunLifecycleLogger,
  run: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now();
  const startedTimestamp = new Date(startedAt).toISOString();

  await logger({
    event: "run.lifecycle",
    stage: "started",
    timestamp: startedTimestamp,
    runId: context.runId,
    agentId: context.agentId,
    sessionKey: context.sessionKey,
    source: context.source,
  });

  try {
    const result = await run();
    const completedAt = Date.now();

    await logger({
      event: "run.lifecycle",
      stage: "completed",
      timestamp: new Date(completedAt).toISOString(),
      runId: context.runId,
      agentId: context.agentId,
      sessionKey: context.sessionKey,
      source: context.source,
      durationMs: completedAt - startedAt,
    });

    return result;
  } catch (error) {
    const failedAt = Date.now();

    await logger({
      event: "run.lifecycle",
      stage: "failed",
      timestamp: new Date(failedAt).toISOString(),
      runId: context.runId,
      agentId: context.agentId,
      sessionKey: context.sessionKey,
      source: context.source,
      durationMs: failedAt - startedAt,
      errorMessage: normalizeErrorMessage(error),
    });

    throw error;
  }
}
