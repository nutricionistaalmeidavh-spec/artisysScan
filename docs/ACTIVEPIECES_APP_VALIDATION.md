# ArtiSys — validação de aplicativos (open source, R$ 0)

## Visão
Activepieces permanece no controle de resultados; GitHub Actions executa testes de código sem depender do computador do usuário. A PR #8 contém os arquivos do pipeline.

## Workflow estático
Arquivo .github/workflows/app-validation.yml:
- Impeccable detect + Hallmark sloplint: verificações de design sem APIs de IA pagas;
- ArtiSys Scan security e supply-chain: verificações de código e dependências;
- quatro alvos: PDV-ARTISYS, PDV-ARTISYS-TOTAL, ARTISYS_ERP e moneyPrintTest;
- PASS se refere apenas aos verificadores determinísticos efetivamente executados, não à aprovação de toda a aplicação.

## Novo workflow Ollama
Arquivo .github/workflows/agent-ai-audit.yml:
- GitHub Actions baixa release oficial Ollama v0.34.0 com SHA-256 fixado e opera em 127.0.0.1:11434;
- em PR testa no moneyPrintTest com Qwen2.5-Coder 0.5B;
- no acionamento manual permite escolher um dos quatro repositórios e usa Qwen2.5-Coder 1.5B;
- o script scripts/app-validation/ai-audit.mjs analisa até 250 arquivos e duas hipóteses; não executa o código dos apps, nem publica release, nem usa API paga;
- quatro papéis de reconhecimento, pesquisador de risco, dois verificadores com prompts independentes e crítico de cobertura;
- todos usam o MESMO modelo: prompts separados não significam modelos independentes;
- cria JSON e relatório Markdown como artifacts do GitHub Actions;
- somente source-only / PARTIAL_SOURCE_ONLY: hipóteses needs_validation ou rejected; nenhum confirmado sem reprodução confiável em sandbox.

## Limites da Cloudflare Security Audit Skill
Este pipeline se inspira nas seis fases, mas NÃO executa a skill Cloudflare integral. Não há sandbox completo para rodar código alvo, nem validação pelos schemas e validadores canônicos da Cloudflare. Estado INCOMPLETE_SOURCE_ONLY, mesmo se o job de IA terminar com sucesso. Um resultado de IA não equivale a aprovação de segurança.

## Activepieces
Na pasta ArtiSys — Validação de Apps, o fluxo de validação tem consultas GET aos dois workflows GitHub e registra seus últimos estados na tabela ArtiSys — Auditorias CI de Apps. Fluxo ainda em rascunho, não publicado. O Activepieces não tem conexão GitHub autenticada; por isso ainda não consegue disparar workflow_dispatch de forma segura. O GitHub permite acionamento manual após disponibilização do workflow na branch padrão. Não adicionar credenciais silenciosas.

## Scrapling / Leads
A fila Scrapling de sites empresariais está ligada ao rascunho do fluxo de captação. O worker Python real ainda não foi conectado, portanto não há coleta efetiva nem mensagens enviadas.

## Segurança de distribuição
Nenhum merge automático, secret alterado, execução de código dos apps, deploy, release ou publicação a clientes. Relatório PARCIAL exige revisão humana; falha do modelo gera INCOMPLETE/BLOCK. Os testes preexistentes ligados a Woodpecker continuam independentes desta PR.
