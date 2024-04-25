# Local Identity stack (Docker Desktop)

## Does it start with Docker Desktop?

Yes — **after the first successful `pnpm id:up` / `docker compose up -d`**.

All services in [`docker-compose.yml`](./docker-compose.yml) use:

```yaml
    restart: unless-stopped
```

So when Docker Desktop starts, it **restarts previously created containers** that were not removed. It does **not** invent the stack from zero on a fresh machine.

| Situation | What happens |
|-----------|----------------|
| First clone / never ran identity | Need `cd LuminaryWorks && pnpm id:up` once |
| Docker Desktop reboot / Windows 登录后 Desktop 自启 | Containers auto-restart (`unless-stopped`) |
| You ran `pnpm id:down` / `docker compose stop` | Containers stay; next Desktop start **still** auto-starts |
| You ran `pnpm id:destroy` / `docker compose down` | Containers removed; need `pnpm id:up` again |
| Port 3001 conflict / crash loop | Fix env/ports, then `pnpm id:up` |

## One-command local IdP

```bash
cd D:\www\LuminaryWorks
pnpm id:up
# OIDC:  http://localhost:3001/oidc
# Admin: http://localhost:3002
# Probe: http://localhost:3001/oidc/.well-known/openid-configuration
```

Health / status:

```bash
pnpm id:ps
# or:
cd identity
docker compose ps
curl http://localhost:3001/oidc/.well-known/openid-configuration
```

Stop without breaking auto-start:

```bash
pnpm id:down          # = docker compose stop（保留容器）
pnpm id:destroy       # = docker compose down（拆掉栈，下次需 id:up）
```


## Admin Console login (developers)

Two different logins:

| Who | Env | URL |
|-----|-----|-----|
| Logto Console operator | `LW_LOGTO_ADMIN_*` in `identity/.env` | http://localhost:3002 |
| Platform / product users | `ACCOUNTS.dev.env` | product SPA login pages |

After `pnpm id:up`, open Admin with the Console operator (see `.env.example`). Missing `LW_LOGTO_ADMIN_PASSWORD` aborts bootstrap — there is no Welcome-page fallback for private deploy.

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

1. Mirror the three images to your GHCR/Harbor.
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

Settings → General → **Start Docker Desktop when you sign in**（本机已可写入 `settings-store.json` 的 `AutoStart=true`）。

Combined with `unless-stopped` + **不要用 `compose down` 当日常关闭**：

1. 登录 Windows → Docker Desktop 自启
2. Desktop 引擎就绪后 → `luminary-identity*` 按 restart 策略自动恢复
3. OIDC 约在 Logto seed/启动完成后可用（健康检查 `start_period` 约 90s）
