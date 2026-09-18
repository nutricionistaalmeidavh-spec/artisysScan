# Roadmap — ArtiSys Scan

## Estratégia de CI

- **Desenvolvimento:** GitHub Actions em repositório público, sem release automático.
- **Operação final:** Woodpecker self-hosted + agents Linux/Windows.
- **Regra:** a lógica do scan pertence ao CLI; CI apenas orquestra comandos.
- **Fallback:** GitHub Actions permanece disponível manualmente após a migração, sem ser dependência operacional.

## Fases

- [ ] **0 — Fundação:** monorepo Node 22/TypeScript, CLI, packages, documentação e CI de desenvolvimento.
- [ ] **1 — Contrato universal:** `.artisys/scan.yml`, JSON Schema, tipos e validação.
- [ ] **2 — Discovery automático:** detectar stack, runtime, banco, QA, installer e produzir manifesto sugerido seguro.
- [ ] **3 — Source Security:** Semgrep CE, Trivy, Gitleaks e OSV-Scanner.
- [ ] **4 — SBOM / Supply Chain:** CycloneDX, dependências, licenças e vulnerabilidades.
- [ ] **5 — QA Engine:** integração com Playwright/artisys-qa, screenshots, vídeos, traces, console e network.
- [ ] **6 — Web Scanner:** headers, CSP, CORS, cookies, HTTPS, sessão, CSRF, XSS, uploads, debug e leakage.
- [ ] **7 — API Scanner:** autenticação, IDOR/BOLA, mass assignment, tenant/company IDs, rate limit e entrada.
- [ ] **8 — RBAC Scanner:** matriz de papéis × ações com teste direto de API.
- [ ] **9 — Multitenant Scanner:** isolamento read/create/update/delete e manipulação de tenant/company IDs.
- [ ] **10 — Admin / Superadmin:** escalada, endpoints privilegiados, licença, impersonation e auditoria.
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
