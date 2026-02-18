import { describe, expect, it } from "vitest";
import {
  isContextOverflowError,
  promptWithOverflowRecovery,
} from "../../src/runtime/session-overflow-recovery.js";

describe("isContextOverflowError", () => {
  it("detects overflow-like errors", () => {
    expect(
      isContextOverflowError(new Error("Maximum context length exceeded")),
    ).toBe(true);
    expect(isContextOverflowError("too many tokens in prompt")).toBe(true);
    expect(isContextOverflowError(new Error("rate limited"))).toBe(false);
  });
});

describe("promptWithOverflowRecovery", () => {
  it("retries once after compaction on overflow", async () => {
    const calls: string[] = [];
    let promptAttempts = 0;

    const session = {
      async prompt(_text: string) {
        promptAttempts += 1;
        calls.push(`prompt:${promptAttempts}`);
        if (promptAttempts === 1) {
          throw new Error("context window exceeded");
        }
      },
      async compact(_instructions?: string) {
        calls.push("compact");
      },
    };

    const result = await promptWithOverflowRecovery({
      session,
      prompt: "hello",
      enabled: true,
    });

    expect(result.recoveredFromOverflow).toBe(true);
    expect(calls).toEqual(["prompt:1", "compact", "prompt:2"]);
  });

  it("rethrows overflow errors when recovery is disabled", async () => {
    const session = {
      async prompt(_text: string) {
        throw new Error("prompt overflow");
      },
      async compact(_instructions?: string) {
        // no-op
      },
    };

    await expect(
      promptWithOverflowRecovery({
        session,
        prompt: "hello",
        enabled: false,
      }),
    ).rejects.toThrow("prompt overflow");
  });

  it("passes through non-overflow errors", async () => {
    const session = {
      async prompt(_text: string) {
        throw new Error("network timeout");
      },
      async compact(_instructions?: string) {
        // no-op
      },
    };

    await expect(
      promptWithOverflowRecovery({
        session,
        prompt: "hello",
        enabled: true,
      }),
    ).rejects.toThrow("network timeout");
  });
});
