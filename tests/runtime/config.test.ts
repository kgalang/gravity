import { describe, expect, it } from "vitest";
import { runtimeConfig } from "../../agents/index.js";
import { loadConfig } from "../../src/runtime/config.js";

describe("loadConfig", () => {
  it("returns defaults when env vars are missing", () => {
    const config = loadConfig({});

    expect(config).toEqual({
      env: "dev",
      databaseUrl:
        "postgres://gravity:gravity@localhost:5432/gravity?sslmode=disable",
      livenessIntervalSeconds: 30,
      slackAppToken: null,
      slackBotToken: null,
      anthropicApiKey: null,
      session: {
        preRunSyncEnabled: true,
        startupBackfillEnabled: true,
        overflowRecoveryEnabled: true,
        compaction: {
          enabled: true,
          reserveTokens: 16384,
          keepRecentTokens: 20000,
        },
        retry: {
          enabled: true,
          maxRetries: 2,
          baseDelayMs: 1000,
          maxDelayMs: 5000,
        },
        idleEviction: {
          enabled: true,
          timeoutMs: 30 * 60 * 1000,
          memoryHookEnabled: true,
        },
      },
      runtimeWarnings: [],
    });
  });

  it("uses explicit environment overrides", () => {
    const databaseUrlEnvVar = runtimeConfig.infra.database.urlEnvVar;
    const config = loadConfig({
      GRAVITY_ENV: "test",
      [databaseUrlEnvVar]: "postgres://custom-url",
      GRAVITY_LIVENESS_INTERVAL_SECONDS: "45",
      GRAVITY_SESSION_IDLE_EVICTION_MINUTES: "5",
    });

    expect(config.env).toBe("test");
    expect(config.databaseUrl).toBe("postgres://custom-url");
    expect(config.livenessIntervalSeconds).toBe(45);
    expect(config.session.idleEviction.timeoutMs).toBe(5 * 60 * 1000);
    expect(config.runtimeWarnings).toEqual([]);
  });

  it("normalizes optional Slack tokens", () => {
    const slackAppTokenEnvVar = runtimeConfig.infra.slack.appTokenEnvVar;
    const slackBotTokenEnvVar = runtimeConfig.infra.slack.botTokenEnvVar;
    const modelApiKeyEnvVar = runtimeConfig.infra.modelProvider.apiKeyEnvVar;
    const config = loadConfig({
      [slackAppTokenEnvVar]: "  xapp-abc  ",
      [slackBotTokenEnvVar]: "",
      [modelApiKeyEnvVar]: "  key-123  ",
    });

    expect(config.slackAppToken).toBe("xapp-abc");
    expect(config.slackBotToken).toBeNull();
    expect(config.anthropicApiKey).toBe("key-123");
  });

  it("throws on invalid liveness interval values", () => {
    expect(() =>
      loadConfig({
        GRAVITY_LIVENESS_INTERVAL_SECONDS: "4",
      }),
    ).toThrow("GRAVITY_LIVENESS_INTERVAL_SECONDS must be a number >= 5");

    expect(() =>
      loadConfig({
        GRAVITY_LIVENESS_INTERVAL_SECONDS: "NaN",
      }),
    ).toThrow("GRAVITY_LIVENESS_INTERVAL_SECONDS must be a number >= 5");
  });

  it("fails closed with runtime warnings on invalid CP6 feature config", () => {
    const config = loadConfig({
      GRAVITY_SESSION_PRE_RUN_SYNC_ENABLED: "maybe",
      GRAVITY_SESSION_COMPACTION_RESERVE_TOKENS: "not-a-number",
      GRAVITY_SESSION_RETRY_MAX_DELAY_MS: "50",
      GRAVITY_SESSION_IDLE_EVICTION_MINUTES: "0",
      GRAVITY_SESSION_MEMORY_HOOK_ENABLED: "true",
    });

    expect(config.session.preRunSyncEnabled).toBe(false);
    expect(config.session.compaction.enabled).toBe(false);
    expect(config.session.retry.enabled).toBe(false);
    expect(config.session.idleEviction.enabled).toBe(false);
    expect(config.session.idleEviction.memoryHookEnabled).toBe(false);
    expect(config.runtimeWarnings.length).toBeGreaterThan(0);
  });
});
