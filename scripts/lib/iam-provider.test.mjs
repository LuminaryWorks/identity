import assert from "node:assert/strict";
import test from "node:test";
import { IdentityManagementCapability } from "./capabilities.mjs";
import { createIdentityManagementProvider } from "./create-identity-management-provider.mjs";
import {
  IdentityManagementError,
  IdentityManagementErrorCode,
} from "./identity-management-error.mjs";
import {
  assertLogtoManagementPlugin,
  DEFAULT_IAM_PROVIDER,
  IAM_PROVIDER_STATUS,
  resolveIamProvider,
} from "./iam-provider.mjs";
import { LogtoManagementProvider } from "./logto-management-provider.mjs";
import { UnsupportedIdentityManagementProvider } from "./unsupported-identity-management-provider.mjs";

test("IAM catalog freezes Logto as the default shipped provider", () => {
  const logto = resolveIamProvider();
  assert.equal(DEFAULT_IAM_PROVIDER, "logto");
  assert.equal(logto.id, "logto");
  assert.equal(logto.status, IAM_PROVIDER_STATUS.shipped);
  assert.equal(logto.management, "logto");
  assert.equal(logto.loginExperience, "logto");
  assert.equal(logto.license, "MPL-2.0");
});

test("ZITADEL is a reserved plugin that reuses hosted OIDC, not a Logto replacement", () => {
  const zitadel = resolveIamProvider("zitadel");
  assert.equal(zitadel.id, "zitadel");
  assert.equal(zitadel.status, IAM_PROVIDER_STATUS.reserved);
  assert.equal(zitadel.runtimeMode, "external_oidc");
  assert.equal(zitadel.loginExperience, "hosted");
  assert.equal(zitadel.management, null);
  assert.equal(zitadel.license, "AGPL-3.0");
  assert.equal(resolveIamProvider("external_oidc").id, "oidc");
});

test("identity compose Management API refuses unshipped plugins", () => {
  assert.equal(assertLogtoManagementPlugin({ IAM_PROVIDER: "logto" }).id, "logto");
  assert.throws(
    () => assertLogtoManagementPlugin({ IAM_PROVIDER: "zitadel" }),
    /ships Logto only/,
  );
});

test("management factory returns Logto or a zero-capability adapter", () => {
  const logto = createIdentityManagementProvider({
    provider: "logto",
    client: { request: async () => ({}) },
  });
  assert.ok(logto instanceof LogtoManagementProvider);
  assert.equal(logto.supports(IdentityManagementCapability.USER_CREATE), true);

  const zitadel = createIdentityManagementProvider({ provider: "zitadel" });
  assert.ok(zitadel instanceof UnsupportedIdentityManagementProvider);
  assert.equal(zitadel.supports(IdentityManagementCapability.REQUEST), false);
  assert.throws(
    () => zitadel.createUser({ primaryEmail: "user@example.com" }),
    (error) =>
      error instanceof IdentityManagementError &&
      error.code === IdentityManagementErrorCode.CAPABILITY_UNSUPPORTED,
  );
});
