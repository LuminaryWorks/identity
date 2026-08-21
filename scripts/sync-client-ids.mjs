/**
 * Sync CLIENT_IDs from identity/registered-apps.json into product .env* files.
 * Idempotent: upserts known keys; never deletes unrelated vars.
 *
 * Writes both Vite (`VITE_*` / `PUBLIC_*`) and Next (`NEXT_PUBLIC_*`) keys when
 * both are present — Next apps ignore `VITE_*`, so a VITE-only sync left
 * BlockyEdu / DoerFlow Admin on stale `NEXT_PUBLIC_IDP_CLIENT_ID`.
 *
 * Usage: node scripts/sync-client-ids.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const identityRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = join(identityRoot, "..", "..");
const registered = JSON.parse(readFileSync(join(identityRoot, "registered-apps.json"), "utf8"));
const spa = registered.spa || {};

const IDP_ISSUER = "http://localhost:3001/oidc";

/** Case-insensitive walk so `blockyedu` resolves to `BlockyEdu` on Linux too. */
function resolveWorkspacePath(...segments) {
  let current = workspaceRoot;
  for (const seg of segments) {
    if (!seg) continue;
    const exact = join(current, seg);
    if (existsSync(exact)) {
      current = exact;
      continue;
    }
    let found;
    try {
      found = readdirSync(current, { withFileTypes: true }).find(
        (e) => e.isDirectory() && e.name.toLowerCase() === String(seg).toLowerCase(),
      );
    } catch {
      found = undefined;
    }
    current = found ? join(current, found.name) : exact;
  }
  return current;
}

function clientIdKeys(value) {
  return {
    VITE_IDP_CLIENT_ID: value,
    PUBLIC_IDP_CLIENT_ID: value,
    NEXT_PUBLIC_IDP_CLIENT_ID: value,
  };
}

function issuerKeys() {
  return {
    VITE_IDP_ISSUER: IDP_ISSUER,
    PUBLIC_IDP_ISSUER: IDP_ISSUER,
    NEXT_PUBLIC_IDP_ISSUER: IDP_ISSUER,
  };
}

/** @type {{ label: string, clientId: string|undefined, files: { path: string, keys: Record<string,string> }[] }[]} */
const targets = [
  {
    label: "DataLuminary DataView",
    clientId: spa["DataView (DataLuminary)"],
    files: [
      {
        path: resolveWorkspacePath("DataLuminary", "DataView", ".env.development"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          VITE_IDP_REDIRECT_URI: "http://localhost:3003/auth/callback",
          VITE_IDP_POST_LOGOUT_URI: "http://localhost:3003/",
          VITE_IDP_AUDIENCE: "https://api.dataluminary.local",
          VITE_AUTH_EXPERIENCE_URL: "http://localhost:3003",
        },
      },
      {
        path: resolveWorkspacePath("DataLuminary", "DataView", ".env"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          VITE_IDP_REDIRECT_URI: "http://localhost:3003/auth/callback",
          VITE_IDP_AUDIENCE: "https://api.dataluminary.local",
        },
      },
      {
        path: resolveWorkspacePath("DataLuminary", "DataTalk", ".env"),
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
        path: resolveWorkspacePath("BlockyEdu", "edu-app-web", ".env.development"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          NEXT_PUBLIC_IDP_REDIRECT_URI: "http://localhost:18082/auth/callback",
          NEXT_PUBLIC_IDP_POST_LOGOUT_URI: "http://localhost:18082/login",
          NEXT_PUBLIC_AUTH_EXPERIENCE_URL: "http://localhost:18082",
          NEXT_PUBLIC_APP_ORIGIN: "http://localhost:18082",
          NEXT_PUBLIC_IDP_AUDIENCE: "https://api.vibeedu.local",
          VITE_IDP_REDIRECT_URI: "http://localhost:18082/auth/callback",
          VITE_IDP_AUDIENCE: "https://api.vibeedu.local",
        },
      },
      {
        path: resolveWorkspacePath("BlockyEdu", "edu-app-web", ".env.local"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          NEXT_PUBLIC_IDP_REDIRECT_URI: "http://localhost:18082/auth/callback",
          NEXT_PUBLIC_AUTH_EXPERIENCE_URL: "http://localhost:18082",
        },
      },
      {
        path: resolveWorkspacePath("BlockyEdu", "edu-server", ".env"),
        keys: {
          IDP_MODE: "logto",
          IDP_ISSUER,
          IDP_AUDIENCE: "https://api.vibeedu.local",
        },
      },
      {
        path: resolveWorkspacePath("BlockyEdu", "server", ".env"),
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
        path: resolveWorkspacePath("BlockyEdu", "code-app-web", ".env.development"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          VITE_IDP_REDIRECT_URI: "http://localhost:18081/auth/callback",
          VITE_IDP_POST_LOGOUT_URI: "http://localhost:18081/login",
          VITE_IDP_AUDIENCE: "https://api.vibeedu.local",
          VITE_AUTH_EXPERIENCE_URL: "http://localhost:18081",
        },
      },
      {
        path: resolveWorkspacePath("BlockyEdu", "code-app-web", ".env.local"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
        },
      },
    ],
  },
  {
    label: "DoerFlow web",
    clientId: spa["VibeAgent Web"],
    files: [
      {
        path: resolveWorkspacePath("DoerFlow", "repos", "web", ".env.development"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          PUBLIC_IDP_REDIRECT_URI: "http://localhost:5174/auth/callback",
          PUBLIC_IDP_AUDIENCE: "https://api.vibeagent.local",
          PUBLIC_AUTH_EXPERIENCE_URL: "http://localhost:5174",
        },
      },
      {
        path: resolveWorkspacePath("DoerFlow", "repos", "web", ".env"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          PUBLIC_IDP_REDIRECT_URI: "http://localhost:5174/auth/callback",
          PUBLIC_IDP_AUDIENCE: "https://api.vibeagent.local",
        },
      },
      {
        path: resolveWorkspacePath("DoerFlow", "repos", "api", ".env"),
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
        path: resolveWorkspacePath("DoerFlow", "repos", "admin", ".env.development"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          NEXT_PUBLIC_IDP_REDIRECT_URI: "http://localhost:13011/auth/callback",
          NEXT_PUBLIC_IDP_AUDIENCE: "https://api.vibeagent.local",
          NEXT_PUBLIC_AUTH_EXPERIENCE_URL: "http://localhost:13011",
          NEXT_PUBLIC_APP_ORIGIN: "http://localhost:13011",
        },
      },
      {
        path: resolveWorkspacePath("DoerFlow", "repos", "admin", ".env.local"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          NEXT_PUBLIC_IDP_REDIRECT_URI: "http://localhost:13011/auth/callback",
          NEXT_PUBLIC_IDP_AUDIENCE: "https://api.vibeagent.local",
        },
      },
    ],
  },
  {
    label: "VistaRemote client + admin",
    clientId: spa["VistaRemote Client"],
    files: [
      {
        path: resolveWorkspacePath("VistaRemote", "config", "environments", "local.env"),
        keys: {
          PUBLIC_IDP_ISSUER: IDP_ISSUER,
          PUBLIC_IDP_CLIENT_ID: "",
          PUBLIC_IDP_AUDIENCE: "https://api.vistaremote.local",
          PUBLIC_ADMIN_IDP_CLIENT_ID: spa["VistaRemote Admin"] || "",
        },
      },
      {
        path: resolveWorkspacePath("VistaRemote", "web", "apps", "client", ".env.development"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          PUBLIC_IDP_REDIRECT_URI: "http://localhost:5173/auth/callback",
          PUBLIC_IDP_AUDIENCE: "https://api.vistaremote.local",
          PUBLIC_AUTH_EXPERIENCE_URL: "http://localhost:5173",
        },
      },
      {
        path: resolveWorkspacePath("VistaRemote", "web", "apps", "client", ".env"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          PUBLIC_IDP_REDIRECT_URI: "http://localhost:5173/auth/callback",
          PUBLIC_IDP_AUDIENCE: "https://api.vistaremote.local",
        },
      },
      {
        path: resolveWorkspacePath("VistaRemote", "desktop", ".env"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
        },
      },
      {
        path: resolveWorkspacePath("VistaRemote", "web", "apps", "admin", ".env.development"),
        keys: {
          PUBLIC_IDP_ISSUER: IDP_ISSUER,
          PUBLIC_IDP_CLIENT_ID: spa["VistaRemote Admin"] || "",
          PUBLIC_IDP_REDIRECT_URI: "http://localhost:5175/auth/callback",
          PUBLIC_IDP_AUDIENCE: "https://api.vistaremote.local",
          PUBLIC_AUTH_EXPERIENCE_URL: "http://localhost:5175",
        },
      },
      {
        path: resolveWorkspacePath("VistaRemote", "web", "apps", "admin", ".env"),
        keys: {
          PUBLIC_IDP_ISSUER: IDP_ISSUER,
          PUBLIC_IDP_CLIENT_ID: spa["VistaRemote Admin"] || "",
          PUBLIC_IDP_REDIRECT_URI: "http://localhost:5175/auth/callback",
          PUBLIC_IDP_AUDIENCE: "https://api.vistaremote.local",
        },
      },
      {
        path: resolveWorkspacePath("VistaRemote", "server", ".env"),
        keys: {
          IDP_MODE: "logto",
          IDP_ISSUER,
          IDP_AUDIENCE: "https://api.vistaremote.local",
        },
      },
    ],
  },
  {
    label: "VistaCast Admin",
    clientId: spa["VistaCast Admin"],
    files: [
      {
        path: resolveWorkspacePath("VistaCast", "web", ".env.example"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          PUBLIC_IDP_REDIRECT_URI: "http://127.0.0.1:13101/auth/callback",
          PUBLIC_IDP_POST_LOGOUT_URI: "http://127.0.0.1:13101/",
          PUBLIC_IDP_AUDIENCE: "https://api.vistacast.local",
          PUBLIC_AUTH_EXPERIENCE_URL: "http://127.0.0.1:13101",
        },
      },
      {
        path: resolveWorkspacePath("VistaCast", "web", ".env"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          PUBLIC_IDP_REDIRECT_URI: "http://127.0.0.1:13101/auth/callback",
          PUBLIC_IDP_POST_LOGOUT_URI: "http://127.0.0.1:13101/",
          PUBLIC_IDP_AUDIENCE: "https://api.vistacast.local",
          PUBLIC_AUTH_EXPERIENCE_URL: "http://127.0.0.1:13101",
        },
      },
      {
        path: resolveWorkspacePath("VistaCast", "server", ".env.example"),
        keys: {
          IDP_MODE: "logto",
          IDP_ISSUER,
          IDP_AUDIENCE: "https://api.vistacast.local",
        },
      },
      {
        path: resolveWorkspacePath("VistaCast", "server", ".env"),
        keys: {
          IDP_MODE: "logto",
          IDP_ISSUER,
          IDP_AUDIENCE: "https://api.vistacast.local",
        },
      },
    ],
  },
  {
    label: "SyncroBrain console",
    clientId: spa["LuminaryIoTChain iot-console-web"],
    files: [
      {
        path: resolveWorkspacePath("SyncroBrain", "iot-console-web", ".env.development"),
        keys: {
          ...issuerKeys(),
          ...clientIdKeys(""),
          VITE_IDP_REDIRECT_URI: "http://localhost:15180/auth/callback",
          VITE_IDP_AUDIENCE: "https://api.iotchain.local",
          VITE_AUTH_EXPERIENCE_URL: "http://localhost:15180",
        },
      },
      {
        path: resolveWorkspacePath("SyncroBrain", "iot-gateway", ".env"),
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
      if (k.includes("CLIENT_ID") && !keys[k]) keys[k] = t.clientId;
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
  if (text.includes("\uFFFD")) {
    throw new Error(`mojibake in ${path}`);
  }
  const eol = "\n";
  for (const [key, value] of Object.entries(keys)) {
    if (value === undefined || value === null) continue;
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
