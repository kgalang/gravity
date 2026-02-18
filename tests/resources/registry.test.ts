import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadResourceContributions } from "../../src/resources/registry.js";

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

describe("loadResourceContributions", () => {
  it("loads typed resource contributions from static registry plugins", async () => {
    const tempRoot = await createTempRoot("gravity-resources-");
    const sharedRoot = path.join(tempRoot, "store", "shared");
    const sharedResourcesDir = path.join(sharedRoot, "resources");
    await mkdir(sharedResourcesDir, { recursive: true });
    await writeFile(
      path.join(sharedResourcesDir, "duckdb-reference.md"),
      "DuckDB resource reference",
      "utf8",
    );
    await writeFile(
      path.join(sharedResourcesDir, "knowledge-docs-guide.md"),
      "Knowledge docs resource guide",
      "utf8",
    );
    await writeFile(
      path.join(sharedResourcesDir, "unrelated.md"),
      "Should not be included",
      "utf8",
    );

    const duckdbProjectDir = path.join(tempRoot, "warehouse");
    const duckdbPath = path.join(duckdbProjectDir, "warehouse.duckdb");
    const duckdbModelsDir = path.join(duckdbProjectDir, "models", "finance");
    await mkdir(duckdbModelsDir, { recursive: true });
    await writeFile(duckdbPath, "", "utf8");
    await writeFile(
      path.join(duckdbModelsDir, "schema.yml"),
      "version: 2\nmodels:\n  - name: revenue",
      "utf8",
    );
    await writeFile(
      path.join(duckdbModelsDir, "README.md"),
      "Model notes",
      "utf8",
    );

    const contributions = await loadResourceContributions({
      resources: [
        {
          id: "warehouse",
          kind: "duckdb",
          path: duckdbPath,
        },
        {
          id: "policy-docs",
          kind: "knowledge-docs",
        },
      ],
      cwd: tempRoot,
      sharedRoot: "store/shared",
    });

    expect(contributions).toHaveLength(2);

    const duckdbContribution = contributions.find(
      (contribution) => contribution.resourceKind === "duckdb",
    );
    expect(duckdbContribution).toBeDefined();
    expect(duckdbContribution?.resourceId).toBe("warehouse");
    expect(duckdbContribution?.guidance).toContain(
      "- Resource `warehouse` (`duckdb`): query structured data via SQL when facts need validation.",
    );
    expect(duckdbContribution?.sharedDocs).toHaveLength(1);
    expect(duckdbContribution?.sharedDocs[0]?.filePath).toContain(
      "duckdb-reference.md",
    );
    expect(duckdbContribution?.contextDocs.length).toBe(2);

    const knowledgeDocsContribution = contributions.find(
      (contribution) => contribution.resourceKind === "knowledge-docs",
    );
    expect(knowledgeDocsContribution).toBeDefined();
    expect(knowledgeDocsContribution?.resourceId).toBe("policy-docs");
    expect(knowledgeDocsContribution?.sharedDocs).toHaveLength(1);
    expect(knowledgeDocsContribution?.sharedDocs[0]?.filePath).toContain(
      "knowledge-docs-guide.md",
    );
    expect(knowledgeDocsContribution?.contextDocs).toEqual([]);
  });

  it("fails open for missing duckdb project metadata", async () => {
    const tempRoot = await createTempRoot("gravity-resources-missing-");

    const contributions = await loadResourceContributions({
      resources: [
        {
          id: "warehouse",
          kind: "duckdb",
          path: path.join(tempRoot, "missing", "warehouse.duckdb"),
        },
      ],
      cwd: tempRoot,
      sharedRoot: "store/shared",
    });

    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.resourceKind).toBe("duckdb");
    expect(contributions[0]?.contextDocs).toEqual([]);
  });
});
