import {
  DOERFLOW_INTEGRATION_ROLE_NAME,
  publicAppRegistrationResult,
} from "./apps-catalog.mjs";

export async function registerIdentityApps({ api, catalog }) {
  const existingApps = await listAll(api, "/api/applications");
  const existingResources = await listAll(api, "/api/resources");
  const existingRoles = await listAll(api, "/api/roles");

  const result = { spa: {}, apiResources: {}, m2m: {} };
  const resourcesByIndicator = new Map();

  for (const spa of catalog.spaApplications) {
    result.spa[spa.name] = await ensureSpaApp(api, existingApps, spa);
  }

  for (const resource of catalog.apiResources) {
    const ensured = await ensureApiResource(api, existingResources, resource);
    resourcesByIndicator.set(resource.indicator, ensured);
    result.apiResources[resource.name] = resource.indicator;
  }

  for (const m2m of catalog.m2mApplications) {
    const resource = resourcesByIndicator.get(m2m.resourceIndicator);
    if (!resource) {
      throw new Error(`Missing API resource ${m2m.resourceIndicator} for M2M ${m2m.name}`);
    }
    const role = await ensureM2mRole(api, existingRoles, m2m, resource);
    const appId = await ensureM2mApp(api, existingApps, m2m);
    await ensureAppRole(api, appId, role.id);
    result.m2m[m2m.name] = appId;
  }

  return publicAppRegistrationResult(result);
}

async function ensureSpaApp(api, existingApps, spa) {
  const found = existingApps.find((app) => app.name === spa.name);
  if (found) {
    const desiredRedirects = spa.redirectUris ?? [];
    const desiredLogout = spa.postLogoutRedirectUris ?? [];
    const currentRedirects = found.oidcClientMetadata?.redirectUris ?? [];
    const currentLogout = found.oidcClientMetadata?.postLogoutRedirectUris ?? [];
    const sameRedirects =
      JSON.stringify([...currentRedirects].sort()) === JSON.stringify([...desiredRedirects].sort());
    const sameLogout =
      JSON.stringify([...currentLogout].sort()) === JSON.stringify([...desiredLogout].sort());
    if (!sameRedirects || !sameLogout) {
      await api("PATCH", `/api/applications/${found.id}`, {
        oidcClientMetadata: {
          redirectUris: desiredRedirects,
          postLogoutRedirectUris: desiredLogout,
        },
      });
    }
    return found.id;
  }
  const created = await api("POST", "/api/applications", {
    name: spa.name,
    type: "SPA",
    oidcClientMetadata: {
      redirectUris: spa.redirectUris,
      postLogoutRedirectUris: spa.postLogoutRedirectUris ?? [],
    },
  });
  existingApps.push(created);
  return created.id;
}

async function ensureApiResource(api, existingResources, resource) {
  let found = existingResources.find((item) => item.indicator === resource.indicator);
  if (!found) {
    found = await api("POST", "/api/resources", {
      name: resource.name,
      indicator: resource.indicator,
    });
    existingResources.push(found);
  }

  const scopes = asList(
    await api("GET", `/api/resources/${found.id}/scopes?page=1&page_size=100`),
  );
  if (resource.scopes.length > 0) {
    for (const scope of resource.scopes) {
      if (!scopes.some((item) => item.name === scope.name)) {
        const created = await api("POST", `/api/resources/${found.id}/scopes`, {
          name: scope.name,
          description: scope.description,
        });
        scopes.push(created);
      }
    }
  } else if (!scopes.length) {
    const created = await api("POST", `/api/resources/${found.id}/scopes`, {
      name: "access",
      description: "Default API access scope",
    });
    scopes.push(created);
  }
  return { ...found, scopes };
}

async function ensureM2mRole(api, existingRoles, m2m, resource) {
  const roleName = m2m.roleName || DOERFLOW_INTEGRATION_ROLE_NAME;
  let role = existingRoles.find(
    (item) => item.name === roleName && item.type === "MachineToMachine",
  );
  if (!role) {
    role = await api("POST", "/api/roles", {
      name: roleName,
      description:
        m2m.roleDescription ||
        "M2M role for VistaCast Service and SyncroBrain Gateway calling DoerFlow integration APIs",
      type: "MachineToMachine",
    });
    existingRoles.push(role);
  }

  const attached = asList(await api("GET", `/api/roles/${role.id}/scopes`));
  const attachedIds = new Set(attached.map((scope) => scope.id));
  const wanted = resource.scopes.filter((scope) => m2m.scopes.includes(scope.name));
  const missing = wanted.filter((scope) => !attachedIds.has(scope.id)).map((scope) => scope.id);
  if (missing.length > 0) {
    await api("POST", `/api/roles/${role.id}/scopes`, { scopeIds: missing });
  }
  return role;
}

async function ensureM2mApp(api, existingApps, m2m) {
  const found = existingApps.find(
    (app) => app.name === m2m.name && app.type === "MachineToMachine",
  );
  if (found) return found.id;
  const created = await api("POST", "/api/applications", {
    name: m2m.name,
    type: "MachineToMachine",
    description: m2m.description,
    oidcClientMetadata: {
      redirectUris: [],
      postLogoutRedirectUris: [],
    },
  });
  if (created.secret) {
    console.warn(
      `+ M2M created: ${m2m.name} (${created.id}). Copy the client secret from Logto Admin; it is not written to disk.`,
    );
  } else {
    console.log(`+ M2M created: ${m2m.name} (${created.id})`);
  }
  existingApps.push({ ...created, type: "MachineToMachine", name: m2m.name });
  return created.id;
}

async function ensureAppRole(api, applicationId, roleId) {
  const assigned = asList(await api("GET", `/api/applications/${applicationId}/roles`));
  if (assigned.some((role) => role.id === roleId)) return;
  await api("POST", `/api/applications/${applicationId}/roles`, { roleIds: [roleId] });
}

async function listAll(api, path) {
  const items = [];
  let page = 1;
  const pageSize = 100;
  const separator = path.includes("?") ? "&" : "?";
  while (true) {
    const batch = asList(await api("GET", `${path}${separator}page=${page}&page_size=${pageSize}`));
    items.push(...batch);
    if (batch.length < pageSize) break;
    page += 1;
  }
  return items;
}

export function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
