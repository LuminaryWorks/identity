# identity — Agent 规则（LuminaryWorks 生态）

本仓是共享 Identity（Logto）。上线权威：`../../LuminaryWorksDeployment/AGENTS.md`（sibling 在 `www/LuminaryWorksDeployment`）。

- 修 → 本机验 → push `main`。
- 用户要上线：同会话进入 `LuminaryWorksDeployment`，按该仓协议 ship（manifest `sources.identity`）。
- 禁止本仓直接改生产 VPS。Identity 变更影响**所有**产品登录，notes 必须写明风险；优先低峰 ship + 立刻 accept。
