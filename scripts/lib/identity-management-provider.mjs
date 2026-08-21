import {
  createIdentityManagementCapabilities,
  IdentityManagementCapability,
} from "./capabilities.mjs";
import { IdentityManagementError } from "./identity-management-error.mjs";

export class IdentityManagementProvider {
  constructor(supportedCapabilities = []) {
    if (new.target === IdentityManagementProvider) {
      throw new TypeError("IdentityManagementProvider is abstract");
    }
    this.capabilities = createIdentityManagementCapabilities(supportedCapabilities);
  }

  supports(capability) {
    return this.capabilities[capability] === true;
  }

  assertCapability(capability) {
    if (!this.supports(capability)) {
      throw IdentityManagementError.unsupported(capability);
    }
  }

  request() {
    this.assertCapability(IdentityManagementCapability.REQUEST);
    throw new TypeError("request() must be implemented by the identity management provider");
  }

  getUser() {
    this.assertCapability(IdentityManagementCapability.USER_GET);
    throw new TypeError("getUser() must be implemented by the identity management provider");
  }

  createUser() {
    this.assertCapability(IdentityManagementCapability.USER_CREATE);
    throw new TypeError("createUser() must be implemented by the identity management provider");
  }

  disableUser() {
    this.assertCapability(IdentityManagementCapability.USER_DISABLE);
    throw new TypeError("disableUser() must be implemented by the identity management provider");
  }

  enableUser() {
    this.assertCapability(IdentityManagementCapability.USER_ENABLE);
    throw new TypeError("enableUser() must be implemented by the identity management provider");
  }

  inviteUser() {
    throw IdentityManagementError.unsupported(IdentityManagementCapability.USER_INVITE);
  }
}
