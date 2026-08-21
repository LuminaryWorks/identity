export const IdentityManagementErrorCode = Object.freeze({
  CAPABILITY_UNSUPPORTED: "IDENTITY_CAPABILITY_UNSUPPORTED",
  INVALID_CONFIGURATION: "IDENTITY_INVALID_CONFIGURATION",
  TOKEN_REQUEST_FAILED: "IDENTITY_TOKEN_REQUEST_FAILED",
  MANAGEMENT_REQUEST_FAILED: "IDENTITY_MANAGEMENT_REQUEST_FAILED",
  INVALID_RESPONSE: "IDENTITY_INVALID_RESPONSE",
});

export class IdentityManagementError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "IdentityManagementError";
    this.code = code;
    this.status = options.status;
    this.operation = options.operation;
    this.details = options.details;
  }

  static unsupported(capability) {
    return new IdentityManagementError(
      IdentityManagementErrorCode.CAPABILITY_UNSUPPORTED,
      `Identity management capability is unsupported: ${capability}`,
      { operation: capability },
    );
  }
}
