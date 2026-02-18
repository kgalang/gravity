export type SlashCommandAgentMap = ReadonlyMap<string, string>;

export function normalizeSlashCommand(command: string): string {
  return command.trim().toLowerCase();
}

export function createDefaultSlashCommandAgentMap(): Map<string, string> {
  return new Map<string, string>([
    ["/wiggs", "data-analyst"],
    ["/compliance", "compliance-helper"],
  ]);
}

export function resolveAgentIdForSlashCommand(
  command: string,
  commandAgentMap: SlashCommandAgentMap,
): string | null {
  const normalized = normalizeSlashCommand(command);
  if (normalized.length === 0) {
    return null;
  }

  return commandAgentMap.get(normalized) ?? null;
}
