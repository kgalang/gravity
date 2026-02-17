import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/runtime/config.js";

describe("loadConfig", () => {
  it("returns defaults when env vars are missing", () => {
    const config = loadConfig({});

    expect(config).toEqual({
      env: "dev",
      databaseUrl:
        "postgres://gravity:gravity@localhost:5432/gravity?sslmode=disable",
      livenessIntervalSeconds: 30,
    });
  });

  it("uses explicit environment overrides", () => {
    const config = loadConfig({
      GRAVITY_ENV: "test",
      DATABASE_URL: "postgres://custom-url",
      GRAVITY_LIVENESS_INTERVAL_SECONDS: "45",
    });

    expect(config).toEqual({
      env: "test",
      databaseUrl: "postgres://custom-url",
      livenessIntervalSeconds: 45,
    });
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
