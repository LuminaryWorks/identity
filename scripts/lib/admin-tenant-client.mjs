/**
 * Admin-tenant Management API helpers (built-in M2M app `m-admin`).
 *
 * Used by ensure-logto-admin.mjs and ensure-admin-console-branding.mjs.
 * Default-tenant M2M (`LOGTO_M2M_APP_ID`) cannot call this API.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export function loadEnvFile(path) {
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

export function readMAdminSecret({ dbContainer, dbUser, dbName, secret } = {}) {
  // 生产安装把脚本丢进纯 node 容器，里面没有 docker CLI。
  // 宿主读好 secret 后经 LOGTO_ADMIN_M2M_SECRET 传入。
  const provided = String(secret ?? process.env.LOGTO_ADMIN_M2M_SECRET ?? "").trim();
  if (provided) return provided;
  const out = execSync(
    `docker exec ${dbContainer} psql -U ${dbUser} -d ${dbName} -tAc "SET ROLE logto_tenant_logto_admin; SELECT secret FROM applications WHERE id = 'm-admin' LIMIT 1;"`,
    { encoding: "utf8" },
  );
  const fromDb = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && l !== "SET");
  if (!fromDb) {
    throw new Error(
      "Missing admin-tenant application m-admin. Is Logto DB seeded (docker compose up)?",
    );
  }
  return fromDb;
}

export async function getAdminAccessToken(adminEndpoint, appSecret) {
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

export function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && typeof payload === "object" && payload.id) return [payload];
  return [];
}

/**
 * Bind admin-tenant Management API calls to an endpoint.
 * Returned `api(token, method, path, body)` matches the previous local helper.
 */
export function createAdminApi(adminEndpoint) {
  return async function api(token, method, path, body) {
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
  };
}
