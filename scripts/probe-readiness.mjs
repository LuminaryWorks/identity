#!/usr/bin/env node
/**
 * Identity readiness probe.
 *
 *   node scripts/probe-readiness.mjs
 *   node scripts/probe-readiness.mjs --issuer http://identity:3001/oidc
 *   node scripts/probe-readiness.mjs --json
 *
 * Logto exposes no `/ready` or `/version` endpoint of its own, so the readiness
 * contract for Identity is the OIDC discovery document plus a non-empty JWKS.
 * Exit code 0 = ready, 1 = not ready, so this can be used in CI and in a
 * control-plane preflight.
 */
import { probeIdentity } from "./lib/readiness.mjs";

function parseArgs(argv) {
  const options = { issuer: null, json: false, timeoutMs: 3000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--issuer") options.issuer = argv[++i];
    else if (arg === "--timeout") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(64);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log(`Usage: node scripts/probe-readiness.mjs [--issuer <url>] [--timeout <ms>] [--json]

Default issuer: $IDP_ISSUER, else $IDENTITY_ENDPOINT + /oidc, else http://localhost:3001/oidc`);
  process.exit(0);
}

const issuer =
  options.issuer ||
  process.env.IDP_ISSUER ||
  (process.env.IDENTITY_ENDPOINT
    ? `${process.env.IDENTITY_ENDPOINT.replace(/\/$/, "")}/oidc`
    : "http://localhost:3001/oidc");

const report = await probeIdentity({ issuer, timeoutMs: options.timeoutMs });

if (options.json) {
  console.log(JSON.stringify({ issuer, ...report.payload }, null, 2));
} else {
  console.log(`[identity] issuer: ${issuer}`);
  for (const check of report.payload.checks) {
    const detail = check.detail ? ` — ${check.detail}` : "";
    console.log(`  ${check.status === "up" ? "OK  " : "FAIL"} ${check.name}${detail}`);
  }
  console.log(`[identity] ${report.payload.status} (${report.statusCode})`);
}

process.exit(report.statusCode === 200 ? 0 : 1);
