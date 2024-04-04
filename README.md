# LuminaryWorks Identity

LuminaryWorks 五产品 + IoT 控制台的**统一登录授权服务**（Logto OIDC）。一处部署，全生态共用同一 `sub`。

> 组织：[github.com/LuminaryWorks](https://github.com/LuminaryWorks) · 规格：[ecosystem-refactoring.md](https://github.com/LuminaryWorks/LuminaryWorks/blob/main/spec/ecosystem-refactoring.md)

## 一键启动

```bash
# Linux / macOS
./bootstrap.sh

# Windows
./bootstrap.ps1
```

启动后：

- OIDC Issuer：`http://localhost:3001/oidc`
- Admin 控制台：`http://localhost:3002`

## 应用注册（幂等）

首次需要一个 Machine-to-Machine 应用来调用 Management API：

1. 打开 Admin `http://localhost:3002`，创建管理员账号
2. Applications → Create → **Machine-to-Machine**，授予 *Logto Management API* 权限
3. 把 App ID / Secret 填入 `.env`（`LOGTO_M2M_APP_ID` / `LOGTO_M2M_APP_SECRET`）
4. 运行：

```bash
node scripts/register-apps.mjs
```

脚本读取 [`apps.json`](./apps.json)，幂等创建 6 个 SPA 应用与 5 个 API 资源，并把解析出的 `CLIENT_ID` 写入 `registered-apps.json`，供各产品 `.env` 填写。

## 接入产品（开发文档统一片段）

| 端 | 依赖 | 配置 |
|----|------|------|
| 后端 (NestJS) | `@luminary/auth-core` | `IDP_ISSUER=http://localhost:3001/oidc` |
| 前端 (SPA) | `@luminary/auth-react` | `VITE_IDP_ISSUER` + `VITE_IDP_CLIENT_ID` + `VITE_IDP_REDIRECT_URI` |

各产品 Redirect URI 见 `apps.json`。完整接入指南：[docs/develop/unified-login](https://github.com/LuminaryWorks/docs)。

## 私有化部署

| 模式 | 配置 |
|------|------|
| 自托管 Logto | 本 compose 直接上生产（换密码/域名/TLS） |
| 对接企业 IdP | 产品侧 `IDP_MODE=external_oidc` + 企业 `IDP_ISSUER`，无需本服务 |
| SAML | 在 Logto 配置 SAML Connector，产品无感 |

## 端口

| 服务 | 端口 |
|------|------|
| OIDC | 3001 |
| Admin | 3002 |
| PostgreSQL | 5433 |
| Redis | 6380 |

可在 `.env` 覆盖。
