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
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createIdentityManagementProvider } from "./lib/create-identity-management-provider.mjs";
import { assertLogtoManagementPlugin } from "./lib/iam-provider.mjs";

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
const apps = JSON.parse(readFileSync(join(root, "apps.json"), "utf8"));

const existingApps = asList(await api("GET", "/api/applications?page=1&page_size=20"));
const existingResources = asList(await api("GET", "/api/resources?page=1&page_size=20"));

const result = { spa: {}, apiResources: {} };

for (const spa of apps.spaApplications) {
  const found = existingApps.find((a) => a.name === spa.name);
  if (found) {
    const desiredRedirects = spa.redirectUris ?? [];
    const desiredLogout = spa.postLogoutRedirectUris ?? [];
    const currentRedirects = found.oidcClientMetadata?.redirectUris ?? [];
    const currentLogout = found.oidcClientMetadata?.postLogoutRedirectUris ?? [];
    const sameRedirects = JSON.stringify([...currentRedirects].sort()) === JSON.stringify([...desiredRedirects].sort());
    const sameLogout = JSON.stringify([...currentLogout].sort()) === JSON.stringify([...desiredLogout].sort());
    if (!sameRedirects || !sameLogout) {
      await api("PATCH", `/api/applications/${found.id}`, {
        oidcClientMetadata: {
          redirectUris: desiredRedirects,
          postLogoutRedirectUris: desiredLogout,
        },
      });
      console.log(`~ SPA updated redirects: ${spa.name} (${found.id})`);
    } else {
      console.log(`= SPA exists: ${spa.name} (${found.id})`);
    }
    result.spa[spa.name] = found.id;
    continue;
  }
  const created = await api("POST", "/api/applications", {
    name: spa.name,
    type: "SPA",
    oidcClientMetadata: {
      redirectUris: spa.redirectUris,
      postLogoutRedirectUris: spa.postLogoutRedirectUris ?? [],
    },
  });
  console.log(`+ SPA created: ${spa.name} (${created.id})`);
  result.spa[spa.name] = created.id;
}

for (const res of apps.apiResources) {
  const found = existingResources.find((r) => r.indicator === res.indicator);
  let resourceId;
  if (found) {
    console.log(`= API resource exists: ${res.name}`);
    result.apiResources[res.name] = res.indicator;
    resourceId = found.id;
  } else {
    const created = await api("POST", "/api/resources", { name: res.name, indicator: res.indicator });
    console.log(`+ API resource created: ${res.name}`);
    result.apiResources[res.name] = res.indicator;
    resourceId = created.id;
  }
  // Logto JWT access tokens for a resource require at least one scope on that resource.
  if (resourceId) {
    const scopes = asList(await api("GET", `/api/resources/${resourceId}/scopes?page=1&page_size=20`));
    if (!scopes.length) {
      await api("POST", `/api/resources/${resourceId}/scopes`, {
        name: "access",
        description: "Default API access scope",
      });
      console.log(`+ scope "access" on ${res.name}`);
    }
  }
}

writeFileSync(join(root, "registered-apps.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log("\n✓ Done. CLIENT_IDs written to identity/registered-apps.json");

// ── helpers ──
function api(method, path, body) {
  return management.request(method, path, body);
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

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
