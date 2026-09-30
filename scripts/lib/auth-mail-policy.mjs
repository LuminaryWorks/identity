/**
 * Tiered auth-mail policy for Logto sign-in experience.
 * Bootstrap uses this instead of tenant-wide Mandatory TOTP.
 */

export function emailAuthEnabled({ argv = [], env = {}, profile = "dev" }) {
  if (argv.includes("--off")) return false;
  if (argv.includes("--on")) return true;
  const raw = String(env.EMAIL_AUTH_ENABLED ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return profile === "product";
}

export function decideAuthMailPolicy(enabled) {
  if (!enabled) {
    return {
      connector: "remove",
      mfa: {
        factors: [],
        policy: "NoPrompt",
        organizationRequiredMfaPolicy: "NoPrompt",
      },
      adaptiveMfa: { enabled: false },
      forgotPasswordMethods: [],
    };
  }
  return {
    connector: "upsert",
    mfa: {
      factors: ["EmailVerificationCode", "Totp", "WebAuthn", "BackupCode"],
      policy: "NoPrompt",
      organizationRequiredMfaPolicy: "Mandatory",
    },
    adaptiveMfa: { enabled: true },
    forgotPasswordMethods: ["EmailVerificationCode"],
  };
}
