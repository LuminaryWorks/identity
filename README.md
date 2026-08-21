# LuminaryWorks Identity

LuminaryWorks 六产品 + 控制台的**统一登录授权服务**（Logto OIDC）。一处部署，全生态共用同一 `sub`。

> 组织：[github.com/LuminaryWorks](https://github.com/LuminaryWorks)  
> IAM 规格：[identity-and-permissions.md](https://github.com/LuminaryWorks/LuminaryWorks/blob/main/spec/identity-and-permissions.md)  
> 生态重构：[ecosystem-refactoring.md](https://github.com/LuminaryWorks/LuminaryWorks/blob/main/spec/ecosystem-refactoring.md)

## 职责边界

| Logto（本服务） | 各产品 |
|-----------------|--------|
| 身份认证、SSO、组织/租户、产品准入 | **Casbin** 资源权限（Dashboard / 课程 / 设备…） |
| Experience API 支撑 Headless 登录 UI | 品牌登录页 + `@luminary/auth-react` |
| 签发 JWT（身份 + 准入） | JWKS 验签 + 业务 ACL，**不把资源权限塞进 Token** |

## 一键启动

```bash
# Linux / macOS
./bootstrap.sh

# Windows
./bootstrap.ps1

# 或从 MetaRepo：
# cd D:\www\LuminaryWorks && pnpm id:up
```

本地 Docker / 开机自启 / 私有镜像镜像说明见 **[LOCAL_DEV_DOCKER.md](./LOCAL_DEV_DOCKER.md)**。

启动后会自动：

1. `docker compose up`（Logto + PG + Redis）
2. `scripts/ensure-logto-admin.mjs` — 创建 **Logto Admin Console 操作员**（admin 租户；`LW_LOGTO_ADMIN_*`）；**未配置则中止**
3. 若无 M2M：`scripts/bootstrap-m2m.mjs`（向 default 租户写入 Management API M2M，**无需先打开 Admin Welcome 页**）
4. `scripts/register-apps.mjs` → `registered-apps.json`
5. `scripts/sync-client-ids.mjs` → 写入各产品 `.env` / `.env.development` / `.env.local`（含 `NEXT_PUBLIC_*` 与 `PUBLIC_*`）
6. `scripts/ensure-social-connectors.mjs` — 若配置了 `LOGTO_GOOGLE_CLIENT_*` / `LOGTO_GITHUB_CLIENT_*` 则创建社交连接器
7. `scripts/seed-accounts.mjs` — 校验 `ACCOUNTS.{dev|product}.env` 或 `LW_*` 环境变量；**未配置则中止**（不自动复制、不交互）
8. `scripts/ensure-sign-in-experience.mjs` — 邮箱/用户名密码 + 把已有社交 connector 挂到 SIE

### 部署顺序

```text
1. 配置 identity/.env（端口、LW_LOGTO_ADMIN_*、M2M 等）
2. 配置平台账号凭据（二选一）：
     · 本地：cp ACCOUNTS.dev.env.example ACCOUNTS.dev.env（或 product）
     · CI/云：注入 IDENTITY_ACCOUNTS_PROFILE + LW_*_PASSWORD 等
3. ./bootstrap.ps1 或 ./bootstrap.sh
     ← 缺 LW_LOGTO_ADMIN_* 或平台 ACCOUNTS 会失败退出
4. 用 LW_LOGTO_ADMIN_* 登录 http://localhost:3002
5. 启动各产品用统一登录（平台用户见 ACCOUNTS）
```

| Profile | 文件 / 环境 | 账号范围 |
|---------|-------------|---------|
| `dev`（默认） | `ACCOUNTS.dev.env` 或同名 `LW_*` | 超管 + 6 产品管理员 + user01..10 |
| `product` | `ACCOUNTS.product.env` 或 `LW_*`（适合 GitHub Actions secrets） | 超管 + 6 产品管理员 |

选择 profile：`IDENTITY_ACCOUNTS_PROFILE=dev|product`（`NODE_ENV=production` 时默认 `product`）。

## 两套账号（请勿混淆）

| 维度 | 配置 | 登录入口 | 用途 |
|------|------|----------|------|
| **Logto Admin Console 操作员** | `identity/.env` 的 `LW_LOGTO_ADMIN_*` | http://localhost:3002 | 管 connector / 应用 / Sign-in Experience |
| **平台用户** | `ACCOUNTS.*.env` 或 `LW_SUPER_ADMIN_*` 等 | 各产品登录页 / OIDC | 产品身份、角色、SSO |

`ACCOUNTS` **不会**自动变成 Console 管理员；Console 管理员也 **不是** 产品 `superadmin@…`。

### Logto Admin Console 操作员

私有化 / 本地初始化时由 `scripts/ensure-logto-admin.mjs` 幂等创建（admin 租户）：

| 变量 | 必填 | 说明 |
|------|------|------|
| `LW_LOGTO_ADMIN_USERNAME` | 是 | Console 登录用户名 |
| `LW_LOGTO_ADMIN_PASSWORD` | 是 | 不能为空或 `CHANGE_ME` |
| `LW_LOGTO_ADMIN_EMAIL` | 否 | 可选主邮箱 |
| `LW_LOGTO_ADMIN_RESET_PASSWORD` | 否 | 设为 `1` 时，已存在用户也会重置密码 |

模板见 [`.env.example`](./.env.example)。缺配置时 **bootstrap 直接失败**（不依赖首次打开 Welcome 页手建）。

```bash
# 仅补建 / 校验 Console 操作员
node scripts/ensure-logto-admin.mjs
```

本地默认示例（请按环境改密）：

- 用户名：`logto_admin`
- 密码：`LuminaryDev!234`
- 控制台：http://localhost:3002

### 启动后入口

- OIDC Issuer：`http://localhost:3001/oidc`
- Admin 控制台：`http://localhost:3002`（用 `LW_LOGTO_ADMIN_*` 登录，不是 ACCOUNTS）
- 平台账号凭据：`ACCOUNTS.*.env` 或部署环境变量；Logto user id 写入 `ACCOUNTS.{profile}.seeded.json`（不含密码）

| 账号 | 默认邮箱（dev） | IdP 角色 | 用途 |
|------|-----------------|----------|------|
| 生态超管 | `superadmin@luminaryworks.local` | `super_admin` + `platform_admin` | 全产品超管 |
| 产品管理员 ×6 | `admin.<product>@…` | `*_admin` | 各产品管理员 |
| 普通用户 ×10 | `user01`…`user10@…` | `guest` | 仅 **dev** |

角色键：[`seed-accounts.manifest.json`](./seed-accounts.manifest.json)。模板：[`ACCOUNTS.dev.env.example`](./ACCOUNTS.dev.env.example) · [`ACCOUNTS.product.env.example`](./ACCOUNTS.product.env.example)。

### GitHub Actions 示例

```yaml
env:
  IDENTITY_ACCOUNTS_PROFILE: product
  LW_LOGTO_ADMIN_USERNAME: logto_admin
  LW_LOGTO_ADMIN_PASSWORD: ${{ secrets.LW_LOGTO_ADMIN_PASSWORD }}
  LW_SUPER_ADMIN_EMAIL: superadmin@example.com
  LW_SUPER_ADMIN_USERNAME: superadmin
  LW_SUPER_ADMIN_PASSWORD: ${{ secrets.LW_SUPER_ADMIN_PASSWORD }}
  # …其余 LW_ADMIN_*_PASSWORD 等同理
steps:
  - run: node scripts/ensure-logto-admin.mjs
    working-directory: identity
  - run: node scripts/seed-accounts.mjs
    working-directory: identity
```

手动补种：

```bash
IDENTITY_ACCOUNTS_PROFILE=dev node scripts/seed-accounts.mjs
```

## 应用注册（幂等）

也可手动：

```bash
node scripts/ensure-logto-admin.mjs
node scripts/bootstrap-m2m.mjs   # 仅首次 / 无 M2M 时
node scripts/register-apps.mjs
node scripts/sync-client-ids.mjs
IDENTITY_ACCOUNTS_PROFILE=dev node scripts/seed-accounts.mjs
```

脚本读取 [`apps.json`](./apps.json)，幂等创建 SPA 与 API 资源，并把 `CLIENT_ID` 写入 `registered-apps.json`。

### 中央 Identity Management Provider

`scripts/lib/identity-management-provider.mjs` 定义厂商无关的中央管理抽象；默认实现是
`LogtoManagementProvider`。它显式公开 capability，并由统一的
`IdentityManagementError` 返回稳定错误码。

| 能力 | Logto 默认实现 |
|------|----------------|
| 通用 Management API 请求 | 支持（供中央运维脚本复用） |
| 用户读取 / 创建 | 支持 |
| 用户禁用 / 启用 | 支持（映射 Logto `isSuspended`） |
| 用户邀请 | **不支持**，抛出 `IDENTITY_CAPABILITY_UNSUPPORTED` |
| 组织 / 角色高级抽象 | 尚未提供；现有初始化脚本暂走通用请求 |

`LogtoManagementClient` 负责 client credentials token、按过期时间缓存，以及 401 后清缓存并重试一次。
`LOGTO_M2M_APP_ID` / `LOGTO_M2M_APP_SECRET` 只允许存在于本仓中央运维环境：

- 不得写入产品仓、`shared` 包、浏览器 bundle 或 `registered-apps.json`。
- 产品运行时只消费 OIDC issuer、公开 `client_id` 和 API audience。
- `register-apps.mjs` 与 `seed-accounts.mjs` 已复用该 provider；新增中央运维脚本也应从
  `scripts/lib/logto-management-provider.mjs` 导入，禁止复制 token 请求代码。

Mock 单测不需要真实管理凭据：

```bash
node --test scripts/lib/*.test.mjs
```

## 接入产品

| 端 | 依赖 | 配置 |
|----|------|------|
| 后端 (NestJS) | `@luminaryworks/auth-core` | `IDP_ISSUER=http://localhost:3001/oidc` |
| 前端 (SPA) | `@luminary/auth-react` | `VITE_IDP_ISSUER` + `VITE_IDP_CLIENT_ID` + `VITE_IDP_REDIRECT_URI` |
| 资源权限 | 产品内 Casbin | 见 MetaRepo IAM 规格 §4 |
| 商业权益 | 中央 Entitlement（不进 JWT） | 401 身份 / 402 权益 / 403 ACL |

各产品 Redirect URI 见 `apps.json`。完整指南：[docs/develop/unified-login](https://github.com/LuminaryWorks/docs)。

DoerFlow 特例：Logto 平台会话与 wallet/SIWE 会话独立；Logto 不证明钱包所有权。DoerFlow 不创建 Trial，仅有 Pro / Ultra / Enterprise，且平台套餐不替代链上协议费。

## Headless 登录（Experience API）

默认路径：**各产品自建品牌登录页**，调用 Experience API / OIDC PKCE；不要 fork Logto Experience 源码。Management API 仅后端运维使用。

产品侧 `@luminary/auth-react` 的 `HeadlessLoginPanel`：

| UI | 行为 |
|----|------|
| 社交按钮（自动） | 从 IdP `socialSignInConnectorTargets` 拉取；新增 X / 飞书 / QQ 等启用后自动出现，横排换行 |
| Google / GitHub 等 | OIDC + `direct_sign_in=social:<target>`，直达提供商（不经 Logto 密码表单） |
| 邮箱/用户名 + 密码 | Experience API Headless（统一账号） |

Logto 托管页 `http://localhost:3001/sign-in` 的社交按钮布局由 `customCss` 控制（`apply-branding.mjs` / `ensure-sign-in-experience.mjs`），与产品 Headless 面板是两套 UI。

### Social login（Google / GitHub）本地联调

1. **在提供商创建 OAuth 应用**（回调必须指向 Logto，不是产品 SPA）：
   - GitHub → Settings → Developer settings → OAuth Apps  
   - Google → Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client (Web)
2. **在 Logto Admin**（http://localhost:3002）→ Connectors → Social：填入 `clientId` / `clientSecret`。
3. **启用到 Sign-in Experience**（connector 建好但未挂到 SIE 时，`direct_sign_in` 会退回密码页）：

```bash
node scripts/ensure-sign-in-experience.mjs
```

4. **核对回调 URL**（把下面地址粘到 Google / GitHub 的 Authorization callback URL）：

```text
http://localhost:3001/callback/<connectorId>
```

`ensure-sign-in-experience.mjs` / `verify-social-direct-signin.mjs` 会打印完整 callback。

5. **自动化检查**（authorize → 提供商，不代替浏览器完成同意页）：

```bash
node scripts/verify-social-direct-signin.mjs
```

常见失败：

| 现象 | 处理 |
|------|------|
| 仍停在 `localhost:3001/sign-in` | IdP 无社交连接器，或旧版 Headless 假按钮走了 `direct_sign_in`。配置 connector 后跑步骤 8 |
| 停在产品 origin 的 `/direct/social/google`（如 `:18082`） | Next.js 把 `X-Forwarded-Host` 传给了 Logto，discovery 的 `authorization_endpoint` 变成了 SPA。升级 `@luminaryworks/auth-dev-proxy@0.1.1` 并重启 SPA |
| `oidc.invalid_client` / `PUT /api/experience` 500 | 产品 `NEXT_PUBLIC_IDP_CLIENT_ID` 与 `registered-apps.json` 不一致 → `node scripts/sync-client-ids.mjs` 后**重启 SPA** |
| `redirect_uri_mismatch` | Google/GitHub 回调不是 `http://localhost:3001/callback/<id>` |
| SPA callback 报错 | 产品 `VITE_IDP_REDIRECT_URI` 须在 `apps.json` 已注册 |

### 统一登录页品牌（Omni Sign-in Experience）

Logto 自带登录页的 logo / 主色走 **Sign-in Experience 配置**（Admin 或 Management API），不是改 Logto 源码：

| 项 | 来源 |
|----|------|
| Logo | [cdn.luminaryworks.dev/logo/luminaryworks-logo.svg](https://cdn.luminaryworks.dev/logo/luminaryworks-logo.svg)（源文件在 `shared/brand/`，已上传 R2） |
| 主色 | `#1677ff`（`shared/brand/tokens.css` → `--lw-primary`） |

```bash
node scripts/apply-branding.mjs
```

`logoUrl` **必须是 HTTP(S) URL**（浏览器加载），不能写本地盘路径。默认指向 CDN；可用 `.env` 的 `IDENTITY_BRAND_ENDPOINT` 覆盖。

## 私有化部署

| 模式 | 配置 |
|------|------|
| 自托管 Logto | 本 compose 上生产（换密码/域名/TLS） |
| 对接企业 IdP | 产品侧 `IDP_MODE=external_oidc` + 企业 `IDP_ISSUER`，无需本服务 |
| SAML | 在 Logto 配置 SAML Connector，产品无感 |

## 端口

| 服务 | 端口 |
|------|------|
| OIDC | 3001 |
| Admin | 3002 |
| Brand 静态资源 | 3005（`shared/brand`，登录页 logo） |
| PostgreSQL | 5433 |
| Redis | 6381（宿主机；容器内仍为 6379。默认避开 VistaRemote 的 6380） |

可在 `.env` 覆盖。

## Docker Desktop 自动启动

三个服务均配置 `restart: unless-stopped`，并带健康检查。本机**至少成功 `compose up` / `pnpm id:up` 一次**后：

1. Docker Desktop → Settings → **General** → 勾选 **Start Docker Desktop when you sign in**
2. Docker Desktop 启动时会按 restart 策略自动拉起 `luminary-identity*` 容器

| 命令 | 效果 |
|------|------|
| `pnpm id:down` / `docker compose stop` | 临时停止；**容器保留**，下次 Desktop 启动仍会自启 |
| `pnpm id:destroy` / `docker compose down` | 移除容器；需再次 `pnpm id:up` 才恢复自启 |

详见 [LOCAL_DEV_DOCKER.md](./LOCAL_DEV_DOCKER.md)。
