/**
 * Sync CLIENT_IDs from identity/registered-apps.json into product .env* files.
 * Idempotent: upserts known keys; never deletes unrelated vars.
 *
 * Usage: node scripts/sync-client-ids.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const identityRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const metaRoot = join(identityRoot, "..");
const registered = JSON.parse(readFileSync(join(identityRoot, "registered-apps.json"), "utf8"));
const spa = registered.spa || {};

const IDP_ISSUER = "http://localhost:3001/oidc";

/** @type {{ label: string, clientId: string|undefined, files: { path: string, keys: Record<string,string> }[] }[]} */
const targets = [
  {
    label: "DataLuminary DataView",
    clientId: spa["DataView (DataLuminary)"],
    files: [
      {
        path: join(metaRoot, "..", "dataluminary", "DataView", ".env.development"),
        keys: {
          VITE_IDP_ISSUER: IDP_ISSUER,
          VITE_IDP_CLIENT_ID: "",
          // Path callback (port 3003); do not share 5173 with VistaRemote Client
          VITE_IDP_REDIRECT_URI: "http://localhost:3003/auth/callback",
          VITE_IDP_POST_LOGOUT_URI: "http://localhost:3003/#/login",
          VITE_IDP_AUDIENCE: "https://api.dataluminary.local",
        },
      },
      {
        path: join(metaRoot, "..", "dataluminary", "DataTalk", ".env"),
        keys: {
          IDP_MODE: "logto",
          IDP_ISSUER,
          IDP_AUDIENCE: "https://api.dataluminary.local",
        },
      },
    ],
  },
  {
    label: "BlockyEdu edu-app-web",
    clientId: spa["VibeEdu edu-app-web"],
    files: [
      {
        path: join(metaRoot, "..", "blockyedu", "edu-app-web", ".env.development"),
        keys: {
          VITE_IDP_ISSUER: IDP_ISSUER,
          VITE_IDP_CLIENT_ID: "",
          VITE_IDP_REDIRECT_URI: "http://localhost:18082/auth/callback",
          VITE_IDP_AUDIENCE: "https://api.vibeedu.local",
        },
      },
      {
        path: join(metaRoot, "..", "blockyedu", "edu-server", ".env"),
        keys: {
          IDP_MODE: "logto",
          IDP_ISSUER,
          IDP_AUDIENCE: "https://api.vibeedu.local",
        },
      },
    ],
  },
  {
    label: "BlockyEdu code-app-web",
    clientId: spa["VibeEdu code-app-web"],
    files: [
      {
        path: join(metaRoot, "..", "blockyedu", "code-app-web", ".env.development"),
        keys: {
          VITE_IDP_ISSUER: IDP_ISSUER,
          VITE_IDP_CLIENT_ID: "",
          VITE_IDP_REDIRECT_URI: "http://localhost:18081/auth/callback",
          VITE_IDP_AUDIENCE: "https://api.vibeedu.local",
        },
      },
    ],
  },
  {
    label: "DoerFlow web",
    clientId: spa["VibeAgent Web"],
    files: [
      {
        path: join(metaRoot, "..", "doerflow", "repos", "web", ".env.development"),
        keys: {
          PUBLIC_IDP_ISSUER: IDP_ISSUER,
          PUBLIC_IDP_CLIENT_ID: "",
          PUBLIC_IDP_REDIRECT_URI: "http://localhost:5174/auth/callback",
          PUBLIC_IDP_AUDIENCE: "https://api.vibeagent.local",
        },
      },
      {
        path: join(metaRoot, "..", "doerflow", "repos", "api", ".env"),
        keys: {
          IDP_MODE: "logto",
          IDP_ISSUER,
          IDP_AUDIENCE: "https://api.vibeagent.local",
        },
      },
    ],
  },
  {
    label: "DoerFlow admin",
    clientId: spa["DoerFlow Admin"],
    files: [
      {
        path: join(metaRoot, "..", "doerflow", "repos", "admin", ".env.local"),
        keys: {
          NEXT_PUBLIC_IDP_ISSUER: IDP_ISSUER,
          NEXT_PUBLIC_IDP_CLIENT_ID: "",
          NEXT_PUBLIC_IDP_REDIRECT_URI: "http://localhost:13011/auth/callback",
          NEXT_PUBLIC_IDP_AUDIENCE: "https://api.vibeagent.local",
        },
      },
    ],
  },
  {
    label: "VistaRemote admin",
    clientId: spa["VistaRemote Admin"],
    files: [
      {
        path: join(metaRoot, "..", "vistaremote", "web", "apps", "admin", ".env.development"),
        keys: {
          PUBLIC_IDP_ISSUER: IDP_ISSUER,
          PUBLIC_IDP_CLIENT_ID: "",
          PUBLIC_IDP_REDIRECT_URI: "http://localhost:5175/auth/callback",
          PUBLIC_IDP_AUDIENCE: "https://api.vistaremote.local",
        },
      },
      {
        path: join(metaRoot, "..", "vistaremote", "server", ".env"),
        keys: {
          IDP_MODE: "logto",
          IDP_ISSUER,
          IDP_AUDIENCE: "https://api.vistaremote.local",
        },
      },
    ],
  },
  {
    label: "SyncroBrain console",
    clientId: spa["LuminaryIoTChain iot-console-web"],
    files: [
      {
        path: join(metaRoot, "..", "syncrobrain", "iot-console-web", ".env.development"),
        keys: {
          VITE_IDP_ISSUER: IDP_ISSUER,
          VITE_IDP_CLIENT_ID: "",
          VITE_IDP_REDIRECT_URI: "http://localhost:5180/auth/callback",
          VITE_IDP_AUDIENCE: "https://api.iotchain.local",
        },
      },
      {
        path: join(metaRoot, "..", "syncrobrain", "iot-gateway", ".env"),
        keys: {
          IDP_MODE: "logto",
          IDP_ISSUER,
          IDP_AUDIENCE: "https://api.iotchain.local",
        },
      },
    ],
  },
];

let updated = 0;
let skipped = 0;

for (const t of targets) {
  if (!t.clientId) {
    console.warn(`! skip ${t.label}: no CLIENT_ID in registered-apps.json`);
    skipped++;
    continue;
  }
  for (const file of t.files) {
    const keys = { ...file.keys };
    for (const k of Object.keys(keys)) {
      if (k.includes("CLIENT_ID")) keys[k] = t.clientId;
    }
    const ok = upsertEnv(file.path, keys);
    if (ok) {
      console.log(`✓ ${file.path}`);
      updated++;
    } else {
      console.warn(`· missing ${file.path} (keys prepared, file not created)`);
      skipped++;
    }
  }
}

console.log(`\nDone. updated=${updated} skipped=${skipped}`);
console.log("CLIENT_IDs:", Object.fromEntries(Object.entries(spa).map(([k, v]) => [k, v])));

function formatEnvValue(value) {
  const s = String(value);
  // dotenv treats unquoted # as comment start (breaks hash-router logout URIs)
  if (/[\s#"']/.test(s) || s.includes("#")) return JSON.stringify(s);
  return s;
}

function upsertEnv(path, keys) {
  if (!existsSync(path)) return false;
  // Normalize mixed/legacy CR-only line endings so KEY= lines parse in dotenv.
  let text = readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const eol = "\n";
  for (const [key, value] of Object.entries(keys)) {
    const line = `${key}=${formatEnvValue(value)}`;
    const re = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
    if (re.test(text)) text = text.replace(re, line);
    else {
      if (text.length && !text.endsWith("\n")) text += eol;
      text += `${line}${eol}`;
    }
  }
  writeFileSync(path, text, "utf8");
  return true;
}
