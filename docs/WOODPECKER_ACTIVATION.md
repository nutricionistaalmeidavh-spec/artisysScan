# Woodpecker activation — ArtiSys Scan

## Target operating model

Woodpecker is the primary CI for trusted pushes and manual heavy scans. GitHub Actions remains the hosted-isolation fallback for pull requests and a manual fallback.

Current server: `https://ci.artisys.dev`.

Current Windows agents are matched through workflow labels:

```text
platform=windows/amd64
backend=local
```

The release workflow additionally requires:

```text
privilege=elevated
```

## Security boundary

The Woodpecker `local` backend executes commands directly on the agent host without container isolation. Because this repository is public, no Woodpecker workflow in this repository accepts the `pull_request` event. Pull request validation remains on GitHub Actions hosted runners.

Only trusted `push` events and manually started workflows are routed to the Windows local agent.

## Repository configuration

Woodpecker 3.18 discovers multiple workflows from `.woodpecker/*.yml` by default. The repository contains:

- `quick.yml` — automatic trusted push verification;
- `full.yml` — manual full engine verification;
- `fleet.yml` — manual fleet scan + dashboard generation;
- `release-windows.yml` — manual release-readiness workflow routed to the elevated Windows local agent.

No workflow publishes a release automatically.

## Server-side activation checklist

1. Enable `nutricionistaalmeidavh-spec/artisysScan` in the Woodpecker server.
2. Keep the default pipeline path `.woodpecker/`.
3. Confirm a connected agent advertises `platform=windows/amd64` and `backend=local`.
4. Confirm the release agent also advertises `privilege=elevated`.
5. Do not enable or add pull request execution on the local backend for this public repository.
6. Push a trusted commit and confirm `quick` completes.
7. Start `full`, `fleet`, and `release-windows` manually and confirm each is routed to the intended agent.

## Optional local syntax verification

With Woodpecker CLI installed:

```powershell
woodpecker-cli exec --backend-engine local .woodpecker/quick.yml
```

Server-side repository activation is an external Woodpecker setting and must be verified on the server/UI; repository files alone cannot prove that the project is enabled there.
