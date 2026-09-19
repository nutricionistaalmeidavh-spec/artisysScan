# ArtiSys Scan Fases 29–33 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Homologar Multitenancy, Admin/Superadmin, QA funcional, mutações descartáveis e um orquestrador único do ArtiSys Scan usando a Loja Online somente em loopback temporário.

**Architecture:** O scanner continua genérico; `packages/orchestrator` agrega scanners existentes sem criar ambiente ou credenciais. A Loja Online mantém um adapter de homologação que cria tenants/usuários/recursos temporários, injeta tokens via environment, chama o orquestrador e destrói o estado no final.

**Tech Stack:** Node 22, TypeScript, node:test, YAML, Woodpecker Windows local backend, Loja Online Node/SQLite local-first.

**Spec:** `docs/superpowers/specs/2026-09-19-artisys-scan-phases-29-33-design.md`

## Global Constraints

- Nunca usar produção; somente loopback e dados temporários.
- Nenhum bearer token pode ser gravado em YAML ou report persistido.
- `--allow-state-change` e `--allow-project-exec` permanecem proibidos em `environment=production`.
- Mutação só ocorre dentro do runtime descartável da Loja Online.
- Não alterar a regra real que define Superadmin da Loja Online.

## Review Focus

- Actor que pertence aos dois tenants não pode ser usado como prova de isolamento.
- `tenant` deve executar A→B e B→A com IDs de recurso reais.
- Admin deve testar negativa de Superadmin sem fabricar um Superadmin.
- Orquestrador deve preservar `complete=false` quando qualquer etapa estiver incompleta.
- Falha em QA/mutação não pode impedir cleanup do runtime temporário.

---

### Task 1: Fase 29 — Multitenancy real no piloto

**Files:**
- Modify: Loja Online `.artisys/access.dynamic.template.yml`
- Modify: Loja Online `scripts/artisys-dynamic-pilot.mjs`
- Modify: Loja Online `test/artisys-dynamic-pilot.test.mjs`

**Interfaces:**
- Consumes: `runTenantScan(policy,{env})` e `tenant.resources/routes` já existentes.
- Produces: dois tenants A/B com tokens exclusivos e recursos reais, mais `tenant` result no report dinâmico.

- [ ] **Step 1: Write failing tests** que exigem policy com dois tenants, dois actors com `tenant`, rota `/api/v1/contacts/{resourceId}` e execução `tenant`.
- [ ] **Step 2: Run** `node --test test/artisys-dynamic-pilot.test.mjs`; esperado: FAIL porque o template/runtime atual não contém tenant isolation.
- [ ] **Step 3: Implement** criação de empresa B, usuário exclusivo B, contato A/B, resources dinâmicos e chamada ao tenant scanner.
- [ ] **Step 4: Run** o teste novamente; esperado: PASS.
- [ ] **Step 5: Commit** `feat(scan): prove disposable tenant isolation`.

### Task 2: Fase 30 — Admin/Superadmin boundary

**Files:**
- Modify: Loja Online `.artisys/access.dynamic.template.yml`
- Modify: Loja Online `scripts/artisys-dynamic-pilot.mjs`
- Modify: Loja Online `test/artisys-dynamic-pilot.test.mjs`

**Interfaces:**
- Consumes: `runAdminScan(policy,{env})` e `action.privileged`.
- Produces: resultado `admin` que prova negação de rotas administrativas/Superadmin para papéis inferiores.

- [ ] **Step 1: Write failing tests** exigindo ações privilegiadas `users.read` e `superadmin.overview`, sem criar role SUPERADMIN falsa.
- [ ] **Step 2: Run** teste; esperado: FAIL no template atual.
- [ ] **Step 3: Implement** política e execução admin read-only.
- [ ] **Step 4: Run** teste; esperado: PASS.
- [ ] **Step 5: Commit** `feat(scan): verify admin and superadmin boundaries`.

### Task 3: Fases 31–32 — QA funcional e mutações descartáveis

**Files:**
- Modify: Loja Online `scripts/artisys-dynamic-pilot.mjs`
- Modify: Loja Online `.artisys/access.dynamic.template.yml`
- Modify: Loja Online `test/artisys-dynamic-pilot.test.mjs`

**Interfaces:**
- Consumes: CLI `qa`, API/RBAC/Tenant/Admin com `--allow-state-change`.
- Produces: `qa` e `mutable` no resultado, ambos executados antes do teardown.

- [ ] **Step 1: Write failing tests** exigindo que execução mutável seja habilitada somente no adapter descartável e que QA seja chamado com project execution explícita.
- [ ] **Step 2: Run** teste; esperado: FAIL porque o adapter ainda só faz Web/API/RBAC read-only.
- [ ] **Step 3: Implement** ações temporárias com prefixo `ARTISYS_SCAN_`, chamadas com `--allow-state-change`, e QA existente com `--allow-project-exec`.
- [ ] **Step 4: Run** teste; esperado: PASS.
- [ ] **Step 5: Commit** `feat(scan): run disposable mutable and functional qa checks`.

### Task 4: Fase 33 — Orquestrador genérico

**Files:**
- Create: `packages/orchestrator/src/index.ts`
- Create: `packages/orchestrator/test/orchestrator.test.mjs`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/test/cli.test.mjs`

**Interfaces:**
- Consumes: web/api/rbac/tenant/admin/qa runners.
- Produces: `runHomologation(config,options)` e comando `artisys-scan homologate <config.json>`.

- [ ] **Step 1: Write failing unit test** para agregação PASS, incompleto e falha.
- [ ] **Step 2: Run** `node --import tsx --test packages/orchestrator/test/orchestrator.test.mjs`; esperado: FAIL por módulo ausente.
- [ ] **Step 3: Implement** tipos `HomologationConfig`, `HomologationReport` e `runHomologation` com runners injetáveis para teste.
- [ ] **Step 4: Run** teste; esperado: PASS.
- [ ] **Step 5: Write failing CLI test** para `homologate` e guard de produção.
- [ ] **Step 6: Implement** comando/usage no CLI; produção continua bloqueando flags perigosas.
- [ ] **Step 7: Run** `node --import tsx --test apps/cli/test/cli.test.mjs`; esperado: PASS.
- [ ] **Step 8: Commit** `feat: add unified homologation orchestrator`.

### Task 5: Integrar o orquestrador ao piloto e homologar no Woodpecker

**Files:**
- Modify: Loja Online `scripts/artisys-dynamic-pilot.mjs`
- Modify: Loja Online `.woodpecker/scan-pilot.yml`
- Modify: Loja Online `test/artisys-dynamic-pilot.test.mjs`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: `artisys-scan homologate`.
- Produces: um único `homologation.json`, release report com fases 29–33 e status Woodpecker.

- [ ] **Step 1: Write failing product test** exigindo uso do comando único e registro de tenant/admin/qa/mutable/orchestrator.
- [ ] **Step 2: Run** teste; esperado: FAIL antes da migração.
- [ ] **Step 3: Replace** chamadas individuais pelo config temporário + comando `homologate`; manter teardown em `finally`.
- [ ] **Step 4: Run** testes da Loja Online ligados ao piloto; esperado: PASS.
- [ ] **Step 5: Run scanner full CI** `npm run ci`; esperado: typecheck, tests e build exit 0.
- [ ] **Step 6: Push/retest Woodpecker** e ler o relatório real; esperado: tenant/admin/qa/mutable/orchestrator PASS e cleanup comprovado.
- [ ] **Step 7: Update ROADMAP** somente depois da evidência real.
- [ ] **Step 8: Commit** `docs: record homologated phases 29-33`.
