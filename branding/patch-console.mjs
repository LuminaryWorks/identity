/**
 * 构建期给 Console / Experience 的 dist/index.html 注入品牌资源。
 * 路径写死官方镜像布局；对不上就让 build 失败，而不是带着半套 overlay 上线。
 */
import fs from "node:fs";
import path from "node:path";

const MARKER = "<!-- lw-brand -->";

function patchSpa({ label, distEnv, defaultDist, assets }) {
  const dist = process.env[distEnv] || defaultDist;
  const index = path.join(dist, "index.html");
  if (!fs.existsSync(index)) {
    console.error(`[lw-brand] 找不到 ${index}（${label}），镜像布局可能已变`);
    process.exit(1);
  }

  console.log(`[lw-brand] 读取 ${index}`);
  let html = fs.readFileSync(index, "utf8");

  if (html.includes(MARKER)) {
    console.log(`[lw-brand] ${label} index.html 已含品牌标记，跳过注入`);
  } else {
    if (!html.includes("</head>")) {
      console.error(`[lw-brand] ${label} index.html 找不到 </head>，无法注入`);
      process.exit(1);
    }
    const lines = assets
      .map((a) => {
        const pathOnly = a.split("?")[0];
        if (pathOnly.endsWith(".css")) {
          return `    <link rel="stylesheet" href="${a}">`;
        }
        return `    <script src="${a}"></script>`;
      })
      .join("\n");
    const injection = `    ${MARKER}\n${lines}\n`;
    html = html.replace("</head>", `${injection}\n  </head>`);
    console.log(`[lw-brand] 已在 ${label} </head> 前注入资源`);
  }

  if (label === "console") {
    const next = html.replace(
      /(<link\b(?=[^>]*\brel=["']icon["'])[^>]*\bhref=["'])[^"']+(["'])/i,
      "$1/console/assets/lw-favicon.svg$2",
    );
    if (next === html) {
      console.warn('[lw-brand] 未找到 rel="icon"，跳过 favicon 替换');
    } else {
      html = next;
      console.log("[lw-brand] 已把 favicon 换成 /console/assets/lw-favicon.svg");
    }
  }

  fs.writeFileSync(index, html, "utf8");
  console.log(`[lw-brand] 已写回 ${index}`);

  for (const extra of ["index.html.br", "index.html.gz"]) {
    const p = path.join(dist, extra);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`[lw-brand] 已删除 ${p}（避免残留未注入的压缩副本）`);
    }
  }
}

patchSpa({
  label: "console",
  distEnv: "LOGTO_CONSOLE_DIST",
  defaultDist: "/etc/logto/packages/console/dist",
  assets: [
    "/console/assets/lw-console.css?v=4",
    "/console/assets/lw-console.js?v=4",
  ],
});

patchSpa({
  label: "experience",
  distEnv: "LOGTO_EXPERIENCE_DIST",
  defaultDist: "/etc/logto/packages/experience/dist",
  assets: ["/assets/lw-experience.js?v=1"],
});

console.log("[lw-brand] 完成");
