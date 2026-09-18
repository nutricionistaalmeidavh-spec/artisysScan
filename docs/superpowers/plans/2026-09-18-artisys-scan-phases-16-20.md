# ArtiSys Scan Phases 16–20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the deterministic release gate, fleet orchestration, static dashboard, Woodpecker workflows, and CI migration while preserving the R$0/self-hosted core and keeping GitHub Actions as fallback.

**Architecture:** Release Gate consumes normalized `UnifiedReportInput` and returns PASS/WARN/BLOCK without coupling to CI. Fleet runs a caller-provided product scanner across a declarative config and aggregates gate decisions. Dashboard renders a static HTML/JSON fleet view. Woodpecker invokes the same Node CLI; Windows-only release checks are routed to the Windows local agent, while Linux quick/full/fleet workflows use the Linux agent. GitHub Actions becomes manual fallback only after the Woodpecker workflow files are present.

**Tech Stack:** Node.js 22+, TypeScript, native fs/path/child_process APIs, YAML, GitHub Actions, Woodpecker CI 3.18 workflow syntax.

**Spec:** `ROADMAP.md`

## Global Constraints

- Core remains R$0, open source and self-hosted.
- No release publication is added by this phase.
- No shell execution for scanner subprocesses unless an existing project workflow explicitly requires it and has an authorization gate.
- Missing tools/evidence must not produce false PASS.
- GitHub Actions remains available manually as fallback.
- Woodpecker is primary only after repository-side workflows exist; server-side enablement must be verified separately.

---

### Task 1: Release Gate

**Files:**
- Create: `packages/release-gate/src/index.ts`
- Create: `packages/release-gate/test/release-gate.test.mjs`
- Modify: `apps/cli/src/index.ts`

**Interfaces:**
- Produces: `evaluateReleaseGate(input, policy?) -> ReleaseGateResult`
- Decision values: `PASS | WARN | BLOCK`

- [ ] Write failing tests for clean PASS, medium WARN, critical/high BLOCK, incomplete BLOCK, failed check BLOCK, and policy override.
- [ ] Run CI and confirm only new tests fail for missing implementation.
- [ ] Implement minimal deterministic evaluator and CLI command `gate <report.json> [policy.json]`.
- [ ] Run CI to green.

### Task 2: Fleet Scanner

**Files:**
- Create: `packages/fleet/src/index.ts`
- Create: `packages/fleet/test/fleet.test.mjs`
- Create: `examples/fleet.yml`
- Modify: `apps/cli/src/index.ts`

**Interfaces:**
- Produces: `loadFleetConfig(path)`, `runFleet(config, scanProduct, options?)`.
- Config contains unique products with `id`, `root`, and `profile`.

- [ ] Write failing tests for duplicate-ID rejection, multi-product aggregation, bounded concurrency, and isolated product failure.
- [ ] Verify RED.
- [ ] Implement YAML loader, concurrency-safe runner, aggregate counts and worst gate decision.
- [ ] Add CLI `fleet <fleet.yml>` using a deterministic built-in static profile (discovery + desktop when applicable) and JSON results.
- [ ] Run CI to green.

### Task 3: Dashboard

**Files:**
- Create: `packages/dashboard/src/index.ts`
- Create: `packages/dashboard/test/dashboard.test.mjs`
- Modify: `apps/cli/src/index.ts`

**Interfaces:**
- Produces: `renderFleetDashboard(fleetReport)` and `writeFleetDashboard(fleetReport, outputDir)`.

- [ ] Write failing tests for BLOCK/WARN/PASS cards, counts, safe HTML escaping, and JSON output.
- [ ] Verify RED.
- [ ] Implement static, dependency-free HTML + `dashboard.json` output.
- [ ] Add CLI `dashboard <fleet-report.json> [output-dir]`.
- [ ] Run CI to green.

### Task 4: Woodpecker

**Files:**
- Create: `.woodpecker/quick.yml`
- Create: `.woodpecker/full.yml`
- Create: `.woodpecker/release-windows.yml`
- Create: `.woodpecker/fleet.yml`
- Replace: `.woodpecker/README.md`
- Create: `packages/core/test/woodpecker-workflows.test.mjs`

**Interfaces:**
- Linux workflows target `platform: linux/amd64`.
- Windows release workflow targets `platform: windows/amd64` and `backend: local`.
- No publish/deploy/release creation command is allowed.

- [ ] Write failing workflow-content tests first.
- [ ] Verify RED.
- [ ] Add Woodpecker 3.18-compatible workflows using `.woodpecker/*.yml`, manual events for heavy/release/fleet paths, and automatic quick checks on push/PR.
- [ ] Run CI to green.

### Task 5: Operational Migration

**Files:**
- Modify: `.github/workflows/scan-quick.yml`
- Modify: `.github/workflows/scan-full.yml`
- Modify: `.github/workflows/scan-manual.yml`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Create: `docs/WOODPECKER_ACTIVATION.md`
- Create: `packages/core/test/ci-migration.test.mjs`

**Interfaces:**
- GitHub Actions must expose only `workflow_dispatch`/reusable manual fallback after migration.
- Woodpecker quick is the repository-side automatic CI definition.

- [ ] Write failing migration test proving Actions no longer auto-runs on push/PR and Woodpecker quick does.
- [ ] Verify RED.
- [ ] Convert Actions to fallback/manual and document exact Woodpecker project settings, agent labels, local-backend security requirements, and validation command.
- [ ] Mark phases complete only after final `npm run ci` passes on the final HEAD.
- [ ] Report server-side activation separately if it cannot be verified from available integrations.
