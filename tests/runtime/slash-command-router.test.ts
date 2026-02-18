import { describe, expect, it } from "vitest";
import {
  createDefaultSlashCommandAgentMap,
  normalizeSlashCommand,
  resolveAgentIdForSlashCommand,
} from "../../src/runtime/slash-command-router.js";

describe("normalizeSlashCommand", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeSlashCommand("  /Wiggs  ")).toBe("/wiggs");
  });
});

describe("resolveAgentIdForSlashCommand", () => {
  it("resolves known commands from the default map", () => {
    const map = createDefaultSlashCommandAgentMap();

    expect(resolveAgentIdForSlashCommand("/wiggs", map)).toBe("data-analyst");
    expect(resolveAgentIdForSlashCommand("/COMPLIANCE", map)).toBe(
      "compliance-helper",
    );
  });

  it("returns null for unknown commands", () => {
    const map = createDefaultSlashCommandAgentMap();

    expect(resolveAgentIdForSlashCommand("/unknown", map)).toBeNull();
  });
});
