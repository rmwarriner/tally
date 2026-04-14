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
  if (!agents.includes("## Starting an Issue")) {
    console.error("AGENTS.md must contain a '## Starting an Issue' section.");
    hasError = true;
  }
  if (!agents.includes("start on #NNN")) {
    console.error("AGENTS.md must describe issue startup using the 'start on #NNN' phrasing.");
    hasError = true;
  }
  if (!agents.includes("gh issue view NNN")) {
    console.error("AGENTS.md must reference 'gh issue view NNN' as the issue-spec entrypoint.");
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
