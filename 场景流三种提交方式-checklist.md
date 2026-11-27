# 场景流：三种提交方式（2026-11-27）

来源：用户要求「语义授权提交、AI 自动提交、人工提交」三选一。

## 执行范围与验收（执行期补齐）

### SUBMIT-001 三选一配置与执行入口
- 状态：`passed`（专项配置与执行测试已通过，后续回归见 SUBMIT-002）。
- TDD：是，复用现有 `node:test` 与 `tests/workspace.cjs`。项目无 React / package.json；技能的 React/Jest 模板不适用，`bits-unit-test-gen` 未提供，采用现有测试环境与手工生成测试，不新增依赖。
  - RED：123 项，85 通过 / 38 失败；失败证明第三模式缺失、按钮可绕过语义模式、消息未标记来源。日志 `/tmp/scene-flow-three-modes-red.log`。
  - GREEN：`node --test --test-reporter=spec tests/scene-flow-submit-mode.test.cjs tests/scene-flow-semantic-submit.test.cjs`，139 / 139 通过。日志 `/tmp/scene-flow-three-modes-green.log`。
  - 重构复核：追加 settings 三模式 change / 取消、旧授权失效及 handoff 安全用例；发现 8 项 RED，补新模式可信复核与完整终检、失败撤销后全部 GREEN。legacy 回归保持。
- [x] 「复核提交」四列表上方常驻一个提交方式选择器：语义授权提交（默认）、AI 自动提交、人工提交。
- [x] 仅「编辑本阶段」后修改；保存 / 取消隔离，配置进入指纹和发布快照，发布配置只读。
- [x] 语义授权：当前字段确认、正式校验和复核完成后，明确当前提交消息授权并终检，不要求再点击按钮。
- [x] AI 自动：用户明确完成复核后自动终检及本地模拟提交；保存 / 浏览 / 预检 / 正式校验本身不提交。
- [x] 人工：复核后点击确认提交触发终检及本地模拟提交，语义提交消息不能触发；也可返回业务表单自行提交。
- [x] 三种模式保留过期失效、未知 / 失败阻断、终检和防重；旧布尔配置保留兼容且读取不迁移。
- [x] 页面摘要、阶段说明、连续样例与执行区同步解释当前模式。

### SUBMIT-002 回归与交付说明
- 状态：`passed`。
- TDD：部分，复核与返回表单安全边界补 RED / GREEN；既有文案断言按三种模式更新，不削弱安全行为。
- [x] 专项提交测试 139 / 139；相关场景流与页签测试 308 / 308（安全追加用例前）；最终全量 `node --test --test-reporter=spec tests/*.test.cjs` 645 / 645 通过，无跳过。日志 `/tmp/scene-flow-three-modes-all.log`。
- [x] `node --check scene-flow.js` 与 `git diff --check` 通过。
- [x] 更新使用说明和静态资源缓存版本 `scene-flow.js?v=14`；旧自动提交 checklist 标注历史记录。
- Typecheck / lint / build：项目无 TypeScript、lint / build 配置，使用 JS 语法和 diff 检查替代，不新增工程配置。
- 浏览器视觉验收：`skipped`，本次复用现有选择器与样式，未打开浏览器；渲染 / 按钮显隐 / 原生事件委托由 workspace 测试覆盖，不作为真实视觉验收证据。
- 规范 / typecheck / lint / build 配置缺失：`skipped`，按现有代码模式执行；JS 语法与 diff 检查作为替代。
- 无外部依赖阻塞；真实模型、接口调用、权限及后端幂等仍不在本次交付范围。

## 边界

- 本次仅配置、页面及本地状态，无 BAM / 真实提交 API 依赖，不新增临时接口。
- 「AI 自动提交」仍保留用户明确复核，不代表无人复核的自动审批。
- 所有本地回执 `businessSubmitted:false`；不调用真实 AI 或业务系统，不写业务数据库或发起审批。
- 规范 / docs / AGENTS.md / QUALITY.md 缺失，按 README、既有方案与原生 JS 模式执行。
- 不 commit / push；保留其他未提交变更。
