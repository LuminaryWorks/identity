export const DOERFLOW_API_NAME = "DoerFlow API";
export const DOERFLOW_API_INDICATOR = "https://api.doerflow.local";
export const LEGACY_VIBEAGENT_API_INDICATOR = "https://api.vibeagent.local";

export const DOERFLOW_INTEGRATION_SCOPES = Object.freeze([
  "integration.provider.register",
  "integration.event.submit",
  "integration.callback.read",
]);

export const DOERFLOW_INTEGRATION_SCOPE_DESCRIPTIONS = Object.freeze({
  "integration.provider.register":
    "Register or update DoerFlow integration provider offerings",
  "integration.event.submit":
    "Submit integration events that may create DoerFlow tasks",
  "integration.callback.read":
    "Read signed job/task lifecycle callbacks and correlation status",
});

export const PRODUCT_M2M_APP_NAMES = Object.freeze({
  vistacastService: "VistaCast Service",
  syncrobrainGateway: "SyncroBrain Gateway",
});

export const DOERFLOW_INTEGRATION_ROLE_NAME = "DoerFlow Integration Caller";

const SECRET_KEYS = new Set([
  "secret",
  "clientSecret",
  "client_secret",
  "appSecret",
  "app_secret",
]);

export function parseAppsCatalog(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("apps.json root must be an object");
  }
  assertNoSecrets(raw, "apps.json");

  const spaApplications = asArray(raw.spaApplications, "spaApplications");
  const apiResources = asArray(raw.apiResources, "apiResources");
  const m2mApplications = asArray(raw.m2mApplications ?? [], "m2mApplications");

  const spas = spaApplications.map((app, index) => parseSpa(app, index));
  const resources = apiResources.map((resource, index) => parseApiResource(resource, index));
  const m2m = m2mApplications.map((app, index) => parseM2m(app, index, resources));

  const doerflow = resources.find((resource) => resource.indicator === DOERFLOW_API_INDICATOR);
  if (!doerflow) {
    throw new Error(`apiResources must include ${DOERFLOW_API_NAME} (${DOERFLOW_API_INDICATOR})`);
  }
  for (const scope of DOERFLOW_INTEGRATION_SCOPES) {
    if (!doerflow.scopes.some((item) => item.name === scope)) {
      throw new Error(`${DOERFLOW_API_NAME} must declare scope ${scope}`);
    }
  }

  const m2mNames = new Set(m2m.map((app) => app.name));
  for (const requiredName of Object.values(PRODUCT_M2M_APP_NAMES)) {
    if (!m2mNames.has(requiredName)) {
      throw new Error(`m2mApplications must include ${requiredName}`);
    }
  }

  return {
    spaApplications: spas,
    apiResources: resources,
    m2mApplications: m2m,
  };
}

export function publicAppRegistrationResult(result) {
  const publicResult = {
    spa: { ...(result?.spa ?? {}) },
    apiResources: { ...(result?.apiResources ?? {}) },
    m2m: { ...(result?.m2m ?? {}) },
  };
  assertNoSecrets(publicResult, "registered-apps.json");
  return publicResult;
}

export function assertNoSecrets(value, label, path = "") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, label, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (SECRET_KEYS.has(key) && hasSecretValue(child)) {
        throw new Error(`${label} must not contain ${nextPath}`);
      }
      assertNoSecrets(child, label, nextPath);
    }
  }
}

function parseSpa(app, index) {
  if (!app || typeof app !== "object") {
    throw new Error(`spaApplications[${index}] must be an object`);
  }
  if (app.type && app.type !== "SPA") {
    throw new Error(`spaApplications[${index}] type must be SPA`);
  }
  const redirectUris = asStringArray(app.redirectUris, `spaApplications[${index}].redirectUris`);
  if (redirectUris.length === 0) {
    throw new Error(`spaApplications[${index}] requires redirectUris`);
  }
  return {
    name: requiredName(app.name, `spaApplications[${index}]`),
    type: "SPA",
    redirectUris,
    postLogoutRedirectUris: asStringArray(
      app.postLogoutRedirectUris ?? [],
      `spaApplications[${index}].postLogoutRedirectUris`,
    ),
  };
}

function parseApiResource(resource, index) {
  if (!resource || typeof resource !== "object") {
    throw new Error(`apiResources[${index}] must be an object`);
  }
  const scopes = (resource.scopes ?? []).map((scope, scopeIndex) => {
    if (typeof scope === "string") {
      return {
        name: scope,
        description: DOERFLOW_INTEGRATION_SCOPE_DESCRIPTIONS[scope] ?? scope,
      };
    }
    if (!scope || typeof scope !== "object" || !scope.name) {
      throw new Error(`apiResources[${index}].scopes[${scopeIndex}] requires name`);
    }
    return {
      name: String(scope.name),
      description: String(scope.description ?? scope.name),
    };
  });
  return {
    name: requiredName(resource.name, `apiResources[${index}]`),
    indicator: requiredName(resource.indicator, `apiResources[${index}].indicator`),
    scopes,
  };
}

function parseM2m(app, index, resources) {
  if (!app || typeof app !== "object") {
    throw new Error(`m2mApplications[${index}] must be an object`);
  }
  if (app.type !== "MachineToMachine") {
    throw new Error(`m2mApplications[${index}] type must be MachineToMachine`);
  }
  if (app.redirectUris && asStringArray(app.redirectUris, `m2mApplications[${index}].redirectUris`).length > 0) {
    throw new Error(
      `m2mApplications[${index}] must not set redirect/callback URIs; M2M uses the token endpoint`,
    );
  }
  if (
    app.postLogoutRedirectUris &&
    asStringArray(app.postLogoutRedirectUris, `m2mApplications[${index}].postLogoutRedirectUris`).length > 0
  ) {
    throw new Error(`m2mApplications[${index}] must not set postLogoutRedirectUris`);
  }

  const resourceIndicator = requiredName(
    app.resourceIndicator,
    `m2mApplications[${index}].resourceIndicator`,
  );
  if (resourceIndicator !== DOERFLOW_API_INDICATOR) {
    throw new Error(
      `m2mApplications[${index}] audience/resourceIndicator must be ${DOERFLOW_API_INDICATOR}`,
    );
  }
  const resource = resources.find((item) => item.indicator === resourceIndicator);
  if (!resource) {
    throw new Error(`m2mApplications[${index}] resourceIndicator is not in apiResources`);
  }

  const scopes = asStringArray(app.scopes, `m2mApplications[${index}].scopes`);
  for (const requiredScope of DOERFLOW_INTEGRATION_SCOPES) {
    if (!scopes.includes(requiredScope)) {
      throw new Error(`m2mApplications[${index}] must include scope ${requiredScope}`);
    }
  }
  const known = new Set(resource.scopes.map((scope) => scope.name));
  for (const scope of scopes) {
    if (!known.has(scope)) {
      throw new Error(`m2mApplications[${index}] scope ${scope} is not defined on ${resource.name}`);
    }
  }

  return {
    name: requiredName(app.name, `m2mApplications[${index}]`),
    type: "MachineToMachine",
    description: String(app.description ?? ""),
    resourceIndicator,
    scopes,
    roleName: String(app.roleName ?? DOERFLOW_INTEGRATION_ROLE_NAME),
  };
}

function asArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function asStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return value;
}

function requiredName(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} requires a non-empty name`);
  }
  return value.trim();
}

function hasSecretValue(value) {
  if (typeof value === "string") return value.trim().length > 0;
  return value != null;
}
