# ArtiSys Scan

Orquestrador open source e self-hosted para QA, segurança, descoberta de stack e futuros release gates dos sistemas ArtiSys.

## Estado atual

As Fases 0–5 estão implementadas:

- fundação do monorepo e CLI;
- contrato universal `.artisys/scan.yml`;
- discovery automático de stack e capacidades técnicas;
- Source Security com Semgrep CE, Trivy, Gitleaks e OSV-Scanner;
- SBOM CycloneDX, vulnerabilidades e licenças;
- QA Engine para Playwright e scripts QA existentes, com screenshots, vídeos, traces e relatórios JSON/HTML;
- CI de desenvolvimento no GitHub Actions, sem release automático;
- Woodpecker previsto para a fase operacional final, ainda sem ativação automática.

## Princípios

- núcleo R$ 0, open source e self-hosted;
- CI independente do provedor: a lógica vive no CLI, não no YAML do CI;
- nenhum scanner crítico é silenciosamente pulado;
- capacidades de negócio que não podem ser inferidas estaticamente ficam como `review`;
- scanners estáticos usam subprocessos sem shell;
- valores brutos de segredos encontrados não entram no relatório normalizado;
- QA não instala dependências do sistema-alvo e só executa código após autorização explícita;
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
```

### Ferramentas da Fase 3

Para um scan completo de Source Security, o ambiente deve ter no `PATH`:

- Semgrep Community Edition;
- Trivy;
- Gitleaks;
- OSV-Scanner.

Todas são ferramentas open source executadas localmente. Se alguma estiver ausente, o relatório recebe `complete: false` em vez de declarar sucesso silenciosamente.

### Fase 4 — Supply Chain

O comando `supply-chain` gera/preserva:

- `sbom.cdx.json` — SBOM CycloneDX;
- `trivy-supply-chain.json` — vulnerabilidades e licenças;
- `osv-supply-chain.json` — segunda fonte para vulnerabilidades de dependências.

Trivy e OSV-Scanner devem estar instalados localmente.

### Fase 5 — QA

O QA Engine procura primeiro a instalação/configuração Playwright já existente no projeto. Também reconhece scripts como `artisys:qa`, `qa:full`, `qa`, `test:e2e` e `e2e`.

Quando Playwright existe, o ArtiSys Scan cria um overlay temporário em `.artisys/qa/` que preserva a configuração do projeto e força evidências de falha:

- screenshot `only-on-failure`;
- vídeo `retain-on-failure`;
- trace `retain-on-failure`;
- JSON report;
- HTML report;
- console e network preservados no trace.

O comando exige `--allow-project-exec` porque testes E2E executam código do sistema analisado. O ArtiSys Scan não baixa Playwright nem instala dependências do projeto automaticamente.

Veja `ROADMAP.md` para o plano completo.
