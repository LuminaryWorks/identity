/**
 * Ensure a default-tenant M2M app for Logto Management API exists and works,
 * write credentials to identity/.env, then run register-apps.mjs.
 *
 * - Missing / empty LOGTO_M2M_* → create M2M in Postgres
 * - Present but invalid (e.g. DB was recreated) → recreate M2M
 * - Present and valid → skip create, just register apps
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const endpoint = (
  readEnvMap().IDENTITY_ENDPOINT ||
  "http://localhost:3001"
).replace(/\/$/, "");
const resource = readEnvMap().LOGTO_MANAGEMENT_API_RESOURCE || "https://default.logto.app/api";

function readEnvMap() {
  const map = {};
  if (!existsEnv()) return map;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

function existsEnv() {
  try {
    readFileSync(envPath);
    return true;
  } catch {
    return false;
  }
}

async function tryToken(appId, secret) {
  if (!appId || !secret) return false;
  const basic = Buffer.from(`${appId}:${secret}`).toString("base64");
  try {
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
    if (!tokenRes.ok) return false;
    const { access_token: accessToken } = await tokenRes.json();
    if (!accessToken) return false;
    // Token can succeed without Management API role; probe the API.
    const probe = await fetch(`${endpoint}/api/applications?page=1&page_size=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return probe.ok;
  } catch {
    return false;
  }
}

function writeM2mCreds(appId, secret) {
  let env = readFileSync(envPath, "utf8");
  if (!/LOGTO_M2M_APP_ID=/.test(env)) env += "\nLOGTO_M2M_APP_ID=\n";
  if (!/LOGTO_M2M_APP_SECRET=/.test(env)) env += "\nLOGTO_M2M_APP_SECRET=\n";
  env = env.replace(/LOGTO_M2M_APP_ID=.*/, `LOGTO_M2M_APP_ID=${appId}`);
  env = env.replace(/LOGTO_M2M_APP_SECRET=.*/, `LOGTO_M2M_APP_SECRET=${secret}`);
  writeFileSync(envPath, env);
  console.log("Wrote", envPath);
}

function resolveManagementApiRoleId() {
  const out = execSync(
    'docker exec luminary-identity-db psql -U logto -d logto -tAc "SET ROLE logto_tenant_logto_default; SELECT id FROM roles WHERE name = \'Logto Management API access\' AND type = \'MachineToMachine\' LIMIT 1;"',
    { encoding: "utf8" },
  );
  const roleId = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && l !== "SET");
  if (!roleId) {
    throw new Error(
      'Missing Logto role "Logto Management API access". Is the identity DB freshly initialized?',
    );
  }
  return roleId;
}

function createM2m() {
  const appId = `lw${Math.random().toString(36).slice(2, 11)}${Math.random().toString(36).slice(2, 12)}`.slice(0, 21);
  const secret = Array.from({ length: 32 }, () => Math.random().toString(36)[2] || "x").join("");
  const roleLinkId = `${appId}r`.slice(0, 21);
  const roleId = resolveManagementApiRoleId();

  const sql = `
\\set ON_ERROR_STOP on
SET ROLE logto_tenant_logto_default;
INSERT INTO applications (tenant_id, id, name, secret, description, type, oidc_client_metadata)
VALUES (
  'default',
  '${appId}',
  'LuminaryWorks Dev M2M',
  '${secret}',
  'Bootstrap M2M for register-apps',
  'MachineToMachine',
  '{"redirectUris":[],"postLogoutRedirectUris":[]}'
);
INSERT INTO applications_roles (tenant_id, id, application_id, role_id)
VALUES ('default', '${roleLinkId}', '${appId}', '${roleId}');
SELECT id, name, type FROM applications WHERE id='${appId}';
`;

  console.log("Creating M2M app", appId, "(role", roleId + ")");
  const out = execSync("docker exec -i luminary-identity-db psql -U logto -d logto", {
    input: sql,
    encoding: "utf8",
  });
  console.log(out);
  writeM2mCreds(appId, secret);
  return { appId, secret };
}

const env = readEnvMap();
const existingId = env.LOGTO_M2M_APP_ID;
const existingSecret = env.LOGTO_M2M_APP_SECRET;

if (await tryToken(existingId, existingSecret)) {
  console.log("M2M credentials OK:", existingId);
} else {
  if (existingId) {
    console.warn(
      `M2M credentials invalid or stale (${existingId}); recreating Management API M2M …`,
    );
  } else {
    console.log("No M2M credentials; bootstrapping default-tenant M2M …");
  }
  const { appId, secret } = createM2m();
  if (!(await tryToken(appId, secret))) {
    console.error("Token failed after M2M create");
    process.exit(1);
  }
  console.log("Token OK");
}

console.log("Running register-apps.mjs …");
execSync("node scripts/register-apps.mjs", { cwd: root, stdio: "inherit" });
