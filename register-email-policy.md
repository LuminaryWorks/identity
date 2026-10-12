# 自助注册邮箱策略

编辑本目录 [`register-email-policy.json`](./register-email-policy.json) 即可，**不必改代码**。

| `mode` | 效果 |
|--------|------|
| `off`（默认） | 只要是邮箱格式（6–64 个字符）即可 |
| `blocklist` | 与 `off` 相同，不按域名名单拦截 |
| `allowlist` | 仅 `allowlist` 内域名可邮箱注册 |

`codeCooldownSec`（默认 **120**）是同一邮箱两次发送注册验证码的最短间隔，前后端都会执行。

不区分临时邮箱或正式邮箱。邮箱（6–64）、用户名（3–20）、验证码（6 位数字）、密码（8–32）在登录卡片和 Auth Gateway 上按长度与格式校验。

**默认 allowlist（消费邮箱）**：Gmail、Googlemail、QQ / Foxmail、163 / 126 / yeah.net、Outlook / Hotmail / Live / MSN、iCloud / me / mac、Yahoo、Proton、新浪、Aliyun、139。

**操作示例**

```json
// 1）任意邮箱格式（默认）
{ "mode": "off", "blocklist": [], "allowlist": [] }

// 2）保持白名单，追加公司域名
{ "mode": "allowlist", "allowlist": [ "gmail.com", "…", "acme.com" ] }

// 3）与 1 相同：不按域名拦截
{ "mode": "off" }
```

Auth Gateway 启动时读取此文件（可用 `AUTH_REGISTER_POLICY_FILE` 指到其它路径）。  
环境变量 `AUTH_REGISTER_EMAIL_MODE` / `ALLOWLIST` / `BLOCKLIST` / IP 限额 **若已设置则覆盖文件**。  
公开只读：`GET {gateway}/api/register-policy`（登录页可自动拉取）。
