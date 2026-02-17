export type AppConfig = {
  env: string;
  databaseUrl: string;
  livenessIntervalSeconds: number;
};

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
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
    databaseUrl:
      env.DATABASE_URL ??
      "postgres://gravity:gravity@localhost:5432/gravity?sslmode=disable",
    livenessIntervalSeconds,
  };
}
