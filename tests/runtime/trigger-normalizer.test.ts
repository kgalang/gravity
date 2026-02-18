import { describe, expect, it } from "vitest";
import {
  normalizeProactiveTrigger,
  normalizeSlackMessageTrigger,
  normalizeSlackSlashCommandTrigger,
  normalizeSystemTrigger,
} from "../../src/runtime/trigger-normalizer.js";

describe("trigger-normalizer", () => {
  it("normalizes system triggers", () => {
    expect(normalizeSystemTrigger()).toEqual({
      triggerKind: "system",
      surface: "system",
      entrypoint: "system",
    });
  });

  it("normalizes slash command triggers", () => {
    expect(normalizeSlackSlashCommandTrigger()).toEqual({
      triggerKind: "message",
      surface: "slack",
      entrypoint: "slash_command",
    });
  });

  it("normalizes non-slash message triggers", () => {
    expect(normalizeSlackMessageTrigger("app_mention")).toEqual({
      triggerKind: "message",
      surface: "slack",
      entrypoint: "app_mention",
    });
    expect(normalizeSlackMessageTrigger("thread_reply")).toEqual({
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });
    expect(normalizeSlackMessageTrigger("direct_message")).toEqual({
      triggerKind: "message",
      surface: "slack",
      entrypoint: "direct_message",
    });
  });

  it("normalizes proactive triggers", () => {
    expect(normalizeProactiveTrigger("cron")).toEqual({
      triggerKind: "cron",
      surface: "system",
      entrypoint: "cron",
    });
    expect(normalizeProactiveTrigger("heartbeat")).toEqual({
      triggerKind: "heartbeat",
      surface: "system",
      entrypoint: "heartbeat",
    });
  });
});
