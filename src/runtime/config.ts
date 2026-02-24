import { runtimeConfig } from "../../agents/index.js";

export type SessionRuntimeConfig = Readonly<{
  preRunSyncEnabled: boolean;
  startupBackfillEnabled: boolean;
  overflowRecoveryEnabled: boolean;
  compaction: Readonly<{
    enabled: boolean;
    reserveTokens: number;
    keepRecentTokens: number;
  }>;
  retry: Readonly<{
    enabled: boolean;
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  }>;
  idleEviction: Readonly<{
    enabled: boolean;
    timeoutMs: number;
    memoryHookEnabled: boolean;
  }>;
}>;

export type SelfAuthoringRuntimeConfig = Readonly<{
  enabled: boolean;
  queueMaxDepth: number;
}>;

export type SandboxRuntimeConfig = Readonly<{
  enabled: boolean;
  forceHost: boolean;
}>;

export type AppConfig = {
  env: string;
  databaseUrl: string;
  livenessIntervalSeconds: number;
  slackAppToken: string | null;
  slackBotToken: string | null;
  anthropicApiKey: string | null;
  session: SessionRuntimeConfig;
  selfAuthoring: SelfAuthoringRuntimeConfig;
  sandbox: SandboxRuntimeConfig;
  runtimeWarnings: readonly string[];
};

const DEFAULT_DATABASE_URL =
  "postgres://gravity:gravity@localhost:5432/gravity?sslmode=disable";

const DEFAULT_COMPACTION_RESERVE_TOKENS = 16384;
const DEFAULT_COMPACTION_KEEP_RECENT_TOKENS = 20000;
const DEFAULT_RETRY_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_RETRY_MAX_DELAY_MS = 5000;
const DEFAULT_IDLE_EVICTION_MINUTES = 30;
const DEFAULT_SELF_AUTHORING_QUEUE_MAX_DEPTH = 8;

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseFeatureBoolean(input: {
  env: NodeJS.ProcessEnv;
  key: string;
  defaultValue: boolean;
  warnings: string[];
}): boolean {
  const raw = input.env[input.key];
  if (raw === undefined) {
    return input.defaultValue;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }

  input.warnings.push(
    `Invalid ${input.key}="${raw}". Feature is disabled (fail-closed).`,
  );
  return false;
}

function parseRequiredInteger(input: {
  env: NodeJS.ProcessEnv;
  key: string;
  defaultValue: number;
  min: number;
  warnings: string[];
}): number | null {
  const raw = input.env[input.key];
  if (raw === undefined) {
    return input.defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < input.min) {
    input.warnings.push(
      `Invalid ${input.key}="${raw}". Expected integer >= ${input.min}.`,
    );
    return null;
  }

  return parsed;
}

function resolveSessionRuntimeConfig(
  env: NodeJS.ProcessEnv,
  warnings: string[],
): SessionRuntimeConfig {
  const preRunSyncEnabled = parseFeatureBoolean({
    env,
    key: "GRAVITY_SESSION_PRE_RUN_SYNC_ENABLED",
    defaultValue: true,
    warnings,
  });
  const startupBackfillEnabled = parseFeatureBoolean({
    env,
    key: "GRAVITY_SESSION_STARTUP_BACKFILL_ENABLED",
    defaultValue: true,
    warnings,
  });
  const overflowRecoveryEnabled = parseFeatureBoolean({
    env,
    key: "GRAVITY_SESSION_OVERFLOW_RECOVERY_ENABLED",
    defaultValue: true,
    warnings,
  });

  let compactionEnabled = parseFeatureBoolean({
    env,
    key: "GRAVITY_SESSION_COMPACTION_ENABLED",
    defaultValue: true,
    warnings,
  });
  let compactionReserveTokens = DEFAULT_COMPACTION_RESERVE_TOKENS;
  let compactionKeepRecentTokens = DEFAULT_COMPACTION_KEEP_RECENT_TOKENS;

  if (compactionEnabled) {
    const reserve = parseRequiredInteger({
      env,
      key: "GRAVITY_SESSION_COMPACTION_RESERVE_TOKENS",
      defaultValue: DEFAULT_COMPACTION_RESERVE_TOKENS,
      min: 1024,
      warnings,
    });
    const keepRecent = parseRequiredInteger({
      env,
      key: "GRAVITY_SESSION_COMPACTION_KEEP_RECENT_TOKENS",
      defaultValue: DEFAULT_COMPACTION_KEEP_RECENT_TOKENS,
      min: 1024,
      warnings,
    });

    if (reserve === null || keepRecent === null) {
      warnings.push(
        "Compaction settings are invalid; compaction is disabled (fail-closed).",
      );
      compactionEnabled = false;
    } else {
      compactionReserveTokens = reserve;
      compactionKeepRecentTokens = keepRecent;
    }
  }

  let retryEnabled = parseFeatureBoolean({
    env,
    key: "GRAVITY_SESSION_RETRY_ENABLED",
    defaultValue: true,
    warnings,
  });
  let retryMaxRetries = DEFAULT_RETRY_MAX_RETRIES;
  let retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS;
  let retryMaxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS;

  if (retryEnabled) {
    const maxRetries = parseRequiredInteger({
      env,
      key: "GRAVITY_SESSION_RETRY_MAX_RETRIES",
      defaultValue: DEFAULT_RETRY_MAX_RETRIES,
      min: 0,
      warnings,
    });
    const baseDelayMs = parseRequiredInteger({
      env,
      key: "GRAVITY_SESSION_RETRY_BASE_DELAY_MS",
      defaultValue: DEFAULT_RETRY_BASE_DELAY_MS,
      min: 100,
      warnings,
    });
    const maxDelayMs = parseRequiredInteger({
      env,
      key: "GRAVITY_SESSION_RETRY_MAX_DELAY_MS",
      defaultValue: DEFAULT_RETRY_MAX_DELAY_MS,
      min: 100,
      warnings,
    });

    if (
      maxRetries === null ||
      baseDelayMs === null ||
      maxDelayMs === null ||
      maxDelayMs < baseDelayMs
    ) {
      warnings.push(
        "Retry settings are invalid; retry is disabled (fail-closed).",
      );
      retryEnabled = false;
    } else {
      retryMaxRetries = maxRetries;
      retryBaseDelayMs = baseDelayMs;
      retryMaxDelayMs = maxDelayMs;
    }
  }

  let idleEvictionEnabled = true;
  let idleTimeoutMinutes = DEFAULT_IDLE_EVICTION_MINUTES;
  const parsedIdleMinutes = parseRequiredInteger({
    env,
    key: "GRAVITY_SESSION_IDLE_EVICTION_MINUTES",
    defaultValue: DEFAULT_IDLE_EVICTION_MINUTES,
    min: 1,
    warnings,
  });

  if (parsedIdleMinutes === null) {
    warnings.push(
      "Idle-eviction timeout is invalid; idle eviction and session-end memory hook are disabled (fail-closed).",
    );
    idleEvictionEnabled = false;
  } else {
    idleTimeoutMinutes = parsedIdleMinutes;
  }

  let memoryHookEnabled = parseFeatureBoolean({
    env,
    key: "GRAVITY_SESSION_MEMORY_HOOK_ENABLED",
    defaultValue: true,
    warnings,
  });

  if (!idleEvictionEnabled && memoryHookEnabled) {
    warnings.push(
      "Session-end memory hook requires idle eviction; memory hook is disabled (fail-closed).",
    );
    memoryHookEnabled = false;
  }

  return {
    preRunSyncEnabled,
    startupBackfillEnabled,
    overflowRecoveryEnabled,
    compaction: {
      enabled: compactionEnabled,
      reserveTokens: compactionReserveTokens,
      keepRecentTokens: compactionKeepRecentTokens,
    },
    retry: {
      enabled: retryEnabled,
      maxRetries: retryMaxRetries,
      baseDelayMs: retryBaseDelayMs,
      maxDelayMs: retryMaxDelayMs,
    },
    idleEviction: {
      enabled: idleEvictionEnabled,
      timeoutMs: idleTimeoutMinutes * 60 * 1000,
      memoryHookEnabled: memoryHookEnabled && idleEvictionEnabled,
    },
  };
}

function resolveSelfAuthoringRuntimeConfig(
  env: NodeJS.ProcessEnv,
  warnings: string[],
): SelfAuthoringRuntimeConfig {
  const enabled = parseFeatureBoolean({
    env,
    key: "GRAVITY_SELF_AUTHORING_ENABLED",
    defaultValue: true,
    warnings,
  });

  const queueMaxDepth = parseRequiredInteger({
    env,
    key: "GRAVITY_SELF_AUTHORING_QUEUE_MAX_DEPTH",
    defaultValue: DEFAULT_SELF_AUTHORING_QUEUE_MAX_DEPTH,
    min: 1,
    warnings,
  });

  if (queueMaxDepth === null) {
    warnings.push(
      `Self-authoring queue depth is invalid; using safe default ${DEFAULT_SELF_AUTHORING_QUEUE_MAX_DEPTH}.`,
    );
  }

  return {
    enabled,
    queueMaxDepth: queueMaxDepth ?? DEFAULT_SELF_AUTHORING_QUEUE_MAX_DEPTH,
  };
}

function resolveSandboxRuntimeConfig(
  env: NodeJS.ProcessEnv,
  warnings: string[],
): SandboxRuntimeConfig {
  const enabled = parseFeatureBoolean({
    env,
    key: "GRAVITY_SANDBOX_ENABLED",
    defaultValue: true,
    warnings,
  });
  const forceHost = parseFeatureBoolean({
    env,
    key: "GRAVITY_SANDBOX_FORCE_HOST",
    defaultValue: false,
    warnings,
  });

  if (enabled && forceHost) {
    warnings.push(
      "Sandbox force-host mode is enabled; sandbox runtime requests are denied fail-closed.",
    );
  }
  if (!enabled) {
    warnings.push(
      "Sandbox runtime is globally disabled; agents with runtime=sandbox will be policy-denied.",
    );
  }

  return {
    enabled,
    forceHost,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const databaseUrlEnvVar = runtimeConfig.infra.database.urlEnvVar;
  const slackAppTokenEnvVar = runtimeConfig.infra.slack.appTokenEnvVar;
  const slackBotTokenEnvVar = runtimeConfig.infra.slack.botTokenEnvVar;
  const modelApiKeyEnvVar = runtimeConfig.infra.modelProvider.apiKeyEnvVar;
  const livenessIntervalRaw = env.GRAVITY_LIVENESS_INTERVAL_SECONDS ?? "30";
  const livenessIntervalSeconds = Number(livenessIntervalRaw);

  if (
    !Number.isFinite(livenessIntervalSeconds) ||
    livenessIntervalSeconds < 5
  ) {
    throw new Error(
      "GRAVITY_LIVENESS_INTERVAL_SECONDS must be a number >= 5",
    );
  }

  const runtimeWarnings: string[] = [];

  return {
    env: env.GRAVITY_ENV ?? "dev",
    databaseUrl: env[databaseUrlEnvVar] ?? DEFAULT_DATABASE_URL,
    livenessIntervalSeconds,
    slackAppToken: normalizeOptionalEnv(env[slackAppTokenEnvVar]),
    slackBotToken: normalizeOptionalEnv(env[slackBotTokenEnvVar]),
    anthropicApiKey: normalizeOptionalEnv(env[modelApiKeyEnvVar]),
    session: resolveSessionRuntimeConfig(env, runtimeWarnings),
    selfAuthoring: resolveSelfAuthoringRuntimeConfig(env, runtimeWarnings),
    sandbox: resolveSandboxRuntimeConfig(env, runtimeWarnings),
    runtimeWarnings,
  };
}
