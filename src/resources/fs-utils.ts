import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ResourceDocument } from "./types.js";

export function resolvePathFromCwd(cwd: string, inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  return path.resolve(cwd, inputPath);
}

export async function readMarkdownFiles(dirPath: string): Promise<ResourceDocument[]> {
  try {
    const directoryEntries = await readdir(dirPath, { withFileTypes: true });
    const markdownFiles = directoryEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();

    const loadedFiles = await Promise.all(
      markdownFiles.map(async (fileName) => {
        const filePath = path.join(dirPath, fileName);
        const content = await readFile(filePath, "utf8");
        return {
          filePath,
          content: content.trim(),
        } satisfies ResourceDocument;
      }),
    );

    return loadedFiles.filter((document) => document.content.length > 0);
  } catch {
    return [];
  }
}

export async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf8");
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function readRequiredMarkdownFile(
  filePath: string,
): Promise<ResourceDocument> {
  const content = await readOptionalFile(filePath);
  if (!content) {
    throw new Error(`Required markdown file is missing or empty: ${filePath}`);
  }

  return {
    filePath,
    content,
  };
}
