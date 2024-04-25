/**
 * @deprecated Use seed-accounts.mjs
 *   IDENTITY_ACCOUNTS_PROFILE=dev|product node scripts/seed-accounts.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
console.warn("! seed-dev-accounts.mjs is deprecated → scripts/seed-accounts.mjs");
const r = spawnSync(process.execPath, [join(root, "scripts/seed-accounts.mjs")], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
