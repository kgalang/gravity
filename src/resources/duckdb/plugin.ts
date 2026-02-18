import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  readMarkdownFiles,
  readOptionalFile,
  resolvePathFromCwd,
} from "../fs-utils.js";
import type { ResourceDocument, ResourcePlugin } from "../types.js";

const MAX_DBT_CONTEXT_FILES = 10;
const MAX_DBT_FILE_CHARS = 6000;

function isDbtMetadataFile(fileName: string): boolean {
  return (
    fileName.endsWith(".yml") ||
    fileName.endsWith(".yaml") ||
    fileName.endsWith(".md")
  );
}

async function walkDbtMetadataFiles(modelsDir: string): Promise<string[]> {
  const discoveredFiles: string[] = [];
  const stack = [modelsDir];

  while (stack.length > 0) {
    const nextDir = stack.pop();
    if (!nextDir) {
      continue;
    }

    let entries: Array<{
      isDirectory: () => boolean;
      isFile: () => boolean;
      name: string;
    }>;
    try {
      const dirEntries = await readdir(nextDir, {
        withFileTypes: true,
        encoding: "utf8",
      });
      entries = dirEntries;
    } catch {
      continue;
    }

    const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sortedEntries) {
      const entryPath = path.join(nextDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (isDbtMetadataFile(entry.name)) {
        discoveredFiles.push(entryPath);
      }
    }
  }

  discoveredFiles.sort();
  return discoveredFiles.slice(0, MAX_DBT_CONTEXT_FILES);
}

async function loadDbtContextDocs(input: {
  cwd: string;
  resourcePath: string;
}): Promise<ResourceDocument[]> {
  const resolvedResourcePath = resolvePathFromCwd(input.cwd, input.resourcePath);
  const projectRoot = path.dirname(resolvedResourcePath);
  const modelsDir = path.join(projectRoot, "models");

  try {
    const modelsDirStats = await stat(modelsDir);
    if (!modelsDirStats.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const metadataFilePaths = await walkDbtMetadataFiles(modelsDir);
  const contextDocs: ResourceDocument[] = [];

  for (const metadataFilePath of metadataFilePaths) {
    const content = await readOptionalFile(metadataFilePath);
    if (!content) {
      continue;
    }

    contextDocs.push({
      filePath: metadataFilePath,
      content: content.slice(0, MAX_DBT_FILE_CHARS).trim(),
    });
  }

  return contextDocs;
}

async function loadSharedResourceDocs(input: {
  cwd: string;
  sharedRoot: string;
}): Promise<ResourceDocument[]> {
  const sharedResourcesDir = path.join(
    resolvePathFromCwd(input.cwd, input.sharedRoot),
    "resources",
  );
  const docs = await readMarkdownFiles(sharedResourcesDir);
  return docs.filter((document) =>
    path.basename(document.filePath).startsWith("duckdb"),
  );
}

export const duckdbResourcePlugin = {
  kind: "duckdb",
  async load(input) {
    const [sharedDocs, contextDocs] = await Promise.all([
      loadSharedResourceDocs({
        cwd: input.cwd,
        sharedRoot: input.sharedRoot,
      }),
      loadDbtContextDocs({
        cwd: input.cwd,
        resourcePath: input.spec.path,
      }),
    ]);

    return {
      resourceId: input.spec.id,
      resourceKind: "duckdb",
      guidance: [
        `- Resource \`${input.spec.id}\` (\`duckdb\`): query structured data via SQL when facts need validation.`,
        `- Preferred DuckDB command pattern: duckdb ${input.spec.path} -cmd \"<SQL>\"`,
        "- Use `bash` for SQL execution and `read` for schema/docs inspection.",
        "- If command output is truncated, follow truncation hints or rerun narrower SQL.",
      ],
      sharedDocs,
      contextDocs,
    };
  },
} satisfies ResourcePlugin<"duckdb">;
