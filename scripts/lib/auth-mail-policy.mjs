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
      // Logto OSS 1.22 enum is UserControlled | Mandatory (no NoPrompt).
      mfa: {
        factors: [],
        policy: "UserControlled",
      },
      adaptiveMfa: { enabled: false },
      forgotPasswordMethods: [],
    };
  }
  return {
    connector: "upsert",
    // Factors empty by default so register/login is not blocked on optional MFA
    // bind. Headless SPA skips via /profile/mfa/mfa-skipped when factors return.
    // Logto OSS 1.22 MFA factors: Totp | WebAuthn | BackupCode (email OTP is
    // forgotPassword / experience verify, not an MFA factor enum value).
    mfa: {
      factors: [],
      policy: "UserControlled",
    },
    adaptiveMfa: { enabled: true },
    forgotPasswordMethods: ["EmailVerificationCode"],
  };
}
