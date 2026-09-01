import { IdentityManagementProvider } from "./identity-management-provider.mjs";

export class UnsupportedIdentityManagementProvider extends IdentityManagementProvider {
  constructor(providerId = "unknown") {
    super([]);
    this.provider = providerId;
  }
}
