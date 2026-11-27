const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');

function fullWorkspace() {
  const run = workspace();
  const loaded = new Set(['app.js', 'scene-system.js', 'deletion.js', 'graph-explorer.js']);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const [, file] of html.matchAll(/src="([^"?]+)\?/g)) {
    if (!loaded.has(file)) {
      run(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
      loaded.add(file);
    }
  }
  run(`
    function submissionButton(html, action) {
      return (html.match(/<button\\b[^>]*>[\\s\\S]*?<[/]button>/g) || []).find(tag => tag.includes('data-action="' + action + '"')) || '';
    }
    function submissionSwitch(html, inline = false) {
      const attribute = inline ? 'data-flow-inline-field' : 'data-field';
      const tag = (html.match(/<input\\b[^>]*>/g) || []).find(tag => tag.includes(attribute + '="allowAssistantSubmit"'));
      assert(tag, '配置应包含场景级 allowAssistantSubmit checkbox');
      assert(tag.includes('type="checkbox"'));
      assert(tag.includes('role="switch"'));
      return tag;
    }
    function submissionModeSelect(html) {
      const tags = (html.match(/<select\\b[^>]*>[\\s\\S]*?<[/]select>/g) || []).filter(tag => tag.includes('data-flow-inline-field="submissionMode"'));
      assert.equal(tags.length, 1, '复核提交应只显示一个提交方式 selector');
      assert(tags[0].includes('aria-label="提交方式"'));
      assert(tags[0].includes('语义授权提交（默认）'));assert(tags[0].includes('AI 自动提交'));assert(tags[0].includes('人工提交'));
      assert(!html.includes('data-flow-inline-field="autoSubmit"'), '统一 finish 不应暴露 legacy auto 开关');
      assert(!html.includes('data-flow-inline-field="allowAssistantSubmit"'), '统一 finish 不应暴露 legacy allowance 开关');
      return tags[0];
    }
    function submissionExample(id = 'recognized') {
      actionsMap['scene-flow-example']({dataset: {id}});
      actionsMap['scene-flow-recognize']();
      sceneFlowConfirmAll();
    }
    function submissionReady() {
      submissionExample();
      actionsMap['scene-flow-validate']();
      assert(state.drawer.flow.result.passed, '通过真实本地规则校验后才进入复核');
      actionsMap['scene-flow-review']();
      assert.equal(state.drawer.flow.reviewStamp, state.drawer.flow.resultStamp);
    }
    function submissionNoReceipt(d) {
      assert(!d.flow.receipt, '自行提交不能创建模拟代提交回执');
      assert.equal(sceneFlowReceipts.size, 0, '自行提交不能注册任何 sceneFlowReceipts');
    }
  `);
  return run;
}
// Explicit legacy booleans preserve the manual runtime API contract; missing configuration now authorizes only after explicit user consent.
const open = `selectScene('release', 'actions');scene().workflow.sceneFlow = {...sceneFlowDefaults()};actionsMap['scene-flow-open']();`;
const editing = `selectScene('release', 'actions');actionsMap['scene-release-edit']({dataset: {id: 'release'}});`;
const legacyEditing = editing + `scene().workflow.sceneFlow = {...sceneFlowDefaults()};`;
// Enabled legacy fixtures change only s.workflow.sceneFlow, not other scenes or shared defaults.
const enabled = `selectScene('release', 'actions');const s = scene();s.workflow.sceneFlow = {...sceneFlowDefaults(), allowAssistantSubmit: true};actionsMap['scene-flow-open']();`;

// Defaults and presentation.
test('提交默认 authorized 且保留 legacy 布尔默认 false：纯读取、页面渲染与打开不写默认配置', () => fullWorkspace()(`
  selectScene('release', 'actions');const s = scene(), before = sceneFlowFingerprint(s), workflow = JSON.stringify(s.workflow);
  assert.equal(sceneFlowDefaults().allowAssistantSubmit, false);
  assert.equal(sceneFlowConfig(s).allowAssistantSubmit, true);assert.equal(sceneFlowConfig(s).autoSubmit, false);
  assert.equal(sceneFlowEffectiveSubmissionMode(s), 'authorized');
  applicationActionsView(s);sceneFlowStageDetailHTML(s, 'submitted');sceneFlowBusinessExampleHTML(s);
  actionsMap['scene-flow-open']();assert.equal(state.drawer.flow.stage, 'input');
  assert.equal(JSON.stringify(s.workflow), workflow);assert.equal(sceneFlowFingerprint(s), before);
  assert.equal(s.workflow.sceneFlow, undefined);submissionNoReceipt(state.drawer);
`));

test('无提交配置默认为 authorized，legacy 显式 false/true 保留原策略且场景隔离', () => fullWorkspace()(`
  selectScene('release', 'actions');const s = scene(), trialBefore = JSON.stringify(appScenes.trial.workflow);delete s.workflow.sceneFlow;
  assert.equal(sceneFlowConfig(s).allowAssistantSubmit, true);assert.equal(sceneFlowEffectiveSubmissionMode(s), 'authorized');
  s.workflow.sceneFlow = {maxRetries: 1};assert.equal(sceneFlowConfig(s).allowAssistantSubmit, true);assert.equal(sceneFlowEffectiveSubmissionMode(s), 'authorized');
  s.workflow.sceneFlow = {allowAssistantSubmit: false};assert.equal(sceneFlowConfig(s).allowAssistantSubmit, false);assert.equal(sceneFlowEffectiveSubmissionMode(s), 'manual');
  s.workflow.sceneFlow = {allowAssistantSubmit: true};assert.equal(sceneFlowConfig(s).allowAssistantSubmit, true);assert.equal(sceneFlowEffectiveSubmissionMode(s), 'authorized');
  assert.equal(sceneFlowConfig(appScenes.trial).allowAssistantSubmit, true);assert.equal(JSON.stringify(appScenes.trial.workflow), trialBefore);
`));

test('关闭时最终阶段显示完成 / 用户自行提交，页面与示例不承诺助手提交回执', () => fullWorkspace()(`
  selectScene('release', 'actions');const s = scene();s.workflow.sceneFlow = {allowAssistantSubmit: false};const before = sceneFlowFingerprint(s);
  const panel = sceneFlowStageDetailHTML(s, 'submitted'), page = applicationActionsView(s), example = sceneFlowBusinessExampleHTML(s);
  assert(panel.includes('完成'));assert(panel.includes('用户自行提交'));
  assert(page.includes('完成'));assert(example.includes('用户自行提交'));
  assert(!page.includes('data-action="scene-flow-submit"'));assert(!example.includes('data-action="scene-flow-submit"'));
  assert.equal(sceneFlowFingerprint(s), before);assert.equal(sceneFlowReceipts.size, 0);
`));

test('基础配置与 legacy submitted 抽屉保留 allowance 开关，统一 finish 行内只显示提交方式', () => fullWorkspace()(legacyEditing + `
  const s = scene(), before = JSON.stringify(s.workflow);
  actionsMap['scene-flow-settings']();assert.equal(state.drawer.draft.allowAssistantSubmit, false);
  assert(!/\\bchecked\\b/.test(submissionSwitch(extraDrawers.sceneFlowSettings())));closeOverlay(true);
  sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});
  assert.equal(state.drawer.draft.allowAssistantSubmit, false);submissionSwitch(extraDrawers.sceneFlowStageSettings());closeOverlay(true);
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'finish'}});
  assert.equal(sceneFlowUI.editor.draft.submissionMode, undefined);assert.equal(sceneFlowEffectiveSubmissionMode(s), 'manual');
  assert.equal(sceneFlowUI.editor.draft.allowAssistantSubmit, false);assert.equal(sceneFlowUI.editor.draft.autoSubmit, false);
  const html = sceneFlowStageDetailHTML(s, 'finish'), tag = submissionModeSelect(html);
  assert(!/\\bdisabled\\b/.test(tag));assert(html.includes('旧配置已关闭代提交'));
  actionsMap['scene-flow-inline-cancel']();assert.equal(JSON.stringify(s.workflow), before);
`));

test('legacy 显式关闭的已通过校验只显示手动完成按钮，未复核按钮禁用且 submit 入口隐藏', () => fullWorkspace()(open + `
  submissionExample();actionsMap['scene-flow-validate']();const d = state.drawer;
  let html = extraDrawers.sceneFlow(), button = submissionButton(html, 'scene-flow-handoff');
  assert(button.includes('完成并返回表单'));assert(/\\bdisabled\\b/.test(button));
  assert(!submissionButton(html, 'scene-flow-submit'));
  actionsMap['scene-flow-review']();html = extraDrawers.sceneFlow();button = submissionButton(html, 'scene-flow-handoff');
  assert(button.includes('完成并返回表单'));assert(!/\\bdisabled\\b/.test(button));
  assert(!submissionButton(html, 'scene-flow-submit'));submissionNoReceipt(d);
`));

// Manual completion has exactly the same validation and review gates as simulated submission.
test('关闭时代提交函数及委托入口必须拒绝，即使有效校验和人工复核均通过', () => fullWorkspace()(open + `
  submissionReady();const d = state.drawer, before = runtimeRecords.length, logs = JSON.stringify(state.logs);
  sceneFlowSubmit();assert(!d.flow.handoff);submissionNoReceipt(d);assert.notEqual(d.flow.stage, 'submitted');
  dispatchTestEvent('click', {dataset: {action: 'scene-flow-submit'}, closest() {return this;}});
  assert(!d.flow.handoff);submissionNoReceipt(d);assert.notEqual(d.flow.stage, 'submitted');
  assert.equal(runtimeRecords.length, before);assert.equal(JSON.stringify(state.logs), logs);
`));

test('手动完成必须先生成并确认映射、执行有效校验和人工复核', () => fullWorkspace()(open + `
  const d = state.drawer;assert.equal(typeof actionsMap['scene-flow-handoff'], 'function');
  actionsMap['scene-flow-handoff']();assert(!d.flow.handoff);submissionNoReceipt(d);
  actionsMap['scene-flow-example']({dataset: {id: 'recognized'}});actionsMap['scene-flow-recognize']();
  actionsMap['scene-flow-handoff']();assert(!d.flow.handoff);submissionNoReceipt(d);
  sceneFlowConfirmAll();actionsMap['scene-flow-handoff']();assert(!d.flow.handoff);
  actionsMap['scene-flow-validate']();assert(d.flow.result.passed);
  actionsMap['scene-flow-handoff']();assert(!d.flow.handoff);assert.notEqual(d.flow.stage, 'submitted');
  actionsMap['scene-flow-review']();actionsMap['scene-flow-handoff']();assert(d.flow.handoff);
`));

test('手动完成独立终检并生成隔离 payload，runtime submitted 仅表示完成且零回执零运行日志', () => fullWorkspace()(open + `
  submissionReady();const d = state.drawer, before = runtimeRecords.length, logs = JSON.stringify(state.logs), originalExecute = sceneFlowExecute;
  let finalCalls = 0;sceneFlowExecute = function(...args) {finalCalls++;return originalExecute(...args);};
  dispatchTestEvent('click', {dataset: {action: 'scene-flow-handoff'}, closest() {return this;}});
  sceneFlowExecute = originalExecute;assert.equal(finalCalls, 1, '不能把旧 passed 结果当作独立终检');
  assert.equal(d.flow.stage, 'submitted');assert.equal(d.flow.stageDefinition.stage, 'submitted');
  assert(d.flow.finalResult.passed);assert.equal(d.flow.finalResult.event, 'submit');
  assert.equal(d.flow.handoff.businessSubmitted, false);assert.equal(d.flow.handoff.submissionMode, 'manual');
  assert.deepEqual(d.flow.handoff.payload, d.flow.payload);assert.notEqual(d.flow.handoff.payload, d.flow.payload);
  assert.notEqual(d.flow.handoff.payload, d.flow.generated.payload);
  submissionNoReceipt(d);assert.equal(runtimeRecords.length, before);assert.equal(JSON.stringify(state.logs), logs);
  const html = extraDrawers.sceneFlow();assert(html.includes('完成'));assert(html.includes('用户自行提交'));
  assert(!submissionButton(html, 'scene-flow-submit'));
`));

for (const sample of ['unknown', 'ambiguous', 'missing-image', 'di-positive', 'minimum-unreleased', 'timeout']) {
  test('手动完成不能绕过未识别 / 阻断 / 未知：' + sample, () => fullWorkspace()(open + `
    submissionExample(${JSON.stringify(sample)});actionsMap['scene-flow-validate']();const d = state.drawer;
    actionsMap['scene-flow-review']();actionsMap['scene-flow-handoff']();
    assert(!d.flow.handoff);assert.notEqual(d.flow.stage, 'submitted');submissionNoReceipt(d);
    if (${JSON.stringify(sample)} === 'timeout') assert(d.flow.result.checks.some(check => check.status === '未知'));
  `));
}

for (const failure of ['unknown', 'blocked', 'throw']) {
  test('手动独立终检出现新' + failure + '必须撤销复核、保留最新失败且不能完成', () => fullWorkspace()(open + `
    submissionReady();const d = state.drawer, originalExecute = sceneFlowExecute;
    sceneFlowExecute = function(...args) {
      if (${JSON.stringify(failure)} === 'throw') throw Error('终检来源执行失败');
      const r = originalExecute(...args);r.passed = false;
      r.checks.push({name: '终检新增失败', target: 'mainOrder', status: ${JSON.stringify(failure === 'unknown' ? '未知' : '阻断')}, level: '阻断', detail: '新事实不能沿用旧通过', evidence: []});
      return r;
    };
    actionsMap['scene-flow-handoff']();sceneFlowExecute = originalExecute;
    assert(!d.flow.handoff);assert(!d.flow.reviewStamp);assert.notEqual(d.flow.stage, 'submitted');submissionNoReceipt(d);
    if (${JSON.stringify(failure)} !== 'throw') {
      assert.equal(d.flow.stage, 'blocked');assert.equal(d.flow.finalResult.passed, false);
      assert(d.flow.blockers.some(b => b.name === '终检新增失败'));
    } else assert(d.error.includes('终检来源执行失败'));
    actionsMap['scene-flow-handoff']();assert(!d.flow.handoff, '修复来源后也必须重新校验与复核');
    actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();actionsMap['scene-flow-handoff']();assert(d.flow.handoff);
  `));
}

test('手动终检实际来源出现新失败而非仅复用旧校验，未知不能视作通过', () => fullWorkspace()(open + `
  submissionReady();const d = state.drawer, originalCall = callCapability;
  callCapability = function(id, ...args) {if (id === 'demo.safetyDI') return {ok: false, error: '终检新故障', capability: id, params: args[0]};return originalCall(id, ...args);};
  actionsMap['scene-flow-handoff']();callCapability = originalCall;
  assert(!d.flow.handoff);assert.equal(d.flow.stage, 'blocked');assert.equal(d.flow.finalResult.passed, false);
  assert(d.flow.finalResult.checks.some(check => check.status === '未知'));assert(!d.flow.reviewStamp);submissionNoReceipt(d);
`));

// Seals, stale completion, and adversarial handoff objects.
for (const mutation of ['input', 'authority', 'mapping', 'confirmations']) {
  test('手动完成之前' + mutation + '变化使旧检查 / 复核过期，不能交付旧 payload', () => fullWorkspace()(open + `
    submissionReady();const d = state.drawer;
    if (${JSON.stringify(mutation)} === 'input') d.draft.request += ' changed';
    if (${JSON.stringify(mutation)} === 'authority') d.flow.authority.projects['PRJ-2026-A'].safetyDI = 9;
    if (${JSON.stringify(mutation)} === 'mapping') scene().bindings.main[0].target += 'Changed';
    if (${JSON.stringify(mutation)} === 'confirmations') delete d.flow.confirmations[0];
    actionsMap['scene-flow-handoff']();assert(!d.flow.handoff);assert.notEqual(d.flow.stage, 'submitted');submissionNoReceipt(d);
  `));
}

for (const mutation of ['input-event', 'input-direct', 'authority', 'mapping', 'config']) {
  test('已经生成的 handoff 在' + mutation + '变化后失效，不能重复交付旧完成对象', () => fullWorkspace()(open + `
    submissionReady();actionsMap['scene-flow-handoff']();const d = state.drawer;assert(d.flow.handoff);
    if (${JSON.stringify(mutation)} === 'input-event') sceneFlowInputChange({dataset: {field: 'request'}, value: '创建发布单 MAT-20260082'});
    if (${JSON.stringify(mutation)} === 'input-direct') d.draft.request += ' changed';
    if (${JSON.stringify(mutation)} === 'authority') d.flow.authority.projects['PRJ-2026-A'].safetyDI = 9;
    if (${JSON.stringify(mutation)} === 'mapping') scene().bindings.main[0].target += 'Changed';
    if (${JSON.stringify(mutation)} === 'config') scene().workflow.sceneFlow = {...sceneFlowDefaults(), allowAssistantSubmit: true};
    if (${JSON.stringify(mutation)} === 'input-event') assert(!d.flow.handoff, 'input 委托应立即清除 handoff');
    extraDrawers.sceneFlow();actionsMap['scene-flow-handoff']();
    assert(!d.flow.handoff);submissionNoReceipt(d);
  `));
}

test('伪造 handoff / submitted 阶段不能替代生成确认、有效校验、人工复核及终检', () => fullWorkspace()(open + `
  const d = state.drawer, fake = {payload: {forged: true}, businessSubmitted: false, submissionMode: 'manual'};
  d.flow.handoff = structuredClone(fake);d.flow.stage = 'submitted';
  actionsMap['scene-flow-handoff']();assert(!d.flow.handoff);submissionNoReceipt(d);
  submissionExample();actionsMap['scene-flow-validate']();assert(d.flow.result.passed);
  d.flow.handoff = structuredClone(fake);d.flow.stage = 'submitted';
  actionsMap['scene-flow-handoff']();assert(!d.flow.handoff);assert(!d.flow.reviewStamp);submissionNoReceipt(d);
  actionsMap['scene-flow-review']();const originalExecute = sceneFlowExecute;let finalCalls = 0;
  sceneFlowExecute = function(...args) {finalCalls++;return originalExecute(...args);};
  d.flow.handoff = structuredClone(fake);actionsMap['scene-flow-handoff']();sceneFlowExecute = originalExecute;
  assert.equal(finalCalls, 1, '伪造完成对象不得触发防重短路跳过终检');
  assert(d.flow.handoff);assert(!d.flow.handoff.payload.forged);assert.deepEqual(d.flow.handoff.payload, d.flow.payload);
`));

test('handoff 内容篡改不能伪装已完成请求；重复完成仍无任何代提交回执或真实日志', () => fullWorkspace()(open + `
  submissionReady();actionsMap['scene-flow-handoff']();const d = state.drawer, logs = JSON.stringify(state.logs), count = runtimeRecords.length;
  d.flow.handoff.payload.mainOrder.subject = '伪造完成数据';
  actionsMap['scene-flow-handoff']();
  assert(!d.flow.handoff || d.flow.handoff.payload.mainOrder.subject === d.flow.payload.mainOrder.subject);
  submissionNoReceipt(d);assert.equal(JSON.stringify(state.logs), logs);assert.equal(runtimeRecords.length, count);
`));

test('载入另一样例与重新校验清除已完成 handoff，不能残留上一单的交付结果', () => fullWorkspace()(open + `
  submissionReady();actionsMap['scene-flow-handoff']();const d = state.drawer;assert(d.flow.handoff);
  actionsMap['scene-flow-validate']();assert(!d.flow.handoff);
  actionsMap['scene-flow-review']();actionsMap['scene-flow-handoff']();assert(d.flow.handoff);
  actionsMap['scene-flow-example']({dataset: {id: 'unknown'}});assert(!d.flow.handoff);assert(!d.flow.result);submissionNoReceipt(d);
`));

test('区块及跨场景切换使手动完成门禁失效，不能为另一场景返回旧单', () => fullWorkspace()(open + `
  submissionReady();const d = state.drawer, other = JSON.stringify(appScenes.trial.workflow);
  scene().selectedBlock = d.blockId === 'items' ? 'main' : 'items';actionsMap['scene-flow-handoff']();assert(!d.flow.handoff);assert(d.error.includes('区块'));submissionNoReceipt(d);
  closeOverlay(true);scene().selectedBlock = 'main';actionsMap['scene-flow-open']();submissionReady();const old = state.drawer;
  selectScene('trial');state.drawer = old;actionsMap['scene-flow-handoff']();assert(!old.flow.handoff);submissionNoReceipt(old);
  assert.equal(JSON.stringify(appScenes.trial.workflow), other);
`));

// Enabled submission remains opt-in, simulated, final-checked, and idempotent.
test('当前场景显式开启后仍须用户主动复核并点击模拟代提交，不能自动产生回执', () => fullWorkspace()(enabled + `
  submissionExample();actionsMap['scene-flow-validate']();const d = state.drawer, count = runtimeRecords.length;
  assert(!d.flow.receipt);assert(!d.flow.handoff);
  assert(submissionButton(extraDrawers.sceneFlow(), 'scene-flow-submit'));
  actionsMap['scene-flow-submit']();assert(!d.flow.receipt, '代提交不能跳过人工复核');
  actionsMap['scene-flow-review']();assert(!d.flow.receipt, '复核不等于主动代提交确认');
  assert(submissionButton(extraDrawers.sceneFlow(), 'scene-flow-handoff'), '开关开启仍允许用户自行提交');
  actionsMap['scene-flow-submit']();assert(d.flow.receipt);assert.equal(d.flow.receipt.businessSubmitted, false);
  assert.equal(d.flow.stage, 'submitted');assert(d.flow.finalResult.passed);assert(!d.flow.handoff);
  assert.equal(sceneFlowReceipts.size, 1);assert.equal(runtimeRecords.length, count);
  assert(!state.logs.some(l => l.type === '场景流配置测试' && l.result === '成功'));
`));

test('开关开启也可以选择自行提交 handoff，不注册回执且不记录代提交日志', () => fullWorkspace()(enabled + `
  submissionReady();const d = state.drawer, count = runtimeRecords.length, logs = JSON.stringify(state.logs);
  actionsMap['scene-flow-handoff']();assert(d.flow.handoff);assert.equal(d.flow.handoff.submissionMode, 'manual');
  assert.equal(d.flow.handoff.businessSubmitted, false);assert.equal(d.flow.stage, 'submitted');assert(d.flow.finalResult.passed);
  submissionNoReceipt(d);assert.equal(runtimeRecords.length, count);assert.equal(JSON.stringify(state.logs), logs);
`));

test('开启代提交仍独立终检，新来源故障不生成回执，恢复后须重新校验与复核', () => fullWorkspace()(enabled + `
  submissionReady();const d = state.drawer, originalCall = callCapability;
  callCapability = function(id, ...args) {if (id === 'demo.safetyDI') return {ok: false, error: '新故障', capability: id, params: args[0]};return originalCall(id, ...args);};
  actionsMap['scene-flow-submit']();callCapability = originalCall;
  assert(!d.flow.receipt);assert.equal(sceneFlowReceipts.size, 0);assert.equal(d.flow.stage, 'blocked');assert(!d.flow.reviewStamp);
  actionsMap['scene-flow-submit']();assert(!d.flow.receipt);
  actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();assert(d.flow.receipt);
`));

test('开启代提交保留同会话与跨会话防重，不增加真实运行或重复配置测试日志', () => fullWorkspace()(enabled + `
  submissionReady();actionsMap['scene-flow-submit']();const d = state.drawer, id = d.flow.receipt.id, count = runtimeRecords.length;
  const logs = state.logs.filter(l => l.type === '场景流配置测试').length;
  actionsMap['scene-flow-submit']();assert.equal(d.flow.receipt.id, id);assert.equal(sceneFlowReceipts.size, 1);
  closeOverlay(true);actionsMap['scene-flow-open']();submissionReady();actionsMap['scene-flow-submit']();
  assert.equal(state.drawer.flow.receipt.id, id);assert.equal(sceneFlowReceipts.size, 1);
  assert.equal(state.logs.filter(l => l.type === '场景流配置测试').length, logs);assert.equal(runtimeRecords.length, count);
`));

// Configuration persistence, strict booleans, scene isolation, and release lifecycle.
test('基础配置 checkbox 使用 checked 布尔而非字符串 value，保存 / 重开与最终阶段保持同步', () => fullWorkspace()(legacyEditing + `
  const s = scene(), before = sceneFlowFingerprint(s), other = JSON.stringify(appScenes.trial.workflow), otherConfig = JSON.stringify(appScenes.range.workflow.sceneFlow);
  actionsMap['scene-flow-settings']();dispatchTestEvent('change', {dataset: {field: 'allowAssistantSubmit'}, type: 'checkbox', tagName: 'INPUT', checked: true, value: 'on'});
  assert.equal(state.drawer.draft.allowAssistantSubmit, true);assert.equal(sceneFlowFingerprint(s), before);
  actionsMap['scene-flow-save-settings']();assert.equal(s.workflow.sceneFlow.allowAssistantSubmit, true);assert.notEqual(sceneFlowFingerprint(s), before);
  assert.equal(JSON.stringify(appScenes.trial.workflow), other);assert.equal(JSON.stringify(appScenes.range.workflow.sceneFlow), otherConfig);
  actionsMap['scene-flow-settings']();assert.equal(state.drawer.draft.allowAssistantSubmit, true);assert(/\\bchecked\\b/.test(submissionSwitch(extraDrawers.sceneFlowSettings())));closeOverlay(true);
  sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});assert.equal(state.drawer.draft.allowAssistantSubmit, true);closeOverlay(true);
  actionsMap['scene-flow-settings']();dispatchTestEvent('change', {dataset: {field: 'allowAssistantSubmit'}, type: 'checkbox', tagName: 'INPUT', checked: false, value: 'true'});
  assert.equal(state.drawer.draft.allowAssistantSubmit, false);actionsMap['scene-flow-save-settings']();assert.equal(s.workflow.sceneFlow.allowAssistantSubmit, false);
`));

test('最终阶段 legacy checkbox 与行内 checkbox 保存同一场景级配置，不降格为阶段文本', () => fullWorkspace()(legacyEditing + `
  const s = scene();sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});
  dispatchTestEvent('change', {dataset: {field: 'allowAssistantSubmit'}, type: 'checkbox', tagName: 'INPUT', checked: true, value: 'on'});
  assert.equal(state.drawer.draft.allowAssistantSubmit, true);sceneFlowSaveStage();assert.equal(s.workflow.sceneFlow.allowAssistantSubmit, true);
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'submitted'}});
  const e = sceneFlowUI.editor;assert.equal(e.draft.allowAssistantSubmit, true);
  dispatchTestEvent('change', {dataset: {field: 'allowAssistantSubmit', flowInlineField: 'allowAssistantSubmit'}, type: 'checkbox', tagName: 'INPUT', checked: false, value: 'true'});
  assert.equal(e.draft.allowAssistantSubmit, false);actionsMap['scene-flow-inline-save']();assert.equal(s.workflow.sceneFlow.allowAssistantSubmit, false);
  actionsMap['scene-flow-settings']();assert.equal(state.drawer.draft.allowAssistantSubmit, false);closeOverlay(true);
`));

test('基础配置及最终阶段取消隔离：不修改场景、全局 legacy、指纹或发布配置', () => fullWorkspace()(legacyEditing + `
  const s = scene(), before = sceneFlowFingerprint(s), workflow = JSON.stringify(s.workflow), otherConfig = JSON.stringify(appScenes.range.workflow.sceneFlow);
  actionsMap['scene-flow-settings']();state.drawer.draft.allowAssistantSubmit = true;closeOverlay(true);
  assert.equal(sceneFlowFingerprint(s), before);assert.equal(JSON.stringify(s.workflow), workflow);
  sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});state.drawer.draft.allowAssistantSubmit = true;closeOverlay(true);
  assert.equal(sceneFlowFingerprint(s), before);assert.equal(JSON.stringify(s.workflow), workflow);
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'submitted'}});sceneFlowUI.editor.draft.allowAssistantSubmit = true;actionsMap['scene-flow-inline-cancel']();
  assert.equal(sceneFlowFingerprint(s), before);assert.equal(JSON.stringify(s.workflow), workflow);assert.equal(JSON.stringify(appScenes.range.workflow.sceneFlow), otherConfig);
`));

for (const value of ['true', 'false', 'on', 1, 0, null, undefined, {}, []]) {
  test('allowAssistantSubmit 严格布尔校验拒绝 ' + String(value), () => {
    const literal = value === undefined ? 'undefined' : JSON.stringify(value);
    fullWorkspace()(legacyEditing + `
      const s = scene(), before = JSON.stringify(s.workflow), bad = ${literal};
      assert(sceneFlowConfigError({...sceneFlowDefaults(), allowAssistantSubmit: bad}), '不能使用 Boolean(value) 放行非法配置');
      actionsMap['scene-flow-settings']();state.drawer.draft.allowAssistantSubmit = bad;actionsMap['scene-flow-save-settings']();
      assert(state.drawer.error);assert.equal(JSON.stringify(s.workflow), before);closeOverlay(true);
      sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});state.drawer.draft.allowAssistantSubmit = bad;sceneFlowSaveStage();
      assert(state.drawer.error);assert.equal(JSON.stringify(s.workflow), before);closeOverlay(true);
      actionsMap['scene-flow-inline-edit']({dataset: {stage: 'submitted'}});sceneFlowUI.editor.draft.allowAssistantSubmit = bad;actionsMap['scene-flow-inline-save']();
      assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow), before);actionsMap['scene-flow-inline-cancel']();
      s.workflow.sceneFlow = {...sceneFlowDefaults(), allowAssistantSubmit: bad};actionsMap['scene-flow-open']();
      assert(!state.drawer, '非法布尔配置不能进入可代提交的体验');
    `);
  });
}

test('布尔 false 与 true 均通过配置校验，legacy 对象显式关闭仍保留手动完成', () => fullWorkspace()(`
  selectScene('release', 'actions');const s = scene();
  for (const value of [false, true]) assert.equal(sceneFlowConfigError({...sceneFlowDefaults(), allowAssistantSubmit: value}), '');
  s.workflow.sceneFlow = {intents: ['draft', 'explain'], unknown: 'clarify', clarification: 'candidates', maxRetries: 2, confirmation: 'per-field', autoSubmit: false, allowAssistantSubmit: false, safety: 'mandatory'};
  assert.equal(sceneFlowConfig(s).allowAssistantSubmit, false);assert.equal(sceneFlowConfigError(sceneFlowConfig(s)), '');
  actionsMap['scene-flow-open']();submissionReady();actionsMap['scene-flow-submit']();submissionNoReceipt(state.drawer);
  actionsMap['scene-flow-handoff']();assert(state.drawer.flow.handoff);
`));

test('缺失最终阶段开关字段不能保存受控行内草稿，不能借缺省覆盖已开启值', () => fullWorkspace()(legacyEditing + `
  const s = scene();s.workflow.sceneFlow = {...sceneFlowDefaults(), allowAssistantSubmit: true};
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'submitted'}});const before = JSON.stringify(s.workflow);
  delete sceneFlowUI.editor.draft.allowAssistantSubmit;actionsMap['scene-flow-inline-save']();
  assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow), before);actionsMap['scene-flow-inline-cancel']();
`));

test('未进入编辑以及已发布只读不能开启代提交；保存时权限撤销也不能写配置', () => fullWorkspace()(`
  selectScene('release', 'actions');const s = scene();s.workflow.sceneFlow = {...sceneFlowDefaults()};const before = JSON.stringify(s.workflow);
  actionsMap['scene-flow-settings']();assert(!state.drawer);sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});assert(!state.drawer);
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'submitted'}});assert(!sceneFlowUI.editor);assert.equal(JSON.stringify(s.workflow), before);
  actionsMap['scene-release-edit']({dataset: {id: s.id}});actionsMap['scene-flow-settings']();state.drawer.draft.allowAssistantSubmit = true;
  sceneReleaseEnsure(s).editing = false;actionsMap['scene-flow-save-settings']();assert(state.drawer);assert.equal(JSON.stringify(s.workflow), before);closeOverlay(true);
  const m = sceneReleaseEnsure(s);assert.equal(m.editing, false);m.check = sceneReleaseCheck(s);sceneReleasePublish(s.id);assert.equal(m.status, '已发布');
  const published = JSON.stringify(m.snapshot);actionsMap['scene-flow-settings']();assert(!state.drawer);
  sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});assert(!state.drawer);actionsMap['scene-flow-inline-edit']({dataset: {stage: 'submitted'}});assert(!sceneFlowUI.editor);
  assert.equal(JSON.stringify(m.snapshot), published);assert.equal(sceneFlowConfig(s).allowAssistantSubmit, false);
`));

test('跨 scene 基础配置和最终阶段草稿不得保存到另一场景', () => fullWorkspace()(legacyEditing + `
  const s = scene();actionsMap['scene-flow-settings']();state.drawer.draft.allowAssistantSubmit = true;
  const old = state.drawer, releaseBefore = JSON.stringify(s.workflow), trialBefore = JSON.stringify(appScenes.trial.workflow);
  selectScene('trial');state.drawer = old;sceneFlowSaveSettings();assert(old.error);
  assert.equal(JSON.stringify(s.workflow), releaseBefore);assert.equal(JSON.stringify(appScenes.trial.workflow), trialBefore);closeOverlay(true);
  selectScene('release', 'actions');sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});state.drawer.draft.allowAssistantSubmit = true;
  const stage = state.drawer;selectScene('trial');state.drawer = stage;sceneFlowSaveStage();assert(stage.error);
  assert.equal(JSON.stringify(s.workflow), releaseBefore);assert.equal(JSON.stringify(appScenes.trial.workflow), trialBefore);closeOverlay(true);
`));

test('最终阶段开关 owner 与指纹保护不能被克隆元数据或新配置覆盖绕过', () => fullWorkspace()(legacyEditing + `
  const s = scene();sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});const old = state.drawer, before = JSON.stringify(s.workflow);
  state.drawer = {...old, draft: {...old.draft, allowAssistantSubmit: true}};sceneFlowSaveStage();assert(state.drawer.error);assert.equal(JSON.stringify(s.workflow), before);
  state.drawer = old;closeOverlay(true);actionsMap['scene-flow-inline-edit']({dataset: {stage: 'submitted'}});
  sceneFlowUI.editor.draft.allowAssistantSubmit = true;s.workflow.action += '配置变更';const changedWorkflow = JSON.stringify(s.workflow);
  actionsMap['scene-flow-inline-save']();assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow), changedWorkflow);actionsMap['scene-flow-inline-cancel']();
`));

test('开关进入发布快照与指纹，已发布体验手动完成不写快照；修订关闭隔离并可恢复', () => fullWorkspace()(legacyEditing + `
  const s = scene(), before = sceneFlowFingerprint(s);actionsMap['scene-flow-settings']();state.drawer.draft.allowAssistantSubmit = true;actionsMap['scene-flow-save-settings']();
  assert.notEqual(sceneFlowFingerprint(s), before);assert.equal(sceneReleaseConfiguration(s).scene.workflow.sceneFlow.allowAssistantSubmit, true);
  actionsMap['scene-release-edit']({dataset: {id: s.id}});const m = sceneReleaseEnsure(s);m.check = sceneReleaseCheck(s);assert(m.check.ok);sceneReleasePublish(s.id);
  assert.equal(m.status, '已发布');assert.equal(m.snapshot.scene.workflow.sceneFlow.allowAssistantSubmit, true);const snapshot = JSON.stringify(m.snapshot), records = runtimeRecords.length;
  actionsMap['scene-flow-open']();submissionReady();actionsMap['scene-flow-handoff']();assert(state.drawer.flow.handoff);submissionNoReceipt(state.drawer);
  assert.equal(JSON.stringify(m.snapshot), snapshot);assert.equal(runtimeRecords.length, records);closeOverlay(true);
  actionsMap['scene-release-edit']({dataset: {id: s.id}});actionsMap['scene-flow-inline-edit']({dataset: {stage: 'submitted'}});
  sceneFlowUI.editor.draft.allowAssistantSubmit = false;actionsMap['scene-flow-inline-save']();assert.equal(sceneFlowConfig(scene()).allowAssistantSubmit, false);
  assert.equal(JSON.stringify(m.snapshot), snapshot);sceneReleaseRestore(s.id);assert.equal(sceneFlowConfig(scene()).allowAssistantSubmit, true);
  assert.equal(JSON.stringify(m.snapshot), snapshot);
`));

test('页面移除基础配置入口，统一 finish 编辑提供唯一提交方式 selector', () => fullWorkspace()(editing + `
  const s = scene(), html = applicationActionsView(s);
  assert(!submissionButton(html, 'scene-flow-settings'));assert(!html.includes('基础配置 / 输入引导'));
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'finish'}});
  submissionModeSelect(sceneFlowStageDetailHTML(s, 'finish'));actionsMap['scene-flow-inline-cancel']();
`));

for (const mutation of ['permission', 'scene', 'block', 'owner']) {
  test('最终阶段行内开关 ' + mutation + ' 变更时拒绝保存，不污染场景配置', () => fullWorkspace()(legacyEditing + `
    const s = scene();actionsMap['scene-flow-inline-edit']({dataset: {stage: 'submitted'}});
    sceneFlowUI.editor.draft.allowAssistantSubmit = true;
    const before = JSON.stringify(s.workflow), other = JSON.stringify(appScenes.trial.workflow);
    if (${JSON.stringify(mutation)} === 'permission') sceneReleaseEnsure(s).editing = false;
    if (${JSON.stringify(mutation)} === 'scene') selectScene('trial');
    if (${JSON.stringify(mutation)} === 'block') s.selectedBlock = sceneFlowUI.editor.blockId === 'items' ? 'main' : 'items';
    if (${JSON.stringify(mutation)} === 'owner') sceneFlowUI.editor = {...sceneFlowUI.editor};
    sceneFlowInlineSave();assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow), before);
    assert.equal(JSON.stringify(appScenes.trial.workflow), other);sceneFlowInlineCancel();
  `));
}

test('显式 false 保存与发布快照保持严格布尔，运行仍仅生成手动 handoff', () => fullWorkspace()(legacyEditing + `
  const s = scene();sceneFlowOpenStageSettings({dataset: {stage: 'submitted'}});
  state.drawer.draft.allowAssistantSubmit = false;sceneFlowSaveStage();
  assert.equal(s.workflow.sceneFlow.allowAssistantSubmit, false);
  actionsMap['scene-release-edit']({dataset: {id: s.id}});const m = sceneReleaseEnsure(s);m.check = sceneReleaseCheck(s);assert(m.check.ok);sceneReleasePublish(s.id);
  assert.equal(m.snapshot.scene.workflow.sceneFlow.allowAssistantSubmit, false);const published = JSON.stringify(m.snapshot);
  actionsMap['scene-flow-open']();submissionReady();actionsMap['scene-flow-handoff']();assert(state.drawer.flow.handoff);
  submissionNoReceipt(state.drawer);assert.equal(JSON.stringify(m.snapshot), published);
`));

test('修改代提交开关使旧体验配置指纹失效，不能复用旧授权进行代提交或手动完成', () => fullWorkspace()(enabled + `
  submissionReady();const d = state.drawer;s.workflow.sceneFlow.allowAssistantSubmit = false;
  actionsMap['scene-flow-submit']();assert(!d.flow.receipt);assert(d.error.includes('配置'));
  actionsMap['scene-flow-handoff']();assert(!d.flow.handoff);assert.equal(sceneFlowReceipts.size, 0);
`));
