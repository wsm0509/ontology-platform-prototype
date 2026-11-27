# 三种提交方式 TDD 记录（2026-11-27）

- [x] 输入解析：三选一提交方式；语义消息 / 明确复核 / 人工点击入口互斥，保留正式校验、终检和防重。
- [x] 环境：沿用 Node.js 22、node:test、tests/workspace.cjs；原生静态 JS，无 React/package.json，未安装 Jest 或新增依赖。bits-unit-test-gen 不可用，按现有测试模式手工补充。
- [x] RED：首次 123 测试 / 38 失败，证明第三模式缺失与旧授权入口差异。安全审查追加测试再发现 8 项 handoff RED。
- [x] GREEN：同一专项命令 `node --test --test-reporter=spec tests/scene-flow-submit-mode.test.cjs tests/scene-flow-semantic-submit.test.cjs`，最终 139 / 139 通过。
- [x] 重构复核：提交来源与模式再次核验；新 handoff 核验可信复核、终检所有 checks 并在失败/异常时撤销状态；旧布尔策略保持兼容。
- [x] 完成验证：`node --test --test-reporter=spec tests/*.test.cjs`，645 / 645 通过；JS 语法与 diff 检查通过。
- [x] 回填：[场景流三种提交方式-checklist.md](场景流三种提交方式-checklist.md)。

测试直接执行现有业务引擎与配置事件；浏览器 API 使用既有环境替身。真实 AI / 后端 / 业务写入不在验证范围，未执行真实浏览器视觉验收。规范缺失，按既有代码模式执行。
