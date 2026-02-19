import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

const requiredFiles = [
  "AGENTS.md",
  "README.md",
  "docs/README.md",
  "docs/DESIGN.md",
  "docs/PLANS.md",
  "docs/QUALITY_SCORE.md",
  "docs/RELIABILITY.md",
  "docs/SECURITY.md",
  "docs/tech-debt-tracker.md",
  "docs/typescript_recommendations.md",
  "docs/checkpoints/mvp-status.md",
  "docs/harness/practices.md",
  "schema.sql",
  "seed.sql",
  "db/migrations",
  "docker-compose.yml",
  "store/shared/skills/self-author.md",
  "store/agents/data-analyst/memory/MEMORY.md",
];

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(root, relativePath))) {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

const agentFile = path.join(root, "AGENTS.md");
if (existsSync(agentFile)) {
  const content = readFileSync(agentFile, "utf8");
  const lineCount = content.split("\n").length;
  if (lineCount > 220) {
    errors.push(`AGENTS.md should stay short; found ${lineCount} lines`);
  }
  if (!content.includes("## Fast Map")) {
    errors.push("AGENTS.md must include a ## Fast Map section");
  }
}

const markdownFilesToCheck = [
  "AGENTS.md",
  "README.md",
  "docs/README.md",
  "docs/harness/practices.md",
];

const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

for (const file of markdownFilesToCheck) {
  const absoluteFile = path.join(root, file);
  if (!existsSync(absoluteFile)) {
    continue;
  }

  const content = readFileSync(absoluteFile, "utf8");
  let match;
  while ((match = markdownLinkPattern.exec(content)) !== null) {
    const rawTarget = match[1];
    if (
      rawTarget.startsWith("http://") ||
      rawTarget.startsWith("https://") ||
      rawTarget.startsWith("mailto:") ||
      rawTarget.startsWith("#")
    ) {
      continue;
    }

    const targetPath = rawTarget.split("#")[0];
    const resolved = path.resolve(path.dirname(absoluteFile), targetPath);
    if (!existsSync(resolved)) {
      errors.push(`Broken relative link in ${file}: ${rawTarget}`);
    }
  }
}

const checkpoints = [
  "CP1",
  "CP2",
  "CP3",
  "CP4",
  "CP5",
  "CP6",
  "CP7",
  "CP8",
  "CP9",
  "CP10",
];

const checkpointFile = path.join(root, "docs/checkpoints/mvp-status.md");
if (existsSync(checkpointFile)) {
  const checkpointText = readFileSync(checkpointFile, "utf8");
  for (const checkpoint of checkpoints) {
    if (!checkpointText.includes(`| ${checkpoint} |`)) {
      errors.push(`Checkpoint table is missing ${checkpoint}`);
    }
  }
}

const activePlansDir = path.join(root, "docs/plans/active");
if (existsSync(activePlansDir)) {
  const activePlans = readdirSync(activePlansDir).filter((entry) =>
    entry.endsWith(".md"),
  );

  if (activePlans.length > 1) {
    errors.push("At most one active plan is allowed in docs/plans/active");
  }

  for (const plan of activePlans) {
    const planPath = path.join(activePlansDir, plan);
    const text = readFileSync(planPath, "utf8");
    if (!/Status:\s+active/i.test(text)) {
      errors.push(`${plan} must declare Status: active`);
    }
    if (!/Last Updated:\s+\d{4}-\d{2}-\d{2}/.test(text)) {
      errors.push(`${plan} must declare Last Updated: YYYY-MM-DD`);
    }
  }
}

const migrationsDir = path.join(root, "db/migrations");
if (existsSync(migrationsDir)) {
  const migrations = readdirSync(migrationsDir).filter((entry) =>
    entry.endsWith(".sql"),
  );
  if (migrations.length === 0) {
    errors.push("db/migrations must contain at least one .sql migration file");
  }
}

if (errors.length > 0) {
  console.error("Repository lint failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Repository lint passed.");
