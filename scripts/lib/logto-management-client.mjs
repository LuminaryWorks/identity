import {
  IdentityManagementError,
  IdentityManagementErrorCode,
} from "./identity-management-error.mjs";

const DEFAULT_RESOURCE = "https://default.logto.app/api";

export class LogtoManagementClient {
  constructor(options) {
    const {
      endpoint,
      clientId,
      clientSecret,
      resource = DEFAULT_RESOURCE,
      scope = "all",
      fetch: fetchImplementation = globalThis.fetch,
      now = Date.now,
      tokenSkewMs = 30_000,
    } = options ?? {};

    if (!endpoint || !clientId || !clientSecret || typeof fetchImplementation !== "function") {
      throw new IdentityManagementError(
        IdentityManagementErrorCode.INVALID_CONFIGURATION,
        "Logto Management client requires endpoint, clientId, clientSecret, and fetch",
      );
    }

    this.endpoint = endpoint.replace(/\/$/, "");
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.resource = resource;
    this.scope = scope;
    this.fetch = fetchImplementation;
    this.now = now;
    this.tokenSkewMs = tokenSkewMs;
    this.cachedToken = undefined;
    this.tokenRequest = undefined;
  }

  clearTokenCache() {
    this.cachedToken = undefined;
  }

  async getAccessToken() {
    if (this.cachedToken && this.cachedToken.expiresAt - this.tokenSkewMs > this.now()) {
      return this.cachedToken.accessToken;
    }
    if (this.tokenRequest) return this.tokenRequest;

    this.tokenRequest = this.requestAccessToken().finally(() => {
      this.tokenRequest = undefined;
    });
    return this.tokenRequest;
  }

  async request(method, path, options = {}) {
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new IdentityManagementError(
        IdentityManagementErrorCode.INVALID_CONFIGURATION,
        "Logto Management API path must start with /",
        { operation: `${method} ${path}` },
      );
    }

    const normalizedMethod = String(method).toUpperCase();
    let response = await this.send(normalizedMethod, path, options);
    if (response.status === 401) {
      this.clearTokenCache();
      response = await this.send(normalizedMethod, path, options);
    }
    return parseManagementResponse(response, `${normalizedMethod} ${path}`);
  }

  async send(method, path, options) {
    const accessToken = await this.getAccessToken();
    const hasBody = options.body !== undefined;
    try {
      return await this.fetch(`${this.endpoint}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
        body: hasBody ? JSON.stringify(options.body) : undefined,
      });
    } catch (cause) {
      throw new IdentityManagementError(
        IdentityManagementErrorCode.MANAGEMENT_REQUEST_FAILED,
        `${method} ${path} failed before receiving a response`,
        { cause, operation: `${method} ${path}` },
      );
    }
  }

  async requestAccessToken() {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    let response;
    try {
      response = await this.fetch(`${this.endpoint}/oidc/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          resource: this.resource,
          scope: this.scope,
        }),
      });
    } catch (cause) {
      throw new IdentityManagementError(
        IdentityManagementErrorCode.TOKEN_REQUEST_FAILED,
        "Logto M2M token request failed",
        { cause, operation: "token" },
      );
    }

    const text = await response.text();
    if (!response.ok) {
      throw new IdentityManagementError(
        IdentityManagementErrorCode.TOKEN_REQUEST_FAILED,
        `Logto M2M token request failed with status ${response.status}`,
        { status: response.status, operation: "token", details: text },
      );
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (cause) {
      throw new IdentityManagementError(
        IdentityManagementErrorCode.INVALID_RESPONSE,
        "Logto M2M token response was not valid JSON",
        { cause, operation: "token" },
      );
    }
    if (!payload.access_token) {
      throw new IdentityManagementError(
        IdentityManagementErrorCode.INVALID_RESPONSE,
        "Logto M2M token response did not contain access_token",
        { operation: "token" },
      );
    }

    const expiresInSeconds = Number(payload.expires_in);
    const ttlMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? expiresInSeconds * 1_000
      : 300_000;
    this.cachedToken = {
      accessToken: payload.access_token,
      expiresAt: this.now() + ttlMs,
    };
    return this.cachedToken.accessToken;
  }
}

async function parseManagementResponse(response, operation) {
  const text = await response.text();
  if (!response.ok) {
    throw new IdentityManagementError(
      IdentityManagementErrorCode.MANAGEMENT_REQUEST_FAILED,
      `${operation} failed with status ${response.status}`,
      { status: response.status, operation, details: text },
    );
  }
  if (response.status === 204 || !text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
