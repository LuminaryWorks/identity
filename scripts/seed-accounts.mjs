/**
 * Seed LuminaryWorks Identity roles + system accounts.
 *
 * Profiles:
 *   - dev      → ACCOUNTS.dev.env     (local; includes guest users)
 *   - product  → ACCOUNTS.product.env (private / cloud; admins only)
 *
 * Credential sources (merged; process env wins):
 *   1. process.env LW_* / SEED_ACCOUNTS_DOMAIN / …
 *   2. ACCOUNTS.{profile}.env on disk
 *
 * If required passwords are missing → exit 1 (no interactive prompt, no auto-copy).
 *
 * Usage:
 *   IDENTITY_ACCOUNTS_PROFILE=dev node scripts/seed-accounts.mjs
 *   IDENTITY_ACCOUNTS_PROFILE=product node scripts/seed-accounts.mjs
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LogtoManagementProvider } from "./lib/logto-management-provider.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLACEHOLDER_PASSWORDS = new Set(["", "CHANGE_ME", "changeme", "REPLACE_ME", "replace_me"]);

const rootEnv = loadEnvFile(join(root, ".env"));
const profile = resolveProfile(rootEnv);
const accountsFilePath = join(root, `ACCOUNTS.${profile}.env`);
const accountsExamplePath = join(root, `ACCOUNTS.${profile}.env.example`);
const seedStatePath = join(root, `ACCOUNTS.${profile}.seeded.json`);

const fileEnv = loadEnvFile(accountsFilePath);
const envMap = mergeEnv(fileEnv, process.env, rootEnv);

const endpoint = (envMap.IDENTITY_ENDPOINT || rootEnv.IDENTITY_ENDPOINT || "http://localhost:3001").replace(
  /\/$/,
  "",
);
const appId = envMap.LOGTO_M2M_APP_ID || rootEnv.LOGTO_M2M_APP_ID;
const appSecret = envMap.LOGTO_M2M_APP_SECRET || rootEnv.LOGTO_M2M_APP_SECRET;
const resource = envMap.LOGTO_MANAGEMENT_API_RESOURCE || rootEnv.LOGTO_MANAGEMENT_API_RESOURCE || "https://default.logto.app/api";
const domain =
  envMap.SEED_ACCOUNTS_DOMAIN ||
  envMap.SEED_DEV_ACCOUNTS_DOMAIN ||
  rootEnv.SEED_ACCOUNTS_DOMAIN ||
  rootEnv.SEED_DEV_ACCOUNTS_DOMAIN ||
  "luminaryworks.local";

const manifest = JSON.parse(readFileSync(join(root, "seed-accounts.manifest.json"), "utf8"));
const accounts = (manifest.accounts || []).filter((a) => {
  const profiles = Array.isArray(a.profiles) && a.profiles.length > 0 ? a.profiles : ["dev", "product"];
  return profiles.includes(profile);
});

assertAccountsConfigured(accounts, envMap, profile, accountsFilePath, accountsExamplePath);

if (!appId || !appSecret) {
  console.error("✗ Missing LOGTO_M2M_APP_ID/SECRET. Run bootstrap-m2m.mjs first.");
  process.exit(1);
}

const management = new LogtoManagementProvider({
  endpoint,
  clientId: appId,
  clientSecret: appSecret,
  resource,
});
await ensureJwtRolesClaim();
const roleIdByName = await ensureRoles(manifest.roles);
const accountsOut = [];

for (const acct of accounts) {
  const creds = resolveAccountCreds(acct, envMap, domain);
  const user = await ensureUser(creds);
  for (const roleName of acct.roles) {
    const roleId = roleIdByName.get(roleName);
    if (!roleId) throw new Error(`Role missing: ${roleName}`);
    await ensureUserHasRole(roleId, user.id, roleName, creds.email);
  }
  accountsOut.push({
    key: acct.key,
    id: user.id,
    email: creds.email,
    username: creds.username,
    name: acct.name,
    roles: acct.roles,
  });
  console.log(`= ${acct.key}: ${creds.email} roles=[${acct.roles.join(",")}]`);
}

writeSeedState(accountsOut, profile, domain, endpoint);
cleanupLegacyFiles();

console.log(`\n✓ Seeded profile=${profile} (${accountsOut.length} users)`);
console.log(`  Login at ${endpoint}`);
console.log(`  State: ACCOUNTS.${profile}.seeded.json (ids only; passwords stay in env / ACCOUNTS.${profile}.env)`);

function resolveProfile(baseEnv) {
  const raw =
    process.env.IDENTITY_ACCOUNTS_PROFILE ||
    process.env.LW_ACCOUNTS_PROFILE ||
    baseEnv.IDENTITY_ACCOUNTS_PROFILE ||
    baseEnv.LW_ACCOUNTS_PROFILE ||
    (process.env.NODE_ENV === "production" ? "product" : "dev");
  const profileName = String(raw).trim().toLowerCase();
  if (profileName !== "dev" && profileName !== "product") {
    console.error(`✗ IDENTITY_ACCOUNTS_PROFILE must be "dev" or "product" (got: ${raw})`);
    process.exit(1);
  }
  return profileName;
}

function assertAccountsConfigured(accts, env, profileName, filePath, examplePath) {
  const missing = [];
  for (const acct of accts) {
    const prefix = `LW_${acct.key}_`;
    const password = env[`${prefix}PASSWORD`];
    if (!isConfiguredPassword(password)) {
      missing.push(`${prefix}PASSWORD`);
    }
  }

  if (missing.length === 0) {
    const source = existsSync(filePath)
      ? `file ${basename(filePath)} (+ process env overrides if set)`
      : "process env only";
    console.log(`= accounts profile=${profileName} ok (${source})`);
    return;
  }

  console.error(`✗ Accounts not configured for profile="${profileName}". Aborting init/seed.`);
  console.error(`  Missing or placeholder: ${missing.join(", ")}`);
  console.error("");
  console.error("  Configure one of:");
  console.error(`    A) File:  cp ${basename(examplePath)} ${basename(filePath)}  then set passwords`);
  console.error(`    B) Env:   export/set LW_*_PASSWORD (and EMAIL/USERNAME) in shell / GitHub Actions`);
  console.error(`  Profile: IDENTITY_ACCOUNTS_PROFILE=${profileName}`);
  if (existsSync(join(root, "DEV_ACCOUNTS.env"))) {
    console.error("  Legacy: rename DEV_ACCOUNTS.env → ACCOUNTS.dev.env (old name no longer used).");
  }
  process.exit(1);
}

function isConfiguredPassword(value) {
  if (value == null) return false;
  const v = String(value).trim();
  return v.length > 0 && !PLACEHOLDER_PASSWORDS.has(v);
}

function resolveAccountCreds(acct, env, dom) {
  const prefix = `LW_${acct.key}_`;
  const email = env[`${prefix}EMAIL`] || `${acct.emailPrefix}@${dom}`;
  const username = env[`${prefix}USERNAME`] || acct.username;
  const password = env[`${prefix}PASSWORD`];
  if (!isConfiguredPassword(password)) {
    throw new Error(`Missing password for ${acct.key}`);
  }
  return { email, username, password: String(password).trim(), name: acct.name };
}

function writeSeedState(accountsList, profileName, dom, ep) {
  const payload = {
    profile: profileName,
    domain: dom,
    issuer: `${ep}/oidc`,
    seededAt: new Date().toISOString(),
    accounts: accountsList,
  };
  writeFileSync(seedStatePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function cleanupLegacyFiles() {
  for (const legacy of ["DEV_ACCOUNTS.json", "DEV_USER.json"]) {
    try {
      unlinkSync(join(root, legacy));
      console.log(`- removed legacy ${legacy}`);
    } catch {
      /* absent */
    }
  }
}

function mergeEnv(fileEnv, procEnv, baseEnv) {
  /** File first, then root .env domain helpers, then process (CI wins). */
  const out = { ...baseEnv, ...fileEnv };
  for (const [k, v] of Object.entries(procEnv)) {
    if (v == null || v === "") continue;
    if (
      k.startsWith("LW_") ||
      k === "IDENTITY_ACCOUNTS_PROFILE" ||
      k === "LW_ACCOUNTS_PROFILE" ||
      k === "SEED_ACCOUNTS_DOMAIN" ||
      k === "SEED_DEV_ACCOUNTS_DOMAIN" ||
      k === "IDP_ISSUER" ||
      k === "IDENTITY_ENDPOINT" ||
      k === "LOGTO_M2M_APP_ID" ||
      k === "LOGTO_M2M_APP_SECRET" ||
      k === "LOGTO_MANAGEMENT_API_RESOURCE"
    ) {
      out[k] = v;
    }
  }
  return out;
}

function basename(p) {
  return p.replace(/\\/g, "/").split("/").pop() || p;
}

async function ensureJwtRolesClaim() {
  const script = `const getCustomJwtClaims = async ({ context }) => {
  const roles = (context?.user?.roles ?? []).map((r) => r.name).filter(Boolean);
  return { roles };
};`;
  try {
    await api("PUT", "/api/configs/jwt-customizer/access-token", {
      script,
      environmentVariables: {},
    });
    console.log("+ JWT access-token customizer: roles claim");
  } catch (e) {
    try {
      await api("PUT", "/api/configs/jwt-customizer/access-token", { script });
      console.log("+ JWT access-token customizer: roles claim (minimal body)");
    } catch (e2) {
      console.warn(
        `! JWT customizer skipped: ${e2 instanceof Error ? e2.message : String(e2)}. Configure roles claim in Admin if SSO mapping fails.`,
      );
    }
  }
}

async function ensureRoles(roles) {
  const existing = asList(await api("GET", "/api/roles?page=1&page_size=100&type=User"));
  const map = new Map(existing.map((r) => [r.name, r.id]));
  for (const role of roles) {
    if (map.has(role.name)) {
      console.log(`= role exists: ${role.name}`);
      continue;
    }
    const created = await api("POST", "/api/roles", {
      name: role.name,
      description: role.description,
      type: "User",
    });
    map.set(role.name, created.id);
    console.log(`+ role created: ${role.name}`);
  }
  return map;
}

async function ensureUser({ email, username, name, password: pwd }) {
  const users = asList(
    await api("GET", `/api/users?search=${encodeURIComponent(email)}&page=1&page_size=20`),
  );
  let user = users.find((u) => u.primaryEmail === email || u.username === username);
  if (!user) {
    const all = asList(await api("GET", "/api/users?page=1&page_size=100"));
    user = all.find((u) => u.primaryEmail === email || u.username === username);
  }
  if (user) {
    if (user.primaryEmail !== email || (name && user.name !== name)) {
      user = await api("PATCH", `/api/users/${user.id}`, {
        primaryEmail: email,
        ...(name ? { name } : {}),
      });
      console.log(`~ updated ${username}: ${email}`);
    }
    return user;
  }
  return management.createUser({
    primaryEmail: email,
    username,
    password: pwd,
    name,
  });
}

async function ensureUserHasRole(roleId, userId, roleName, email) {
  try {
    await api("POST", `/api/roles/${roleId}/users`, { userIds: [userId] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/422|409|already|exist/i.test(msg)) {
      console.warn(`! assign ${roleName} → ${email}: ${msg}`);
    }
  }
}

function api(method, path, body) {
  return management.request(method, path, body);
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function loadEnvFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* missing file */
  }
  return out;
}
