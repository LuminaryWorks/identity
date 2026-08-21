import { IdentityManagementCapability } from "./capabilities.mjs";
import { IdentityManagementProvider } from "./identity-management-provider.mjs";
import { LogtoManagementClient } from "./logto-management-client.mjs";

const LOGTO_CAPABILITIES = [
  IdentityManagementCapability.REQUEST,
  IdentityManagementCapability.USER_GET,
  IdentityManagementCapability.USER_CREATE,
  IdentityManagementCapability.USER_DISABLE,
  IdentityManagementCapability.USER_ENABLE,
];

export class LogtoManagementProvider extends IdentityManagementProvider {
  constructor(options = {}) {
    super(LOGTO_CAPABILITIES);
    this.client = options.client ?? new LogtoManagementClient(options);
  }

  request(method, path, body) {
    this.assertCapability(IdentityManagementCapability.REQUEST);
    return this.client.request(method, path, {
      ...(body === undefined ? {} : { body }),
    });
  }

  getUser(userId) {
    this.assertCapability(IdentityManagementCapability.USER_GET);
    return this.request("GET", `/api/users/${encodeURIComponent(userId)}`);
  }

  createUser(user) {
    this.assertCapability(IdentityManagementCapability.USER_CREATE);
    return this.request("POST", "/api/users", user);
  }

  disableUser(userId) {
    this.assertCapability(IdentityManagementCapability.USER_DISABLE);
    return this.request("PATCH", `/api/users/${encodeURIComponent(userId)}`, {
      isSuspended: true,
    });
  }

  enableUser(userId) {
    this.assertCapability(IdentityManagementCapability.USER_ENABLE);
    return this.request("PATCH", `/api/users/${encodeURIComponent(userId)}`, {
      isSuspended: false,
    });
  }
}
