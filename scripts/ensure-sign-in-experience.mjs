/**
 * Ensure Logto sign-in experience accepts email OR username + password,
 * and enables configured social connectors (google / github) on the SIE.
 * Fixes hosted UI "The username is invalid" when users enter an email.
 * Fixes Headless `direct_sign_in=social:*` falling back to password UI when
 * socialSignInConnectorTargets is empty.
 *
 * Usage (from identity/): node scripts/ensure-sign-in-experience.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

function readEnvMap() {
  const map = {};
  try {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) map[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  } catch {
    /* missing .env */
  }
  return map;
}

const envFile = readEnvMap();
const endpoint = (
  process.env.IDENTITY_ENDPOINT ||
  envFile.IDENTITY_ENDPOINT ||
  "http://localhost:3001"
).replace(/\/$/, "");
const appId = process.env.LOGTO_M2M_APP_ID || envFile.LOGTO_M2M_APP_ID;
const appSecret = process.env.LOGTO_M2M_APP_SECRET || envFile.LOGTO_M2M_APP_SECRET;
const resource =
  process.env.LOGTO_MANAGEMENT_API_RESOURCE ||
  envFile.LOGTO_MANAGEMENT_API_RESOURCE ||
  "https://default.logto.app/api";

if (!appId || !appSecret) {
  console.error("✗ Missing LOGTO_M2M_APP_ID/SECRET. Run bootstrap-m2m.mjs first.");
  process.exit(1);
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

const getRes = await fetch(`${endpoint}/api/sign-in-exp`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!getRes.ok) {
  console.error("✗ GET sign-in-exp failed", getRes.status, await getRes.text());
  process.exit(1);
}
const current = await getRes.json();

const desiredMethods = [
  {
    identifier: "email",
    password: true,
    verificationCode: false,
    isPasswordPrimary: true,
  },
  {
    identifier: "username",
    password: true,
    verificationCode: false,
    isPasswordPrimary: true,
  },
];

const connectorsRes = await fetch(`${endpoint}/api/connectors`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!connectorsRes.ok) {
  console.error("✗ GET connectors failed", connectorsRes.status, await connectorsRes.text());
  process.exit(1);
}
const connectors = await connectorsRes.json();
const socialTargets = [
  ...new Set(
    (Array.isArray(connectors) ? connectors : [])
      .filter((c) => c?.target && (c.type === "Social" || c.target === "google" || c.target === "github"))
      .map((c) => c.target),
  ),
];

const connectorsHaveEmail = (Array.isArray(connectors) ? connectors : []).some(
  (c) =>
    c?.type === "Email" ||
    String(c?.target || "").toLowerCase() === "email" ||
    String(c?.connectorId || "").toLowerCase().includes("email") ||
    String(c?.id || "").toLowerCase().includes("email"),
);

const patch = {
  signIn: {
    ...(current.signIn || {}),
    methods: desiredMethods,
  },
  // Username always; email when an Email connector exists (verification required).
  signUp: {
    identifiers: connectorsHaveEmail
      ? ["email", "username"]
      : ["username"],
    password: true,
    verify: Boolean(connectorsHaveEmail),
  },
  ...(socialTargets.length ? { socialSignInConnectorTargets: socialTargets } : {}),
  // customCss 由 apply-branding.mjs 唯一维护，此处不写入以免互相覆盖。
};

const patchRes = await fetch(`${endpoint}/api/sign-in-exp`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(patch),
});
if (!patchRes.ok) {
  console.error("✗ PATCH sign-in-exp failed", patchRes.status, await patchRes.text());
  process.exit(1);
}

const updated = await patchRes.json();
console.log("✓ Sign-in experience: email + username password enabled");
console.log(
  "  methods:",
  (updated.signIn?.methods || []).map((m) => m.identifier).join(", "),
);
console.log(
  "✓ Sign-up:",
  (updated.signUp?.identifiers || []).join(", ") || "(none)",
  updated.signUp?.password ? "+ password" : "",
  updated.signUp?.verify ? "+ verify" : "",
  connectorsHaveEmail ? "(email connector detected)" : "(username-only until Email connector is configured)",
);
if (socialTargets.length) {
  console.log(
    "✓ Social sign-in targets:",
    (updated.socialSignInConnectorTargets || []).join(", ") || "(none)",
  );
  for (const c of connectors.filter((x) => socialTargets.includes(x.target))) {
    console.log(`  ${c.target} callback: ${endpoint}/callback/${c.id}`);
  }
} else {
  console.log("· No social connectors found — configure Google/GitHub in Admin, then re-run.");
}
