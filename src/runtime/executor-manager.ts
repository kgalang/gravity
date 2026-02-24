import { existsSync } from "node:fs";
import path from "node:path";
import {
  createBashTool,
  createReadTool,
  type BashSpawnContext,
} from "@mariozechner/pi-coding-agent";
import type { ToolPrimitive } from "../../agents/tool-primitives.js";

export type ExecutorRuntime = "host" | "sandbox";

type PiTool = ReturnType<typeof createReadTool> | ReturnType<typeof createBashTool>;

export type Executor = Readonly<{
  id: string;
  runtime: ExecutorRuntime;
  createTools: (
    cwd: string,
    allowedToolPrimitives: readonly ToolPrimitive[],
  ) => PiTool[];
}>;

export type SandboxPolicyDecision = Readonly<{
  decision: "allow" | "deny";
  reason: string;
}>;

export type ResolveExecutorInput = Readonly<{
  requestedRuntime: ExecutorRuntime;
  runId: string;
  agentId: string;
  sessionKey: string;
}>;

type SandboxPolicyContext = ResolveExecutorInput &
  Readonly<{
    sandboxEnabled: boolean;
    forceHostRuntime: boolean;
  }>;

export type SandboxPolicyEvaluator = (
  input: SandboxPolicyContext,
) => SandboxPolicyDecision;

export type ExecutorResolution = Readonly<
  | {
      decision: "allow";
      reason: string;
      requestedRuntime: ExecutorRuntime;
      effectiveRuntime: ExecutorRuntime;
      rollbackApplied: boolean;
      executor: Executor;
    }
  | {
      decision: "deny";
      reason: string;
      requestedRuntime: "sandbox";
      effectiveRuntime: "sandbox";
      rollbackApplied: false;
    }
>;

export type ExecutorManager = Readonly<{
  resolve: (input: ResolveExecutorInput) => ExecutorResolution;
}>;

type ExecutorManagerConfig = {
  // `enableSandbox` remains accepted for compatibility with older callsites.
  enableSandbox?: boolean;
  sandboxEnabled?: boolean;
  forceHostRuntime?: boolean;
  evaluateSandboxPolicy?: SandboxPolicyEvaluator;
  sandboxRuntimeCommand?: string;
  log?: (line: string) => void;
};

function createHostExecutor(): Executor {
  return {
    id: "host",
    runtime: "host",
    createTools: (cwd, allowedToolPrimitives) => {
      const allowedSet = new Set(allowedToolPrimitives);
      const tools: PiTool[] = [];
      if (allowedSet.has("read")) {
        tools.push(createReadTool(cwd));
      }
      if (allowedSet.has("bash")) {
        tools.push(createBashTool(cwd));
      }
      return tools;
    },
  };
}

function quoteForPosixShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function normalizeReason(reason: string, fallback: string): string {
  const normalized = reason.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizePolicyDecision(
  decision: SandboxPolicyDecision,
): SandboxPolicyDecision {
  if (decision.decision !== "allow" && decision.decision !== "deny") {
    return {
      decision: "deny",
      reason: "sandbox_policy_invalid_decision",
    };
  }

  return {
    decision: decision.decision,
    reason: normalizeReason(decision.reason, "sandbox_policy_unspecified"),
  };
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "unknown";
}

export function createDefaultSandboxPolicyEvaluator(): SandboxPolicyEvaluator {
  return (input) => {
    if (!input.sandboxEnabled) {
      return {
        decision: "deny",
        reason: "sandbox_runtime_disabled",
      };
    }

    return {
      decision: "allow",
      reason: "sandbox_runtime_allowed",
    };
  };
}

function resolveSandboxRuntimeCommand(
  cwd: string,
  sandboxRuntimeCommand: string | undefined,
): string {
  if (sandboxRuntimeCommand) {
    return sandboxRuntimeCommand;
  }

  const localBinary = path.join(cwd, "node_modules", ".bin", "srt");
  if (existsSync(localBinary)) {
    return localBinary;
  }

  return "srt";
}

function createSandboxExecutor(
  sandboxRuntimeCommand: string | undefined,
): Executor {
  return {
    id: "sandbox",
    runtime: "sandbox",
    createTools: (cwd, allowedToolPrimitives) => {
      const allowedSet = new Set(allowedToolPrimitives);
      const tools: PiTool[] = [];
      if (allowedSet.has("read")) {
        tools.push(createReadTool(cwd));
      }
      if (allowedSet.has("bash")) {
        tools.push(
          createBashTool(cwd, {
            spawnHook: (context: BashSpawnContext): BashSpawnContext => {
              const sandboxCommand = resolveSandboxRuntimeCommand(
                context.cwd,
                sandboxRuntimeCommand,
              );
              return {
                ...context,
                command: `${quoteForPosixShell(sandboxCommand)} ${quoteForPosixShell(context.command)}`,
              };
            },
          }),
        );
      }
      return tools;
    },
  };
}

export function createExecutorManager(
  config: ExecutorManagerConfig = {},
): ExecutorManager {
  const hostExecutor = createHostExecutor();
  const sandboxEnabled = config.sandboxEnabled ?? config.enableSandbox ?? true;
  const forceHostRuntime = config.forceHostRuntime ?? false;
  const sandboxExecutor = createSandboxExecutor(config.sandboxRuntimeCommand);
  const evaluateSandboxPolicy =
    config.evaluateSandboxPolicy ?? createDefaultSandboxPolicyEvaluator();
  const log = config.log ?? console.log;

  return {
    resolve(input) {
      if (input.requestedRuntime === "host") {
        return {
          decision: "allow",
          reason: "host_runtime_requested",
          requestedRuntime: "host",
          effectiveRuntime: "host",
          rollbackApplied: false,
          executor: hostExecutor,
        };
      }

      if (!sandboxEnabled) {
        log(
          `[gravity] sandbox policy denied execution (agentId=${input.agentId} sessionKey=${input.sessionKey} runId=${input.runId} reason=sandbox_runtime_disabled)`,
        );
        return {
          decision: "deny",
          reason: "sandbox_runtime_disabled",
          requestedRuntime: "sandbox",
          effectiveRuntime: "sandbox",
          rollbackApplied: false,
        };
      }

      if (forceHostRuntime) {
        log(
          `[gravity] sandbox policy denied execution (agentId=${input.agentId} sessionKey=${input.sessionKey} runId=${input.runId} reason=sandbox_force_host_mode_enabled)`,
        );
        return {
          decision: "deny",
          reason: "sandbox_force_host_mode_enabled",
          requestedRuntime: "sandbox",
          effectiveRuntime: "sandbox",
          rollbackApplied: false,
        };
      }

      let policyDecision: SandboxPolicyDecision;
      try {
        policyDecision = normalizePolicyDecision(
          evaluateSandboxPolicy({
            requestedRuntime: input.requestedRuntime,
            runId: input.runId,
            agentId: input.agentId,
            sessionKey: input.sessionKey,
            sandboxEnabled,
            forceHostRuntime,
          }),
        );
      } catch (error) {
        log(
          `[gravity] sandbox policy evaluator failed (agentId=${input.agentId} sessionKey=${input.sessionKey} runId=${input.runId} error=${normalizeErrorMessage(error)})`,
        );
        policyDecision = {
          decision: "deny",
          reason: "sandbox_policy_evaluator_failed",
        };
      }

      if (policyDecision.decision === "deny") {
        log(
          `[gravity] sandbox policy denied execution (agentId=${input.agentId} sessionKey=${input.sessionKey} runId=${input.runId} reason=${policyDecision.reason})`,
        );
        return {
          decision: "deny",
          reason: policyDecision.reason,
          requestedRuntime: "sandbox",
          effectiveRuntime: "sandbox",
          rollbackApplied: false,
        };
      }

      log(
        `[gravity] sandbox runtime selected (agentId=${input.agentId} sessionKey=${input.sessionKey} runId=${input.runId})`,
      );
      return {
        decision: "allow",
        reason: policyDecision.reason,
        requestedRuntime: "sandbox",
        effectiveRuntime: "sandbox",
        rollbackApplied: false,
        executor: sandboxExecutor,
      };
    },
  };
}
