import path from "node:path";
import { readMarkdownFiles, resolvePathFromCwd } from "../fs-utils.js";
import type { ResourceDocument, ResourcePlugin } from "../types.js";

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
    path.basename(document.filePath).startsWith("knowledge-docs"),
  );
}

export const knowledgeDocsResourcePlugin = {
  kind: "knowledge-docs",
  async load(input) {
    const sharedDocs = await loadSharedResourceDocs({
      cwd: input.cwd,
      sharedRoot: input.sharedRoot,
    });

    return {
      resourceId: input.spec.id,
      resourceKind: "knowledge-docs",
      guidance: [
        `- Resource \`${input.spec.id}\` (\`knowledge-docs\`): use loaded markdown docs for policy/process guidance before final recommendations.`,
      ],
      sharedDocs,
      contextDocs: [],
    };
  },
} satisfies ResourcePlugin<"knowledge-docs">;
