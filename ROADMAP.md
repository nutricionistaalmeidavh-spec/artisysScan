# Roadmap — ArtiSys Scan

## Estratégia de CI

- **Push confiável:** Woodpecker self-hosted no agent Windows local.
- **Pull request:** GitHub Actions hospedado para isolamento de código de PR.
- **Operação pesada/release:** Woodpecker manual no mesmo agent Windows homologado.
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
- [x] **19 — Woodpecker:** repo habilitado, webhook/status confirmado e `quick` concluído com sucesso no agent Windows homologado.
- [x] **20 — Migração operacional:** `push` confiável usa Woodpecker; PR/manual permanecem no GitHub Actions; fallback hospedado validado em Ubuntu e Windows.
- [x] **21 — Piloto seguro:** Loja Online adotada como alvo sem clientes; manifesto e fleet dedicados; produção e Obra na Mão excluídos da homologação.
- [x] **22 — Safe Mode:** `--safe` e `--environment` bloqueiam execução do projeto, mutações, DAST e flags perigosas em ambientes incompatíveis.
- [x] **23 — Scan estático real:** Discovery + Desktop + Semgrep + Trivy + Gitleaks + OSV + SBOM executados no Windows/Woodpecker com toolchain isolada fora do alvo.
- [x] **24 — Calibração:** falsos positivos da toolchain removidos, OSV v2 compatibilizado e `shell.openExternal` homologado somente com URL parseada, HTTPS, hostname exato, pathname validado e default deny. Loja Online fechou com 0 critical/high/medium.
- [x] **25 — Ambiente descartável:** runtime da Loja Online sobe em `127.0.0.1` com porta aleatória, diretório/banco temporário, licença e usuários fictícios; servidor e estado são destruídos em `finally`, inclusive em falha.
- [x] **26 — Web dinâmico:** baseline, headers/CSP/cookies/CORS e reflexão ativa GET-only homologados contra o runtime descartável. HTTP é aceito somente para loopback; HTTP remoto continua finding HIGH.
- [x] **27 — API dinâmica:** autenticação anônima e token inválido homologados contra endpoints reais do ambiente descartável, com tokens apenas em variáveis de ambiente. Casos mutáveis de invalid input/mass-assignment permanecem bloqueados até a fase específica de testes mutáveis.
- [x] **28 — RBAC dinâmico:** matriz OWNER/ADMIN/MANAGER/SALES/READONLY homologada em rotas reais GET, cobrindo acessos permitidos e negados sem alteração de estado.

## Homologação Loja Online — 2026-09-19

Pipeline Woodpecker homologado: `repos/17/pipeline/63`.

Resultado final:

```text
manifest: pass
static-scan: pass
release-gate: pass
critical: 0
high: 0
medium: 0
low: 0
info: 0
desktop-calibration: pass
dynamic-runtime: pass
web-dynamic: pass
api-dynamic: pass
rbac-dynamic: pass
```

O ambiente dinâmico usa exclusivamente loopback e dados fictícios. Nenhum sistema com clientes, URL de produção ou banco de produção participou da homologação.

## Estado operacional Woodpecker — 2026-09-19

Labels do agent homologado:

```text
platform=windows/amd64
backend=local
pilot=pdv-artisys
```

O status GitHub `ci/woodpecker/push/quick` confirma habilitação do repositório, webhook e execução real. As correções de calibração também passaram no scanner principal no agent Windows.

O launcher atual usa `WOODPECKER_MAX_WORKFLOWS=1`, portanto o agent Windows processa um workflow por vez. Pushes mais novos podem cancelar pipelines de homologação anteriores; somente o HEAD final deve ser usado como evidência de conclusão.

## Regra de segurança do discovery

O discovery pode inferir tecnologias objetivamente observáveis, mas **não deve assumir** autenticação, RBAC, multitenancy ou superadmin. Essas capacidades são marcadas como `review` até declaração explícita no manifesto. Isso evita que um scan crítico seja pulado silenciosamente.

## Regras de execução segura

- Scans estáticos não executam código do sistema analisado.
- QA E2E exige `--allow-project-exec` porque Playwright/scripts QA executam o projeto-alvo.
- Web Scanner executa baseline e probe CORS por `GET`; a reflexão ativa só roda com `--allow-active`.
- HTTP sem TLS só pode ser tratado como aceitável pelo Web Scanner quando o hostname é loopback (`127.0.0.1`, `localhost` ou equivalente IPv6); alvos HTTP remotos continuam HIGH.
- O perfil `web --dast` executa ZAP Baseline em Docker; Nuclei só é incluído quando `--allow-active` também é fornecido.
- API, RBAC, Multitenant e Admin/Superadmin não executam `POST`, `PUT`, `PATCH` ou `DELETE` sem `--allow-state-change`.
- A homologação das fases 25–28 mantém API/RBAC em operações GET-only; testes mutáveis serão ativados apenas em ambiente descartável na fase correspondente.
- Desktop/Electron é análise estática do projeto e não inicializa o aplicativo alvo.
- `shell.openExternal` só é considerado endurecido quando há parsing de URL, protocolo HTTPS explícito, hostname exato, validação do pathname e bloqueio default da navegação externa.
- O Installer Scanner só executa comandos declarados pelo produto quando `--allow-project-exec` é fornecido; os processos usam `shell: false`.
- A inspeção de artefatos de update é estática. O cenário de update/restart/rollback usa um adapter explícito do ambiente de teste.
- Tokens e credenciais não ficam no YAML. O contrato guarda somente nomes `tokenEnv`; os valores vêm de secrets do CI ou variáveis de ambiente locais/temporárias.
- Se uma etapa necessária é pulada ou uma credencial/ferramenta está ausente, o relatório fica `complete: false` em vez de declarar sucesso silenciosamente.
- O backend Woodpecker `local` não recebe eventos de `pull_request` neste repositório público; PRs usam runner hospedado do GitHub Actions.
