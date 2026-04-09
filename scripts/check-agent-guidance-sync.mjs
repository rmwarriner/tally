import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const expectedAgents = `# AGENTS.md

Canonical repository agent guidance lives in [CLAUDE.md](/Users/robert/Projects/tally/CLAUDE.md).

This file is intentionally a thin pointer so Claude Code and Codex share one policy source of truth.
Do not duplicate policy text here.
`;

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
  if (agents !== expectedAgents) {
    console.error(
      "AGENTS.md has drifted. Keep AGENTS.md as the canonical pointer shim to CLAUDE.md.",
    );
    console.error("Expected AGENTS.md contents:\n");
    console.error(expectedAgents);
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
