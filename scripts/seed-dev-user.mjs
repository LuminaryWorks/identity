/**
 * Idempotently create a local Logto user for smoke tests.
 *
 * Default credentials (override via env):
 *   DEV_USER_EMAIL=dev@luminaryworks.local
 *   DEV_USER_USERNAME=luminarydev
 *   DEV_USER_PASSWORD=LuminaryDev!234
 *
 * Usage: node scripts/seed-dev-user.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(join(root, ".env"));
const endpoint = (env.IDENTITY_ENDPOINT || "http://localhost:3001").replace(/\/$/, "");
const appId = env.LOGTO_M2M_APP_ID;
const appSecret = env.LOGTO_M2M_APP_SECRET;
const resource = env.LOGTO_MANAGEMENT_API_RESOURCE || "https://default.logto.app/api";

const email = process.env.DEV_USER_EMAIL || "dev@luminaryworks.local";
const username = process.env.DEV_USER_USERNAME || "luminarydev";
const password = process.env.DEV_USER_PASSWORD || "LuminaryDev!234";
const name = process.env.DEV_USER_NAME || "Luminary Dev";

if (!appId || !appSecret) {
  console.error("✗ Missing LOGTO_M2M_APP_ID/SECRET. Run bootstrap-m2m.mjs first.");
  process.exit(1);
}

const token = await getToken();
const users = asList(await api("GET", "/api/users?page=1&page_size=20"));
const existing = users.find((u) => u.primaryEmail === email || u.username === username);
if (existing) {
  console.log(`= user exists: ${existing.id} (${existing.primaryEmail || existing.username})`);
  writeCreds(existing.id);
  process.exit(0);
}

const created = await api("POST", "/api/users", {
  primaryEmail: email,
  username,
  password,
  name,
});
console.log(`+ user created: ${created.id} (${email})`);
writeCreds(created.id);

function writeCreds(id) {
  const body = {
    id,
    email,
    username,
    password,
    issuer: `${endpoint}/oidc`,
    note: "Local smoke-test user only. Change password in Admin for shared environments.",
  };
  writeFileSync(join(root, "DEV_USER.json"), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`  credentials → identity/DEV_USER.json`);
}

async function getToken() {
  const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const res = await fetch(`${endpoint}/oidc/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      resource,
      scope: "all",
    }),
  });
  if (!res.ok) throw new Error(`Token failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function api(method, path, body) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
