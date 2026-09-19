# ArtiSys Scan

Orquestrador open source e self-hosted para QA, segurança, descoberta de stack, autorização, desktop, supply chain e validação de releases dos sistemas ArtiSys.

## Estado atual

As Fases **0–20 estão concluídas**. O core foi validado em Linux e Windows, e o `quick` também concluiu com sucesso no Woodpecker Windows local.

O ArtiSys Scan inclui:

- contrato universal `.artisys/scan.yml` e discovery automático;
- Source Security: Semgrep CE, Trivy, Gitleaks e OSV-Scanner;
- SBOM CycloneDX, vulnerabilidades e licenças;
- QA Engine com Playwright, screenshots, vídeos, traces e relatórios;
- Web/DAST com engine ArtiSys, OWASP ZAP Baseline e Nuclei opt-in;
- API, RBAC, Multitenant e Admin/Superadmin scanners;
- Desktop/Electron, Installer e Update scanners;
- Reporter HTML/JSON/SARIF/JUnit/evidências/SBOM;
- Release Gate determinístico `PASS/WARN/BLOCK`;
- Fleet Scanner para múltiplos produtos;
- Dashboard estático do Fleet;
- workflows Woodpecker `quick`, `full`, `fleet` e `release-windows`;
- GitHub Actions como isolamento de PR e fallback manual.

## Princípios

- núcleo R$ 0, open source e self-hosted;
- lógica de scan no CLI, não presa ao provedor de CI;
- ausência de ferramenta/evidência produz `complete: false`, nunca falso PASS;
- segredos encontrados não são copiados em bruto para relatórios normalizados;
- credenciais de teste entram por env/secrets e não pelo Git;
- operações mutáveis/ativas exigem autorização explícita;
- nenhuma automação publica release automaticamente.

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
npm run scan -- web https://app.exemplo.com [/pasta/de/relatorios] [--dast] [--allow-active]
npm run scan -- api /caminho/access.yml [--allow-state-change]
npm run scan -- rbac /caminho/access.yml [--allow-state-change]
npm run scan -- tenant /caminho/access.yml [--allow-state-change]
npm run scan -- admin /caminho/access.yml [--allow-state-change]
npm run scan -- desktop /caminho/do/projeto
npm run scan -- installer /caminho/installer-workflow.json --allow-project-exec
npm run scan -- update-artifacts /caminho/latest.yml [/pasta/dos/artefatos]
npm run scan -- report /caminho/report-input.json [/pasta/de/saida]
npm run scan -- gate /caminho/report-input.json [/caminho/gate-policy.json]
npm run scan -- fleet /caminho/fleet.yml [/caminho/fleet-report.json] [--concurrency=3]
npm run scan -- dashboard /caminho/fleet-report.json [/pasta/dashboard]
```

## Release Gate — Fase 16

`gate` recebe o relatório normalizado e devolve:

- `PASS`: completo, checks válidos e sem findings que exijam bloqueio/revisão;
- `WARN`: findings configurados como revisão;
- `BLOCK`: evidência incompleta, check obrigatório falho/incompleto ou severidade bloqueante.

Por padrão, `critical` e `high` bloqueiam; `medium`, `low` e `unknown` geram revisão. A política pode ser sobrescrita por JSON sem alterar o engine.

## Fleet Scanner — Fase 17

Use `examples/fleet.yml`. Cada produto declara `id`, `root` e perfil `quick|full|release`.

- `quick`: discovery + Desktop/Electron quando aplicável;
- `full`/`release`: acrescentam Source Security + Supply Chain;
- falha de um produto é isolada e vira `BLOCK`, sem cancelar os demais;
- concorrência é limitada por `--concurrency=N`.

Roots relativos são resolvidos em relação ao arquivo `fleet.yml`.

## Dashboard — Fase 18

`dashboard` gera uma saída estática, sem servidor obrigatório:

- `index.html`;
- `dashboard.json`.

A visão mostra decisão global, PASS/WARN/BLOCK por produto e contagens das principais severidades.

## Woodpecker + Actions — Fases 19–20

O modelo de CI do repositório é:

```text
trusted push ──────> Woodpecker Windows local
manual heavy ─────> Woodpecker Windows local
release manual ───> Woodpecker Windows local
pull request ─────> GitHub Actions hosted runner
manual fallback ──> GitHub Actions
```

O agent Windows homologado é selecionado por:

```text
platform=windows/amd64
backend=local
pilot=pdv-artisys
```

Workflows Woodpecker:

- `.woodpecker/quick.yml` — `push` confiável;
- `.woodpecker/full.yml` — manual;
- `.woodpecker/fleet.yml` — manual Fleet + Dashboard;
- `.woodpecker/release-windows.yml` — manual no mesmo agent Windows homologado.

O backend Woodpecker `local` executa comandos diretamente no host. Como este repositório é público, **nenhum workflow Woodpecker aceita `pull_request`**. PRs permanecem no GitHub Actions hospedado e isolado.

A migração foi validada operacionalmente: o contexto `ci/woodpecker/push/quick` concluiu `success` no Woodpecker, e o mesmo HEAD passou no GitHub Actions em `ubuntu-latest` e `windows-latest`. Durante essa homologação foram corrigidas diferenças de paths Windows e a detecção do entrypoint ESM do CLI.

## Segurança de execução

- `web --dast` usa ZAP Baseline; Nuclei exige `--allow-active`;
- `api`, `rbac`, `tenant` e `admin` não executam mutações sem `--allow-state-change`;
- `qa` e `installer` exigem `--allow-project-exec`;
- `desktop` e `update-artifacts` são estáticos;
- comandos do Installer usam `shell: false`;
- execute testes ativos/mutáveis somente em ambientes autorizados e preparados.

## Ferramentas externas

Para Source Security/Supply Chain completos, disponibilize no `PATH`:

- Semgrep Community Edition;
- Trivy;
- Gitleaks;
- OSV-Scanner.

Para Web DAST:

- Docker para OWASP ZAP Baseline;
- Nuclei para o perfil ativo opcional.

Veja `ROADMAP.md` e `docs/WOODPECKER_ACTIVATION.md`.
