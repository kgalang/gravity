export const toolPrimitives = ["read", "bash"] as const;

export type ToolPrimitive = (typeof toolPrimitives)[number];
