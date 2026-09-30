import assert from "node:assert/strict";
import test from "node:test";
import { decideAuthMailPolicy, emailAuthEnabled } from "./auth-mail-policy.mjs";

test("dev profile leaves auth mail off unless explicitly enabled", () => {
  assert.equal(emailAuthEnabled({ profile: "dev", env: {} }), false);
  assert.equal(emailAuthEnabled({ profile: "product", env: {} }), true);
  assert.equal(emailAuthEnabled({ profile: "product", env: { EMAIL_AUTH_ENABLED: "0" } }), false);
  assert.equal(emailAuthEnabled({ profile: "dev", argv: ["--on"], env: {} }), true);
});

test("enabled policy is adaptive email MFA, not tenant Mandatory TOTP", () => {
  const on = decideAuthMailPolicy(true);
  assert.equal(on.connector, "upsert");
  assert.equal(on.mfa.policy, "NoPrompt");
  assert.equal(on.mfa.organizationRequiredMfaPolicy, "Mandatory");
  assert.equal(on.adaptiveMfa.enabled, true);
  assert.ok(on.mfa.factors.includes("EmailVerificationCode"));
  assert.equal(on.mfa.policy === "Mandatory", false);

  const off = decideAuthMailPolicy(false);
  assert.equal(off.connector, "remove");
  assert.deepEqual(off.mfa.factors, []);
  assert.equal(off.adaptiveMfa.enabled, false);
});
