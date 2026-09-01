/**
 * Keep in sync with shared/packages/auth-core/src/iam-provider.ts
 *
 * Frozen default: Logto (MPL-2.0). ZITADEL is a reserved plugin id — login may
 * reuse hosted OIDC later; identity compose Management API stays Logto-only until
 * a real ZITADEL plugin ships. Do not add empty vendor adapters.
 */

export const DEFAULT_IAM_PROVIDER = "logto";

export const IAM_PROVIDER_STATUS = Object.freeze({
  shipped: "shipped",
  reserved: "plugin-reserved",
  devOnly: "dev-only",
});

export const IAM_PROVIDER_CATALOG = Object.freeze({
  logto: Object.freeze({
    id: "logto",
    status: IAM_PROVIDER_STATUS.shipped,
    runtimeMode: "logto",
    loginExperience: "logto",
    management: "logto",
    license: "MPL-2.0",
  }),
  oidc: Object.freeze({
    id: "oidc",
    status: IAM_PROVIDER_STATUS.shipped,
    runtimeMode: "external_oidc",
    loginExperience: "hosted",
    management: null,
    license: undefined,
  }),
  zitadel: Object.freeze({
    id: "zitadel",
    status: IAM_PROVIDER_STATUS.reserved,
    runtimeMode: "external_oidc",
    loginExperience: "hosted",
    management: null,
    license: "AGPL-3.0",
  }),
  legacy: Object.freeze({
    id: "legacy",
    status: IAM_PROVIDER_STATUS.devOnly,
    runtimeMode: "legacy",
    loginExperience: "hosted",
    management: null,
    license: undefined,
  }),
});

const IAM_PROVIDER_ALIASES = Object.freeze({
  logto: "logto",
  oidc: "oidc",
  external_oidc: "oidc",
  hosted: "oidc",
  zitadel: "zitadel",
  legacy: "legacy",
});

export function normalizeIamProviderId(input) {
  const key = String(input ?? DEFAULT_IAM_PROVIDER).trim().toLowerCase();
  const id = IAM_PROVIDER_ALIASES[key];
  if (!id) {
    throw new Error(
      `Unknown IAM_PROVIDER "${input}". Shipped: logto (default), oidc. Reserved plugin: zitadel. Dev-only: legacy.`,
    );
  }
  return id;
}

export function resolveIamProvider(input) {
  return IAM_PROVIDER_CATALOG[normalizeIamProviderId(input)];
}

export function resolveIamProviderFromEnv(env = process.env) {
  return resolveIamProvider(env.IAM_PROVIDER ?? env.IDP_MODE ?? DEFAULT_IAM_PROVIDER);
}

export function assertLogtoManagementPlugin(env = process.env) {
  const iam = resolveIamProviderFromEnv(env);
  if (iam.management !== "logto") {
    throw new Error(
      `identity compose Management API ships Logto only (IAM_PROVIDER=${iam.id}). ` +
        "ZITADEL is a reserved plugin: hosted OIDC login can be selected later, but register/seed stay on Logto until a real management plugin ships.",
    );
  }
  return iam;
}
