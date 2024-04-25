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

const env = readEnvMap();
const endpoint = (env.IDENTITY_ENDPOINT || "http://localhost:3001").replace(/\/$/, "");
const appId = env.LOGTO_M2M_APP_ID;
const appSecret = env.LOGTO_M2M_APP_SECRET;
const resource = env.LOGTO_MANAGEMENT_API_RESOURCE || "https://default.logto.app/api";

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

const patch = {
  signIn: {
    ...(current.signIn || {}),
    methods: desiredMethods,
  },
  ...(socialTargets.length ? { socialSignInConnectorTargets: socialTargets } : {}),
  customCss: `
#app div[class*='socialLinkList'] {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap;
  gap: 12px;
  align-items: stretch;
}
#app div[class*='socialLinkList'] > button,
#app div[class*='socialLinkList'] > div[class*='socialLinkButton'] {
  margin-bottom: 0 !important;
  flex: 1 1 calc(50% - 6px);
  min-width: min(140px, 100%);
}
`.trim(),
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
if (socialTargets.length) {
  console.log(
    "✓ Social sign-in targets:",
    (updated.socialSignInConnectorTargets || []).join(", ") || "(none)",
  );
  for (const c of connectors.filter((x) => socialTargets.includes(x.target))) {
    console.log(`  ${c.target} callback: ${endpoint}/callback/${c.id}`);
  }
  console.log("✓ customCss: social buttons row + wrap (auto-adapts for new connectors)");
} else {
  console.log("· No social connectors found — configure Google/GitHub in Admin, then re-run.");
}
