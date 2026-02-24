import { describe, expect, it } from "vitest";
import { createExecutorManager } from "../../src/runtime/executor-manager.js";

describe("createExecutorManager", () => {
  function runtimeInput(requestedRuntime: "host" | "sandbox") {
    return {
      requestedRuntime,
      runId: "run-123",
      agentId: "data-analyst",
      sessionKey: "data-analyst:main",
    };
  }

  it("resolves host executor by default", () => {
    const manager = createExecutorManager();
    const resolution = manager.resolve(runtimeInput("host"));

    expect(resolution.decision).toBe("allow");
    if (resolution.decision !== "allow") {
      throw new Error("Expected allow decision for host runtime.");
    }
    expect(resolution.reason).toBe("host_runtime_requested");
    expect(resolution.effectiveRuntime).toBe("host");
    expect(resolution.rollbackApplied).toBe(false);
    expect(resolution.executor.id).toBe("host");
    expect(resolution.executor.runtime).toBe("host");
    expect(resolution.executor.createTools(process.cwd(), ["read", "bash"]).length).toBe(2);
    expect(resolution.executor.createTools(process.cwd(), ["read"]).length).toBe(1);
    expect(resolution.executor.createTools(process.cwd(), []).length).toBe(0);
  });

  it("denies sandbox runtime when sandbox is disabled (fail-closed)", () => {
    const manager = createExecutorManager({
      sandboxEnabled: false,
      log: () => undefined,
    });
    const resolution = manager.resolve(runtimeInput("sandbox"));

    expect(resolution).toEqual({
      decision: "deny",
      reason: "sandbox_runtime_disabled",
      requestedRuntime: "sandbox",
      effectiveRuntime: "sandbox",
      rollbackApplied: false,
    });
  });

  it("routes to sandbox executor when sandbox is enabled and policy allows", () => {
    const manager = createExecutorManager({
      sandboxEnabled: true,
      log: () => undefined,
    });
    const resolution = manager.resolve(runtimeInput("sandbox"));

    expect(resolution.decision).toBe("allow");
    if (resolution.decision !== "allow") {
      throw new Error("Expected allow decision for sandbox runtime.");
    }
    expect(resolution.reason).toBe("sandbox_runtime_allowed");
    expect(resolution.effectiveRuntime).toBe("sandbox");
    expect(resolution.rollbackApplied).toBe(false);
    expect(resolution.executor.id).toBe("sandbox");
    expect(resolution.executor.runtime).toBe("sandbox");
    expect(resolution.executor.createTools(process.cwd(), ["read", "bash"]).length).toBe(2);
    expect(resolution.executor.createTools(process.cwd(), ["bash"]).length).toBe(1);
    expect(resolution.executor.createTools(process.cwd(), []).length).toBe(0);
  });

  it("supports explicit policy deny reasons", () => {
    const manager = createExecutorManager({
      sandboxEnabled: true,
      evaluateSandboxPolicy: () => ({
        decision: "deny",
        reason: "sandbox_policy_denied_for_agent",
      }),
      log: () => undefined,
    });
    const resolution = manager.resolve(runtimeInput("sandbox"));

    expect(resolution).toEqual({
      decision: "deny",
      reason: "sandbox_policy_denied_for_agent",
      requestedRuntime: "sandbox",
      effectiveRuntime: "sandbox",
      rollbackApplied: false,
    });
  });

  it("denies sandbox runtime when force-host mode is active", () => {
    const manager = createExecutorManager({
      sandboxEnabled: true,
      forceHostRuntime: true,
      log: () => undefined,
    });
    const resolution = manager.resolve(runtimeInput("sandbox"));

    expect(resolution.decision).toBe("deny");
    expect(resolution.reason).toBe("sandbox_force_host_mode_enabled");
    expect(resolution.requestedRuntime).toBe("sandbox");
    expect(resolution.effectiveRuntime).toBe("sandbox");
    expect(resolution.rollbackApplied).toBe(false);
  });

  it("prioritizes sandbox disable over force-host mode", () => {
    const manager = createExecutorManager({
      sandboxEnabled: false,
      forceHostRuntime: true,
      log: () => undefined,
    });
    const resolution = manager.resolve(runtimeInput("sandbox"));

    expect(resolution).toEqual({
      decision: "deny",
      reason: "sandbox_runtime_disabled",
      requestedRuntime: "sandbox",
      effectiveRuntime: "sandbox",
      rollbackApplied: false,
    });
  });

  it("normalizes empty policy reasons to a deterministic fallback", () => {
    const manager = createExecutorManager({
      sandboxEnabled: true,
      evaluateSandboxPolicy: () => ({
        decision: "allow",
        reason: "   ",
      }),
      log: () => undefined,
    });
    const resolution = manager.resolve(runtimeInput("sandbox"));

    expect(resolution.decision).toBe("allow");
    if (resolution.decision !== "allow") {
      throw new Error("Expected allow decision for normalized policy reason.");
    }
    expect(resolution.reason).toBe("sandbox_policy_unspecified");
  });

  it("fails closed when sandbox policy evaluator throws", () => {
    const manager = createExecutorManager({
      sandboxEnabled: true,
      evaluateSandboxPolicy: () => {
        throw new Error("policy subsystem unavailable");
      },
      log: () => undefined,
    });
    const resolution = manager.resolve(runtimeInput("sandbox"));

    expect(resolution).toEqual({
      decision: "deny",
      reason: "sandbox_policy_evaluator_failed",
      requestedRuntime: "sandbox",
      effectiveRuntime: "sandbox",
      rollbackApplied: false,
    });
  });

  it("keeps sandbox command failures fail-closed", async () => {
    const manager = createExecutorManager({
      sandboxEnabled: true,
      sandboxRuntimeCommand: "false",
      log: () => undefined,
    });
    const resolution = manager.resolve(runtimeInput("sandbox"));
    if (resolution.decision !== "allow") {
      throw new Error("Expected allow decision before sandbox command failure test.");
    }

    const tools = resolution.executor.createTools(process.cwd(), ["bash"]);
    const bashTool = tools.find((tool) => tool.name === "bash");
    if (!bashTool) {
      throw new Error("Expected sandbox bash tool to be registered.");
    }

    await expect(
      (bashTool as { execute: (toolCallId: string, input: { command: string }) => Promise<unknown> }).execute(
        "call-1",
        { command: "echo sandbox" },
      ),
    ).rejects.toThrow(/Command exited with code 1/);
  });
});
