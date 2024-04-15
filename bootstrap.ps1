# LuminaryWorks Identity — 一键拉起统一登录授权服务 (Windows)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "> LuminaryWorks Identity bootstrap"

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "  - created .env from template"
}

Write-Host "> Starting Logto + PostgreSQL + Redis ..."
docker compose up -d

$endpoint = (Select-String -Path .env -Pattern '^IDENTITY_ENDPOINT=(.*)$').Matches.Groups[1].Value
if (-not $endpoint) { $endpoint = "http://localhost:3001" }

Write-Host "> Waiting for Logto OIDC endpoint ..."
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing "$endpoint/oidc/.well-known/openid-configuration" -TimeoutSec 3 | Out-Null
    Write-Host "  - OIDC up at $endpoint/oidc"
    break
  } catch { Start-Sleep -Seconds 2 }
}

$m2mLine = Select-String -Path .env -Pattern '^LOGTO_M2M_APP_ID=(.+)$'
if (-not $m2mLine) {
  Write-Host "> Bootstrapping default-tenant M2M (no Admin UI needed) ..."
  node scripts/bootstrap-m2m.mjs
} else {
  Write-Host "> Registering applications ..."
  node scripts/register-apps.mjs
}

if (Test-Path .\registered-apps.json) {
  Write-Host "> Syncing CLIENT_IDs into product .env files ..."
  node scripts/sync-client-ids.mjs
  Write-Host "> Ensuring local test user ..."
  node scripts/seed-dev-user.mjs
}

if (Select-String -Path .env -Pattern '^LOGTO_M2M_APP_ID=.+$') {
  Write-Host "> Applying LuminaryWorks branding (logo + primary color) ..."
  node scripts/apply-branding.mjs
}

Write-Host "OK Identity ready."
Write-Host "  OIDC:  $endpoint/oidc"
Write-Host "  Admin: http://localhost:3002"
Write-Host "  Brand: http://localhost:3005/luminaryworks-logo.svg"
Write-Host "  Test user: see scripts/seed-dev-user.mjs output / DEV_USER.json"
