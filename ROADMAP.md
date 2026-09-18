# Roadmap — ArtiSys Scan

## Estratégia de CI

- **Push confiável:** Woodpecker self-hosted no agent Windows local.
- **Pull request:** GitHub Actions hospedado para isolamento de código de PR.
- **Operação pesada/release:** Woodpecker manual no agent Windows; release exige `privilege=elevated`.
- **Regra:** a lógica do scan pertence ao CLI; CI apenas orquestra comandos.
- **Fallback:** GitHub Actions permanece disponível manualmente e para PRs.

## Fases

- [x] **0 — Fundação:** monorepo Node 22/TypeScript, CLI, packages, documentação e CI de desenvolvimento.
- [x] **1 — Contrato universal:** `.artisys/scan.yml`, JSON Schema, tipos e validação.
- [x] **2 — Discovery automático:** detectar stack, runtime, banco, QA, installer e produzir manifesto sugerido seguro.
- [x] **3 — Source Security:** Semgrep CE com regras locais, Trivy, Gitleaks e OSV-Scanner, runner sem shell e findings normalizados sem expor segredos brutos.
- [x] **4 — SBOM / Supply Chain:** CycloneDX preservado como artefato, dependências, licenças e vulnerabilidades via Trivy + OSV-Scanner.
- [x] **5 — QA Engine:** descoberta de Playwright/scripts QA existentes, screenshots, vídeos, traces, JSON/HTML, console e network via trace, com execução do projeto-alvo somente após autorização explícita.
- [x] **6 — Web Scanner:** HTTPS, headers, CSP, HSTS, cookies, banners/leakage, CORS com origem não confiável, heurística de CSRF, superfície de upload, reflexão ativa opt-in e perfil DAST opcional com OWASP ZAP Baseline + Nuclei.
- [x] **7 — API Scanner:** autenticação anônima/token inválido, entrada inválida, rate limit, BOLA/IDOR configurável e mass assignment, com mutações bloqueadas por padrão.
- [x] **8 — RBAC Scanner:** matriz atores/papéis × ações com teste HTTP direto, detecção de acesso negado aceito e divergência entre política e implementação.
- [x] **9 — Multitenant Scanner:** pares A→B/B→A, substituição de `tenantId`/`resourceId`, isolamento read/create/update/delete e findings críticos para qualquer acesso cross-tenant bem-sucedido.
- [x] **10 — Admin / Superadmin:** fronteira de privilégio, ações exclusivas, execução de auditoria configurada e evidência de trilha administrativa.
- [x] **11 — Desktop / Electron:** análise estática de `contextIsolation`, `nodeIntegration`, sandbox, webview, preload, IPC, navegação remota, `shell.openExternal`, persistência de tokens/logs e artefatos SQLite.
- [x] **12 — Installer Scanner:** workflow declarativo e sem shell na ordem build → instalador → instalação → execução → QA → security; o instalador é produzido antes do QA e permanece como evidência mesmo se uma etapa posterior falhar.
- [x] **13 — Update Scanner:** validação de `latest.yml`, `version`, `path`, `sha512`, instalador e blockmap; cenário adaptável de atualização, restart, persistência de dados e rollback.
- [x] **14 — Reporter:** resumo no terminal e bundle com HTML, JSON, SARIF 2.1, JUnit, evidências e cópia preservada do SBOM CycloneDX.
- [x] **15 — GitHub Actions:** `scan-quick` hospedado para PR/manual e workflows full/manual como fallback; nenhum workflow publica release automaticamente.
- [x] **16 — Release Gate:** PASS/WARN/BLOCK com política padrão e override configurável.
- [x] **17 — Fleet Scanner:** múltiplos produtos, concorrência limitada, falha isolada e decisão agregada.
- [x] **18 — Dashboard:** HTML/JSON estático com visão central PASS/WARN/BLOCK e findings por produto.
- [ ] **19 — Woodpecker:** workflows `quick`, `full`, `fleet` e `release-windows` estão no repositório; falta confirmar uma execução real após habilitação do projeto no servidor.
- [ ] **20 — Migração operacional:** eventos já migrados no Git (`push` → Woodpecker; PR/manual → Actions); falta confirmar o primeiro `quick` real no Woodpecker.

## Regra de segurança do discovery

O discovery pode inferir tecnologias objetivamente observáveis, mas **não deve assumir** autenticação, RBAC, multitenancy ou superadmin. Essas capacidades são marcadas como `review` até declaração explícita no manifesto. Isso evita que um scan crítico seja pulado silenciosamente.

## Regras de execução segura

- Scans estáticos não executam código do sistema analisado.
- QA E2E exige `--allow-project-exec` porque Playwright/scripts QA executam o projeto-alvo.
- Web Scanner executa baseline e probe CORS por `GET`; a reflexão ativa só roda com `--allow-active`.
- O perfil `web --dast` executa ZAP Baseline em Docker; Nuclei só é incluído quando `--allow-active` também é fornecido.
- API, RBAC, Multitenant e Admin/Superadmin não executam `POST`, `PUT`, `PATCH` ou `DELETE` sem `--allow-state-change`.
- Desktop/Electron é análise estática do projeto e não inicializa o aplicativo alvo.
- O Installer Scanner só executa comandos declarados pelo produto quando `--allow-project-exec` é fornecido; os processos usam `shell: false`.
- A inspeção de artefatos de update é estática. O cenário de update/restart/rollback usa um adapter explícito do ambiente de teste.
- Tokens e credenciais não ficam no YAML. O contrato guarda somente nomes `tokenEnv`; os valores vêm de secrets do CI ou variáveis de ambiente locais.
- Se uma etapa necessária é pulada ou uma credencial/ferramenta está ausente, o relatório fica `complete: false` em vez de declarar sucesso silenciosamente.
- O backend Woodpecker `local` não recebe eventos de `pull_request` neste repositório público; PRs usam runner hospedado do GitHub Actions.
