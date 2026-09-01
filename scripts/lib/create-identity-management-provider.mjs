import { resolveIamProvider } from "./iam-provider.mjs";
import { LogtoManagementProvider } from "./logto-management-provider.mjs";
import { UnsupportedIdentityManagementProvider } from "./unsupported-identity-management-provider.mjs";

/**
 * Select the shipped Identity Management plugin.
 * Unknown / reserved providers return an adapter with zero capabilities
 * (`IDENTITY_CAPABILITY_UNSUPPORTED`) — never a silent no-op.
 */
export function createIdentityManagementProvider(options = {}) {
  const iam = resolveIamProvider(options.provider);
  if (iam.management === "logto") {
    return new LogtoManagementProvider(options);
  }
  return new UnsupportedIdentityManagementProvider(iam.id);
}
