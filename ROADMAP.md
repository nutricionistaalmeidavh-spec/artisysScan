# Roadmap — ArtiSys Scan

## Estratégia de CI

- **Desenvolvimento:** GitHub Actions em repositório público, sem release automático.
- **Operação final:** Woodpecker self-hosted + agents Linux/Windows.
- **Regra:** a lógica do scan pertence ao CLI; CI apenas orquestra comandos.
- **Fallback:** GitHub Actions permanece disponível manualmente após a migração, sem ser dependência operacional.

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
- [ ] **11 — Desktop / Electron:** contextIsolation, sandbox, IPC, preload, navegação, filesystem, tokens e SQLite.
- [ ] **12 — Installer Scanner:** build → instalador → instalação → execução → QA → security.
- [ ] **13 — Update Scanner:** atualização, hash, restart, persistência, rollback, latest.yml e blockmap.
- [ ] **14 — Reporter:** terminal, HTML, JSON, SARIF, JUnit, SBOM e evidências.
- [ ] **15 — GitHub Actions:** quick/full/manual durante desenvolvimento, sem release automático.
- [ ] **16 — Release Gate:** PASS/WARN/BLOCK com políticas críticas.
- [ ] **17 — Fleet Scanner:** scan de múltiplos produtos em uma execução.
- [ ] **18 — Dashboard:** visão central dos produtos e findings.
- [ ] **19 — Woodpecker:** ativar pipelines e agents self-hosted somente quando o produto estiver estável.
- [ ] **20 — Migração operacional:** Woodpecker como CI principal; Actions como fallback/manual.

## Regra de segurança do discovery

O discovery pode inferir tecnologias objetivamente observáveis, mas **não deve assumir** autenticação, RBAC, multitenancy ou superadmin. Essas capacidades são marcadas como `review` até declaração explícita no manifesto. Isso evita que um scan crítico seja pulado silenciosamente.

## Regras de execução segura

- Scans estáticos não executam código do sistema analisado.
- QA E2E exige `--allow-project-exec` porque Playwright/scripts QA executam o projeto-alvo.
- Web Scanner executa baseline e probe CORS por `GET`; a reflexão ativa só roda com `--allow-active`.
- O perfil `web --dast` executa ZAP Baseline em Docker; Nuclei só é incluído quando `--allow-active` também é fornecido.
- API, RBAC, Multitenant e Admin/Superadmin não executam `POST`, `PUT`, `PATCH` ou `DELETE` sem `--allow-state-change`.
- Tokens e credenciais não ficam no YAML. O contrato guarda somente nomes `tokenEnv`; os valores vêm de secrets do CI ou variáveis de ambiente locais.
- Se uma etapa necessária é pulada ou uma credencial/ferramenta está ausente, o relatório fica `complete: false` em vez de declarar sucesso silenciosamente.
