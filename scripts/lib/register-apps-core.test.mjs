import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOERFLOW_API_INDICATOR,
  DOERFLOW_INTEGRATION_ROLE_NAME,
  DOERFLOW_INTEGRATION_SCOPES,
  PRODUCT_M2M_APP_NAMES,
  parseAppsCatalog,
} from "./apps-catalog.mjs";
import { registerIdentityApps } from "./register-apps-core.mjs";

const appsPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "apps.json");

test("registerIdentityApps creates DoerFlow resource, scopes, shared role, and two M2M apps without persisting secrets", async () => {
  const catalog = parseAppsCatalog(JSON.parse(readFileSync(appsPath, "utf8")));
  const logto = createFakeLogto();
  const first = await registerIdentityApps({ api: logto.api, catalog });
  const second = await registerIdentityApps({ api: logto.api, catalog });

  assert.equal(first.apiResources["DoerFlow API"], DOERFLOW_API_INDICATOR);
  assert.equal(typeof first.m2m[PRODUCT_M2M_APP_NAMES.vistacastService], "string");
  assert.equal(typeof first.m2m[PRODUCT_M2M_APP_NAMES.syncrobrainGateway], "string");
  assert.notEqual(
    first.m2m[PRODUCT_M2M_APP_NAMES.vistacastService],
    first.m2m[PRODUCT_M2M_APP_NAMES.syncrobrainGateway],
  );
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(first).includes("super-secret"), false);
  assert.equal(logto.secretsWritten, 0);

  const resource = [...logto.resources.values()].find((item) => item.indicator === DOERFLOW_API_INDICATOR);
  const scopeNames = [...logto.scopes.values()]
    .filter((scope) => scope.resourceId === resource.id)
    .map((scope) => scope.name);
  for (const scope of DOERFLOW_INTEGRATION_SCOPES) {
    assert.ok(scopeNames.includes(scope));
  }

  const role = [...logto.roles.values()].find((item) => item.name === DOERFLOW_INTEGRATION_ROLE_NAME);
  assert.equal(role.type, "MachineToMachine");
  const vistaId = first.m2m[PRODUCT_M2M_APP_NAMES.vistacastService];
  const syncroId = first.m2m[PRODUCT_M2M_APP_NAMES.syncrobrainGateway];
  assert.ok(logto.appRoles.get(vistaId)?.has(role.id));
  assert.ok(logto.appRoles.get(syncroId)?.has(role.id));

  const createAppCalls = logto.calls.filter(
    (call) => call.method === "POST" && call.path === "/api/applications",
  );
  assert.equal(createAppCalls.filter((call) => call.body.type === "MachineToMachine").length, 2);
});

function createFakeLogto() {
  const apps = [];
  const resources = new Map();
  const scopes = new Map();
  const roles = new Map();
  const roleScopes = new Map();
  const appRoles = new Map();
  const calls = [];
  let seq = 1;

  function id(prefix) {
    return `${prefix}-${seq++}`;
  }

  async function api(method, path, body) {
    calls.push({ method, path, body });
    const [pathname, query] = path.split("?");
    if (method === "GET" && pathname === "/api/applications") return apps;
    if (method === "GET" && pathname === "/api/resources") return [...resources.values()];
    if (method === "GET" && pathname === "/api/roles") return [...roles.values()];

    const resourceScopes = pathname.match(/^\/api\/resources\/([^/]+)\/scopes$/);
    if (resourceScopes) {
      const resourceId = resourceScopes[1];
      if (method === "GET") {
        return [...scopes.values()].filter((scope) => scope.resourceId === resourceId);
      }
      if (method === "POST") {
        const scope = { id: id("scope"), resourceId, name: body.name, description: body.description };
        scopes.set(scope.id, scope);
        return scope;
      }
    }

    const roleScopeMatch = pathname.match(/^\/api\/roles\/([^/]+)\/scopes$/);
    if (roleScopeMatch) {
      const roleId = roleScopeMatch[1];
      if (method === "GET") {
        return [...(roleScopes.get(roleId) ?? [])].map((scopeId) => scopes.get(scopeId));
      }
      if (method === "POST") {
        const current = roleScopes.get(roleId) ?? new Set();
        for (const scopeId of body.scopeIds) current.add(scopeId);
        roleScopes.set(roleId, current);
        return { success: true };
      }
    }

    const appRoleMatch = pathname.match(/^\/api\/applications\/([^/]+)\/roles$/);
    if (appRoleMatch) {
      const applicationId = appRoleMatch[1];
      if (method === "GET") {
        return [...(appRoles.get(applicationId) ?? [])].map((roleId) => roles.get(roleId));
      }
      if (method === "POST") {
        const current = appRoles.get(applicationId) ?? new Set();
        for (const roleId of body.roleIds) current.add(roleId);
        appRoles.set(applicationId, current);
        return { success: true };
      }
    }

    const appPatch = pathname.match(/^\/api\/applications\/([^/]+)$/);
    if (method === "PATCH" && appPatch) {
      const app = apps.find((item) => item.id === appPatch[1]);
      Object.assign(app, body);
      return app;
    }

    if (method === "POST" && pathname === "/api/applications") {
      const created = {
        id: id("app"),
        name: body.name,
        type: body.type,
        description: body.description,
        oidcClientMetadata: body.oidcClientMetadata ?? { redirectUris: [], postLogoutRedirectUris: [] },
      };
      if (body.type === "MachineToMachine") created.secret = "super-secret";
      apps.push(created);
      return created;
    }

    if (method === "POST" && pathname === "/api/resources") {
      const created = { id: id("res"), name: body.name, indicator: body.indicator };
      resources.set(created.id, created);
      return created;
    }

    if (method === "POST" && pathname === "/api/roles") {
      const created = {
        id: id("role"),
        name: body.name,
        type: body.type,
        description: body.description,
      };
      roles.set(created.id, created);
      roleScopes.set(created.id, new Set());
      return created;
    }

    throw new Error(`unhandled ${method} ${path} ${query ?? ""}`);
  }

  return { api, calls, resources, scopes, roles, appRoles, secretsWritten: 0 };
}
