/**
 * Install or remove the Logto HTTP Email connector and apply tiered MFA.
 *
 *   node scripts/ensure-auth-mail.mjs --on
 *   node scripts/ensure-auth-mail.mjs --off
 *
 * --on requires NOTIFICATION_EMAIL_ENDPOINT and NOTIFICATION_SERVICE_KEY.
 * Daily sign-in stays password-primary; registration verify follows the connector
 * (ensure-sign-in-experience.mjs). This script does not enable tenant Mandatory TOTP.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decideAuthMailPolicy, emailAuthEnabled } from "./lib/auth-mail-policy.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = readEnvMap(join(root, ".env"));
const env = { ...envFile, ...process.env };
const endpoint = (env.IDENTITY_ENDPOINT || "http://localhost:3001").replace(/\/$/, "");
const appId = env.LOGTO_M2M_APP_ID;
const appSecret = env.LOGTO_M2M_APP_SECRET;
const resource = env.LOGTO_MANAGEMENT_API_RESOURCE || "https://default.logto.app/api";
const profile = env.IDENTITY_ACCOUNTS_PROFILE || "dev";
const enabled = emailAuthEnabled({ argv: process.argv.slice(2), env, profile });
const policy = decideAuthMailPolicy(enabled);

if (!appId || !appSecret) {
  console.error("✗ Missing LOGTO_M2M_APP_ID/SECRET. Run bootstrap-m2m.mjs first.");
  process.exit(1);
}

const accessToken = await fetchM2mToken();
await syncConnector();
await patchExperience();

async function syncConnector() {
  const connectors = asList(await api("GET", "/api/connectors"));
  const httpEmail = connectors.filter(
    (connector) => connector.connectorId === "http-email" || connector.target === "http-email",
  );
  if (!enabled) {
    for (const connector of httpEmail) {
      await api("DELETE", `/api/connectors/${connector.id}`);
      console.log(`- http-email: removed ${connector.id}`);
    }
    if (httpEmail.length === 0) console.log("· http-email: already absent");
    return;
  }

  const mailEndpoint = env.NOTIFICATION_EMAIL_ENDPOINT;
  const serviceKey = env.NOTIFICATION_SERVICE_KEY;
  if (!mailEndpoint || !serviceKey) {
    console.error(
      "✗ --on requires NOTIFICATION_EMAIL_ENDPOINT and NOTIFICATION_SERVICE_KEY (empty values are not written).",
    );
    process.exit(1);
  }
  const config = {
    endpoint: mailEndpoint,
    authorization: `Bearer ${serviceKey}`,
  };
  const existing = httpEmail[0];
  if (existing) {
    await api("PATCH", `/api/connectors/${existing.id}`, { config });
    console.log(`= http-email: updated ${existing.id}`);
    return;
  }
  const created = await api("POST", "/api/connectors", { connectorId: "http-email", config });
  console.log(`+ http-email: ${created.id ?? "(created)"}`);
}

async function patchExperience() {
  const body = {
    mfa: policy.mfa,
    adaptiveMfa: policy.adaptiveMfa,
    forgotPasswordMethods: policy.forgotPasswordMethods,
  };
  const updated = await patchSignIn(body);
  console.log(enabled ? "✓ Auth mail on: register OTP + adaptive Email MFA" : "✓ Auth mail off");
  console.log("  mfa policy:", updated.mfa?.policy);
  console.log("  factors:", (updated.mfa?.factors || []).join(", ") || "(none)");
  if (updated.adaptiveMfa) {
    console.log("  adaptiveMfa.enabled:", updated.adaptiveMfa.enabled === true);
  } else if (enabled) {
    console.log("· adaptiveMfa field absent; Email MFA stays optional (NoPrompt)");
  }
}

async function patchSignIn(body) {
  try {
    return await api("PATCH", "/api/sign-in-exp", body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (body.adaptiveMfa && /adaptiveMfa/i.test(message)) {
      console.warn(
        "· This Logto rejected adaptiveMfa. Falling back to optional Email MFA. No custom risk engine.",
      );
      const { adaptiveMfa, ...rest } = body;
      return patchSignIn(rest);
    }
    if (body.forgotPasswordMethods && /forgotPassword/i.test(message)) {
      console.warn("· forgotPasswordMethods rejected; sign-in experience left otherwise updated");
      const { forgotPasswordMethods, ...rest } = body;
      return patchSignIn(rest);
    }
    throw err;
  }
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

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

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
