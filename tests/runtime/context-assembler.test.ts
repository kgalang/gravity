import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileAgentCapabilities } from "../../agents/capability-compiler.js";
import { assembleTurnContext } from "../../src/runtime/context-assembler.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (tempRoot) => {
      await rm(tempRoot, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

describe("assembleTurnContext", () => {
  it("assembles duckdb-focused context and blank prompt normalization", async () => {
    const tempRoot = await createTempRoot("gravity-context-duckdb-");
    const sharedRoot = path.join(tempRoot, "store", "shared");
    const sharedSkillsDir = path.join(sharedRoot, "skills");
    const sharedResourcesDir = path.join(sharedRoot, "resources");
    const agentMemoryDir = path.join(tempRoot, "store", "agents", "alpha", "memory");

    await mkdir(sharedSkillsDir, { recursive: true });
    await mkdir(sharedResourcesDir, { recursive: true });
    await mkdir(agentMemoryDir, { recursive: true });

    await writeFile(path.join(sharedSkillsDir, "query-gravity.md"), "Shared skill", "utf8");
    await writeFile(path.join(sharedSkillsDir, "duckdb-query.md"), "DuckDB skill", "utf8");
    await writeFile(
      path.join(sharedResourcesDir, "duckdb-reference.md"),
      "DuckDB resource docs",
      "utf8",
    );
    await writeFile(path.join(agentMemoryDir, "MEMORY.md"), "Prior memory", "utf8");

    const duckdbProjectDir = path.join(tempRoot, "warehouse");
    const duckdbPath = path.join(duckdbProjectDir, "warehouse.duckdb");
    const modelsDir = path.join(duckdbProjectDir, "models");
    await mkdir(modelsDir, { recursive: true });
    await writeFile(duckdbPath, "", "utf8");
    await writeFile(path.join(modelsDir, "schema.yml"), "version: 2", "utf8");

    const context = await assembleTurnContext({
      cwd: tempRoot,
      sharedRoot: "store/shared",
      prompt: "   ",
      agent: {
        id: "alpha",
        name: "Alpha",
        description: "Data helper",
        capabilityProfile: compileAgentCapabilities({
          resources: [
            {
              id: "warehouse",
              kind: "duckdb",
              path: duckdbPath,
            },
          ],
          useCapabilities: [
            {
              capability: "query-gravity-v1",
              bindResources: {},
            },
            {
              capability: "duckdb-analyst-v1",
              bindResources: {
                warehouse: "warehouse",
              },
            },
          ],
        }),
        memoryPath: "store/agents/alpha/memory",
      },
    });

    expect(context.normalizedPrompt).toContain("DuckDB business questions");
    expect(context.systemPrompt).toContain("You are Alpha (alpha).");
    expect(context.systemPrompt).toContain("Active capabilities:");
    expect(context.systemPrompt).toContain(
      "- `duckdb-analyst-v1`: execute SQL-backed analysis against the bound DuckDB warehouse resource.",
    );
    expect(context.systemPrompt).toContain("Resource guidance:");
    expect(context.systemPrompt).toContain(
      "- Resource `warehouse` (`duckdb`): query structured data via SQL when facts need validation.",
    );
    expect(context.systemPrompt).toContain("dbt schema/docs context loaded this turn:");
    expect(context.systemPrompt).toContain("schema.yml");
    expect(context.systemPrompt).toContain("Shared skills loaded this turn:");
    expect(context.systemPrompt).toContain("Agent memory:");
  });

  it("assembles non-duckdb context with generic prompt fallback", async () => {
    const tempRoot = await createTempRoot("gravity-context-knowledge-");
    const sharedRoot = path.join(tempRoot, "store", "shared");
    const sharedSkillsDir = path.join(sharedRoot, "skills");
    const sharedResourcesDir = path.join(sharedRoot, "resources");
    await mkdir(sharedSkillsDir, { recursive: true });
    await mkdir(sharedResourcesDir, { recursive: true });

    await writeFile(path.join(sharedSkillsDir, "query-gravity.md"), "Shared skill", "utf8");
    await writeFile(
      path.join(sharedSkillsDir, "knowledge-docs-review.md"),
      "Knowledge docs skill",
      "utf8",
    );
    await writeFile(
      path.join(sharedResourcesDir, "knowledge-docs-guide.md"),
      "Knowledge docs guidance",
      "utf8",
    );

    const context = await assembleTurnContext({
      cwd: tempRoot,
      sharedRoot: "store/shared",
      prompt: "",
      agent: {
        id: "beta",
        name: "Beta",
        description: null,
        capabilityProfile: compileAgentCapabilities({
          resources: [
            {
              id: "warehouse",
              kind: "duckdb",
              path: "/tmp/unbound.duckdb",
            },
            {
              id: "policy-docs",
              kind: "knowledge-docs",
            },
          ],
          useCapabilities: [
            {
              capability: "query-gravity-v1",
              bindResources: {},
            },
            {
              capability: "knowledge-docs-review-v1",
              bindResources: {
                docs: "policy-docs",
              },
            },
          ],
        }),
        memoryPath: null,
      },
    });

    expect(context.normalizedPrompt).toContain(
      "next steps based on available capabilities/resources",
    );
    expect(context.systemPrompt).toContain(
      "Resource-specific schema/docs context loaded this turn:",
    );
    expect(context.systemPrompt).toContain(
      "- Resource `policy-docs` (`knowledge-docs`): use loaded markdown docs for policy/process guidance before final recommendations.",
    );
    expect(context.systemPrompt).not.toContain(
      "- Resource `warehouse` (`duckdb`): query structured data via SQL when facts need validation.",
    );
    expect(context.systemPrompt).not.toContain(
      "- Use DuckDB for factual claims when a query is needed.",
    );
  });
});
