import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOERFLOW_API_INDICATOR,
  DOERFLOW_INTEGRATION_SCOPES,
  PRODUCT_M2M_APP_NAMES,
  parseAppsCatalog,
  publicAppRegistrationResult,
} from "./apps-catalog.mjs";

const appsPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "apps.json");
const rawText = readFileSync(appsPath, "utf8");

test("apps.json is UTF-8 JSON without BOM", () => {
  assert.equal(rawText.charCodeAt(0) === 0xfeff, false);
  const parsed = JSON.parse(rawText);
  assert.equal(typeof parsed, "object");
  assert.ok(parsed.spaApplications);
});

test("catalog keeps existing human SPA applications unchanged", () => {
  const catalog = parseAppsCatalog(JSON.parse(rawText));
  const spaNames = catalog.spaApplications.map((app) => app.name);
  assert.deepEqual(spaNames, [
    "LuminaryWorks Portal",
    "DataView (DataLuminary)",
    "VibeEdu edu-app-web",
    "VibeEdu code-app-web",
    "VibeAgent Web",
    "DoerFlow Admin",
    "VistaCast Admin",
    "VistaRemote Admin",
    "VistaRemote Client",
    "LuminaryIoTChain iot-console-web",
  ]);
  for (const spa of catalog.spaApplications) {
    assert.equal(spa.type, "SPA");
    assert.ok(spa.redirectUris.length > 0);
  }
  assert.equal(
    catalog.m2mApplications.some((app) => spaNames.includes(app.name)),
    false,
  );
});

test("catalog freezes DoerFlow API audience and product M2M callers", () => {
  const catalog = parseAppsCatalog(JSON.parse(rawText));
  const doerflow = catalog.apiResources.find((resource) => resource.indicator === DOERFLOW_API_INDICATOR);
  assert.ok(doerflow);
  assert.deepEqual(
    doerflow.scopes.map((scope) => scope.name),
    [...DOERFLOW_INTEGRATION_SCOPES],
  );

  const names = catalog.m2mApplications.map((app) => app.name);
  assert.ok(names.includes(PRODUCT_M2M_APP_NAMES.vistacastService));
  assert.ok(names.includes(PRODUCT_M2M_APP_NAMES.syncrobrainGateway));
  for (const app of catalog.m2mApplications) {
    assert.equal(app.type, "MachineToMachine");
    assert.equal(app.resourceIndicator, DOERFLOW_API_INDICATOR);
    for (const scope of DOERFLOW_INTEGRATION_SCOPES) {
      assert.ok(app.scopes.includes(scope));
    }
  }
});

test("catalog rejects secrets and M2M callback URIs", () => {
  const parsed = JSON.parse(rawText);
  assert.throws(
    () => parseAppsCatalog({ ...parsed, m2mApplications: [{ ...parsed.m2mApplications[0], secret: "real-secret" }] }),
    /must not contain/,
  );
  assert.throws(
    () =>
      parseAppsCatalog({
        ...parsed,
        m2mApplications: [
          {
            ...parsed.m2mApplications[0],
            redirectUris: ["http://localhost/callback"],
          },
        ],
      }),
    /must not set redirect/,
  );
  assert.throws(
    () =>
      parseAppsCatalog({
        ...parsed,
        m2mApplications: [
          {
            ...parsed.m2mApplications[0],
            resourceIndicator: "https://api.vistacast.local",
          },
        ],
      }),
    /audience\/resourceIndicator/,
  );
});

test("public registration result never includes client secrets", () => {
  const publicResult = publicAppRegistrationResult({
    spa: { "DoerFlow Admin": "spa-id" },
    apiResources: { "DoerFlow API": DOERFLOW_API_INDICATOR },
    m2m: {
      [PRODUCT_M2M_APP_NAMES.vistacastService]: "m2m-vista",
      [PRODUCT_M2M_APP_NAMES.syncrobrainGateway]: "m2m-syncro",
    },
    secret: "",
  });
  assert.deepEqual(publicResult.m2m[PRODUCT_M2M_APP_NAMES.vistacastService], "m2m-vista");
  assert.equal(JSON.stringify(publicResult).includes("secret"), false);
});
