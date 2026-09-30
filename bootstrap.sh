#!/usr/bin/env bash
# LuminaryWorks Identity — 一键拉起统一登录授权服务
set -euo pipefail
cd "$(dirname "$0")"

assert_docker_ready() {
  if ! docker info >/dev/null 2>&1; then
    echo "✗ Docker daemon is not running." >&2
    echo "  Start Docker Desktop (or the Docker service), wait until healthy, then re-run:" >&2
    echo "    pnpm id:up" >&2
    echo "    # or: npm run bootstrap" >&2
    exit 1
  fi
}

echo "▶ LuminaryWorks Identity bootstrap"
assert_docker_ready

if [ ! -f .env ]; then
  cp .env.example .env
  echo "  · created .env from template"
fi

echo "▶ Starting Logto + PostgreSQL + Redis ..."
docker compose up -d

echo "▶ Waiting for Logto OIDC endpoint ..."
ENDPOINT="$(grep -E '^IDENTITY_ENDPOINT=' .env | cut -d= -f2 || echo http://localhost:3001)"
oidc_ready=0
for i in $(seq 1 60); do
  if curl -sf "${ENDPOINT}/oidc/.well-known/openid-configuration" >/dev/null 2>&1; then
    echo "  · OIDC up at ${ENDPOINT}/oidc"
    oidc_ready=1
    break
  fi
  sleep 2
done
if [ "$oidc_ready" -ne 1 ]; then
  echo "✗ Logto OIDC not reachable at ${ENDPOINT} after ~2m. Check: docker compose ps" >&2
  exit 1
fi

echo "▶ Waiting for Logto Admin endpoint ..."
ADMIN_ENDPOINT="$(grep -E '^IDENTITY_ADMIN_ENDPOINT=' .env | cut -d= -f2 || echo http://localhost:3002)"
admin_ready=0
for i in $(seq 1 30); do
  if curl -sf "${ADMIN_ENDPOINT}/oidc/.well-known/openid-configuration" >/dev/null 2>&1 \
    || curl -sf "${ADMIN_ENDPOINT}" >/dev/null 2>&1; then
    echo "  · Admin up at ${ADMIN_ENDPOINT}"
    admin_ready=1
    break
  fi
  sleep 2
done
if [ "$admin_ready" -ne 1 ]; then
  echo "✗ Logto Admin not reachable at ${ADMIN_ENDPOINT}. Check: docker compose ps" >&2
  exit 1
fi

echo "▶ Ensuring Logto Admin Console operator (LW_LOGTO_ADMIN_*) ..."
node scripts/ensure-logto-admin.mjs

echo "▶ Applying LuminaryWorks branding to Admin Console sign-in ..."
node scripts/ensure-admin-console-branding.mjs

echo "▶ Ensuring M2M + registering applications ..."
node scripts/bootstrap-m2m.mjs

if [ -f registered-apps.json ]; then
  echo "▶ Syncing CLIENT_IDs into product .env files ..."
  node scripts/sync-client-ids.mjs
  PROFILE="${IDENTITY_ACCOUNTS_PROFILE:-dev}"
  echo "▶ Checking ACCOUNTS.${PROFILE}.env / LW_* env (abort if incomplete) ..."
  echo "▶ Seeding Identity roles + accounts (profile=${PROFILE}) ..."
  IDENTITY_ACCOUNTS_PROFILE="${PROFILE}" node scripts/seed-accounts.mjs
  echo "▶ Ensuring social connectors from LOGTO_GOOGLE_* / LOGTO_GITHUB_* (optional) ..."
  node scripts/ensure-social-connectors.mjs
  # Auth mail: dev off unless EMAIL_AUTH_ENABLED=1; product on unless =0.
  # Does not enable tenant Mandatory TOTP (that remains ensure-force-mfa --on for tests).
  EMAIL_AUTH_RAW="${EMAIL_AUTH_ENABLED:-}"
  if [ -z "${EMAIL_AUTH_RAW}" ]; then
    EMAIL_AUTH_RAW="$(grep -E '^EMAIL_AUTH_ENABLED=' .env 2>/dev/null | cut -d= -f2- || true)"
  fi
  if [ -z "${EMAIL_AUTH_RAW}" ]; then
    if [ "${PROFILE}" = "product" ]; then EMAIL_AUTH_RAW=1; else EMAIL_AUTH_RAW=0; fi
  fi
  case "${EMAIL_AUTH_RAW}" in
    1|true|TRUE|on|ON)
      echo "▶ Enabling auth mail (register OTP + adaptive MFA, not tenant Mandatory TOTP) ..."
      node scripts/ensure-auth-mail.mjs --on
      ;;
    *)
      echo "▶ Auth mail off (private/dev). Registration will not require an email code ..."
      node scripts/ensure-auth-mail.mjs --off
      ;;
  esac
  echo "▶ Ensuring sign-in methods match the email connector ..."
  node scripts/ensure-sign-in-experience.mjs
fi

if grep -qE '^LOGTO_M2M_APP_ID=.+' .env; then
  echo "▶ Applying LuminaryWorks branding (logo + primary color) ..."
  node scripts/apply-branding.mjs
fi

echo "✓ Identity ready."
echo "  OIDC:  ${ENDPOINT}/oidc"
echo "  Admin: ${ADMIN_ENDPOINT}  (operator: LW_LOGTO_ADMIN_* in .env; sign-in 已品牌化)"
echo "  Logo:  $(grep -E '^IDENTITY_BRAND_ENDPOINT=' .env | cut -d= -f2- || echo https://cdn.luminaryworks.dev/logo)/luminaryworks-logo.svg"
echo "  Platform accounts: ACCOUNTS.dev.env | ACCOUNTS.product.env | LW_* (not Console login)"
