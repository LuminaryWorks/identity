/**
 * Idempotently register LuminaryWorks applications + API resources in Logto
 * via the Management API.
 *
 * Prerequisites (.env):
 *   IDENTITY_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET,
 *   LOGTO_MANAGEMENT_API_RESOURCE
 *
 * Usage:  node scripts/register-apps.mjs
 *
 * Writes resolved CLIENT_IDs to ./registered-apps.json for product .env wiring.
 * Machine-to-machine client secrets are never written to disk.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createIdentityManagementProvider } from "./lib/create-identity-management-provider.mjs";
import { assertLogtoManagementPlugin } from "./lib/iam-provider.mjs";
import { parseAppsCatalog, publicAppRegistrationResult } from "./lib/apps-catalog.mjs";
import { registerIdentityApps } from "./lib/register-apps-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const env = loadEnv(join(root, ".env"));
const endpoint = (env.IDENTITY_ENDPOINT || "http://localhost:3001").replace(/\/$/, "");
const appId = env.LOGTO_M2M_APP_ID;
const appSecret = env.LOGTO_M2M_APP_SECRET;
const resource = env.LOGTO_MANAGEMENT_API_RESOURCE || "https://default.logto.app/api";

if (!appId || !appSecret) {
  console.error(
    "✗ Missing LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET.\n" +
      "  Create a Machine-to-Machine app in Admin (with Logto Management API access),\n" +
      "  then fill them into identity/.env. See README.md §应用注册.",
  );
  process.exit(1);
}

assertLogtoManagementPlugin({ ...env, ...process.env });
const management = createIdentityManagementProvider({
  endpoint,
  clientId: appId,
  clientSecret: appSecret,
  resource,
  provider: process.env.IAM_PROVIDER || env.IAM_PROVIDER,
});
const catalog = parseAppsCatalog(JSON.parse(readFileSync(join(root, "apps.json"), "utf8")));

const result = await registerIdentityApps({
  api: (method, path, body) => management.request(method, path, body),
  catalog,
});
const publicResult = publicAppRegistrationResult(result);

writeFileSync(join(root, "registered-apps.json"), `${JSON.stringify(publicResult, null, 2)}\n`);
console.log("\n✓ Done. CLIENT_IDs written to identity/registered-apps.json (no secrets)");

function loadEnv(path) {
  try {
    const out = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    console.error(`✗ Missing ${path}. Run: cp .env.example .env`);
    process.exit(1);
  }
}
