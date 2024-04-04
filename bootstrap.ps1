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

$m2m = (Select-String -Path .env -Pattern '^LOGTO_M2M_APP_ID=(.+)$').Matches
if ($m2m.Count -gt 0) {
  Write-Host "> Registering applications ..."
  node scripts/register-apps.mjs
} else {
  $admin = (Select-String -Path .env -Pattern '^IDENTITY_ADMIN_ENDPOINT=(.*)$').Matches.Groups[1].Value
  Write-Host "! Skipping app registration: set LOGTO_M2M_APP_ID/SECRET in .env first."
  Write-Host "  1) Open Admin: $admin"
  Write-Host "  2) Create a Machine-to-Machine app with Logto Management API access"
  Write-Host "  3) Fill ID/Secret into .env, then: node scripts/register-apps.mjs"
}

Write-Host "OK Identity ready."
