import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const rootDirectory = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".github",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
]);
const scannedExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const secretPatterns = [
  {
    message: "Potential private key material detected.",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    message: "Potential AWS access key detected.",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    message: "Potential hard-coded credential detected.",
    pattern:
      /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["'`][A-Za-z0-9/_+=.-]{16,}["'`]/gi,
  },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = extname(entry.name);

    if (extension && !scannedExtensions.has(extension)) {
      continue;
    }

    const info = await stat(entryPath);

    if (info.size > 1024 * 1024) {
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

function findIssues(filePath, content) {
  const issues = [];

  for (const rule of secretPatterns) {
    const matches = content.match(rule.pattern);

    if (!matches) {
      continue;
    }

    issues.push({
      filePath,
      match: matches[0],
      message: rule.message,
    });
  }

  return issues;
}

const files = await walk(rootDirectory);
const issues = [];

for (const filePath of files) {
  const content = await readFile(filePath, "utf8");
  issues.push(...findIssues(filePath, content));
}

if (issues.length > 0) {
  console.error("Secret scan failed.");

  for (const issue of issues) {
    console.error(
      `- ${relative(rootDirectory, issue.filePath)}: ${issue.message} (${issue.match.slice(0, 60)})`,
    );
  }

  process.exit(1);
}

console.log(`Secret scan passed for ${files.length} files.`);
