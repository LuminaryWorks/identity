/**
 * Verify Logto social connectors + direct_sign_in redirect targets.
 *
 * Checks:
 * 1) Google/GitHub connectors exist with clientId
 * 2) socialSignInConnectorTargets includes them
 * 3) OIDC authorize with direct_sign_in=social:<target> leaves Logto password UI
 *    and lands on accounts.google.com / github.com (or reports redirect_uri_mismatch)
 *
 * Usage (from identity/): node scripts/verify-social-direct-signin.mjs
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

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

class CookieJar {
  /** @type {Map<string, string>} */
  #map = new Map();

  absorb(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const pair = line.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) this.#map.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }

  header() {
    return [...this.#map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
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

const connectors = await (
  await fetch(`${endpoint}/api/connectors`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
).json();
const sie = await (
  await fetch(`${endpoint}/api/sign-in-exp`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
).json();

const apps = JSON.parse(readFileSync(join(root, "registered-apps.json"), "utf8"));
const spaClientId = apps?.spa?.["DataView (DataLuminary)"] || Object.values(apps?.spa || {})[0];
if (!spaClientId) {
  console.error("✗ No SPA client id in registered-apps.json");
  process.exit(1);
}

const targets = ["google", "github"];
let failed = 0;

console.log(`IdP: ${endpoint}`);
console.log(`SPA client: ${spaClientId}`);
console.log(`SIE social targets: ${(sie.socialSignInConnectorTargets || []).join(", ") || "(empty)"}`);
console.log("");

for (const target of targets) {
  const connector = connectors.find((c) => c.target === target);
  if (!connector) {
    console.error(`✗ ${target}: connector missing — create in Admin → Connectors → Social`);
    failed += 1;
    continue;
  }
  if (!connector.config?.clientId) {
    console.error(`✗ ${target}: clientId empty — paste OAuth client credentials in connector`);
    failed += 1;
    continue;
  }
  const enabled = (sie.socialSignInConnectorTargets || []).includes(target);
  if (!enabled) {
    console.error(
      `✗ ${target}: not on socialSignInConnectorTargets — run node scripts/ensure-sign-in-experience.mjs`,
    );
    failed += 1;
    continue;
  }
  console.log(`✓ ${target}: connector ${connector.id}`);
  console.log(`  OAuth callback (paste into Google/GitHub app): ${endpoint}/callback/${connector.id}`);

  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = "http://localhost:3003/auth/callback";

  const authUrl = new URL(`${endpoint}/oidc/auth`);
  authUrl.searchParams.set("client_id", spaClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("direct_sign_in", `social:${target}`);
  authUrl.searchParams.set("prompt", "login");

  const jar = new CookieJar();
  const hops = [];
  let url = authUrl.toString();
  let finalUrl = url;

  for (let i = 0; i < 8; i += 1) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: jar.header() ? { cookie: jar.header() } : {},
    });
    jar.absorb(res);
    const location = res.headers.get("location");
    hops.push(`${res.status} ${location ? `→ ${location.slice(0, 140)}` : "(no Location)"}`);
    if (!location) {
      finalUrl = url;
      break;
    }
    finalUrl = location.startsWith("http") ? location : new URL(location, url).toString();
    if (/accounts\.google\.com|github\.com\/login\/oauth|redirect_uri_mismatch|error=/i.test(finalUrl)) {
      break;
    }
    url = finalUrl;
  }

  // Logto serves a small Experience shell at /direct/social/<target> which then
  // client-navigates to Google/GitHub. Server-side fetch cannot follow that hop.
  const onDirectShell = new RegExp(`/direct/social/${target}(?:\\?|$)`, "i").test(finalUrl);
  const onProvider =
    (target === "google" && /accounts\.google\.com/i.test(finalUrl)) ||
    (target === "github" && /github\.com\/login\/oauth/i.test(finalUrl));

  if (onProvider) {
    console.log(`  ✓ direct_sign_in reaches ${target} provider`);
  } else if (onDirectShell) {
    console.log(`  ✓ direct_sign_in entered /direct/social/${target} (provider hop is browser-side)`);
  } else if (/redirect_uri_mismatch/i.test(finalUrl)) {
    console.error(`  ✗ Provider rejected callback URL. Fix OAuth app Authorization callback URL to:`);
    console.error(`    ${endpoint}/callback/${connector.id}`);
    failed += 1;
  } else if (/\/sign-in/i.test(finalUrl)) {
    console.error(`  ✗ Fell back to Logto password sign-in (direct_sign_in failed for ${target})`);
    console.error(`    hops:\n    - ${hops.join("\n    - ")}`);
    failed += 1;
  } else {
    console.error(`  ✗ Unexpected location after direct_sign_in:`);
    console.error(`    ${finalUrl.slice(0, 220)}`);
    console.error(`    hops:\n    - ${hops.join("\n    - ")}`);
    failed += 1;
  }
  console.log("");
}

if (failed) {
  console.error(`✗ Social verification failed (${failed} issue(s)).`);
  console.error("See identity/README.md → Social login (Google / GitHub).");
  process.exit(1);
}
console.log("✓ Social connector + direct_sign_in checks passed (authorize → provider).");
console.log("  Complete a real login in the product SPA to finish end-to-end.");
