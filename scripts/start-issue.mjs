#!/usr/bin/env node
/**
 * start-issue.mjs <issue-number>
 *
 * Fetches origin, reads the GitHub issue, derives a branch name, and checks
 * out a fresh branch from origin/main. Eliminates the manual fetch + branch
 * creation steps that are easy to skip or get wrong.
 *
 * Usage:
 *   pnpm start-issue 131
 */
import { spawnSync } from "node:child_process";

const issueNumber = process.argv[2];

if (!issueNumber || !/^\d+$/.test(issueNumber)) {
  console.error("Usage: pnpm start-issue <issue-number>");
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function capture(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr ?? `Command failed: ${cmd}`);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

// 1. Fetch so origin/main is current
console.log("Fetching origin...");
run("git", ["fetch", "origin"]);

// 2. Read issue title + labels from GitHub
let issue;
try {
  issue = JSON.parse(capture("gh", ["issue", "view", issueNumber, "--json", "title,labels"]));
} catch {
  console.error(`Could not read issue #${issueNumber} — is it a valid GitHub issue?`);
  process.exit(1);
}

// 3. Derive branch type from labels
const labelNames = issue.labels.map((l) => l.name);
let type = "feat";
if (labelNames.some((l) => ["bug", "fix"].includes(l))) type = "fix";
else if (labelNames.includes("docs")) type = "docs";
else if (labelNames.includes("chore")) type = "chore";
else if (labelNames.includes("refactor")) type = "refactor";

// 4. Slugify title (max 50 chars)
const slug = issue.title
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, "")
  .trim()
  .replace(/\s+/g, "-")
  .replace(/-+/g, "-")
  .slice(0, 50)
  .replace(/-$/, "");

const branch = `${type}/${issueNumber}-${slug}`;

// 5. Check out fresh branch from origin/main
console.log(`\nBranching: ${branch}`);
run("git", ["checkout", "-B", branch, "origin/main"]);
console.log(`\n✓ Ready on ${branch}`);
console.log(`  Issue: #${issueNumber} — ${issue.title}`);
