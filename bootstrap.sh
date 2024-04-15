#!/usr/bin/env bash
# LuminaryWorks Identity — 一键拉起统一登录授权服务
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ LuminaryWorks Identity bootstrap"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "  · created .env from template"
fi

echo "▶ Starting Logto + PostgreSQL + Redis ..."
docker compose up -d

echo "▶ Waiting for Logto OIDC endpoint ..."
ENDPOINT="$(grep -E '^IDENTITY_ENDPOINT=' .env | cut -d= -f2 || echo http://localhost:3001)"
for i in $(seq 1 60); do
  if curl -sf "${ENDPOINT}/oidc/.well-known/openid-configuration" >/dev/null 2>&1; then
    echo "  · OIDC up at ${ENDPOINT}/oidc"
    break
  fi
  sleep 2
done

if grep -qE '^LOGTO_M2M_APP_ID=.+' .env; then
  echo "▶ Registering applications ..."
  node scripts/register-apps.mjs
else
  echo "▶ Bootstrapping default-tenant M2M (no Admin UI needed) ..."
  node scripts/bootstrap-m2m.mjs
fi

if [ -f registered-apps.json ]; then
  echo "▶ Syncing CLIENT_IDs into product .env files ..."
  node scripts/sync-client-ids.mjs
  echo "▶ Ensuring local test user ..."
  node scripts/seed-dev-user.mjs
fi

if grep -qE '^LOGTO_M2M_APP_ID=.+' .env; then
  echo "▶ Applying LuminaryWorks branding (logo + primary color) ..."
  node scripts/apply-branding.mjs
fi

echo "✓ Identity ready."
echo "  OIDC:  ${ENDPOINT}/oidc"
echo "  Admin: $(grep -E '^IDENTITY_ADMIN_ENDPOINT=' .env | cut -d= -f2 || echo http://localhost:3002)"
echo "  Brand: $(grep -E '^IDENTITY_BRAND_ENDPOINT=' .env | cut -d= -f2 || echo http://localhost:3005)/luminaryworks-logo.svg"
