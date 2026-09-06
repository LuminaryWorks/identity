/**
 * Readiness contract for the Identity service.
 *
 * Identity is a packaged Logto container, so it does not expose the
 * `/health` + `/ready` + `/version` triple that LuminaryWorks NestJS services
 * implement. Its honest equivalent is the OIDC discovery document plus the JWKS
 * endpoint: if both answer with a usable payload, products can validate tokens.
 *
 * These helpers are pure so the contract is unit-testable without a running
 * container; `scripts/probe-readiness.mjs` wires them to `fetch`.
 */

export const IDENTITY_SERVICE_NAME = "luminary-identity";

/** Contract versions this deployment speaks, as declared in a Control Manifest. */
export const IDENTITY_API_VERSION = "v1";
export const IDENTITY_SCHEMA_VERSION = "1";

/** Discovery fields a product needs before it can validate a token. */
const REQUIRED_DISCOVERY_FIELDS = [
  "issuer",
  "authorization_endpoint",
  "token_endpoint",
  "jwks_uri",
];

export function discoveryUrl(issuer) {
  return `${String(issuer).replace(/\/$/, "")}/.well-known/openid-configuration`;
}

/**
 * Validates a discovery document. An `issuer` mismatch is fatal: products
 * validate JWT `iss` against the configured issuer, so a silently rewritten
 * issuer would make every token fail — or, worse, be accepted from the wrong
 * provider.
 */
export function evaluateDiscovery({ issuer, document }) {
  const problems = [];
  if (!document || typeof document !== "object") {
    return { ok: false, problems: ["discovery document is not a JSON object"] };
  }

  for (const field of REQUIRED_DISCOVERY_FIELDS) {
    if (typeof document[field] !== "string" || document[field].trim() === "") {
      problems.push(`missing ${field}`);
    }
  }

  const expected = String(issuer).replace(/\/$/, "");
  const actual = String(document.issuer ?? "").replace(/\/$/, "");
  if (actual !== "" && actual !== expected) {
    problems.push(`issuer mismatch: expected ${expected}, document says ${actual}`);
  }

  return { ok: problems.length === 0, problems };
}

/** A JWKS with no signing key cannot verify anything. */
export function evaluateJwks(document) {
  if (!document || typeof document !== "object" || !Array.isArray(document.keys)) {
    return { ok: false, problems: ["jwks document has no keys array"] };
  }
  if (document.keys.length === 0) {
    return { ok: false, problems: ["jwks contains no keys"] };
  }
  return { ok: true, problems: [] };
}

/**
 * Combines check results into the same shape the NestJS services return from
 * `/ready`, so operators and preflight scripts read one format.
 *
 * @param {{ name: string, status: "up" | "down" | "skipped", detail?: string }[]} checks
 */
export function buildReadinessReport(checks) {
  const failed = checks.filter((check) => check.status === "down").map((check) => check.name);
  const ready = failed.length === 0;
  return {
    statusCode: ready ? 200 : 503,
    payload: {
      status: ready ? "ready" : "not_ready",
      service: IDENTITY_SERVICE_NAME,
      apiVersion: IDENTITY_API_VERSION,
      schemaVersion: IDENTITY_SCHEMA_VERSION,
      checks,
      ...(ready ? {} : { failed }),
    },
  };
}

/**
 * Probes discovery + JWKS. Never throws: a probe that crashes is
 * indistinguishable from a healthy service in a shell pipeline.
 */
export async function probeIdentity({ issuer, fetchImpl, timeoutMs = 3000 }) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const checks = [];

  const fetchJson = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(url, { signal: controller.signal });
      if (!response.ok) return { error: `HTTP ${response.status}` };
      return { json: await response.json() };
    } catch (err) {
      return {
        error:
          err?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : String(err?.message ?? err),
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const discovery = await fetchJson(discoveryUrl(issuer));
  if (discovery.error) {
    checks.push({ name: "oidc_discovery", status: "down", detail: discovery.error });
    return buildReadinessReport(checks);
  }

  const discoveryResult = evaluateDiscovery({ issuer, document: discovery.json });
  checks.push({
    name: "oidc_discovery",
    status: discoveryResult.ok ? "up" : "down",
    ...(discoveryResult.ok ? {} : { detail: discoveryResult.problems.join("; ") }),
  });

  const jwksUri = discovery.json?.jwks_uri;
  if (typeof jwksUri !== "string" || jwksUri.trim() === "") {
    checks.push({ name: "jwks", status: "down", detail: "discovery has no jwks_uri" });
    return buildReadinessReport(checks);
  }

  const jwks = await fetchJson(jwksUri);
  if (jwks.error) {
    checks.push({ name: "jwks", status: "down", detail: jwks.error });
    return buildReadinessReport(checks);
  }

  const jwksResult = evaluateJwks(jwks.json);
  checks.push({
    name: "jwks",
    status: jwksResult.ok ? "up" : "down",
    ...(jwksResult.ok ? {} : { detail: jwksResult.problems.join("; ") }),
  });

  return buildReadinessReport(checks);
}
