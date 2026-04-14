#!/usr/bin/env node
/**
 * claude-review.mjs
 * Fetches a PR diff, sends it to the Anthropic API, and posts the review
 * as a PR comment via the GitHub CLI.
 *
 * Required env:
 *   ANTHROPIC_API_KEY  — Anthropic API key
 *   PR_NUMBER          — GitHub PR number
 *   GITHUB_REPOSITORY  — owner/repo (set automatically by GitHub Actions)
 */

import { spawnSync } from "node:child_process";

const { ANTHROPIC_API_KEY, PR_NUMBER, GITHUB_REPOSITORY } = process.env;

if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
if (!PR_NUMBER) throw new Error("PR_NUMBER is not set");
if (!GITHUB_REPOSITORY) throw new Error("GITHUB_REPOSITORY is not set");

const SYSTEM_PROMPT = `You are a code reviewer for Tally, a personal finance system built on strict
double-entry accounting. Review the pull request diff provided and focus on the following concerns,
in priority order:

1. Audit events — Any mutation path (commands, API handlers, book writes) must emit a structured
   audit event. Flag any added or modified mutation that skips this.

2. Domain layer purity — packages/domain and packages/book must have no I/O or side effects unless
   the file is explicitly at an operational boundary. Flag violations.

3. TDD compliance — Production .ts changes in apps/ or packages/ should be accompanied by .test.ts
   changes. If tests are absent and the PR description doesn't mark "no test needed", note it.

4. Double-entry integrity — Any ledger or transaction logic must preserve the invariant that debits
   equal credits. Flag any change that could break balanced entries.

5. Security — Check for command injection, untrusted input flowing into dangerous sinks,
   client-supplied actor identity being trusted, or secrets exposed in logs.

6. General quality — Obvious bugs, unhandled error paths, incorrect TypeScript types, or logic that
   contradicts the stated intent of the change.

Be concise. Lead with any blocking issues. Skip praise for things that are simply correct.
If the diff looks clean across all concerns, say so briefly.`;

function gh(...args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`gh ${args[0]} failed: ${result.stderr}`);
  }
  return result.stdout;
}

async function callClaude(diff, title) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `PR: ${title}\nRepository: ${GITHUB_REPOSITORY}\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

console.log(`PR_NUMBER=${PR_NUMBER} GITHUB_REPOSITORY=${GITHUB_REPOSITORY}`);

const diff = gh("pr", "diff", PR_NUMBER);
console.log(`Diff length: ${diff.length} chars`);

if (!diff.trim()) {
  console.log("No diff found — skipping review.");
  process.exit(0);
}

const title = gh("pr", "view", PR_NUMBER, "--json", "title", "--jq", ".title").trim();
console.log(`Reviewing PR #${PR_NUMBER}: ${title}`);

const review = await callClaude(diff, title);
console.log(`Review length: ${review.length} chars`);
console.log("Posting comment...");

gh("pr", "comment", PR_NUMBER, "--body", `### Claude Review\n\n${review}`);
console.log("Done.");
