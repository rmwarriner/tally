import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const issuesPath = resolve(process.cwd(), "docs/issues.md");
const content = readFileSync(issuesPath, "utf8");
const lines = content.split(/\r?\n/);

const items = [];
let current = null;

for (const line of lines) {
  const itemMatch = line.match(/^- \[( |x)\] (I-\d+)\s+(.+)$/);
  if (itemMatch) {
    if (current) items.push(current);
    current = {
      checked: itemMatch[1] === "x",
      id: itemMatch[2],
      title: itemMatch[3].trim(),
      status: "",
      type: "",
      owner: "",
      links: "",
    };
    continue;
  }

  if (!current) continue;

  const statusMatch = line.match(/^\s+- status:\s*(.+)$/i);
  if (statusMatch) {
    current.status = statusMatch[1].trim().toLowerCase();
    continue;
  }

  const typeMatch = line.match(/^\s+- type:\s*(.+)$/i);
  if (typeMatch) {
    current.type = typeMatch[1].trim();
    continue;
  }

  const ownerMatch = line.match(/^\s+- owner:\s*(.+)$/i);
  if (ownerMatch) {
    current.owner = ownerMatch[1].trim();
    continue;
  }

  const linksMatch = line.match(/^\s+- links:\s*(.+)$/i);
  if (linksMatch) {
    current.links = linksMatch[1].trim();
  }
}

if (current) items.push(current);

const actionable = items.filter(
  (item) =>
    !item.checked &&
    (item.status === "in-progress" || item.status === "ready"),
);

const rank = { "in-progress": 0, ready: 1 };
actionable.sort((a, b) => {
  const statusDiff = rank[a.status] - rank[b.status];
  if (statusDiff !== 0) return statusDiff;
  return a.id.localeCompare(b.id);
});

const next = actionable[0];

if (!next) {
  console.log("No in-progress or ready local issues found in docs/issues.md.");
  process.exit(0);
}

console.log(`Next issue: ${next.id} ${next.title}`);
console.log(`status: ${next.status}`);
if (next.type) console.log(`type: ${next.type}`);
if (next.owner) console.log(`owner: ${next.owner}`);
if (next.links && next.links !== "(empty)") console.log(`links: ${next.links}`);
