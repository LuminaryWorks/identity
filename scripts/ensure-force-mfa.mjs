/**
 * Logto tenant MFA policy helper (LuminaryWorks ecosystem).
 *
 * Policy:
 *   - Local / IDENTITY_ACCOUNTS_PROFILE=dev → MFA OFF (UserControlled, no factors)
 *   - Production / product profile / LOGTO_FORCE_MFA=1 → Mandatory + Totp (+ BackupCode)
 *   - Tests temporarily enable MFA, then --restore / --off so local DX stays password-only
 *
 * Usage (from identity/):
 *   node scripts/ensure-force-mfa.mjs --off
 *   node scripts/ensure-force-mfa.mjs --on
 *   node scripts/ensure-force-mfa.mjs --on --bind-email=admin.doerflow@luminaryworks.dev
 *   node scripts/ensure-force-mfa.mjs --restore
 *
 * Env:
 *   IDENTITY_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET
 *   LOGTO_FORCE_MFA_TOTP_SECRET — base32 secret for test bind (default: fixed local vector)
 *   LW_ADMIN_DOERFLOW_EMAIL — default bind target when --bind / --bind-email
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const accountsPath = join(root, "ACCOUNTS.dev.env");
const statePath = join(root, ".force-mfa-state.json");

/** Local-only default; not for production. Overridable via env / --secret=. */
const DEFAULT_TOTP_SECRET = "JBSWY3DPEHPK3PXP"; // "Hello!" base32 — well-known test vector

const args = parseArgs(process.argv.slice(2));
const envFile = readEnvMap(envPath);
const accounts = existsSync(accountsPath) ? readEnvMap(accountsPath) : {};

const endpoint = (
  process.env.IDENTITY_ENDPOINT ||
  envFile.IDENTITY_ENDPOINT ||
  "http://localhost:3001"
).replace(/\/$/, "");
const appId = process.env.LOGTO_M2M_APP_ID || envFile.LOGTO_M2M_APP_ID;
const appSecret = process.env.LOGTO_M2M_APP_SECRET || envFile.LOGTO_M2M_APP_SECRET;
const resource =
  process.env.LOGTO_MANAGEMENT_API_RESOURCE ||
  envFile.LOGTO_MANAGEMENT_API_RESOURCE ||
  "https://default.logto.app/api";

if (!appId || !appSecret) {
  console.error("✗ Missing LOGTO_M2M_APP_ID/SECRET. Run bootstrap-m2m.mjs first.");
  process.exit(1);
}

const accessToken = await fetchM2mToken();

if (args.restore) {
  await restoreMfa();
  process.exit(0);
}

if (args.off) {
  await disableForceMfa();
  process.exit(0);
}

// Default / --on → enable Mandatory MFA (production + ephemeral test)
await enableForceMfa();

const bindEmail =
  args.bindEmail ||
  (args.bind
    ? process.env.LW_ADMIN_DOERFLOW_EMAIL ||
      accounts.LW_ADMIN_DOERFLOW_EMAIL ||
      "admin.doerflow@luminaryworks.dev"
    : null);

if (bindEmail) {
  const secret =
    args.secret ||
    process.env.LOGTO_FORCE_MFA_TOTP_SECRET ||
    envFile.LOGTO_FORCE_MFA_TOTP_SECRET ||
    DEFAULT_TOTP_SECRET;
  await bindTotp(bindEmail, normalizeBase32(secret));
}

async function fetchM2mToken() {
  const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const tokenRes = await fetch(`${endpoint}/oidc/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      resource,
      scope: "all",
    }),
  });
  if (!tokenRes.ok) {
    console.error("✗ M2M token failed", await tokenRes.text());
    process.exit(1);
  }
  const { access_token: token } = await tokenRes.json();
  return token;
}

async function api(method, path, body) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${text}`);
  }
  return json;
}

async function enableForceMfa() {
  const current = await api("GET", "/api/sign-in-exp");
  if (!existsSync(statePath)) {
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          mfa: current.mfa ?? { factors: [], policy: "UserControlled" },
          adaptiveMfa: current.adaptiveMfa ?? {},
        },
        null,
        2,
      ) + "\n",
    );
  }

  const updated = await api("PATCH", "/api/sign-in-exp", {
    mfa: {
      factors: ["Totp", "BackupCode"],
      policy: "Mandatory",
    },
  });
  console.log("✓ Force-MFA enabled (Mandatory + Totp + BackupCode)");
  console.log("  policy:", updated.mfa?.policy);
  console.log("  factors:", (updated.mfa?.factors || []).join(", "));
  console.log("  note: production / product profile default; local DX uses --off");
}

async function disableForceMfa() {
  const updated = await api("PATCH", "/api/sign-in-exp", {
    mfa: { factors: [], policy: "UserControlled" },
  });
  console.log("✓ MFA off for local/dev (UserControlled, no factors)");
  console.log("  policy:", updated.mfa?.policy);
}

async function restoreMfa() {
  if (!existsSync(statePath)) {
    console.log("· No .force-mfa-state.json — applying --off");
    await disableForceMfa();
    return;
  }
  const prev = JSON.parse(readFileSync(statePath, "utf8"));
  await api("PATCH", "/api/sign-in-exp", {
    mfa: prev.mfa,
    ...(prev.adaptiveMfa ? { adaptiveMfa: prev.adaptiveMfa } : {}),
  });
  console.log("✓ MFA restored from .force-mfa-state.json");
  console.log("  policy:", prev.mfa?.policy);
  console.log("  factors:", (prev.mfa?.factors || []).join(", ") || "(none)");
}

async function findUserByEmail(email) {
  const q = encodeURIComponent(email);
  const list = await api("GET", `/api/users?search=${q}`);
  const rows = Array.isArray(list) ? list : list?.data || [];
  const hit =
    rows.find((u) => u.primaryEmail?.toLowerCase() === email.toLowerCase()) ||
    rows.find((u) => String(u.primaryEmail || "").toLowerCase().includes(email.toLowerCase()));
  if (!hit) {
    throw new Error(`User not found for email: ${email}`);
  }
  return hit;
}

async function bindTotp(email, secret) {
  const user = await findUserByEmail(email);
  const existing = await api("GET", `/api/users/${user.id}/mfa-verifications`);
  const rows = Array.isArray(existing) ? existing : [];
  for (const row of rows) {
    const id = row.id || row.verificationId;
    if (!id) continue;
    await api("DELETE", `/api/users/${user.id}/mfa-verifications/${id}`);
  }

  const created = await api("POST", `/api/users/${user.id}/mfa-verifications`, {
    type: "Totp",
    secret,
  });

  const after = await api("GET", `/api/users/${user.id}/mfa-verifications`);
  const hasBackup = (Array.isArray(after) ? after : []).some(
    (r) => r.type === "BackupCode" || r.type === "backupCode",
  );
  if (!hasBackup) {
    try {
      await api("POST", `/api/users/${user.id}/mfa-verifications`, { type: "BackupCode" });
    } catch (err) {
      console.warn("· BackupCode bind skipped:", err instanceof Error ? err.message : err);
    }
  }

  const code = generateTotp(secret);
  console.log(`✓ Bound TOTP for ${email} (user ${user.id})`);
  console.log(`  secret (base32): ${secret}`);
  console.log(`  current code:    ${code}`);
  if (created?.secret && created.secret !== secret) {
    console.log(`  server secret:   ${created.secret}`);
  }
}

function parseArgs(argv) {
  const out = {
    restore: false,
    off: false,
    on: false,
    bind: false,
    bindEmail: null,
    secret: null,
  };
  for (const a of argv) {
    if (a === "--restore") out.restore = true;
    else if (a === "--off" || a === "--dev-off") out.off = true;
    else if (a === "--on" || a === "--production") out.on = true;
    else if (a === "--bind") out.bind = true;
    else if (a.startsWith("--bind-email=")) {
      out.bind = true;
      out.bindEmail = a.slice("--bind-email=".length);
    } else if (a.startsWith("--secret=")) out.secret = a.slice("--secret=".length);
  }
  // Bare invoke (no flags) = --on (production / test enable)
  if (!out.restore && !out.off && !out.on && !out.bind && !out.bindEmail) {
    out.on = true;
  }
  return out;
}

function readEnvMap(path) {
  const map = {};
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[trimmed.slice(0, eq)] = value;
  }
  return map;
}

function normalizeBase32(secret) {
  const cleaned = String(secret).replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z2-7]+=*$/.test(cleaned)) {
    if (/^[0-9a-f]+$/i.test(cleaned) && cleaned.length % 2 === 0) {
      return base32Encode(Buffer.from(cleaned, "hex"));
    }
  }
  return cleaned;
}

function base32Encode(buf) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secret.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP (SHA1, 30s, 6 digits). */
function generateTotp(secret, now = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(now / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}
