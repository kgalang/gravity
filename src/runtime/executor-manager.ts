import { createBashTool, createReadTool } from "@mariozechner/pi-coding-agent";
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

export type ExecutorManager = Readonly<{
  resolve: (runtime: ExecutorRuntime) => Executor;
}>;

type ExecutorManagerConfig = {
  enableSandbox?: boolean;
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

function createSandboxScaffoldExecutor(): Executor {
  return {
    id: "sandbox-scaffold-disabled",
    runtime: "sandbox",
    createTools: () => {
      throw new Error(
        "Sandbox executor scaffold is disabled for CP5.1. Use runtime=host or enable sandbox in a later checkpoint.",
      );
    },
  };
}

export function createExecutorManager(
  config: ExecutorManagerConfig = {},
): ExecutorManager {
  const hostExecutor = createHostExecutor();
  const sandboxEnabled = config.enableSandbox ?? false;
  const sandboxExecutor = createSandboxScaffoldExecutor();
  const log = config.log ?? console.log;

  return {
    resolve(runtime) {
      if (runtime === "sandbox") {
        if (!sandboxEnabled) {
          throw new Error(
            "Sandbox runtime requested but sandbox executor scaffold is disabled.",
          );
        }

        log("[gravity] sandbox runtime selected (scaffold executor)");
        return sandboxExecutor;
      }

      return hostExecutor;
    },
  };
}
