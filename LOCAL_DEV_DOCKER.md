# Local Identity stack (Docker Desktop)

## Does it start with Docker Desktop?

Yes — **after the first successful `pnpm id:up` / `docker compose up -d`**.

All services in [`docker-compose.yml`](./docker-compose.yml) use:

```yaml
restart: unless-stopped
```

So when Docker Desktop starts, it **restarts previously created containers** that were not explicitly stopped (`docker compose down` / Stop in UI). It does **not** invent the stack from zero on a fresh machine.

| Situation | What happens |
|-----------|----------------|
| First clone / never ran identity | Need `cd LuminaryWorks && pnpm id:up` once |
| Docker Desktop reboot | Containers auto-restart (`unless-stopped`) |
| You ran `docker compose down` | Need `pnpm id:up` again |
| Port 3001 conflict / crash loop | Fix env/ports, then `pnpm id:up` |

## One-command local IdP

```bash
cd D:\www\LuminaryWorks
pnpm id:up
# OIDC:  http://localhost:3001/oidc
# Admin: http://localhost:3002
# Probe: http://localhost:3001/oidc/.well-known/openid-configuration
```

Health:

```bash
cd identity
docker compose ps
curl http://localhost:3001/oidc/.well-known/openid-configuration
```

## Issuer host rule (Windows)

Logto `ENDPOINT` defaults to `http://localhost:3001`. Discovery `issuer` and callback `iss` use that host.

**SPA `PUBLIC_IDP_ISSUER` / `VITE_IDP_ISSUER` must match exactly** — do not mix `localhost` and `127.0.0.1`.

| Product | Port | App name in `apps.json` |
|---------|------|-------------------------|
| VistaRemote Client | **5173** | VistaRemote Client |
| DoerFlow Web | **5174** | VibeAgent Web |
| VistaRemote Admin | 5175 | VistaRemote Admin |
| DoerFlow Admin | 13011 | DoerFlow Admin |

## “Private image” for local debug

This stack is already the local IdP package: official images + compose + register scripts.

| Layer | Image |
|-------|--------|
| IdP | `svhd/logto:latest` |
| DB | `postgres:16-alpine` |
| Redis | `redis:7-alpine` |
| Brand static | `nginx:alpine` + `../shared/brand` |

Optional private mirror (team registry):

1. Mirror the four images to your GHCR/Harbor.
2. Override in `docker-compose.override.yml`:

```yaml
services:
  identity:
    image: ghcr.io/your-org/luminary-logto:1.0.0
  identity-db:
    image: ghcr.io/your-org/postgres:16-alpine
  identity-redis:
    image: ghcr.io/your-org/redis:7-alpine
```

3. Developers still run `pnpm id:up` (or `docker compose up -d` in `identity/`).

A single all-in-one “fat” image is **not** recommended (Logto + Postgres + Redis state). Keep compose; pin/mirror images if you need offline/private pulls.

## Docker Desktop tip

Settings → General → **Start Docker Desktop when you sign in** (optional). Combined with `unless-stopped`, identity comes back after login without re-running bootstrap — as long as the containers still exist.
