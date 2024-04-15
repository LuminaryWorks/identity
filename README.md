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
2. 若无 M2M：`scripts/bootstrap-m2m.mjs`（向 default 租户写入 Management API M2M，**无需先打开 Admin**）
3. `scripts/register-apps.mjs` → `registered-apps.json`
4. `scripts/sync-client-ids.mjs` → 写入各产品 `.env` / `.env.development`
5. `scripts/seed-dev-user.mjs` → 本地测试账号 `DEV_USER.json`

启动后：

- OIDC Issuer：`http://localhost:3001/oidc`
- Admin 控制台：`http://localhost:3002`
- 测试账号：见 `DEV_USER.json`（默认 `dev@luminaryworks.local` / `LuminaryDev!234`）

## 应用注册（幂等）

也可手动：

```bash
node scripts/bootstrap-m2m.mjs   # 仅首次 / 无 M2M 时
node scripts/register-apps.mjs
node scripts/sync-client-ids.mjs
node scripts/seed-dev-user.mjs
```

脚本读取 [`apps.json`](./apps.json)，幂等创建 SPA 与 API 资源，并把 `CLIENT_ID` 写入 `registered-apps.json`。

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

### 统一登录页品牌（Omni Sign-in Experience）

Logto 自带登录页的 logo / 主色走 **Sign-in Experience 配置**（Admin 或 Management API），不是改 Logto 源码：

| 项 | 来源 |
|----|------|
| Logo | `shared/brand/luminaryworks-logo.svg`，经 `identity-brand` 暴露为 `http://localhost:3005/luminaryworks-logo.svg` |
| 主色 | `#1677ff`（`shared/brand/tokens.css` → `--lw-primary`） |

```bash
node scripts/apply-branding.mjs
```

`logoUrl` **必须是 HTTP(S) URL**（浏览器加载），不能写本地盘路径。生产环境把该 URL 换成 CDN / 文档站静态地址即可。

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

三个服务均配置 `restart: unless-stopped`。本机**至少成功 `compose up` 一次**后：

1. Docker Desktop → Settings → **General** → 勾选 **Start Docker Desktop when you sign in**（登录 Windows 后自动开 Docker）
2. Docker Desktop 启动时会按 restart 策略自动拉起 `luminary-identity*` 容器

手动停止（`docker compose stop` / `pnpm id:down`）后不会自动再起，直到下次 `up`；`docker compose down` 会移除容器，需重新 `up` 才会恢复自动启动。
