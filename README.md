# ArtiSys Scan

Orquestrador open source e self-hosted para QA, segurança, descoberta de stack e futuros release gates dos sistemas ArtiSys.

## Estado atual

Implementação em fases. As Fases 0–2 estabelecem:

- fundação do monorepo;
- contrato universal `.artisys/scan.yml`;
- discovery automático de stack e capacidades técnicas;
- CI de desenvolvimento no GitHub Actions, sem release automático;
- Woodpecker previsto para a fase final, sem ativação durante o desenvolvimento.

## Princípios

- núcleo R$ 0, open source e self-hosted;
- CI independente do provedor: a lógica vive no CLI, não no YAML do CI;
- nenhum scanner crítico é silenciosamente pulado;
- capacidades de negócio que não podem ser inferidas estaticamente ficam como `review`;
- GitHub Actions é CI de desenvolvimento; Woodpecker será o CI operacional definitivo.

## Desenvolvimento

Requer Node.js 22+.

```bash
npm install
npm run ci
```

Após as Fases 0–2, os comandos principais são:

```bash
npm run scan -- validate .artisys/scan.yml
npm run scan -- discover /caminho/do/projeto
```

Veja `ROADMAP.md` para o plano completo.
