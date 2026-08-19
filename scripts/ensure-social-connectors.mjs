/**
 * Create Google / GitHub social connectors from env (idempotent) and attach
 * them to the Sign-in Experience.
 *
 * Credentials are optional: without them this script is a no-op besides
 * printing the Admin URL. Fake SPA social buttons should not appear until
 * connectors exist (see @luminaryworks/auth-react HeadlessLoginPanel).
 *
 * Usage (from identity/):
 *   LOGTO_GOOGLE_CLIENT_ID=... LOGTO_GOOGLE_CLIENT_SECRET=... \
 *   LOGTO_GITHUB_CLIENT_ID=... LOGTO_GITHUB_CLIENT_SECRET=... \
 *   node scripts/ensure-social-connectors.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(join(root, ".env"));
const endpoint = (env.IDENTITY_ENDPOINT || "http://localhost:3001").replace(/\/$/, "");
const appId = env.LOGTO_M2M_APP_ID;
const appSecret = env.LOGTO_M2M_APP_SECRET;
const resource = env.LOGTO_MANAGEMENT_API_RESOURCE || "https://default.logto.app/api";

const CONNECTORS = [
  {
    target: "google",
    factoryId: "google-universal",
    clientId: env.LOGTO_GOOGLE_CLIENT_ID,
    clientSecret: env.LOGTO_GOOGLE_CLIENT_SECRET,
    config: (id, secret) => ({
      clientId: id,
      clientSecret: secret,
      prompts: ["select_account"],
    }),
  },
  {
    target: "github",
    factoryId: "github-universal",
    clientId: env.LOGTO_GITHUB_CLIENT_ID,
    clientSecret: env.LOGTO_GITHUB_CLIENT_SECRET,
    config: (id, secret) => ({
      clientId: id,
      clientSecret: secret,
    }),
  },
];

if (!appId || !appSecret) {
  console.error("✗ Missing LOGTO_M2M_APP_ID/SECRET. Run bootstrap-m2m.mjs first.");
  process.exit(1);
}

const token = await getToken();
const existing = asList(await api("GET", "/api/connectors?page=1&page_size=50"));
let created = 0;
let skipped = 0;

for (const spec of CONNECTORS) {
  const found = existing.find((c) => c.target === spec.target || c.connectorId === spec.factoryId);
  if (found) {
    console.log(`= ${spec.target}: connector ${found.id}`);
    console.log(`  callback: ${endpoint}/callback/${found.id}`);
    skipped += 1;
    continue;
  }
  if (!spec.clientId || !spec.clientSecret) {
    console.log(
      `· ${spec.target}: skipped (set LOGTO_${spec.target.toUpperCase()}_CLIENT_ID / _CLIENT_SECRET)`,
    );
    continue;
  }
  const createdConnector = await api("POST", "/api/connectors", {
    connectorId: spec.factoryId,
    config: spec.config(spec.clientId, spec.clientSecret),
  });
  console.log(`+ ${spec.target}: connector ${createdConnector.id}`);
  console.log(`  callback (paste into ${spec.target} OAuth app): ${endpoint}/callback/${createdConnector.id}`);
  created += 1;
}

if (created === 0 && skipped === 0) {
  console.log("");
  console.log("· No social connectors configured.");
  console.log(`  Add Google / GitHub in Admin → Connectors: ${endpoint.replace(/3001$/, "3002")}`);
  console.log("  or set LOGTO_GOOGLE_CLIENT_* / LOGTO_GITHUB_CLIENT_* in identity/.env and re-run.");
  console.log("  Product Headless buttons only appear after connectors exist.");
  process.exit(0);
}

if (created > 0) {
  console.log("▶ Refreshing sign-in experience social targets …");
}

async function getToken() {
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
    throw new Error(`M2M token failed ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const body = await tokenRes.json();
  return body.access_token;
}

async function api(method, path, body) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${text}`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function loadEnv(path) {
  const map = { ...process.env };
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && map[m[1]] === undefined) map[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  } catch {
    /* missing .env */
  }
  return map;
}
