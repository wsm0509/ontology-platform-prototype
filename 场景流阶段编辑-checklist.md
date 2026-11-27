# 场景流阶段编辑验收

范围：仅 `scene-flow.js`、`tests/scene-flow.test.cjs` 与本文；不修改 index / styles / authoring / intent / runtime，不浏览器、不 commit / push。规范缺失，按现有离线 JS、`field` / `frame` / `openDrawer` / Node VM 真实事件测试模式执行；无新增接口或依赖。

## SF-EDIT-01 七阶段配置入口 — passed
- 每个阶段首个节点旁有“编辑本阶段”，仅打开本阶段字段；页面卡片仍是只读展示。
- 未进入场景编辑时按钮禁用，显示醒目提示；体验抽屉只读阶段页不新增配置编辑入口，避免吞掉未保存输入。
- 保留“高级全局配置”、完整体验和高级 JSON 调试。
- `sceneFlowOpenStageSettings` / `sceneFlowStageSettingsDrawer` / `sceneFlowSaveStage`；actions：`scene-flow-edit-stage` / `scene-flow-save-stage`；drawer type：`sceneFlowStageSettings`。

## SF-EDIT-02 字段范围与真实使用 — passed
| 阶段 | 复用 workflow.sceneFlow 字段 | 新增 workflow.flow.stages[stage] 字段及真实使用 |
| --- | --- | --- |
| input | — | inputMode：自然语言/优先结构字段，后者实际展开补充字段；inputPrompt：页面、体验与初始对话 |
| recognize | intents、unknown | noMatchPrompt：未知识别进入实际对话，不替代失败原因 |
| clarify | clarification、maxRetries | clarifyPrompt：候选冲突/缺失字段进入实际追问对话 |
| mapping | confirmation | mappingPrompt：生成建议后实际显示到对话；确认模式实际切换逐字段/整单 |
| check | maxRetries | recoveryMode：允许显式本地模拟/仅回来源系统；manual实际隐藏并拒绝模拟动作与超时模拟恢复。blockerPrompt、imagesGuide、diGuide、minimumGuide：实际阻断对话及失败证据处理建议 |
| review | — | reviewPrompt：校验通过后的实际复核对话 |
| submitted | — | receiptPrompt：真正完成终检后的测试回执对话；固定本地模拟免责声明仍保留 |
- 仅保存本阶段白名单字段；不覆盖其他阶段与原全局配置；全局保存不覆盖 flow。
- 提示限制 1–800 字非空，受控枚举校验；不开放 safety/skipStage/confirmation none 等危险选项。
- 未保存 draft 为深拷贝；取消不写配置、不改发布指纹、不推进流程。

## SF-EDIT-03 安全、过期和版本 — passed
- `sceneFlowEditAllowed`：明确草稿/修订 + editing 权限，发布配置不可编辑。
- `sceneFlowStageAllowed`：WeakMap 保存实际抽屉创建时 scene/block/stage/fingerprint 所有权，复制/伪造抽屉、修改阶段、跨场景跨区块、过期指纹和权限撤销均拒绝。
- `sceneFlowGuard(type)` 限定体验/全局/阶段抽屉类型，体验 action 不会误操作配置 draft。
- 保存进入完整 sceneReleaseFingerprint；`sceneFlowGeneratedCurrent` 也核验场景/区块/完整配置指纹，旧生成、校验及复核不可用于提交。
- 未知阻断、身份/规则校验、字段人工确认、复核、提交终检、防重均保持不可关闭；浏览阶段不推进执行。
- 已发布快照不被修订覆盖；恢复上次快照可恢复 flow 与 sceneFlow；旧无 flow 快照使用只读默认配置、不隐式初始化。

## SF-EDIT-04 发布包装集成 — passed
- 主 agent 已将 `scene-flow-edit-stage` / `scene-flow-save-stage` 加入 `scene-release.js` 的 `sceneReleaseMutations`；本 agent 未修改该文件。
- 自身 Allowed 与发布包装双重保护；保存草稿/修订版本记录、完整发布指纹与 check 清理生效。
- 集成后 `node --test tests/scene-flow.test.cjs` 41/41 通过。新增通用规则卡失败证据适配测试：无法进行已登记样例修复时按真实失败对象/入参提示负责人回来源系统处理后重新查询；最小系统默认文案不硬编码项目/软件/版本。

## 验证记录
- Baseline：`node --test tests/scene-flow.test.cjs`，33/33 passed。
- RED：增加六组测试，33 passed / 6 failed（缺编辑入口、动作及抽屉）；实现前证据已观察。
- GREEN 最终：追加复核/回执/人工恢复/伪造抽屉与通用失败证据用例，总计 41/41 passed。
- 过程历史（非最终阻塞）：集成前 40 项中 39 passed / 1 failed（新动作尚未 release 包装），主 agent 集成后消除；未降低断言。
- `node --check scene-flow.js`、`node --check tests/scene-flow.test.cjs`：passed。
- `git diff --check -- scene-flow.js tests/scene-flow.test.cjs`：passed。
- 全仓库回归最终：`node --test tests/*.test.cjs` 228/228 passed（包含并行模块最新测试）。
- 过程历史（非最终阻塞）：早期并行快照 220 项中 216 passed / 4 failed；1 项阶段发布包装、3 项 authoring 用例，现均已修复并通过最终全量回归。
- lint / typecheck / build：skipped，项目未配置 package.json/QUALITY 对应工具；以 JS 语法与真实模块事件测试覆盖。
- 浏览器 / 视觉：skipped，按用户要求不执行。
