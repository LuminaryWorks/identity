# 自助注册邮箱策略

编辑本目录 [`register-email-policy.json`](./register-email-policy.json) 即可，**不必改代码**。

| `mode` | 效果 |
|--------|------|
| `allowlist`（默认） | 仅 `allowlist` 内域名可邮箱注册 |
| `blocklist` | 除 `blocklist` 外均可注册 |
| `off` | 不限制常见邮箱；**仍拒绝** `blocklist` 里的一次性邮箱（若要完全不限，把 `blocklist` 设为 `[]`） |

**默认 allowlist（消费邮箱）**：Gmail、Googlemail、QQ / Foxmail、163 / 126 / yeah.net、Outlook / Hotmail / Live / MSN、iCloud / me / mac、Yahoo、Proton、新浪、Aliyun、139。

**操作示例**

```json
// 1）完全不限制域名（含一次性邮箱也放行 —— 不推荐公网）
{ "mode": "off", "blocklist": [], "allowlist": [] }

// 2）保持白名单，追加公司域名
{ "mode": "allowlist", "allowlist": [ "gmail.com", "…", "acme.com" ] }

// 3）只拦一次性邮箱
{ "mode": "blocklist" }
```

Auth Gateway 启动时读取此文件（可用 `AUTH_REGISTER_POLICY_FILE` 指到其它路径）。  
环境变量 `AUTH_REGISTER_EMAIL_MODE` / `ALLOWLIST` / `BLOCKLIST` / IP 限额 **若已设置则覆盖文件**。  
公开只读：`GET {gateway}/api/register-policy`（登录页可自动拉取）。
