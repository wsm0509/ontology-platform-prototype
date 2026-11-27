# 规则抽屉下拉稳定性（2026-11-27）

## 问题与范围

自然语言规则抽屉每次 change 调用 drawOverlay，将 overlayRoot.innerHTML 整体替换，造成抽屉动画重播、滚动归零、焦点丢失及 details 展开状态重置。本轮仅调整自然语言规则 authoring 抽屉，保留其他抽屉既有行为。

## 实现与验收

- [x] 所有合法下拉 change 改为 workflowRuleAuthoringRefresh，不再调用 drawOverlay。
- [x] 原位核对 [data-rule-intent-preview]，通过 DOM diff 更新实际变化节点；不替换 overlay、drawer、drawer-body、自然语言输入框或 footer。
- [x] 保留 input / select / textarea 身份，只同步变动 value、属性与 options；文本输入不重写相同 value，不重新创建原文输入或抢光标。
- [x] details 的 open 状态保留；高级核对打开后选择属性或执行范围不自动折叠。
- [x] 保留滚动位置，布局联动时以触发控件的视口位置补偿滚动；原控件仍存在时保持焦点。
- [x] 条件 / 断言使用 WeakMap 生成稳定 UI key，不污染业务结构、保存数据或发布指纹；引用、接口、参数采用稳定 id / name。
- [x] 删除前置行后仍保留对应行的正确控件，不按旧索引错误复用；父容器稳定时只更新索引事件标记。
- [x] 本地 / 接口方式切换、入参、返回字段与类型、判断方式、比较属性及值输入形态仍联动。
- [x] 修改任一配置仍立即失效结构化草稿、禁用旧确认按钮，不改变人工确认保存和执行逻辑。
- [x] 示例填充、增删配置行、生成预览也走原位更新；成功不重新播放抽屉动画。
- [x] 无效属性 / 接口配置在当前抽屉原位显示错误，不重建或强制滚动至顶部；权限 / 跨场景错误仍使用原安全门禁。
- [x] index.html 更新 authoring 缓存版本至 v7。

## 验证

新增 tests/scene-rule-drawer-stability.test.cjs **26/26 通过**：14 类真实 change 事件、轻量 DOM / template 解析、Refresh 集成、稳定节点身份、滚动 / 焦点 / 展开、options / value / disabled、删除索引移位以及参数和输入形态联动。不增加依赖。

最终规则专项 **262/262 通过**；node --check scene-rule-authoring.js 和 git diff --check 通过。

同期全量工作区 **405/406 通过**；唯一失败为范围外场景流“默认与已保存策略在对应详情显示，浏览不写workflow或发布fingerprint”，本轮未修改 scene-flow.js 或其测试，不宣称全量通过。

尝试浏览器验收，但连接返回 native pipe closed before response；未完成浏览器实际滚动视觉验收。Node DOM 集成测试不替代实机视觉验收。

未 commit / push，保留原有与同期工作区修改。
