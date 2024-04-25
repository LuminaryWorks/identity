/**
 * Ensure Logto Admin Console operator exists (admin tenant).
 *
 * This is NOT the same as platform users in ACCOUNTS.*.env (default tenant).
 * Console login: http://localhost:3002 — credentials from LW_LOGTO_ADMIN_*.
 *
 * Required env (process.env wins over identity/.env):
 *   LW_LOGTO_ADMIN_USERNAME
 *   LW_LOGTO_ADMIN_PASSWORD
 * Optional:
 *   LW_LOGTO_ADMIN_EMAIL
 *   LW_LOGTO_ADMIN_RESET_PASSWORD=1  — update password when user already exists
 *
 * Missing / placeholder password → exit 1 (fail-fast; no Welcome-page fallback).
 *
 * Usage (from identity/):
 *   node scripts/ensure-logto-admin.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const PLACEHOLDER_PASSWORDS = new Set(["", "CHANGE_ME", "changeme", "REPLACE_ME", "replace_me"]);

const fileEnv = loadEnvFile(envPath);
const envMap = mergeEnv(fileEnv, process.env);

const adminEndpoint = (
  envMap.IDENTITY_ADMIN_ENDPOINT ||
  envMap.ADMIN_ENDPOINT ||
  "http://localhost:3002"
).replace(/\/$/, "");

const dbContainer = envMap.IDENTITY_DB_CONTAINER || "luminary-identity-db";
const dbUser = envMap.IDENTITY_DB_USER || "logto";
const dbName = envMap.IDENTITY_DB_NAME || "logto";

const username = String(envMap.LW_LOGTO_ADMIN_USERNAME || "").trim();
const password = String(envMap.LW_LOGTO_ADMIN_PASSWORD || "").trim();
const email = String(envMap.LW_LOGTO_ADMIN_EMAIL || "").trim();
const resetPassword = isTruthy(envMap.LW_LOGTO_ADMIN_RESET_PASSWORD);

assertConfigured(username, password);

const mAdminSecret = readMAdminSecret();
const token = await getAdminAccessToken(mAdminSecret);
const user = await ensureAdminUser(token);
await ensureOrgMembership(token, user.id);
await ensureUserRoles(token, user.id);
await markOssOnboardingDone(token, user.id);
await ensureAdminSignInMode(token);

console.log(`✓ Logto Admin Console operator ready: ${username}`);
console.log(`  Console: ${adminEndpoint}`);
if (email) console.log(`  Email:   ${email}`);

function assertConfigured(user, pass) {
  if (!user) {
    console.error("✗ Missing LW_LOGTO_ADMIN_USERNAME.");
    printConfigHelp();
    process.exit(1);
  }
  if (!isConfiguredPassword(pass)) {
    console.error("✗ Missing or placeholder LW_LOGTO_ADMIN_PASSWORD.");
    printConfigHelp();
    process.exit(1);
  }
}

function printConfigHelp() {
  console.error("");
  console.error("  Logto Admin Console operator ≠ platform users (ACCOUNTS.*.env).");
  console.error("  Configure in identity/.env (or process env), then re-run bootstrap:");
  console.error("    LW_LOGTO_ADMIN_USERNAME=logto_admin");
  console.error("    LW_LOGTO_ADMIN_PASSWORD=…");
  console.error("    LW_LOGTO_ADMIN_EMAIL=logto.admin@luminaryworks.local   # optional");
  console.error("  See .env.example and identity/README.md.");
}

function isConfiguredPassword(value) {
  if (value == null) return false;
  const v = String(value).trim();
  return v.length > 0 && !PLACEHOLDER_PASSWORDS.has(v);
}

function isTruthy(value) {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function loadEnvFile(path) {
  const map = {};
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map[m[1]] = v;
  }
  return map;
}

function mergeEnv(fileEnv, procEnv) {
  const out = { ...fileEnv };
  for (const [k, v] of Object.entries(procEnv)) {
    if (v == null || v === "") continue;
    if (
      k.startsWith("LW_LOGTO_ADMIN_") ||
      k === "IDENTITY_ADMIN_ENDPOINT" ||
      k === "ADMIN_ENDPOINT" ||
      k === "IDENTITY_DB_CONTAINER" ||
      k === "IDENTITY_DB_USER" ||
      k === "IDENTITY_DB_NAME"
    ) {
      out[k] = v;
    }
  }
  return out;
}

function readMAdminSecret() {
  const out = execSync(
    `docker exec ${dbContainer} psql -U ${dbUser} -d ${dbName} -tAc "SET ROLE logto_tenant_logto_admin; SELECT secret FROM applications WHERE id = 'm-admin' LIMIT 1;"`,
    { encoding: "utf8" },
  );
  const secret = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && l !== "SET");
  if (!secret) {
    throw new Error(
      "Missing admin-tenant application m-admin. Is Logto DB seeded (docker compose up)?",
    );
  }
  return secret;
}

async function getAdminAccessToken(appSecret) {
  const res = await fetch(`${adminEndpoint}/oidc/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "m-admin",
      client_secret: appSecret,
      resource: "https://admin.logto.app/api",
      scope: "all",
    }),
  });
  if (!res.ok) {
    throw new Error(`Admin M2M token failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error("Admin M2M token response missing access_token");
  return data.access_token;
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && typeof payload === "object" && payload.id) return [payload];
  return [];
}

async function api(token, method, path, body) {
  const res = await fetch(`${adminEndpoint}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`${method} ${path} → ${res.status} ${detail}`);
  }
  return data;
}

async function findUser(token) {
  const users = asList(await api(token, "GET", "/api/users?page=1&page_size=100"));
  return (
    users.find((u) => u.username === username) ||
    (email ? users.find((u) => u.primaryEmail === email) : undefined)
  );
}

async function ensureAdminUser(token) {
  let user = await findUser(token);
  if (!user) {
    const body = {
      username,
      password,
      name: "Logto Admin",
      ...(email ? { primaryEmail: email } : {}),
    };
    user = await api(token, "POST", "/api/users", body);
    console.log(`+ created Admin Console user: ${username}`);
  } else {
    console.log(`= Admin Console user exists: ${username} (${user.id})`);
    if (email && user.primaryEmail !== email) {
      user = await api(token, "PATCH", `/api/users/${user.id}`, { primaryEmail: email });
      console.log(`~ updated primaryEmail → ${email}`);
    }
    if (resetPassword) {
      await api(token, "PATCH", `/api/users/${user.id}/password`, { password });
      console.log("~ password reset (LW_LOGTO_ADMIN_RESET_PASSWORD=1)");
    }
  }
  return user;
}

async function ensureOrgMembership(token, userId) {
  const members = asList(
    await api(token, "GET", "/api/organizations/t-default/users?page=1&page_size=100"),
  );
  if (!members.some((u) => u.id === userId)) {
    await api(token, "POST", "/api/organizations/t-default/users", { userIds: [userId] });
    console.log("+ added to organization t-default");
  }
  try {
    await api(token, "POST", "/api/organizations/t-default/users/roles", {
      userIds: [userId],
      organizationRoleIds: ["admin"],
    });
    console.log("+ organization role admin");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Idempotent: already assigned often returns 422
    if (!/\b422\b/.test(msg) && !/already|exist/i.test(msg)) throw e;
    console.log("= organization role admin already set");
  }
}

async function ensureUserRoles(token, userId) {
  const roles = asList(await api(token, "GET", "/api/roles?type=User&page=1&page_size=50"));
  const needed = ["user", "default:admin"];
  const roleIds = needed
    .map((name) => roles.find((r) => r.name === name)?.id)
    .filter(Boolean);
  if (roleIds.length === 0) {
    throw new Error('Admin tenant missing roles "user" / "default:admin"');
  }

  const existing = asList(await api(token, "GET", `/api/users/${userId}/roles`));
  const existingIds = new Set(existing.map((r) => r.id));
  const missing = roleIds.filter((id) => !existingIds.has(id));
  if (missing.length === 0) {
    console.log("= user roles ok:", needed.join(", "));
    return;
  }
  await api(token, "POST", `/api/users/${userId}/roles`, { roleIds: missing });
  console.log("+ assigned user roles:", needed.join(", "));
}

async function markOssOnboardingDone(token, userId) {
  await api(token, "PATCH", `/api/users/${userId}/custom-data`, {
    customData: {
      ossOnboarding: { isOnboardingDone: true },
      onboarding: { isOnboardingDone: true },
    },
  });
  console.log("+ OSS onboarding marked done");
}

async function ensureAdminSignInMode(token) {
  await api(token, "PATCH", "/api/sign-in-exp", { signInMode: "SignIn" });
  console.log("= admin sign-in mode: SignIn");
}
