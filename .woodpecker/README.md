# Woodpecker CI

A lógica de scan continua no CLI; os workflows apenas orquestram os mesmos comandos usados localmente e no GitHub Actions.

Agent atual homologado:

```text
platform=windows/amd64
backend=local
pilot=pdv-artisys
shell=powershell.exe
```

Arquivos:

- `quick.yml`: verificação automática em `push` confiável no agent Windows local;
- `full.yml`: verificação manual completa do engine;
- `fleet.yml`: execução manual do Fleet Scanner e geração do Dashboard;
- `release-windows.yml`: verificação manual de release no mesmo agent Windows homologado.

Por segurança, nenhum workflow Woodpecker aceita `pull_request`: o backend `local` não oferece isolamento e este repositório é público. PRs continuam validados em runner hospedado pelo GitHub Actions.

Nenhum workflow cria ou publica release automaticamente.

Veja `docs/WOODPECKER_ACTIVATION.md` para o estado da ativação, labels e validação do agent.
