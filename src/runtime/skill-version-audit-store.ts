import type { Kysely } from "kysely";
import { type GravityDatabase, gravitySchema } from "./db.js";

export type SkillVersionAuditMutation = Readonly<{
  agentId: string;
  skillName: string;
  changedBy: string;
  changeSummary: string;
  fileHash: string;
}>;

export type SkillVersionAuditRecord = Readonly<{
  skillName: string;
  version: number;
}>;

export type SkillVersionAuditStore = Readonly<{
  recordSkillMutation: (
    input: SkillVersionAuditMutation,
  ) => Promise<SkillVersionAuditRecord>;
}>;

function normalizeRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Skill version audit ${label} must be non-empty`);
  }

  return trimmed;
}

export function createKyselySkillVersionAuditStore(
  db: Kysely<GravityDatabase>,
): SkillVersionAuditStore {
  return {
    async recordSkillMutation(input) {
      const agentId = normalizeRequired(input.agentId, "agentId");
      const skillName = normalizeRequired(input.skillName, "skillName");
      const changedBy = normalizeRequired(input.changedBy, "changedBy");
      const changeSummary = normalizeRequired(input.changeSummary, "changeSummary");
      const fileHash = normalizeRequired(input.fileHash, "fileHash");

      return db.transaction().execute(async (trx) => {
        const txSchemaDb = gravitySchema(trx);
        const latest = await txSchemaDb
          .selectFrom("skill_versions")
          .select(["version"])
          .where("agent_id", "=", agentId)
          .where("skill_name", "=", skillName)
          .orderBy("version", "desc")
          .limit(1)
          .executeTakeFirst();

        const nextVersion = (latest?.version ?? 0) + 1;

        await txSchemaDb
          .insertInto("skill_versions")
          .values({
            agent_id: agentId,
            skill_name: skillName,
            version: nextVersion,
            changed_by: changedBy,
            change_summary: changeSummary,
            file_hash: fileHash,
            created_at: new Date(),
          })
          .executeTakeFirst();

        return {
          skillName,
          version: nextVersion,
        };
      });
    },
  };
}
