/**
 * Apply LuminaryWorks branding to Logto Admin Console sign-in (admin tenant).
 *
 * Sets:
 *   - logo / favicon → ${adminEndpoint}/assets/lw-logo.svg
 *     （镜像 overlay 放进 experience 静态目录，和 Console 同源，不依赖官网是否在跑）
 *   - primaryColor → #1677ff (same tokens as apply-branding.mjs)
 *
 * Admin tenant Management API uses built-in M2M app `m-admin`
 * (see lib/admin-tenant-client.mjs). Does not use LOGTO_M2M_APP_ID
 * (that is the default tenant).
 *
 * Usage: node scripts/ensure-admin-console-branding.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAdminApi,
  getAdminAccessToken,
  loadEnvFile,
  readMAdminSecret,
} from "./lib/admin-tenant-client.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fileEnv = loadEnvFile(join(root, ".env"));

function env(key, fallback = "") {
  const proc = process.env[key];
  if (proc != null && proc !== "") return String(proc);
  const fromFile = fileEnv[key];
  if (fromFile != null && fromFile !== "") return String(fromFile);
  return fallback;
}

const adminEndpoint = env("IDENTITY_ADMIN_ENDPOINT", "http://localhost:3002").replace(/\/$/, "");
const dbContainer = env("IDENTITY_DB_CONTAINER", "luminary-identity-db");
const dbUser = env("IDENTITY_DB_USER", "logto");
const dbName = env("IDENTITY_DB_NAME", "logto");

// 与 apply-branding.mjs 保持一致（tokens.css --lw-primary）
const PRIMARY = "#1677ff";
const PRIMARY_DARK = "#4593ff";

// 不用 IDENTITY_BRAND_ENDPOINT：那是官网/CDN，本地经常没起来，登录页会裂图。
const logoUrl = `${adminEndpoint}/assets/lw-logo.svg`;

/**
 * Admin Console sign-in only: shrink the 256² mark and hide “Powered by Logto”.
 * Logto hashes CSS-module class names, so match on substring (same idea as SOCIAL_ROW_CSS).
 */
const ADMIN_SIGN_IN_CSS = `
#app div[class*='logoWrapper'] img,
#app img[class*='logo'] {
  height: 40px !important;
  width: auto !important;
  max-width: 40px !important;
  object-fit: contain;
}
#app div[class*='signature'],
#app [class*='logto_signature'] {
  display: none !important;
}
`.trim();

console.log(`· Admin Console logo: ${logoUrl}`);

try {
  const appSecret = readMAdminSecret({ dbContainer, dbUser, dbName });
  const token = await getAdminAccessToken(adminEndpoint, appSecret);
  const api = createAdminApi(adminEndpoint);

  await api(token, "PATCH", "/api/sign-in-exp", {
    color: { primaryColor: PRIMARY, isDarkModeEnabled: true, darkPrimaryColor: PRIMARY_DARK },
    branding: { logoUrl, darkLogoUrl: logoUrl, favicon: logoUrl, darkFavicon: logoUrl },
    customCss: ADMIN_SIGN_IN_CSS,
  });

  try {
    await api(token, "PATCH", "/api/sign-in-exp", { hideLogtoBranding: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`· hideLogtoBranding skipped (Cloud paid / older OSS): ${detail}`);
  }

  console.log("✓ Admin Console sign-in branding updated");
  console.log(`  logo: ${logoUrl}`);
  console.log(`  primary: ${PRIMARY} (dark: ${PRIMARY_DARK})`);
  console.log(`  preview: ${adminEndpoint}/sign-in?app_id=admin-console`);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`✗ Admin Console sign-in branding failed: ${detail}`);
  console.error("  Check Admin is up: docker compose ps  (endpoint IDENTITY_ADMIN_ENDPOINT)");
  console.error(`  Endpoint: ${adminEndpoint}`);
  console.error(`  DB: docker exec ${dbContainer} … applications.id = 'm-admin'`);
  console.error("  Re-run: node scripts/ensure-logto-admin.mjs && node scripts/ensure-admin-console-branding.mjs");
  process.exit(1);
}
