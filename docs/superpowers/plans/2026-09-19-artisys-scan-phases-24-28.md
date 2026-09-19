# ArtiSys Scan Phases 24–28 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Homologate the scanner against the disposable Loja Online pilot through calibration, disposable runtime, real web/API scans, and RBAC validation without touching production or customer data.

**Architecture:** Keep scanner engines generic and policy-driven. The Loja Online pilot starts only on `127.0.0.1` with a temporary data directory, seeds synthetic actors/data, writes ephemeral access policy with tokens in environment variables, runs scanner CLI commands, then always closes the server and removes the temporary data. Static and dynamic evidence are published by the existing Woodpecker reporter.

**Tech Stack:** Node 22, TypeScript, Electron, Woodpecker Windows local backend, ArtiSys Scan CLI, native `fetch`, temporary SQLite data.

**Spec:** `ROADMAP.md`

## Global Constraints

- Never target Obra na Mão or any real-customer environment in phases 24–28.
- Dynamic targets must resolve to loopback (`127.0.0.1`/`localhost`) and use disposable data only.
- Tokens stay in process environment; no bearer token is committed to YAML or reports.
- State-changing probes remain disabled unless the disposable runtime is active.
- Cleanup must run in `finally`, even when a scanner fails.
- A scan may be PASS/WARN/BLOCK, but may not silently mark skipped required checks as passed.

## Review Focus

- External URL lookalikes such as `wa.me.evil.test` must remain blocked.
- A disposable runner that receives a non-loopback target must refuse execution.
- Runtime cleanup must happen after both success and failure.
- API/RBAC policies must never serialize actual tokens.
- Auth/RBAC scanners must distinguish expected denials from transport errors.

---

### Task 1: Phase 24 — close calibration

**Files:**
- Modify in pilot: `lojaonline/apps/desktop/main.mjs`
- Modify in pilot: `lojaonline/test/final-shells.test.mjs`
- Modify: `packages/desktop/src/index.ts`
- Modify: `packages/desktop/test/desktop.test.mjs`

**Interfaces:**
- Consumes: existing `ARTISYS-ELECTRON-008` Electron rule.
- Produces: strict external URL allowlist that the scanner can recognize without suppressing unsafe `shell.openExternal` calls.

- [ ] Add failing tests for exact `https:` + `wa.me` allowlisting and default popup deny.
- [ ] Add failing scanner fixture proving strict allowlist is not flagged while raw `shell.openExternal(url)` remains flagged.
- [ ] Implement URL parser/allowlist in Loja Online and default-deny window opens.
- [ ] Refine Electron rule to recognize the explicit strict allowlist pattern only.
- [ ] Run scanner suite and pilot pipeline; expected: static gate PASS with zero findings.

### Task 2: Phase 25 — disposable runtime

**Files:**
- Create in pilot: `lojaonline/scripts/artisys-dynamic-pilot.mjs`
- Create in pilot: `lojaonline/test/artisys-dynamic-pilot.test.mjs`
- Modify in pilot: `lojaonline/.woodpecker/scan-pilot.yml`

**Interfaces:**
- Produces: loopback `baseUrl`, synthetic actor tokens, fixture identifiers and guaranteed cleanup for Tasks 3–5.

- [ ] Add tests for loopback-only target, temporary data path, and cleanup-on-failure.
- [ ] Start `startFinalServer({port:0, host:'127.0.0.1', dataDir:<temp>})`.
- [ ] Seed synthetic owner/member roles and disposable domain data.
- [ ] Export tokens only to child-process environment and remove temp state in `finally`.
- [ ] Add Woodpecker dynamic step after static PASS.

### Task 3: Phase 26 — real Web Scanner

**Files:**
- Modify in pilot: `lojaonline/scripts/artisys-dynamic-pilot.mjs`
- Modify in pilot: `lojaonline/test/artisys-dynamic-pilot.test.mjs`
- Modify: `packages/web/test/web.test.mjs` only if a Windows/loopback regression is discovered.

**Interfaces:**
- Consumes: disposable `baseUrl` from Task 2.
- Produces: real `web` report against local staging without DAST/state changes.

- [ ] Run baseline + CORS probes against the disposable runtime.
- [ ] Keep active reflection/DAST disabled in this phase.
- [ ] Persist JSON evidence and fail only on scanner incomplete/high/critical results.
- [ ] Verify no external host is contacted by the pilot.

### Task 4: Phase 27 — real API Scanner

**Files:**
- Create in pilot: `lojaonline/.artisys/access.dynamic.template.yml`
- Modify in pilot: `lojaonline/scripts/artisys-dynamic-pilot.mjs`
- Modify in pilot: `lojaonline/test/artisys-dynamic-pilot.test.mjs`

**Interfaces:**
- Consumes: synthetic session tokens and loopback URL.
- Produces: ephemeral access policy and API report for anonymous/invalid-token/input checks.

- [ ] Generate access policy at runtime with loopback base URL; committed template contains no secrets.
- [ ] Test protected session/users endpoints for anonymous and invalid-token denial.
- [ ] Run only read-only API cases in Phase 27; state-changing cases remain skipped by policy.
- [ ] Persist report and distinguish skips from errors.

### Task 5: Phase 28 — real RBAC Scanner

**Files:**
- Modify in pilot: `lojaonline/.artisys/access.dynamic.template.yml`
- Modify in pilot: `lojaonline/scripts/artisys-dynamic-pilot.mjs`
- Modify in pilot: `lojaonline/test/artisys-dynamic-pilot.test.mjs`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: owner/member synthetic actors from Task 2 and access policy from Task 4.
- Produces: RBAC evidence for allowed and denied read actions without customer data.

- [ ] Seed at least owner and restricted member actors.
- [ ] Define read-only role matrix against real Loja Online routes.
- [ ] Run `rbac` without `--allow-state-change` and require complete report.
- [ ] Publish Web/API/RBAC evidence in Woodpecker summary.
- [ ] Mark phases 24–28 complete only after the Windows pilot is green.
