export type PromptWithCompactionSession = {
  prompt: (text: string) => Promise<void>;
  compact: (customInstructions?: string) => Promise<unknown>;
};

export type PromptWithOverflowRecoveryInput = Readonly<{
  session: PromptWithCompactionSession;
  prompt: string;
  enabled: boolean;
  compactInstructions?: string;
}>;

const OVERFLOW_ERROR_PATTERNS = [
  /context length/i,
  /maximum context length/i,
  /prompt is too long/i,
  /tokens?.*exceed/i,
  /input is too long/i,
  /context window/i,
  /too many tokens/i,
  /prompt overflow/i,
] as const;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

export function isContextOverflowError(error: unknown): boolean {
  const message = toErrorMessage(error);
  if (message.length === 0) {
    return false;
  }

  return OVERFLOW_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export async function promptWithOverflowRecovery(
  input: PromptWithOverflowRecoveryInput,
): Promise<{ recoveredFromOverflow: boolean }> {
  try {
    await input.session.prompt(input.prompt);
    return { recoveredFromOverflow: false };
  } catch (error) {
    if (!input.enabled || !isContextOverflowError(error)) {
      throw error;
    }

    await input.session.compact(input.compactInstructions);
    await input.session.prompt(input.prompt);
    return { recoveredFromOverflow: true };
  }
}
