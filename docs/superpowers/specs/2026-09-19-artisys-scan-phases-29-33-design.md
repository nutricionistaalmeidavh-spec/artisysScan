# ArtiSys Scan Fases 29–33 — Design

## Objetivo

Homologar o ArtiSys Scan além dos checks estáticos/read-only já aprovados, usando a Loja Online apenas como alvo descartável, até existir um fluxo único capaz de provar isolamento multitenant, fronteiras Admin/Superadmin, QA funcional, mutações controladas e resultado agregado.

## Restrições de segurança

- Nunca usar URL, banco, usuário ou credencial de produção.
- O alvo dinâmico deve ser `127.0.0.1`/`localhost`, porta aleatória e diretório de dados temporário.
- Todo estado criado para o scan deve ser removido mesmo quando uma etapa falha.
- Tokens ficam apenas em variáveis de ambiente/processo; o YAML contém somente nomes `tokenEnv`.
- Testes mutáveis só podem rodar em `environment=staging` com autorização explícita `--allow-state-change` e `--allow-project-exec` quando aplicável.
- O scanner não deve enfraquecer regras de produção para fabricar um Superadmin de teste.

## Fase 29 — Multitenancy

O runtime descartável cria duas empresas independentes, A e B, com usuários que pertencem somente ao seu tenant. Cada empresa recebe ao menos um recurso real (contato). A política dinâmica informa `tenant`, IDs reais dos recursos e uma rota parametrizada `/api/v1/contacts/{resourceId}`. O `tenant` scanner executa A→B e B→A; qualquer resposta 2xx/3xx é `critical`.

A prova é bidirecional e baseada em recursos reais. Um único usuário membro das duas empresas não serve como evidência de isolamento.

## Fase 30 — Admin / Superadmin

A política marca como `privileged`:

1. rotas administrativas da empresa, como `/api/v1/users`, permitidas somente a OWNER/ADMIN;
2. rota `/api/v1/superadmin/overview`, sem ator normal autorizado.

OWNER/ADMIN/MANAGER/SALES/READONLY são usados para provar que papéis inferiores não atravessam a fronteira. Não será criada uma conta Superadmin falsa, nem alterada a lista/critério de Superadmin do produto. O objetivo nesta fase é provar a fronteira negativa com usuários descartáveis reais.

## Fase 31 — QA funcional

O scanner executa a suíte QA já existente do produto somente dentro do workspace descartável. A execução deve ser explícita e separada do scan de produção: `--allow-project-exec --environment=staging`.

O resultado deve registrar exit code, contagem de testes quando disponível, screenshots/vídeos/traces/JSON/HTML existentes e diagnostics. Falha de QA bloqueia o resultado agregado.

## Fase 32 — Testes mutáveis

Depois que o runtime descartável estiver validado, API/RBAC/Tenant/Admin podem executar ações `POST/PUT/PATCH/DELETE` com `--allow-state-change`. A política usa dados com prefixo `ARTISYS_SCAN_` e recursos temporários.

A prova mínima inclui:

- criação de recurso permitida para papel autorizado;
- mutação negada para papel sem permissão;
- tentativa cross-tenant de update/delete negada;
- ação administrativa mutável negada a papel inferior.

O teardown do runtime continua obrigatório, portanto nenhuma mutação sobrevive ao run.

## Fase 33 — Orquestrador único

Adicionar um comando de CLI `homologate <config.json>` que execute, em ordem determinística, os scanners configurados e produza um único JSON:

1. web;
2. api;
3. rbac;
4. tenant;
5. admin;
6. qa, quando `projectRoot` estiver configurado.

O config contém `baseUrl`, `accessPolicy`, `projectRoot`, `outputDir` e flags `allowActive`, `allowStateChange`, `allowProjectExecution`. O orquestrador não cria ambiente nem credenciais; isso continua responsabilidade do adapter do produto. Ele apenas coordena capacidades do scanner.

O resultado agregado contém `complete`, `passed`, resultados por etapa e lista de etapas executadas. Qualquer etapa incompleta torna `complete=false`; qualquer etapa não aprovada torna `passed=false`.

## Integração Loja Online

O adapter `scripts/artisys-dynamic-pilot.mjs` continua sendo o boundary de segurança do produto. Ele cria as empresas/usuários/recursos, escreve a política e config temporários, injeta tokens no processo, chama `artisys-scan homologate`, persiste somente relatórios sem segredos e destrói o runtime no `finally`.

## Critério de homologação

A entrega 29–33 só é considerada homologada quando um run real do Woodpecker Windows comprovar:

- static/release gate anterior ainda verde;
- tenant PASS com A→B e B→A executados;
- admin PASS;
- QA funcional PASS;
- mutações autorizadas no ambiente descartável PASS;
- orquestrador PASS;
- cleanup descartável comprovado;
- nenhum critical/high inesperado e nenhum check necessário `incomplete`.
