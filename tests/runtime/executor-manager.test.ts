import { describe, expect, it } from "vitest";
import { createExecutorManager } from "../../src/runtime/executor-manager.js";

describe("createExecutorManager", () => {
  it("resolves host executor by default", () => {
    const manager = createExecutorManager();
    const executor = manager.resolve("host");

    expect(executor.id).toBe("host");
    expect(executor.runtime).toBe("host");
    expect(executor.createTools(process.cwd()).length).toBe(2);
  });

  it("fails closed when sandbox runtime is requested while disabled", () => {
    const manager = createExecutorManager({ enableSandbox: false });
    expect(() => manager.resolve("sandbox")).toThrow(
      /sandbox runtime requested/i,
    );
  });

  it("returns scaffold sandbox executor when explicitly enabled", () => {
    const manager = createExecutorManager({
      enableSandbox: true,
      log: () => undefined,
    });
    const executor = manager.resolve("sandbox");

    expect(executor.id).toBe("sandbox-scaffold-disabled");
    expect(executor.runtime).toBe("sandbox");
    expect(() => executor.createTools(process.cwd())).toThrow(
      /scaffold is disabled/i,
    );
  });
});
