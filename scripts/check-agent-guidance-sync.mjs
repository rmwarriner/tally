import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const agentsPath = resolve(root, "AGENTS.md");
const claudePath = resolve(root, "CLAUDE.md");

let hasError = false;

try {
  const claude = readFileSync(claudePath, "utf8");
  if (!claude.includes("## Collaboration & Automation")) {
    console.error(
      "CLAUDE.md must include the 'Collaboration & Automation' section because it is the canonical agent policy.",
    );
    hasError = true;
  }
} catch (error) {
  console.error(`Unable to read CLAUDE.md: ${error.message}`);
  process.exit(1);
}

try {
  const agents = readFileSync(agentsPath, "utf8");
  if (!agents.includes("CLAUDE.md")) {
    console.error("AGENTS.md must contain a pointer to CLAUDE.md as the canonical policy source.");
    hasError = true;
  }
  if (!agents.includes("## Codex Session Start")) {
    console.error("AGENTS.md must contain a '## Codex Session Start' section with worktree sync instructions.");
    hasError = true;
  }
  if (!agents.includes("docs/handoffs/")) {
    console.error("AGENTS.md must reference docs/handoffs/ as the handoff deck location.");
    hasError = true;
  }
} catch (error) {
  console.error(`Unable to read AGENTS.md: ${error.message}`);
  process.exit(1);
}

if (hasError) {
  process.exit(1);
}

console.log("Agent guidance sync check passed.");
