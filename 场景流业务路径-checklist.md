# 场景流业务路径验收 checklist

## 修改范围

- [x] 仅修改 `scene-flow.js`、`tests/scene-flow.test.cjs`，新增本 checklist。
- [x] 不修改 `styles.css`、`index.html`、其他 authoring / runtime / release 文件及测试。
- [x] 无 browser 操作，无 commit。

## 业务展示

- [x] 顶部明确：场景流只管理提单时的交互和流转，不重复字段映射/校验条件。
- [x] 内容顺序：七步主路径导航 → 当前阶段操作表 → 分流与异常表 → 可折叠完整连续样例。
- [x] 主路径：输入 → 识别 → 补充澄清 → 表单确认 → 规则校验 → 复核 → 提交。
- [x] 七阶段均有「发生什么 / 系统动作 / 用户交互 / 下一步」，移除原三列普通节点卡。
- [x] 保留七阶段 `role=tablist` / `role=tab` / `role=tabpanel`、选中状态及原阶段 ID。
- [x] 当前阶段有受保护「编辑本阶段」入口；详细配置与提示独立折叠展示，继续引用 `workflow.flow.stages` / `sceneFlow`。
- [x] 异常表覆盖：可识别唯一、多个候选、无法识别、问题模糊、规则阻塞、超时、通过待复核。
- [x] 各分支都有「何时发生 / 系统如何处理 / 问用户什么 / 用户可做什么 / 满足何条件继续」。
- [x] 映射及规则仅引用，便捷跳转原 tabs，不增加技术字段配置。
- [x] 顶部突出原「体验完整提单流程（配置测试）」抽屉入口。

## 连贯示例及真实性

- [x] 同一请求串联九步：用户请求 → 助手澄清 → 用户选择对象 → 展示表单 → 阻塞解释 → 源系统处理与重查 → 通过 → 复核确认 → 提交回执。
- [x] 请求引用既有 `ambiguous` 工作流本地样例；缺图片为既有本地故障样例的说明性串联，不冒充一次已执行结果。
- [x] 示例中的输入、澄清、表单确认、阻塞、图片处理、复核、回执提示均读取现有阶段配置。
- [x] 标明「仅说明性示例，非执行结果」「本地样例」，默认折叠完整九步，外部处理及通过均为假设。
- [x] 展示不执行规则、不修改抽屉、不生成回执、不增加 runtimeRecords、不写入 workflow 或发布指纹。
- [x] 已保存提示及受控策略动态生效，提示经过 HTML 转义。

## 安全保留

- [x] 保留识别、字段确认、逐行校验、事实模拟、重试、复核、提交、防重门禁；在识别、校验、终检失败历史与处理建议中实际应用已保存分支 question / guide。
- [x] stage settings 复用同 drawer，增加 branch mode；WeakMap 同时锁定 mode / branch / stage / scene / block / fingerprint，保存复用现有 guard / workflowInvalidate。
- [x] 未改发布 / 修订 / 锁定 / 快照恢复门禁。
- [x] 页面和抽屉阶段浏览仍互相独立；浏览未来阶段不能推进真实执行。
- [x] 未引入任意流程节点编排。

## Action / releaseGuard 交接

**新增 action：无。**

- 跳转映射：复用 `scene-tab`，`data-tab="strategy"`。
- 跳转规则：复用 `scene-tab`，`data-tab="rules"`。
- 阶段浏览：原 `scene-flow-stage`。
- 阶段编辑 / 保存：原 `scene-flow-edit-stage` / `scene-flow-save-stage`。
- 完整体验：原 `scene-flow-open`。
- 全局配置 / 调试：原 `scene-flow-settings` / `workflow-test`。
- 示例及详细配置折叠使用原生 `<details>`，没有执行或修改配置 action。
- `releaseGuard` 无需为本次展示添加 mutation 注册。

## 测试结果

- [x] 原 flow baseline：41 / 41 GREEN。
- [x] 新增 5 项测试先 RED，失败针对缺失的主路径、操作表、异常表、连贯示例、tab 跳转及已保存配置同步。
- [x] `node --test tests/scene-flow.test.cjs`：46 / 46 GREEN（含原安全 / stage edit / 发布回归）。
- [x] `node --check scene-flow.js`：通过。
- [x] `git diff --check -- scene-flow.js tests/scene-flow.test.cjs`：通过。
- [x] 未修改其他 authoring tests；本次全量回归见下方增量记录。

## 本次增量：用户交互与异常分支可编辑

- [x] 七阶段操作表「用户交互」单元格直接显示「可编辑 · 自然语言用户交互提示」及原 `scene-flow-edit-stage` 按钮，非静态卡片伪配置。
- [x] 主路径系统动作 / 下一步以及分支系统处理 / 继续条件明确标注「固定安全机制（规则/流程门禁，不可直接编辑）」。
- [x] 异常表逐行显示「编辑追问与处理指引」；复用 `scene-flow-edit-stage` 的 `data-stage` + `data-branch`、`scene-flow-save-stage`，**新增 actions 无，releaseMutations 无需新增注册**。
- [x] `workflow.flow.branches[id] = {question, guide}` 仅允许两项字符串；拒绝空、超 800 字、错误类型、未知 schema / 分支和任意状态字段，保存 trim；默认值精确引用原分支行追问 / 指引（含当前阶段提示），不另造默认文案。
- [x] branch mode 无重试 / 跳转 / 安全关闭配置；保留权限、WeakMap owner、mode / branch / stage / 场景 / 区块 / 指纹、取消隔离、草稿历史、版本快照和旧结果失效检查。
- [x] recognized / ambiguous / unknown / vague-question 的 question / guide 实际进入识别对话；blocked / timeout / passed-review 实际进入校验对话及处理建议，终检失败同样使用最新分支消息。自然语言不改变 runtime 判定或下一步状态。
- [x] 阶段操作表与连续说明示例优先使用对应已保存分支提示；无分支值时兼容原阶段配置，连续示例保持「仅说明性示例，非执行结果」，不增加编辑 label。
- [x] RED：原 46 通过 + 新增 6 失败（`/tmp/scene-flow-branch-red.log`）；GREEN：52 / 52（原 46 无回退）。
- [x] 验证：`node --test tests/scene-flow.test.cjs`、`node --check scene-flow.js`、`git diff --check -- scene-flow.js tests/scene-flow.test.cjs 场景流业务路径-checklist.md`。
- [x] 无 package / QUALITY / docs 规范及 lint / typecheck / build 脚本，按现有原生 JS + node:test 模式执行；无需新增依赖或接口。
- [x] 仅改允许的三文件，不浏览器、不 commit；完整仓库集成回归由主 agent 最后复核。
