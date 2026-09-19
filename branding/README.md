# LuminaryWorks Identity — Console 品牌 overlay

在官方 `svhd/logto` 镜像上叠一层静态资源，把 Admin Console 顶栏和 get-started 改成 LuminaryWorks 外观。不 fork Logto：官方升级只换版本号重新 build，定制失败也只是样式不生效，不会把 Console 打挂。

## 文件职责

| 路径 | 作用 |
| --- | --- |
| `Dockerfile` | `FROM svhd/logto`，拷静态文件并跑一次 patch |
| `patch-console.mjs` | 构建期改 `console/dist/index.html`（注入 CSS/JS、换 favicon、删 `.br`/`.gz`） |
| `assets/lw-logo.svg` | 正方形标记，顶栏 / 登录页静态资源 |
| `assets/lw-favicon.svg` | 与 logo 相同，Console favicon |
| `assets/lw-console.css` | Console 全部视觉定制（顶栏、get-started 卡、侧边栏 Cloud 广告） |
| `assets/lw-console.js` | SPA 路由标记 `data-lw-path`；把标签页标题里的 `Logto Console` / `Logto Cloud` 换成 `LuminaryWorks Identity` |
| `assets/lw-experience.js` | 登录页摘掉 OSS 强插的 “Powered by Logto”（带 `!important` 内联样式，CSS 盖不住） |

## 构建

开发栈（在 `identity/` 下）：

```bash
docker compose build identity
```

指定旧版官方镜像手工构建：

```bash
docker build --build-arg LOGTO_VERSION=1.22.0 -t luminaryworks/identity:1.22.0-lw1 .
```

## 升级 SOP

1. 改 `LOGTO_VERSION`（compose `.env` / `IDENTITY_IMAGE` 标签一并改）。
2. 重新 `docker compose build identity`。
3. 打开 Admin Console，目视三处：
   - 顶栏 logo 是 LuminaryWorks 正方形标记
   - 顶栏文案是「LuminaryWorks Identity」
   - get-started 只剩 Manage 卡
4. 若某条失效：只改 `lw-console.css` 对应那一行选择器。CSS 失配的后果是**定制不生效**，不是 Console 打不开。
5. 静态资源有 7 天缓存。改了 css/js 后把 `patch-console.mjs` 里的 `?v=` 加一，否则浏览器继续用旧文件。

## 登录页品牌不在这里

`/sign-in`（Experience）走 `identity/scripts/ensure-admin-console-branding.mjs` 的 Management API，和本 overlay 两条通道互不影响。
