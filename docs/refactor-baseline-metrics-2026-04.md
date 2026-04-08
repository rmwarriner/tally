# Refactor Baseline Metrics - April 2026

Captured on: 2026-04-07

## Purpose

This artifact provides the PR-0 baseline for:

- API read/write endpoint latency (p50/p95)
- book load/save timing by dataset size
- full test runtime median

Use this as the comparison reference for refactor slices that touch API request flow, persistence timing paths, or test runtime characteristics.

## Measurement Protocol

- API latency:
  - warmup: 5 requests per endpoint
  - samples: 30 requests per endpoint
  - reported metrics: p50, p95
- Workspace load/save timing:
  - datasets:
    - `small` (~1k transactions)
    - `medium` (~10k transactions)
    - `large` (~50k transactions)
  - iterations: 10 per dataset
  - reported metrics: median, p95 for load and save
- Full test runtime:
  - command: `pnpm test`
  - runs: 3
  - reported metric: median wall-clock time

## Environment Metadata

- machine: Apple M3
- cpu threads: 8
- platform: darwin arm64
- Node: `v22.22.1`
- pnpm: `10.0.0`

## Baseline Results

### API Endpoint Latency

| Endpoint | Method | p50 (ms) | p95 (ms) |
| --- | --- | ---: | ---: |
| `/api/books/:bookId` | GET | 1.71 | 2.03 |
| `/api/books/:bookId/transactions` | POST | 3.13 | 4.01 |

### Workspace Load/Save Timing

| Dataset | Transactions | Load median (ms) | Load p95 (ms) | Save median (ms) | Save p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `small` | 1,000 | 1.28 | 1.74 | 1.03 | 1.44 |
| `medium` | 10,000 | 12.74 | 13.20 | 11.91 | 14.94 |
| `large` | 50,000 | 63.74 | 72.08 | 59.40 | 74.00 |

### Full Test Runtime

- samples (ms): `2196.06`, `2049.23`, `2021.31`
- median (ms): `2049.23` (2.05s)

## Reproducibility Spot Check

A second execution of `pnpm metrics:baseline` on 2026-04-07 produced comparable values:

- API GET `/api/books/:bookId` p95: `2.07ms` (first run `2.03ms`)
- API POST `/api/books/:bookId/transactions` p95: `4.18ms` (first run `4.01ms`)
- test runtime median: `2075.79ms` (first run `2049.23ms`)
- book `large` load p95: `76.14ms` (first run `72.08ms`)
- book `large` save p95: `71.42ms` (first run `74.00ms`)

## Thresholds and Regression Policy

Default regression thresholds (unless a PR explicitly overrides with justification):

- API latency: p95 must not regress by more than 10%
- book load/save: p95 must not regress by more than 10%
- full test runtime: median must not regress by more than 15%

Waiver policy:

- if a threshold must be exceeded for an intentional tradeoff, document it in the PR under `risk and rollback notes`
- include expected impact, mitigation, and follow-up owner/date
- include a rollback trigger tied to an observable metric

## Reproducible Runner

Run command:

```bash
pnpm metrics:baseline
```

This command prints structured JSON with:

- environment metadata
- protocol values (warmup/sample counts and iteration counts)
- measured results
- default threshold values

## PR Checklist Mapping

For PRs using this baseline, include:

- `contract impact: none` (or explicitly scoped change)
- structural impact summary
- rollback note
- observability/regression detection note
- command evidence for:
  - `pnpm test`
  - `pnpm typecheck`
