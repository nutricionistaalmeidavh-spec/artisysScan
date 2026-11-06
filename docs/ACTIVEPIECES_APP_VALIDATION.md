# ArtiSys — Validacao de Apps

Orquestracao: Activepieces (rascunho); processamento: GitHub Actions no repositorio artisysScan.

## Pipeline
- Impeccable: detector estatico via npx impeccable detect --json.
- Hallmark: sloplint.mjs --scope app --json, sem Together AI.
- Security: artisysScan security e supply-chain em modo --safe.
- Cloudflare security-audit-skill: NOT_RUN, pois a auditoria completa requer multiplos agentes independentes e isolamento. Nao confundir com as varreduras estaticas.

Alvos atuais: PDV-ARTISYS, PDV-ARTISYS-TOTAL, ARTISYS_ERP e moneyPrintTest.
Execucao: workflow_dispatch, pull_request deste workflow e agendamento de segunda a sexta (12:30 UTC).
Somente leitura do codigo dos alvos. Nenhum script do app alvo e executado, nenhum deploy, release ou contato com cliente.

## Activepieces
Pasta: ArtiSys — Validação de Apps.
Fluxo: ArtiSys | Validação de Apps — Impeccable + Hallmark + Segurança (CI, NÃO PUBLICAR).
Consulta a API publica do GitHub e registra resultados na tabela ArtiSys — Auditorias CI de Apps.
O fluxo permanece em rascunho ate autorizacao explicita.

## Leads + Scrapling
O fluxo de captacao de clientes da ArtiSys agora enfileira dominios comerciais publicos na tabela ArtiSys — Fila Scrapling (sites comerciais), apos cadastrar o lead. Sites nao sao raspados nesta etapa: o worker Python com Scrapling ainda nao esta conectado. Nao existe disparo automatico de WhatsApp.

## Validacao e custos
Nucleo open source, sem APIs pagas. GitHub Actions gratuito em repos publicos com runners padrao. Ferramentas ausentes produzem INCOMPLETE, nao falso PASS. PASS considera apenas verificacoes estaticas de fato executadas.
