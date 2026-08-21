import assert from "node:assert/strict";
import test from "node:test";

import { IdentityManagementCapability } from "./capabilities.mjs";
import {
  IdentityManagementError,
  IdentityManagementErrorCode,
} from "./identity-management-error.mjs";
import { LogtoManagementClient } from "./logto-management-client.mjs";
import { LogtoManagementProvider } from "./logto-management-provider.mjs";

test("LogtoManagementClient caches and shares an in-flight M2M token", async () => {
  let tokenRequests = 0;
  const client = new LogtoManagementClient({
    endpoint: "https://identity.example",
    clientId: "server-only-id",
    clientSecret: "server-only-secret",
    fetch: async () => {
      tokenRequests++;
      return jsonResponse({ access_token: "token-1", expires_in: 120 });
    },
    now: () => 1_000,
  });

  const [first, second] = await Promise.all([
    client.getAccessToken(),
    client.getAccessToken(),
  ]);
  assert.equal(first, "token-1");
  assert.equal(second, "token-1");
  assert.equal(await client.getAccessToken(), "token-1");
  assert.equal(tokenRequests, 1);
});

test("LogtoManagementClient clears the token and retries one unauthorized request", async () => {
  const calls = [];
  const responses = [
    jsonResponse({ access_token: "token-1", expires_in: 120 }),
    new Response("unauthorized", { status: 401 }),
    jsonResponse({ access_token: "token-2", expires_in: 120 }),
    jsonResponse({ id: "user-1" }),
  ];
  const client = new LogtoManagementClient({
    endpoint: "https://identity.example",
    clientId: "id",
    clientSecret: "secret",
    fetch: async (url, options) => {
      calls.push({ url, options });
      return responses.shift();
    },
  });

  assert.deepEqual(await client.request("GET", "/api/users/user-1"), { id: "user-1" });
  assert.equal(calls.length, 4);
  assert.equal(calls[1].options.headers.Authorization, "Bearer token-1");
  assert.equal(calls[3].options.headers.Authorization, "Bearer token-2");
});

test("LogtoManagementProvider exposes user lifecycle operations and rejects invite", async () => {
  const calls = [];
  const provider = new LogtoManagementProvider({
    client: {
      request: async (method, path, options) => {
        calls.push({ method, path, options });
        return { id: "user/1" };
      },
    },
  });

  assert.equal(provider.supports(IdentityManagementCapability.USER_DISABLE), true);
  assert.equal(provider.supports(IdentityManagementCapability.USER_INVITE), false);
  await provider.getUser("user/1");
  await provider.createUser({ primaryEmail: "user@example.com" });
  await provider.disableUser("user/1");
  await provider.enableUser("user/1");

  assert.deepEqual(
    calls.map(({ method, path, options }) => [method, path, options.body]),
    [
      ["GET", "/api/users/user%2F1", undefined],
      ["POST", "/api/users", { primaryEmail: "user@example.com" }],
      ["PATCH", "/api/users/user%2F1", { isSuspended: true }],
      ["PATCH", "/api/users/user%2F1", { isSuspended: false }],
    ],
  );
  assert.throws(
    () => provider.inviteUser({ email: "user@example.com" }),
    (error) =>
      error instanceof IdentityManagementError &&
      error.code === IdentityManagementErrorCode.CAPABILITY_UNSUPPORTED,
  );
});

test("LogtoManagementClient normalizes Management API failures", async () => {
  const responses = [
    jsonResponse({ access_token: "token", expires_in: 120 }),
    new Response('{"message":"forbidden"}', { status: 403 }),
  ];
  const client = new LogtoManagementClient({
    endpoint: "https://identity.example",
    clientId: "id",
    clientSecret: "secret",
    fetch: async () => responses.shift(),
  });

  await assert.rejects(
    client.request("DELETE", "/api/users/user-1"),
    (error) =>
      error instanceof IdentityManagementError &&
      error.code === IdentityManagementErrorCode.MANAGEMENT_REQUEST_FAILED &&
      error.status === 403 &&
      error.operation === "DELETE /api/users/user-1",
  );
});

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}
