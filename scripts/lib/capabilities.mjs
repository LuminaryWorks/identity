export const IdentityManagementCapability = Object.freeze({
  REQUEST: "request",
  USER_GET: "user.get",
  USER_CREATE: "user.create",
  USER_DISABLE: "user.disable",
  USER_ENABLE: "user.enable",
  USER_INVITE: "user.invite",
  ORGANIZATION_MANAGE: "organization.manage",
  ROLE_MANAGE: "role.manage",
});

export function createIdentityManagementCapabilities(supported = []) {
  const supportedSet = new Set(supported);
  return Object.freeze(
    Object.fromEntries(
      Object.values(IdentityManagementCapability).map((capability) => [
        capability,
        supportedSet.has(capability),
      ]),
    ),
  );
}
