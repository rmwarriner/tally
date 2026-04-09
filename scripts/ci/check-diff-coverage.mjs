#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const threshold = Number.parseFloat(process.env.DIFF_COVERAGE_THRESHOLD ?? "80");
const baseRef = process.env.DIFF_BASE_REF ?? "origin/main";
const coveragePath = process.env.COVERAGE_FINAL_PATH ?? path.join("coverage", "coverage-final.json");

function normalizeFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return path.isAbsolute(normalized)
    ? path.relative(cwd, normalized).replace(/\\/g, "/")
    : normalized;
}

function isProductionTsFile(filePath) {
  return /^(apps|packages)\/.+\/src\/.+\.ts$/.test(filePath) && !/\.test\.ts$/.test(filePath);
}

function parseChangedLines(diffText) {
  const changedByFile = new Map();
  let currentFile = null;

  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentFile = normalizeFile(line.slice(6));
      if (!changedByFile.has(currentFile)) {
        changedByFile.set(currentFile, new Set());
      }
      continue;
    }

    if (!line.startsWith("@@") || !currentFile) {
      continue;
    }

    const match = line.match(/\+(\d+)(?:,(\d+))?/);
    if (!match) {
      continue;
    }

    const start = Number.parseInt(match[1], 10);
    const count = Number.parseInt(match[2] ?? "1", 10);
    const lines = changedByFile.get(currentFile);

    if (!lines || count === 0) {
      continue;
    }

    for (let lineNumber = start; lineNumber < start + count; lineNumber += 1) {
      lines.add(lineNumber);
    }
  }

  return changedByFile;
}

function loadCoverageIndex(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Coverage file not found at ${filePath}. Ensure coverage reporter outputs JSON.`);
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const byRelativePath = new Map();

  for (const [key, value] of Object.entries(raw)) {
    byRelativePath.set(normalizeFile(key), value);
  }

  return byRelativePath;
}

function statementIdsForLines(statementMap, changedLines) {
  const touched = new Set();

  for (const [statementId, location] of Object.entries(statementMap)) {
    const startLine = location.start?.line;
    const endLine = location.end?.line;

    if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
      continue;
    }

    for (const line of changedLines) {
      if (line >= startLine && line <= endLine) {
        touched.add(statementId);
        break;
      }
    }
  }

  return touched;
}

function percent(covered, total) {
  if (total === 0) {
    return 100;
  }
  return (covered / total) * 100;
}

const diffOutput = execSync(`git diff --unified=0 --no-color ${baseRef}...HEAD`, {
  cwd,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const changedByFile = parseChangedLines(diffOutput);
const productionChanges = [...changedByFile.entries()].filter(([file]) => isProductionTsFile(file));

if (productionChanges.length === 0) {
  console.log("Diff coverage: no production TypeScript source changes detected.");
  process.exit(0);
}

const coverageByPath = loadCoverageIndex(coveragePath);
let totalStatements = 0;
let coveredStatements = 0;

for (const [file, changedLines] of productionChanges) {
  const coverage = coverageByPath.get(file);
  if (!coverage) {
    console.error(`Diff coverage: missing coverage entry for ${file}.`);
    process.exit(1);
  }

  const touchedStatementIds = statementIdsForLines(coverage.statementMap ?? {}, changedLines);
  if (touchedStatementIds.size === 0) {
    continue;
  }

  let fileCovered = 0;
  for (const statementId of touchedStatementIds) {
    const hitCount = coverage.s?.[statementId] ?? 0;
    if (hitCount > 0) {
      fileCovered += 1;
    }
  }

  totalStatements += touchedStatementIds.size;
  coveredStatements += fileCovered;

  const filePercent = percent(fileCovered, touchedStatementIds.size);
  console.log(`Diff coverage ${file}: ${filePercent.toFixed(2)}% (${fileCovered}/${touchedStatementIds.size})`);
}

if (totalStatements === 0) {
  console.log("Diff coverage: changed files contain no coverable statements.");
  process.exit(0);
}

const overall = percent(coveredStatements, totalStatements);
console.log(`Diff coverage overall: ${overall.toFixed(2)}% (${coveredStatements}/${totalStatements})`);

if (overall < threshold) {
  console.error(`Diff coverage is below threshold (${threshold.toFixed(2)}%).`);
  process.exit(1);
}
