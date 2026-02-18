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
    });
  });

  it("uses explicit environment overrides", () => {
    const databaseUrlEnvVar = runtimeConfig.infra.database.urlEnvVar;
    const config = loadConfig({
      GRAVITY_ENV: "test",
      [databaseUrlEnvVar]: "postgres://custom-url",
      GRAVITY_LIVENESS_INTERVAL_SECONDS: "45",
    });

    expect(config).toEqual({
      env: "test",
      databaseUrl: "postgres://custom-url",
      livenessIntervalSeconds: 45,
      slackAppToken: null,
      slackBotToken: null,
      anthropicApiKey: null,
    });
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
});
