export const resourceKinds = ["duckdb", "knowledge-docs"] as const;

export type ResourceKind = (typeof resourceKinds)[number];
