# ArtiSys Scan

Orquestrador open source e self-hosted para QA, segurança, descoberta de stack, autorização, desktop e validação de releases dos sistemas ArtiSys.

## Estado atual

As Fases 0–15 estão implementadas:

- fundação do monorepo e CLI;
- contrato universal `.artisys/scan.yml` e discovery automático;
- Source Security com Semgrep CE, Trivy, Gitleaks e OSV-Scanner;
- SBOM CycloneDX, vulnerabilidades e licenças;
- QA Engine para Playwright/scripts QA existentes, com screenshots, vídeos, traces e relatórios;
- Web Scanner para HTTPS/headers/CSP/cookies/CORS/leakage, superfícies de CSRF/upload e reflexão opt-in;
- perfil Web DAST opt-in com OWASP ZAP Baseline e Nuclei;
- API Scanner para autenticação, entrada inválida, rate limit, BOLA/IDOR e mass assignment;
- RBAC Scanner por matriz de atores/papéis × ações;
- Multitenant Scanner para isolamento entre tenants A/B;
- Admin/Superadmin Scanner para fronteiras privilegiadas e auditoria;
- Desktop/Electron Scanner para hardening, preload/IPC, navegação, tokens/logs e SQLite;
- Installer Scanner com geração do instalador antes de instalação, execução, QA e security;
- Update Scanner para `latest.yml`, integridade, blockmap, restart, persistência e rollback;
- Reporter com terminal, HTML, JSON, SARIF, JUnit, evidências e SBOM;
- GitHub Actions nos perfis quick/full/manual, sem publicação automática de release;
- Woodpecker reservado para a fase operacional final, ainda sem ativação automática.

## Princípios

- núcleo R$ 0, open source e self-hosted;
- CI independente do provedor: a lógica vive no CLI, não no YAML do CI;
- nenhum scanner crítico é silenciosamente pulado;
- capacidades de negócio não inferíveis estaticamente permanecem `review` até declaração explícita;
- valores brutos de segredos encontrados não entram no relatório normalizado;
- credenciais de teste não ficam no Git: arquivos de acesso usam apenas nomes `tokenEnv`;
- operações que alteram estado são bloqueadas por padrão;
- workflows que executam código do produto exigem autorização explícita;
- GitHub Actions é CI de desenvolvimento; Woodpecker será o CI operacional definitivo.

## Desenvolvimento

Requer Node.js 22+.

```bash
npm install
npm run ci
```

## CLI

```bash
npm run scan -- validate .artisys/scan.yml
npm run scan -- discover /caminho/do/projeto
npm run scan -- security /caminho/do/projeto
npm run scan -- supply-chain /caminho/do/projeto [/pasta/de/relatorios]
npm run scan -- qa /caminho/do/projeto [/pasta/de/relatorios] --allow-project-exec
npm run scan -- web https://app.exemplo.com
npm run scan -- web https://app.exemplo.com [/pasta/de/relatorios] --dast
npm run scan -- web https://app.exemplo.com [/pasta/de/relatorios] --dast --allow-active
npm run scan -- api /caminho/access.yml [--allow-state-change]
npm run scan -- rbac /caminho/access.yml [--allow-state-change]
npm run scan -- tenant /caminho/access.yml [--allow-state-change]
npm run scan -- admin /caminho/access.yml [--allow-state-change]
npm run scan -- desktop /caminho/do/projeto
npm run scan -- installer /caminho/installer-workflow.json --allow-project-exec
npm run scan -- update-artifacts /caminho/latest.yml [/pasta/dos/artefatos]
npm run scan -- report /caminho/report-input.json [/pasta/de/saida]
```

## Web / DAST

Sem `--dast`, o scanner web usa o engine ArtiSys para baseline HTTP, headers/cookies, CORS, leakage e superfícies de revisão. Com `--dast`:

- OWASP ZAP Baseline roda em `ghcr.io/zaproxy/zaproxy:stable` via Docker e gera `zap.json` + `zap.html`;
- Nuclei só entra quando `--allow-active` também é fornecido e gera `nuclei.jsonl`;
- ambos são executados sem shell e os findings são normalizados sem copiar corpos de resposta para o resumo.

O perfil DAST exige Docker disponível no `PATH`; o perfil ativo também exige o binário `nuclei` no `PATH`. Se uma ferramenta solicitada estiver ausente, o relatório fica incompleto em vez de receber falso PASS.

## Contrato de acesso — Fases 7–10

Use `examples/access.yml` como referência. O arquivo descreve:

- `baseUrl` do ambiente autorizado de teste;
- atores e papéis;
- `tokenEnv` em vez do token real;
- ações e `allowRoles` para RBAC;
- endpoints de API e probes opcionais de BOLA/mass assignment;
- recursos de tenants usados para cruzar A→B e B→A;
- ações `privileged` e endpoint de auditoria para superadmin.

Antes de executar scanners autenticados, defina os tokens no ambiente/CI, por exemplo:

```powershell
$env:ARTISYS_TOKEN_USER_A="..."
$env:ARTISYS_TOKEN_ADMIN="..."
$env:ARTISYS_TOKEN_SUPERADMIN="..."
```

Nunca coloque esses valores no `access.yml`.

## Desktop / Electron

`desktop` é estático: ele percorre arquivos do projeto sem iniciar o aplicativo. Entre as verificações atuais:

- `nodeIntegration`, `contextIsolation`, sandbox e `webviewTag`;
- preload expondo `ipcRenderer` diretamente;
- handlers IPC sem validação observável do sender;
- `shell.openExternal` para revisão de allowlist;
- navegação remota por HTTP;
- persistência aparente de tokens em localStorage/logs;
- bancos SQLite/DB rastreados no projeto que podem conter dados reais.

## Installer Scanner

O fluxo é declarativo. Use `examples/installer-workflow.json` como base. A ordem é fixa:

```text
build → installer → install → launch → QA → security
```

O instalador é produzido antes do QA. Assim, uma falha posterior de QA/security não apaga a evidência de que o `.exe`/instalador foi gerado. Falhas em build/installer/install/launch bloqueiam etapas dependentes. Os comandos são executados com `shell: false` e somente após `--allow-project-exec`.

## Update Scanner

`update-artifacts` verifica os artefatos de release sem executar o produto:

- versão e path do `latest.yml`;
- `sha512`;
- instalador referenciado;
- `<installer>.blockmap`.

O package de updater também expõe um cenário adaptável para ambientes de teste que verifica versão anterior → nova versão, restart, preservação de um sentinel de dados e rollback. Esse cenário não é disparado automaticamente contra produção.

## Reporter

`report` recebe um JSON normalizado e cria:

- `summary.json`;
- `report.html`;
- `findings.sarif`;
- `junit.xml`;
- `evidence.json`;
- `sbom.cdx.json`, quando um SBOM é informado.

O terminal também exibe status geral, contagem por severidade e findings principais.

## GitHub Actions

Durante o desenvolvimento:

- `scan-quick.yml`: automático em push/PR e executa typecheck + testes + build;
- `scan-full.yml`: manual/reutilizável para core + Source Security + Supply Chain;
- `scan-manual.yml`: permite escolher `quick`, `full` ou `release`;
- `ci.yml`: mantido apenas como fallback manual legado.

O perfil `release` atual é somente de verificação. **Nenhum workflow publica release automaticamente.** O gate PASS/WARN/BLOCK entra na Fase 16; Woodpecker continua preparado para a fase operacional final.

### Segurança de execução

- `web` faz baseline e CORS com `GET` por padrão; a probe de reflexão só entra com `--allow-active`.
- `web --dast` usa ZAP Baseline; Nuclei só roda com `--allow-active`.
- `api`, `rbac`, `tenant` e `admin` pulam `POST`, `PUT`, `PATCH` e `DELETE` sem `--allow-state-change` e devolvem `complete: false`.
- `qa` exige `--allow-project-exec` porque testes E2E executam código do alvo.
- `desktop` é estático e não inicia o alvo.
- `installer` exige `--allow-project-exec`; não executa comandos via shell.
- `update-artifacts` é estático; update/restart/rollback real depende de adapter explícito de ambiente de teste.
- Execute testes ativos e mutações somente em sistemas/ambientes que você controla e preparou para teste.

## Ferramentas externas do core

Para Source Security/Supply Chain completos, o ambiente deve ter no `PATH`:

- Semgrep Community Edition;
- Trivy;
- Gitleaks;
- OSV-Scanner.

Para Web DAST:

- Docker para OWASP ZAP Baseline;
- Nuclei para o perfil ativo opcional.

Todas são executadas localmente/self-hosted. Se uma ferramenta obrigatória do perfil solicitado estiver ausente, o relatório fica incompleto em vez de receber um falso PASS.

Veja `ROADMAP.md` para as próximas fases.
