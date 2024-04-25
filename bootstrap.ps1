# LuminaryWorks Identity — 一键拉起统一登录授权服务 (Windows)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Assert-DockerReady {
  docker info 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host @"
✗ Docker daemon is not running (cannot reach dockerDesktopLinuxEngine).

Start Docker Desktop, wait until it is healthy, then re-run:
  pnpm id:up
  # or: npm run bootstrap
"@ -ForegroundColor Red
    exit 1
  }
}

function Invoke-Node([string]$Script) {
  node $Script
  if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ $Script failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Write-Host "> LuminaryWorks Identity bootstrap"
Assert-DockerReady

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "  - created .env from template"
}

Write-Host "> Starting Logto + PostgreSQL + Redis ..."
docker compose up -d
if ($LASTEXITCODE -ne 0) {
  Write-Host "✗ docker compose up -d failed (exit $LASTEXITCODE). Is Docker Desktop running?" -ForegroundColor Red
  exit $LASTEXITCODE
}

$endpoint = (Select-String -Path .env -Pattern '^IDENTITY_ENDPOINT=(.*)$').Matches.Groups[1].Value
if (-not $endpoint) { $endpoint = "http://localhost:3001" }

Write-Host "> Waiting for Logto OIDC endpoint ..."
$oidcReady = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing "$endpoint/oidc/.well-known/openid-configuration" -TimeoutSec 3 | Out-Null
    Write-Host "  - OIDC up at $endpoint/oidc"
    $oidcReady = $true
    break
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $oidcReady) {
  Write-Host "✗ Logto OIDC not reachable at $endpoint after ~2m. Check: docker compose ps" -ForegroundColor Red
  exit 1
}

Write-Host "> Waiting for Logto Admin endpoint ..."
$adminEndpoint = (Select-String -Path .env -Pattern '^IDENTITY_ADMIN_ENDPOINT=(.*)$').Matches.Groups[1].Value
if (-not $adminEndpoint) { $adminEndpoint = "http://localhost:3002" }
$adminReady = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing "$adminEndpoint" -TimeoutSec 3 | Out-Null
    Write-Host "  - Admin up at $adminEndpoint"
    $adminReady = $true
    break
  } catch {
    try {
      Invoke-WebRequest -UseBasicParsing "$adminEndpoint/oidc/.well-known/openid-configuration" -TimeoutSec 3 | Out-Null
      Write-Host "  - Admin OIDC up at $adminEndpoint"
      $adminReady = $true
      break
    } catch { Start-Sleep -Seconds 2 }
  }
}
if (-not $adminReady) {
  Write-Host "✗ Logto Admin not reachable at $adminEndpoint. Check: docker compose ps" -ForegroundColor Red
  exit 1
}

Write-Host "> Ensuring Logto Admin Console operator (LW_LOGTO_ADMIN_*) ..."
Invoke-Node "scripts/ensure-logto-admin.mjs"

Write-Host "> Ensuring M2M + registering applications ..."
Invoke-Node "scripts/bootstrap-m2m.mjs"

if (Test-Path .\registered-apps.json) {
  Write-Host "> Syncing CLIENT_IDs into product .env files ..."
  Invoke-Node "scripts/sync-client-ids.mjs"
  $profile = $env:IDENTITY_ACCOUNTS_PROFILE
  if (-not $profile) { $profile = "dev" }
  Write-Host "> Checking ACCOUNTS.$profile.env / LW_* env (abort if incomplete) ..."
  Write-Host "> Seeding Identity roles + accounts (profile=$profile) ..."
  $env:IDENTITY_ACCOUNTS_PROFILE = $profile
  Invoke-Node "scripts/seed-accounts.mjs"
  Write-Host "> Ensuring sign-in accepts email or username ..."
  Invoke-Node "scripts/ensure-sign-in-experience.mjs"
}

if (Select-String -Path .env -Pattern '^LOGTO_M2M_APP_ID=.+$') {
  Write-Host "> Applying LuminaryWorks branding (logo + primary color) ..."
  Invoke-Node "scripts/apply-branding.mjs"
}

Write-Host "OK Identity ready."
Write-Host "  OIDC:  $endpoint/oidc"
Write-Host "  Admin: $adminEndpoint  (operator: LW_LOGTO_ADMIN_* in .env)"
Write-Host "  Logo:  https://cdn.luminaryworks.dev/logo/luminaryworks-logo.svg"
Write-Host "  Platform accounts: ACCOUNTS.dev.env | ACCOUNTS.product.env | LW_* (not Console login)"
