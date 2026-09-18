# ArtiSys Scan Phases 0–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a fundação, o contrato universal e o discovery automático do ArtiSys Scan.

**Architecture:** Um CLI Node 22/TypeScript chama packages pequenos e independentes. `contracts` possui schema/tipos/validação; `core` possui discovery local e geração de draft; o CLI só transforma argumentos em chamadas desses packages.

**Tech Stack:** Node.js 22, TypeScript, npm workspaces, AJV, yaml e `node:test` com tsx.

**Spec:** `docs/superpowers/specs/2026-09-18-artisys-scan-foundation-design.md`

## Global Constraints

- Núcleo R$ 0, open source e self-hosted.
- GitHub Actions não publica releases durante o desenvolvimento.
- Woodpecker permanece desativado até a fase operacional final.
- Capacidades de negócio não inferíveis devem resultar em `review`, nunca `false` silencioso.
- Node.js >= 22 e TypeScript strict.

---

### Task 1: Contrato e validação

**Files:**
- Create: `packages/contracts/schema/artisys-scan.schema.json`
- Create: `packages/contracts/src/types.ts`
- Create: `packages/contracts/src/manifest.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/manifest.test.mjs`

**Interfaces:**
- Produces: `loadManifest(path): Promise<ScanManifestV1>`
- Produces: `validateManifest(value): ScanManifestV1`
- Produces: `CapabilityFlag = boolean | 'review'`

- [ ] Escrever testes de manifesto válido, inválido e `review`.
- [ ] Executar testes e observar falha antes da implementação.
- [ ] Implementar schema, tipos e validação YAML/AJV.
- [ ] Executar `npm test` e `npm run typecheck`.

### Task 2: Discovery automático

**Files:**
- Create: `packages/core/src/discovery.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/test/discovery.test.mjs`

**Interfaces:**
- Consumes: `ScanManifestV1` e `CapabilityFlag` de contracts.
- Produces: `discoverProject(root): Promise<DiscoveryResult>`.

- [ ] Escrever testes com projetos temporários Electron/Vite/Playwright e projeto desconhecido.
- [ ] Confirmar que os testes falham antes da implementação.
- [ ] Implementar sinais, evidências, classificação de runtime e manifesto sugerido.
- [ ] Garantir que auth/RBAC/multitenancy/superadmin sejam `review` quando não declarados.

### Task 3: CLI e verificação integrada

**Files:**
- Create: `apps/cli/src/index.ts`
- Test: `apps/cli/test/cli.test.mjs`

**Interfaces:**
- `artisys-scan validate <manifest>` imprime JSON válido e retorna 0; manifesto inválido retorna código != 0.
- `artisys-scan discover <root>` imprime `DiscoveryResult` em JSON.

- [ ] Escrever testes de CLI antes da implementação.
- [ ] Implementar parsing mínimo de argumentos sem framework adicional.
- [ ] Rodar `npm run ci`.
- [ ] Atualizar README e ROADMAP com o estado verificado.
