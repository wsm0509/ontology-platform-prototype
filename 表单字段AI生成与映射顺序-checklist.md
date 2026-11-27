# 非映射字段 AI 生成描述与手动映射顺序

来源：2026-11-25 用户要求未参与映射来源新增「AI 按规则生成」和生成规则描述；手动添加填入规则先选表单字段信息，再选本体对象信息。沿用现有离线原型、字段 metadata、抽屉事件与编辑 / 发布保护，无新增依赖或后端接口。

- [x] A-01 `passed` 非映射 AI 来源
  - TDD：否，场景页面领域配置，无共享组件 / Hook / 通用工具。先追加失败领域测试，再实现验证。
  - [x] 未参与来源保留用户输入 / 系统生成，新增 AI 按规则生成；参与映射时来源控件禁用，技术标识不允许改来源。
  - [x] 选择 AI 后就地展开字段生成规则描述输入，输入不抢焦点；切换其他来源隐藏描述，保留草稿。
  - [x] AI 模式描述必填，空白保存失败、不部分更新；描述随 fields 保存、重开和版本快照保留。
  - [x] AI 字段不进入本体映射列表建议 / 人工候选；主列表展示 AI 来源和描述。
  - [x] 场景流明确字段尚未接生成服务，不能冒充已生成结果或被忽略后直接提交。本次未新增真实 AI 运行契约。
- [x] A-02 `passed` 手动表单填入规则顺序
  - TDD：否，既有页面顺序调整。
  - [x] 新增 / 编辑先展示表单目标、中文名称、保存表 / 列，再展示本体属性、取数来源和填入方式。
  - [x] 既有预填、字段目标联动、来源选择、测试 / 保存保护不变。

验证：
- `node --check scene-tables.js`、`scene-flow.js`、`scene-mapping.js`、`scene-workflow.js`：通过。
- `node --test tests/*.test.cjs`：114 个 Node 顶层测试通过，包含真实 input/change 事件、字段模式切换、重开持久化、描述校验、映射顺序、生成未接入提交保护及既有回归。
- `git diff --check`：通过。
- lint / typecheck / build：`skipped`，离线 JS 原型未配置对应命令；以语法和真实模块 / 处理器回归替代。
- 浏览器 / 视觉验收：`skipped`，按用户要求不操作浏览器。

关键文件：scene-tables.js、scene-mapping.js、scene-flow.js、scene-workflow.js、styles.css、index.html、tests/scene-tables.test.cjs、tests/scene-mapping.test.cjs、tests/scene-flow.test.cjs、使用与调整说明.md。
边界：仅字段生成规则配置，没有执行任意自然语言生成或真实数据库写入；配置与测试当前会话有效，无实现阻塞项。
