/**
 * Bootstrap a default-tenant M2M app for Logto Management API,
 * write credentials to identity/.env, then run register-apps.mjs.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

const appId = `lw${Math.random().toString(36).slice(2, 11)}${Math.random().toString(36).slice(2, 12)}`.slice(0, 21);
const secret = Array.from({ length: 32 }, () => Math.random().toString(36)[2] || "x").join("");
const roleLinkId = `${appId}r`.slice(0, 21);

const sql = `
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
VALUES ('default', '${roleLinkId}', '${appId}', 'hjqrx0z09qr83xatrwa3u');
SELECT id, name, type FROM applications WHERE id='${appId}';
`;

console.log("Creating M2M app", appId);
const out = execSync("docker exec -i luminary-identity-db psql -U logto -d logto", {
  input: sql,
  encoding: "utf8",
});
console.log(out);

let env = readFileSync(envPath, "utf8");
if (!/LOGTO_M2M_APP_ID=/.test(env)) env += "\nLOGTO_M2M_APP_ID=\n";
if (!/LOGTO_M2M_APP_SECRET=/.test(env)) env += "\nLOGTO_M2M_APP_SECRET=\n";
env = env.replace(/LOGTO_M2M_APP_ID=.*/, `LOGTO_M2M_APP_ID=${appId}`);
env = env.replace(/LOGTO_M2M_APP_SECRET=.*/, `LOGTO_M2M_APP_SECRET=${secret}`);
writeFileSync(envPath, env);
console.log("Wrote", envPath);

// Verify token
const basic = Buffer.from(`${appId}:${secret}`).toString("base64");
const tokenRes = await fetch("http://localhost:3001/oidc/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    resource: "https://default.logto.app/api",
    scope: "all",
  }),
});
const tokenText = await tokenRes.text();
if (!tokenRes.ok) {
  console.error("Token failed:", tokenRes.status, tokenText);
  process.exit(1);
}
console.log("Token OK");

console.log("Running register-apps.mjs …");
execSync("node scripts/register-apps.mjs", { cwd: root, stdio: "inherit" });
