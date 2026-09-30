/**
 * Turn organization MFA on or off.
 *
 *   node scripts/ensure-org-mfa.mjs --org=<logtoOrganizationId>
 *   node scripts/ensure-org-mfa.mjs --org=<id> --off
 *
 * Requires ensure-auth-mail --on so members can satisfy MFA with email / TOTP / passkey.
 * Tenant-wide Mandatory TOTP is not enabled here.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...readEnvMap(join(root, ".env")), ...process.env };
const endpoint = (env.IDENTITY_ENDPOINT || "http://localhost:3001").replace(/\/$/, "");
const appId = env.LOGTO_M2M_APP_ID;
const appSecret = env.LOGTO_M2M_APP_SECRET;
const resource = env.LOGTO_MANAGEMENT_API_RESOURCE || "https://default.logto.app/api";
const args = process.argv.slice(2);
const orgArg = args.find((arg) => arg.startsWith("--org="));
const orgId = orgArg?.slice("--org=".length);
const required = !args.includes("--off");

if (!appId || !appSecret) {
  console.error("✗ Missing LOGTO_M2M_APP_ID/SECRET. Run bootstrap-m2m.mjs first.");
  process.exit(1);
}
if (!orgId) {
  console.error("✗ Pass --org=<logtoOrganizationId>");
  process.exit(1);
}
if (required && (env.EMAIL_AUTH_ENABLED === "0" || env.EMAIL_AUTH_ENABLED === "false")) {
  console.warn("· EMAIL_AUTH_ENABLED is off. Members of this org may be unable to complete MFA.");
}

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
const { access_token: accessToken } = await tokenRes.json();
const res = await fetch(`${endpoint}/api/organizations/${orgId}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ isMfaRequired: required }),
});
const text = await res.text();
if (!res.ok) {
  console.error("✗ PATCH organization failed", res.status, text);
  process.exit(1);
}
console.log(`✓ organization ${orgId} isMfaRequired=${required}`);
console.log("  members follow organizationRequiredMfaPolicy from ensure-auth-mail");

function readEnvMap(path) {
  const map = {};
  try {
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
  } catch {
    /* missing .env */
  }
  return map;
}
