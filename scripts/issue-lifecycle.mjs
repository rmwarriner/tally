import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2];
const issueId = process.argv[3];
const ownerArg = process.argv.find((arg) => arg.startsWith("--owner="));
const owner = ownerArg ? ownerArg.slice("--owner=".length).trim() : "";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (!mode || !["start", "close"].includes(mode)) {
  console.error("Usage: node scripts/issue-lifecycle.mjs <start|close> I-### [--owner=name]");
  process.exit(1);
}

if (!issueId || !/^I-\d{3,}$/.test(issueId)) {
  console.error("Issue id is required and must look like I-### (for example: I-001).");
  process.exit(1);
}

const safeIssueId = escapeRegExp(issueId);

const issuesPath = resolve(process.cwd(), "docs/issues.md");
const lines = readFileSync(issuesPath, "utf8").split(/\r?\n/);

let startIndex = -1;
for (let i = 0; i < lines.length; i += 1) {
  if (new RegExp(`^- \\[[ x]\\] ${safeIssueId}\\b`).test(lines[i])) {
    startIndex = i;
    break;
  }
}

if (startIndex === -1) {
  console.error(`Issue ${issueId} not found in docs/issues.md.`);
  process.exit(1);
}

let endIndex = lines.length;
for (let i = startIndex + 1; i < lines.length; i += 1) {
  if (/^- \[[ x]\] I-\d{3,}\b/.test(lines[i])) {
    endIndex = i;
    break;
  }
}

const today = new Date().toISOString().slice(0, 10);

if (mode === "start") {
  lines[startIndex] = lines[startIndex].replace(/^- \[[ x]\]/, "- [ ]");

  let foundStatus = false;
  let foundOwner = false;
  for (let i = startIndex + 1; i < endIndex; i += 1) {
    if (/^\s+- status:/i.test(lines[i])) {
      lines[i] = "  - status: in-progress";
      foundStatus = true;
    } else if (/^\s+- owner:/i.test(lines[i])) {
      foundOwner = true;
      if (owner) {
        lines[i] = `  - owner: ${owner}`;
      }
    } else if (/^\s+- completed:/i.test(lines[i])) {
      lines[i] = "";
    }
  }

  if (!foundStatus) {
    lines.splice(startIndex + 1, 0, "  - status: in-progress");
    endIndex += 1;
  }
  if (owner && !foundOwner) {
    lines.splice(startIndex + 2, 0, `  - owner: ${owner}`);
  }
}

if (mode === "close") {
  lines[startIndex] = lines[startIndex].replace(/^- \[[ x]\]/, "- [x]");

  let foundStatus = false;
  let foundCompleted = false;
  for (let i = startIndex + 1; i < endIndex; i += 1) {
    if (/^\s+- status:/i.test(lines[i])) {
      lines[i] = "  - status: done";
      foundStatus = true;
    } else if (/^\s+- completed:/i.test(lines[i])) {
      lines[i] = `  - completed: ${today}`;
      foundCompleted = true;
    }
  }

  if (!foundStatus) {
    lines.splice(startIndex + 1, 0, "  - status: done");
    endIndex += 1;
  }
  if (!foundCompleted) {
    lines.splice(endIndex, 0, `  - completed: ${today}`);
  }
}

const cleaned = lines.filter((line, i) => {
  if (line !== "") return true;
  const prev = lines[i - 1] ?? "";
  const next = lines[i + 1] ?? "";
  return prev === "" || next === "";
});

writeFileSync(issuesPath, `${cleaned.join("\n")}\n`, "utf8");
console.log(`${mode === "start" ? "Started" : "Closed"} ${issueId}.`);
