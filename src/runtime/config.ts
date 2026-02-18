import { runtimeConfig } from "../../agents/index.js";

export type AppConfig = {
  env: string;
  databaseUrl: string;
  livenessIntervalSeconds: number;
  slackAppToken: string | null;
  slackBotToken: string | null;
  anthropicApiKey: string | null;
};

const DEFAULT_DATABASE_URL =
  "postgres://gravity:gravity@localhost:5432/gravity?sslmode=disable";

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

  return {
    env: env.GRAVITY_ENV ?? "dev",
    databaseUrl: env[databaseUrlEnvVar] ?? DEFAULT_DATABASE_URL,
    livenessIntervalSeconds,
    slackAppToken: normalizeOptionalEnv(env[slackAppTokenEnvVar]),
    slackBotToken: normalizeOptionalEnv(env[slackBotTokenEnvVar]),
    anthropicApiKey: normalizeOptionalEnv(env[modelApiKeyEnvVar]),
  };
}
