# Woodpecker activation — ArtiSys Scan

## Target operating model

Woodpecker is the primary CI for trusted pushes and manual heavy scans. GitHub Actions remains the hosted-isolation fallback for pull requests and a manual fallback.

Current server: `https://ci.artisys.dev`.

The homologated Windows agent is matched by:

```text
platform=windows/amd64
backend=local
pilot=pdv-artisys
```

The `pilot=pdv-artisys` label is the label currently advertised by the existing Windows agent. The name can be generalized later without changing the scanner engine, as long as the agent and workflow labels are changed together.

## Security boundary

The Woodpecker `local` backend executes commands directly on the agent host without container isolation. Because this repository is public, no Woodpecker workflow in this repository accepts the `pull_request` event. Pull request validation remains on GitHub Actions hosted runners.

Only trusted `push` events and manually started workflows are routed to the Windows local agent.

## Repository configuration

Woodpecker 3.18 discovers multiple workflows from `.woodpecker/*.yml` by default. The repository contains:

- `quick.yml` — automatic trusted push verification;
- `full.yml` — manual full engine verification;
- `fleet.yml` — manual fleet scan + dashboard generation;
- `release-windows.yml` — manual release-readiness workflow on the same homologated Windows local agent.

All steps use `powershell.exe`, matching the already homologated PDV pipeline. No workflow publishes a release automatically.

## Activation state — 2026-09-18

The repository is enabled on `ci.artisys.dev`, the GitHub webhook/status integration is confirmed, and the automatic `quick` workflow has completed successfully on the Windows local agent.

During homologation, Windows-specific incompatibilities were reproduced on GitHub `windows-latest` and corrected:

- the CLI entrypoint now compares normalized filesystem paths using `fileURLToPath(import.meta.url)` instead of a POSIX-only `file://` string comparison;
- Source Security and Supply Chain tests no longer hardcode POSIX-only absolute paths.

After the fixes, the same HEAD passed:

- GitHub Actions `ubuntu-latest`;
- GitHub Actions `windows-latest`;
- Woodpecker context `ci/woodpecker/push/quick`.

The existing agent launcher sets `WOODPECKER_MAX_WORKFLOWS=1`, so only one workflow can run at a time.

## Server/agent checklist

1. Keep `nutricionistaalmeidavh-spec/artisysScan` enabled in Woodpecker.
2. Keep the default pipeline path `.woodpecker/`.
3. Keep a Windows agent connected with `platform=windows/amd64`, `backend=local`, `pilot=pdv-artisys`.
4. Do not add pull request execution on the local backend for this public repository.
5. Use `quick` for trusted pushes.
6. Use `full`, `fleet`, and `release-windows` manually when those heavier profiles are needed.

## Optional local syntax verification

With Woodpecker CLI installed:

```powershell
woodpecker-cli exec --backend-engine local .woodpecker/quick.yml
```

Repository enablement, webhook delivery and a real green agent execution have all been verified.
