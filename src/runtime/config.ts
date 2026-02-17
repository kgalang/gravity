export type AppConfig = {
  env: string;
  databaseUrl: string;
  heartbeatSeconds: number;
};

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const heartbeatRaw = env.GRAVITY_BOOTSTRAP_HEARTBEAT_SECONDS ?? "30";
  const heartbeatSeconds = Number(heartbeatRaw);

  if (!Number.isFinite(heartbeatSeconds) || heartbeatSeconds < 5) {
    throw new Error(
      "GRAVITY_BOOTSTRAP_HEARTBEAT_SECONDS must be a number >= 5",
    );
  }

  return {
    env: env.GRAVITY_ENV ?? "dev",
    databaseUrl:
      env.DATABASE_URL ??
      "postgres://gravity:gravity@localhost:5432/gravity?sslmode=disable",
    heartbeatSeconds,
  };
}
