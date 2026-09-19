# ArtiSys Scan Phases 16–20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the deterministic release gate, fleet orchestration, static dashboard, Woodpecker workflows, and CI migration while preserving the R$0/self-hosted core and keeping GitHub Actions as fallback.

**Architecture:** Release Gate consumes normalized `UnifiedReportInput` and returns PASS/WARN/BLOCK without coupling to CI. Fleet runs a caller-provided product scanner across a declarative config and aggregates gate decisions. Dashboard renders static HTML/JSON. Woodpecker invokes the same Node CLI on the existing homologated Windows local agent (`platform=windows/amd64`, `backend=local`, `pilot=pdv-artisys`). GitHub Actions remains the hosted isolation boundary for pull requests and a manual fallback.

**Tech Stack:** Node.js 22+, TypeScript, native fs/path/child_process APIs, YAML, GitHub Actions, Woodpecker CI 3.18 workflow syntax.

**Spec:** `ROADMAP.md`

## Global Constraints

- Core remains R$0, open source and self-hosted.
- No release publication is added by this phase.
- Missing tools/evidence must not produce false PASS.
- GitHub Actions remains available for pull-request isolation and manual fallback.
- Woodpecker local backend receives trusted pushes/manual runs only.

---

### Task 1: Release Gate

- [x] Write failing tests for PASS/WARN/BLOCK, incomplete evidence, failed checks, and policy override.
- [x] Verify RED.
- [x] Implement `evaluateReleaseGate` and CLI `gate`.
- [x] Run CI to green.

### Task 2: Fleet Scanner

- [x] Write failing tests for duplicate IDs, aggregation, bounded concurrency, and isolated failure.
- [x] Verify RED.
- [x] Implement config loader, concurrency-safe runner, and aggregate gate decision.
- [x] Add CLI `fleet` and example config.
- [x] Run CI to green.

### Task 3: Dashboard

- [x] Write failing tests for cards, counts, escaping, and JSON output.
- [x] Verify RED.
- [x] Implement dependency-free static HTML + `dashboard.json`.
- [x] Add CLI `dashboard`.
- [x] Run CI to green.

### Task 4: Woodpecker

- [x] Write workflow-content tests first.
- [x] Verify RED.
- [x] Add `quick`, `full`, `fleet`, and `release-windows` workflows.
- [x] Route workflows to the homologated Windows local agent and use `powershell.exe`.
- [x] Prevent pull-request execution on the local backend.
- [x] Confirm repository enablement/webhook by observing `ci/woodpecker/push/quick` on GitHub commits.
- [x] Confirm `quick` executes successfully on the Windows local agent.

### Task 5: Operational Migration

- [x] Write migration tests.
- [x] Move trusted push CI to Woodpecker.
- [x] Keep pull requests on GitHub-hosted runners and retain manual fallback workflows.
- [x] Document server, labels, local-backend boundary, and activation state.
- [x] Validate typecheck + tests + build on both Ubuntu and Windows hosted runners.
- [x] Mark phases 19–20 complete after the first Woodpecker `quick` execution is green.

## Verification evidence

- Windows-specific failures were reproduced on `windows-latest`, traced to ESM CLI entrypoint detection and POSIX-only path assertions, and fixed at the source.
- The corrected HEAD passed the full `npm run ci` path on both `ubuntu-latest` and `windows-latest`.
- Woodpecker repository enablement is confirmed by GitHub commit statuses pointing to `ci.artisys.dev`.
- `ci/woodpecker/push/quick` completed successfully on the homologated Windows local agent.
- Fases 0–20 are complete; no workflow publishes releases automatically.
