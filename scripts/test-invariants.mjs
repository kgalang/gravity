import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

const EXPECTED_CHECKPOINTS = Array.from({ length: 11 }, (_, index) => `CP${index + 1}`);
const VALID_CHECKPOINT_STATUSES = new Set([
  "not_started",
  "in_progress",
  "blocked",
  "complete",
]);

const DEFAULT_MAX_ACTIVE_PLANS = 1;
const DEFAULT_PLAN_STALENESS_DAYS = 3;

function addError(message) {
  errors.push(message);
}

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    addError(`Missing required file for invariants: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function toPascalCase(raw) {
  return raw
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join("");
}

function collectTsFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(absolutePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function parseEnvInteger(envName, fallback) {
  const raw = process.env[envName];
  if (raw == null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    addError(`${envName} must be an integer >= 1; received "${raw}"`);
    return fallback;
  }
  return parsed;
}

function parseCheckpointRows(checkpointText) {
  const rows = checkpointText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\|\s*CP\d+\s*\|/i.test(line));

  const result = new Map();
  for (const row of rows) {
    const cells = row
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length < 4) {
      addError(`Malformed checkpoint row: "${row}"`);
      continue;
    }

    const [checkpoint, status, notes, verification] = cells;
    const normalizedStatus = status.toLowerCase();

    if (result.has(checkpoint)) {
      addError(`Checkpoint table has duplicate row for ${checkpoint}`);
      continue;
    }

    result.set(checkpoint, {
      checkpoint,
      status: normalizedStatus,
      notes,
      verification,
    });
  }

  return result;
}

function invariantMigrationScaffold() {
  const migrationsDir = path.join(root, "db/migrations");
  if (!existsSync(migrationsDir)) {
    addError("Missing db/migrations directory");
    return;
  }

  const migrationFiles = readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort();

  if (migrationFiles.length === 0) {
    addError("db/migrations must contain at least one .sql migration file");
    return;
  }

  for (const migrationFile of migrationFiles) {
    const relativePath = path.join("db/migrations", migrationFile);
    const text = readText(relativePath);
    if (!/--\s*migrate:up/i.test(text)) {
      addError(`${relativePath} is missing a "-- migrate:up" section`);
    }
    if (!/--\s*migrate:down/i.test(text)) {
      addError(`${relativePath} is missing a "-- migrate:down" section`);
    }
  }
}

function invariantSeedAgentFilesystemParity() {
  const seedText = readText("seed.sql");
  const valuesBlockMatch = seedText.match(
    /INSERT INTO\s+gravity\.agents[\s\S]*?VALUES([\s\S]*?)ON CONFLICT/i,
  );

  if (!valuesBlockMatch) {
    addError("Could not parse gravity.agents values block in seed.sql");
    return;
  }

  const valuesBlock = valuesBlockMatch[1];
  const tuples = [];
  let depth = 0;
  let tupleStart = -1;
  let inString = false;
  let previous = "";

  for (let index = 0; index < valuesBlock.length; index += 1) {
    const char = valuesBlock[index];

    if (char === "'" && previous !== "\\") {
      inString = !inString;
    }

    if (!inString && char === "(") {
      if (depth === 0) {
        tupleStart = index;
      }
      depth += 1;
    } else if (!inString && char === ")") {
      depth -= 1;
      if (depth === 0 && tupleStart >= 0) {
        tuples.push(valuesBlock.slice(tupleStart, index + 1));
        tupleStart = -1;
      }
    }

    previous = char;
  }

  const ids = tuples
    .map((tuple) => tuple.match(/^\(\s*'([^']+)'/))
    .filter((match) => Boolean(match))
    .map((match) => match[1]);

  if (ids.length === 0) {
    addError("seed.sql does not contain any gravity.agents seed rows");
    return;
  }

  for (const agentId of new Set(ids)) {
    const skillsDir = path.join(root, "store", "agents", agentId, "skills");
    const memoryFile = path.join(root, "store", "agents", agentId, "memory", "MEMORY.md");

    if (!existsSync(skillsDir)) {
      addError(`seed.sql agent "${agentId}" is missing skills directory: store/agents/${agentId}/skills`);
    }
    if (!existsSync(memoryFile)) {
      addError(
        `seed.sql agent "${agentId}" is missing memory file: store/agents/${agentId}/memory/MEMORY.md`,
      );
    }
  }
}

function invariantActivePlanDiscipline() {
  const activeDir = path.join(root, "docs/plans/active");
  if (!existsSync(activeDir)) {
    addError("Missing docs/plans/active directory");
    return;
  }

  const maxActivePlans = parseEnvInteger("GRAVITY_MAX_ACTIVE_PLANS", DEFAULT_MAX_ACTIVE_PLANS);
  const stalenessDays = parseEnvInteger("GRAVITY_PLAN_STALENESS_DAYS", DEFAULT_PLAN_STALENESS_DAYS);

  const activePlans = readdirSync(activeDir).filter((entry) => entry.endsWith(".md"));

  if (activePlans.length === 0) {
    addError("Expected at least one active plan in docs/plans/active");
    return;
  }

  if (activePlans.length > maxActivePlans) {
    addError(
      `Found ${activePlans.length} active plans; max allowed is ${maxActivePlans}. ` +
        "Raise GRAVITY_MAX_ACTIVE_PLANS only when parallel execution threads are intentional.",
    );
  }

  const seenThreadKeys = new Set();
  const nowMs = Date.now();

  for (const planFile of activePlans) {
    const relativePath = path.join("docs/plans/active", planFile);
    const planText = readText(relativePath);

    if (!/Status:\s+active/i.test(planText)) {
      addError(`${relativePath} must declare "Status: active"`);
    }

    const threadMatch = planText.match(/^Thread:\s+(.+)$/im);
    const threadKey = threadMatch?.[1]?.trim() || path.basename(planFile, ".md");
    if (seenThreadKeys.has(threadKey)) {
      addError(`Duplicate active plan thread key "${threadKey}" in ${relativePath}`);
    }
    seenThreadKeys.add(threadKey);

    const updatedMatch = planText.match(/Last Updated:\s+(\d{4}-\d{2}-\d{2})/i);
    if (!updatedMatch) {
      addError(`${relativePath} must declare "Last Updated: YYYY-MM-DD"`);
      continue;
    }

    const updatedAt = new Date(`${updatedMatch[1]}T00:00:00Z`);
    if (Number.isNaN(updatedAt.getTime())) {
      addError(`${relativePath} has invalid Last Updated date: ${updatedMatch[1]}`);
      continue;
    }

    const ageDays = Math.floor((nowMs - updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    if (ageDays > stalenessDays) {
      addError(
        `${relativePath} is stale (${ageDays} days old). ` +
          `Update Last Updated or raise GRAVITY_PLAN_STALENESS_DAYS from ${stalenessDays}.`,
      );
    }
  }
}

function invariantCheckpointIntegrity() {
  const checkpointText = readText("docs/checkpoints/mvp-status.md");
  const checkpointRows = parseCheckpointRows(checkpointText);

  for (const checkpoint of EXPECTED_CHECKPOINTS) {
    if (!checkpointRows.has(checkpoint)) {
      addError(`Checkpoint table is missing ${checkpoint}`);
      continue;
    }

    const row = checkpointRows.get(checkpoint);
    if (!VALID_CHECKPOINT_STATUSES.has(row.status)) {
      addError(
        `Checkpoint ${checkpoint} has invalid status "${row.status}". ` +
          `Expected one of: ${[...VALID_CHECKPOINT_STATUSES].join(", ")}`,
      );
    }

    if (!row.verification) {
      addError(`Checkpoint ${checkpoint} is missing a verification entry`);
      continue;
    }

    if (row.status !== "not_started" && /^n\/a$/i.test(row.verification)) {
      addError(
        `Checkpoint ${checkpoint} has status "${row.status}" but verification is N/A. ` +
          "Use a command or query that proves the state.",
      );
    }
  }

  return checkpointRows;
}

function invariantPlaceholderChannels(checkpointRows) {
  const cp3 = checkpointRows.get("CP3");
  if (!cp3 || cp3.status !== "complete") {
    return;
  }

  const seedText = readText("seed.sql");
  const placeholders = ["C_WIGGS", "C_COMPLIANCE"];
  for (const placeholder of placeholders) {
    if (seedText.includes(`'${placeholder}'`)) {
      addError(
        `CP3 is complete but seed.sql still contains placeholder channel id "${placeholder}". ` +
          "Replace with a real Slack channel id before claiming CP3 completion.",
      );
    }
  }
}

function invariantRuntimeInterfaceDocumentation() {
  const interfacesText = readText("docs/architecture/interfaces.md");
  const runtimeDir = path.join(root, "src/runtime");
  const runtimeFiles = collectTsFiles(runtimeDir);
  const excludedFiles = new Set(["config.ts", "index.ts", "types.ts"]);

  for (const absolutePath of runtimeFiles) {
    const fileName = path.basename(absolutePath);
    if (excludedFiles.has(fileName)) {
      continue;
    }

    const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
    const fileStem = path.basename(fileName, ".ts");
    const pascalName = toPascalCase(fileStem);

    if (!interfacesText.includes(fileStem) && !interfacesText.includes(pascalName)) {
      addError(
        `Runtime component ${relativePath} is not represented in docs/architecture/interfaces.md. ` +
          `Mention "${pascalName}" or "${fileStem}" when adding new runtime boundaries.`,
      );
    }
  }
}

function invariantStableIdentifiers() {
  const agentsDoc = readText("AGENTS.md");
  const reliabilityDoc = readText("docs/RELIABILITY.md");
  const schemaText = readText("schema.sql");
  const systemMap = readText("docs/architecture/system-map.md");

  for (const stableId of ["agentId", "sessionKey", "runId"]) {
    if (!agentsDoc.includes(stableId)) {
      addError(`AGENTS.md must reference stable identifier "${stableId}"`);
    }
    if (!reliabilityDoc.includes(stableId)) {
      addError(`docs/RELIABILITY.md must reference stable identifier "${stableId}"`);
    }
  }

  const runsTableMatch = schemaText.match(
    /CREATE TABLE IF NOT EXISTS\s+gravity\.runs\s*\(([\s\S]*?)\);\s*/i,
  );

  if (!runsTableMatch) {
    addError("schema.sql is missing CREATE TABLE IF NOT EXISTS gravity.runs");
    return;
  }

  const runsTableBlock = runsTableMatch[1];
  if (!/\bid\s+TEXT\s+PRIMARY\s+KEY\b/i.test(runsTableBlock)) {
    addError("gravity.runs must define id TEXT PRIMARY KEY (runId)");
  }
  if (!/\bagent_id\s+TEXT\s+NOT\s+NULL\b/i.test(runsTableBlock)) {
    addError("gravity.runs must define agent_id TEXT NOT NULL");
  }
  if (!/\bsession_key\s+TEXT\s+NOT\s+NULL\b/i.test(runsTableBlock)) {
    addError("gravity.runs must define session_key TEXT NOT NULL");
  }

  if (!/Session key format:/i.test(systemMap)) {
    addError("docs/architecture/system-map.md must define session key format");
  }
}

function collectNestedGitDirs(startDir, relativePrefix = "") {
  if (!existsSync(startDir)) {
    return [];
  }

  const nested = [];
  const entries = readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const childRelative = relativePrefix
      ? path.join(relativePrefix, entry.name)
      : entry.name;
    if (entry.name === ".git") {
      nested.push(childRelative.replaceAll(path.sep, "/"));
      continue;
    }

    const childAbsolute = path.join(startDir, entry.name);
    nested.push(...collectNestedGitDirs(childAbsolute, childRelative));
  }

  return nested;
}

function invariantStoreConventions() {
  const requiredDirectories = [
    "store/shared/skills",
    "store/shared/connectors",
    "store/shared/knowledge",
    "store/agents",
  ];
  for (const relativePath of requiredDirectories) {
    if (!existsSync(path.join(root, relativePath))) {
      addError(`Store convention missing directory: ${relativePath}`);
    }
  }

  const requiredSharedSkills = [
    "store/shared/skills/log-run.md",
    "store/shared/skills/query-gravity.md",
    "store/shared/skills/rollback.md",
    "store/shared/skills/self-author.md",
  ];
  for (const relativePath of requiredSharedSkills) {
    if (!existsSync(path.join(root, relativePath))) {
      addError(`Store convention missing shared skill: ${relativePath}`);
    }
  }

  const nestedStoreGitDirs = collectNestedGitDirs(path.join(root, "store"));
  for (const nestedGitDir of nestedStoreGitDirs) {
    addError(
      `Nested git directory found under store/: store/${nestedGitDir}. ` +
        "Use repository root git history; do not initialize a separate store repo.",
    );
  }
}

invariantMigrationScaffold();
invariantSeedAgentFilesystemParity();
invariantActivePlanDiscipline();
const checkpointRows = invariantCheckpointIntegrity();
invariantPlaceholderChannels(checkpointRows);
invariantRuntimeInterfaceDocumentation();
invariantStableIdentifiers();
invariantStoreConventions();

if (errors.length > 0) {
  console.error("Invariant checks failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Invariant checks passed.");
