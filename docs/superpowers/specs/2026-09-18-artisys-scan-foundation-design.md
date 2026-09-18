# ArtiSys Scan — Foundation Design

## Objetivo

Criar um orquestrador central, open source e self-hosted para analisar sistemas web, desktop e híbridos da ArtiSys, evoluindo posteriormente para QA, segurança, RBAC, multitenancy, superadmin, installer, updater e release gates.

## Arquitetura

O núcleo é um CLI independente de CI. GitHub Actions e Woodpecker não contêm lógica de produto: ambos apenas executam comandos do ArtiSys Scan. Durante o desenvolvimento, GitHub Actions valida cada mudança; Woodpecker permanece inativo até a fase final.

A estrutura inicial é dividida em `apps/cli` e packages focados: `contracts`, `core`, `reporter` e `rules`. Scanners e adapters adicionais entram nas fases posteriores sem transformar o projeto em um arquivo monolítico.

## Contrato universal

Cada produto poderá declarar `.artisys/scan.yml`. O schema v1 descreve produto, runtime, capacidades de segurança, QA e release.

Capacidades de negócio que análise estática não consegue comprovar usam o estado `review`. Um manifesto descoberto automaticamente nunca deve transformar ausência de evidência em `false` para autenticação, RBAC, multitenancy ou superadmin.

## Discovery

O discovery inspeciona arquivos e metadados locais. Na Fase 2 ele detecta ecossistemas, runtimes, ferramentas, bancos, QA, updater e installer. O resultado inclui evidências e um manifesto sugerido.

Não são realizadas requisições externas, execução de código do projeto alvo ou tentativa de autenticação nessa fase.

## CI

GitHub Actions executa typecheck, testes e build no Node 22. Não cria release. Woodpecker só será habilitado no fim do roadmap, reutilizando os mesmos comandos do CLI.

## Restrições

- core R$ 0;
- dependências open source;
- nenhum SaaS pago obrigatório;
- Node.js 22+;
- TypeScript estrito;
- scanners críticos não podem ser silenciosamente desativados por inferência.
