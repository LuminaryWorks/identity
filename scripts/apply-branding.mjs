/**
 * Apply LuminaryWorks branding to Logto default sign-in experience.
 *
 * Sets:
 *   - logo / favicon → https://cdn.luminaryworks.dev/logo/luminaryworks-logo.svg
 *   - primaryColor → #1677ff (tokens.css --lw-primary)
 *
 * Override logo base with IDENTITY_BRAND_ENDPOINT (no trailing slash).
 *
 * Usage: node scripts/apply-branding.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(join(root, ".env"));
const endpoint = (env.IDENTITY_ENDPOINT || "http://localhost:3001").replace(/\/$/, "");
const brandBase = (env.IDENTITY_BRAND_ENDPOINT || "https://cdn.luminaryworks.dev/logo").replace(
  /\/$/,
  "",
);
const appId = env.LOGTO_M2M_APP_ID;
const appSecret = env.LOGTO_M2M_APP_SECRET;
const resource = env.LOGTO_MANAGEMENT_API_RESOURCE || "https://default.logto.app/api";

const PRIMARY = "#1677ff";
const PRIMARY_DARK = "#4593ff";
const logoUrl = `${brandBase}/luminaryworks-logo.svg`;

/** Row + wrap social buttons; auto-adapts when more connectors (X / Feishu / QQ) are enabled. */
const SOCIAL_ROW_CSS = `
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
`.trim();

if (!appId || !appSecret) {
  console.error("✗ Missing LOGTO_M2M_APP_ID/SECRET. Run bootstrap-m2m.mjs first.");
  process.exit(1);
}

const token = await getToken();
const body = {
  color: {
    primaryColor: PRIMARY,
    isDarkModeEnabled: true,
    darkPrimaryColor: PRIMARY_DARK,
  },
  branding: {
    logoUrl,
    darkLogoUrl: logoUrl,
    favicon: logoUrl,
    darkFavicon: logoUrl,
  },
  customCss: SOCIAL_ROW_CSS,
};

const res = await fetch(`${endpoint}/api/sign-in-exp`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`✗ PATCH /api/sign-in-exp → ${res.status} ${text}`);
  process.exit(1);
}

console.log("✓ Sign-in branding updated");
console.log(`  logo: ${logoUrl}`);
console.log(`  primary: ${PRIMARY} (dark: ${PRIMARY_DARK})`);
console.log(`  customCss: social buttons row + wrap`);
console.log(`  preview: ${endpoint}/sign-in`);

async function getToken() {
  const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const res = await fetch(`${endpoint}/oidc/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      resource,
      scope: "all",
    }),
  });
  if (!res.ok) throw new Error(`Token failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
