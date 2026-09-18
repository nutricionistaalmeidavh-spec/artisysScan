# Woodpecker — reservado para a fase operacional

O repositório **não deve ser ativado no Woodpecker durante as fases iniciais de desenvolvimento**.

A arquitetura do ArtiSys Scan mantém toda a lógica no CLI para que GitHub Actions e Woodpecker apenas chamem os mesmos comandos. Na fase final serão adicionados os pipelines `quick`, `full`, `release` e `fleet`, incluindo o agent Windows para Electron/instaladores.

Até lá, GitHub Actions executa somente CI de desenvolvimento e não publica releases.
