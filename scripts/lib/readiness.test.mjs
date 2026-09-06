import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReadinessReport,
  discoveryUrl,
  evaluateDiscovery,
  evaluateJwks,
  probeIdentity,
} from "./readiness.mjs";

const ISSUER = "http://localhost:3001/oidc";

function discoveryDocument(overrides = {}) {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/auth`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
    ...overrides,
  };
}

test("discovery url is built from the issuer", () => {
  assert.equal(
    discoveryUrl("http://localhost:3001/oidc/"),
    "http://localhost:3001/oidc/.well-known/openid-configuration",
  );
});

test("a complete discovery document is ready", () => {
  assert.deepEqual(evaluateDiscovery({ issuer: ISSUER, document: discoveryDocument() }), {
    ok: true,
    problems: [],
  });
});

test("a missing endpoint is reported", () => {
  const document = discoveryDocument();
  delete document.jwks_uri;
  const result = evaluateDiscovery({ issuer: ISSUER, document });
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ["missing jwks_uri"]);
});

test("an issuer mismatch is fatal", () => {
  const result = evaluateDiscovery({
    issuer: ISSUER,
    document: discoveryDocument({ issuer: "http://other:3001/oidc" }),
  });
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /issuer mismatch/);
});

test("an empty jwks cannot verify tokens", () => {
  assert.equal(evaluateJwks({ keys: [] }).ok, false);
  assert.equal(evaluateJwks({}).ok, false);
  assert.equal(evaluateJwks({ keys: [{ kid: "a" }] }).ok, true);
});

test("readiness report mirrors the NestJS /ready shape", () => {
  const ok = buildReadinessReport([{ name: "oidc_discovery", status: "up" }]);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.payload.status, "ready");
  assert.equal(ok.payload.apiVersion, "v1");

  const bad = buildReadinessReport([{ name: "jwks", status: "down", detail: "HTTP 503" }]);
  assert.equal(bad.statusCode, 503);
  assert.deepEqual(bad.payload.failed, ["jwks"]);
});

test("probe reports ready when discovery and jwks answer", async () => {
  const report = await probeIdentity({
    issuer: ISSUER,
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith("/jwks") ? { keys: [{ kid: "abc" }] } : discoveryDocument(),
    }),
  });
  assert.equal(report.statusCode, 200);
  assert.deepEqual(
    report.payload.checks.map((check) => check.name),
    ["oidc_discovery", "jwks"],
  );
});

test("probe reports not ready when discovery is unreachable", async () => {
  const report = await probeIdentity({
    issuer: ISSUER,
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(report.statusCode, 503);
  assert.equal(report.payload.checks[0].detail, "ECONNREFUSED");
});

test("probe reports not ready when jwks is empty", async () => {
  const report = await probeIdentity({
    issuer: ISSUER,
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      json: async () => (url.endsWith("/jwks") ? { keys: [] } : discoveryDocument()),
    }),
  });
  assert.equal(report.statusCode, 503);
  assert.deepEqual(report.payload.failed, ["jwks"]);
});
