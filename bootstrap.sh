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
  echo "⚠ Skipping app registration: set LOGTO_M2M_APP_ID/SECRET in .env first."
  echo "  1) Open Admin: $(grep -E '^IDENTITY_ADMIN_ENDPOINT=' .env | cut -d= -f2 || echo http://localhost:3002)"
  echo "  2) Create a Machine-to-Machine app with Logto Management API access"
  echo "  3) Fill ID/Secret into .env, then: node scripts/register-apps.mjs"
fi

echo "✓ Identity ready. Admin: $(grep -E '^IDENTITY_ADMIN_ENDPOINT=' .env | cut -d= -f2 || echo http://localhost:3002)"
