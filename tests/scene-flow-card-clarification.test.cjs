const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');

function full() {
  const run = workspace();
  const loaded = new Set(['app.js', 'scene-system.js', 'deletion.js', 'graph-explorer.js']);
  for (const [, file] of fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').matchAll(/src="([^"?]+)\?/g)) {
    if (!loaded.has(file)) {
      run(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
      loaded.add(file);
    }
  }
  run(`
    function clarificationCandidateIds(html) {
      return (html.match(/<button\\b[^>]*>/g) || [])
        .filter(tag => tag.includes('data-action="scene-flow-choose-material"'))
        .map(tag => tag.match(/data-id="([^"]+)"/)[1]);
    }
    function noClarificationSelector(html) {
      assert(!html.includes('data-field="clarification"'), '不应再暴露抽屉澄清形式 selector');
      assert(!html.includes('data-flow-inline-field="clarification"'), '不应再暴露行内澄清形式 selector');
    }
  `);
  return run;
}
const editing = `selectScene('release', 'actions');actionsMap['scene-release-edit']({dataset: {id: 'release'}});`;
const open = `selectScene('release', 'actions');actionsMap['scene-flow-open']();`;

// RED-first 契约：先写失败期望，主代理完成实现后才运行；本文件不改运行时代码。
test('默认与 legacy fields 配置均只读归一为 candidates，不重写原配置或指纹', () => full()(`
  selectScene('release', 'actions');const s = scene();
  assert.equal(sceneFlowDefaults().clarification, 'candidates');
  for (const legacy of [undefined, {}, {clarification: 'fields'}, {clarification: 'candidates'}]) {
    if (legacy === undefined) delete s.workflow.sceneFlow;else s.workflow.sceneFlow = structuredClone(legacy);
    s.workflow.flow = {stages: {clarify: {clarification: 'fields'}}};
    const before = sceneFlowFingerprint(s), workflow = JSON.stringify(s.workflow);
    assert.equal(sceneFlowConfig(s).clarification, 'candidates');
    assert.deepEqual(sceneFlowStageFields.clarify.config, ['maxRetries']);
    assert(!Object.hasOwn(sceneFlowStageConfig(s, 'clarify'), 'clarification'));
    for (const [stage] of sceneFlowStages) {
      sceneFlowStageDetailHTML(s, stage);sceneFlowView(s);
    }
    sceneFlowBusinessExampleHTML(s);actionsMap['scene-flow-open']();extraDrawers.sceneFlow();
    assert.equal(sceneFlowFingerprint(s), before);assert.equal(JSON.stringify(s.workflow), workflow);
    closeOverlay(true);
  }
`));

test('澄清阶段行内编辑和兼容抽屉不再有 clarification selector，仍可编辑重试和提示', () => full()(editing + `
  const s = scene();s.workflow.sceneFlow = {...sceneFlowDefaults(), clarification: 'fields'};
  const before = sceneFlowFingerprint(s), workflow = JSON.stringify(s.workflow);
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'clarify'}});
  assert.equal(state.drawer, null);assert(sceneFlowUI.editor);
  assert(!Object.hasOwn(sceneFlowUI.editor.draft, 'clarification'));
  const inline = sceneFlowStageDetailHTML(s, 'clarify');noClarificationSelector(inline);
  for (const key of ['maxRetries', 'clarifyPrompt']) assert(inline.includes('data-flow-inline-field="' + key + '"'));
  actionsMap['scene-flow-inline-cancel']();
  sceneFlowOpenStageSettings({dataset: {stage: 'clarify'}});
  assert.equal(state.drawer.type, 'sceneFlowStageSettings');assert(!Object.hasOwn(state.drawer.draft, 'clarification'));
  const drawer = extraDrawers.sceneFlowStageSettings();noClarificationSelector(drawer);
  for (const key of ['maxRetries', 'clarifyPrompt']) assert(drawer.includes('data-field="' + key + '"'));
  closeOverlay(true);assert.equal(sceneFlowFingerprint(s), before);assert.equal(JSON.stringify(s.workflow), workflow);
`));

test('伪造澄清形式输入或草稿不能从阶段编辑切换回字段式', () => full()(editing + `
  const s = scene(), before = sceneFlowFingerprint(s), workflow = JSON.stringify(s.workflow);
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'clarify'}});
  dispatchTestEvent('change', {dataset: {flowInlineField: 'clarification'}, value: 'fields'});
  assert(!Object.hasOwn(sceneFlowUI.editor.draft, 'clarification'));
  sceneFlowUI.editor.draft.clarification = 'fields';actionsMap['scene-flow-inline-save']();
  assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow), workflow);actionsMap['scene-flow-inline-cancel']();
  sceneFlowOpenStageSettings({dataset: {stage: 'clarify'}});
  dispatchTestEvent('change', {dataset: {field: 'clarification'}, value: 'fields'});
  assert(!Object.hasOwn(state.drawer.draft, 'clarification'));
  state.drawer.draft.clarification = 'fields';sceneFlowSaveStage();assert(state.drawer.error);
  assert.equal(JSON.stringify(s.workflow), workflow);assert.equal(sceneFlowFingerprint(s), before);closeOverlay(true);
  assert.equal(sceneFlowConfig(s).clarification, 'candidates');
`));

for (const clarification of ['candidates', 'fields']) {
  test('多个候选固定显示选择卡片，即使 legacy clarification=' + clarification, () => full()(`
    selectScene('release', 'actions');const s = scene();s.workflow.sceneFlow = {...sceneFlowDefaults(), clarification: '${clarification}'};
    const before = sceneFlowFingerprint(s), workflow = JSON.stringify(s.workflow);actionsMap['scene-flow-open']();
    actionsMap['scene-flow-example']({dataset: {id: 'ambiguous'}});actionsMap['scene-flow-recognize']();
    const d = state.drawer;assert.equal(d.flow.stage, 'clarify');assert.equal(d.flow.branch, 'ambiguous');assert(d.flow.candidates.length > 1);
    assert(!d.flow.generated);assert(!d.draft.materialCode, '不允许默认采用第一条');
    const html = extraDrawers.sceneFlow();noClarificationSelector(html);assert(html.includes('请选择确切本体实例'));
    assert.deepEqual(clarificationCandidateIds(html), d.flow.candidates.map(candidate => candidate.materialCode));
    for (const candidate of d.flow.candidates) assert(html.includes(esc(candidate.materialCode + ' · ' + candidate.materialName)));
    assert.equal(sceneFlowFingerprint(s), before);assert.equal(JSON.stringify(s.workflow), workflow);
    actionsMap['scene-flow-choose-material']({dataset: {id: 'MAT-20260081'}});
    assert.equal(d.draft.materialCode, 'MAT-20260081');assert(d.flow.generated);assert.equal(d.flow.stage, 'mapping');
    assert.equal(sceneFlowFingerprint(s), before);assert.equal(JSON.stringify(s.workflow), workflow);
  `));
}

test('卡片澄清仅允许当前候选，不存在或已登记但不在候选中的任意对象均拒绝', () => full()(`
  selectScene('release', 'actions');const s = scene();s.workflow.sceneFlow = {...sceneFlowDefaults(), clarification: 'fields'};
  actionsMap['scene-flow-open']();
  state.drawer.draft.request = '创建发布单 MAT-20260081 MAT-20260082 项目 PRJ-2026-A 软件 SW-20260032 V5.8.2 后端业务部 主题“冲突”';
  actionsMap['scene-flow-recognize']();const d = state.drawer;
  assert.equal(d.flow.branch, 'ambiguous');assert.deepEqual(d.flow.candidates.map(candidate => candidate.materialCode), ['MAT-20260081', 'MAT-20260082']);
  assert(catalog.some(candidate => candidate.materialCode === 'MAT-20260099'), '使用实际已登记但不在当前候选内的对象验证 guard');
  for (const id of ['NOT-EXISTING', 'MAT-20260099']) {
    const draft = JSON.stringify(d.draft), candidates = JSON.stringify(d.flow.candidates);
    actionsMap['scene-flow-choose-material']({dataset: {id}});assert(d.error);assert(!d.flow.generated);
    assert.equal(d.flow.stage, 'clarify');assert.equal(JSON.stringify(d.draft), draft);assert.equal(JSON.stringify(d.flow.candidates), candidates);
    actionsMap['scene-flow-submit']();assert(!d.flow.receipt);
  }
  actionsMap['scene-flow-choose-material']({dataset: {id: 'MAT-20260082'}});assert(d.flow.generated);assert.equal(d.draft.materialCode, 'MAT-20260082');
`));

test('固定卡片不取消缺失关键信息追问，补齐前不得生成或提交', () => full()(`
  selectScene('release', 'actions');const s = scene();s.workflow.sceneFlow = {...sceneFlowDefaults(), clarification: 'fields'};
  const before = sceneFlowFingerprint(s);actionsMap['scene-flow-open']();state.drawer.draft.request = '创建发布单 MAT-20260081';actionsMap['scene-flow-recognize']();
  const d = state.drawer;assert.equal(d.flow.branch, 'recognized');assert.equal(d.flow.stage, 'clarify');assert(!d.flow.generated);
  const missing = d.flow.missing.map(([key]) => key);
  for (const key of ['projectCode', 'softwareCode', 'version', 'submitDepartment', 'subject']) assert(missing.includes(key), key);
  const html = extraDrawers.sceneFlow();assert(html.includes('<details open class="plain-details section-gap"><summary>补充关键信息'));
  for (const [key, label] of d.flow.missing) {
    assert(html.includes('data-field="' + key + '"'), key);assert(d.flow.history.some(entry => entry.role === 'assistant' && entry.text.includes(label)), label);
  }
  actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();assert(!d.flow.result);assert(!d.flow.receipt);
  for (const [field, value] of Object.entries({projectCode: 'PRJ-2026-A', softwareCode: 'SW-20260032', version: 'V5.8.2', submitDepartment: '后端业务部', subject: '补充升级'})) sceneFlowInputChange({dataset: {field}, value});
  actionsMap['scene-flow-recognize']();assert.equal(d.flow.missing.length, 0);assert(d.flow.generated);assert.equal(d.flow.stage, 'mapping');assert.equal(sceneFlowFingerprint(s), before);
`));

test('无法识别无候选时不允许任意选择，仍保留关键字段追问', () => full()(open + `
  actionsMap['scene-flow-example']({dataset: {id: 'unknown'}});actionsMap['scene-flow-recognize']();const d = state.drawer;
  assert.equal(d.flow.stage, 'clarify');assert.equal(d.flow.branch, 'unknown');assert.equal(d.flow.candidates.length, 0);
  assert.deepEqual(clarificationCandidateIds(extraDrawers.sceneFlow()), []);
  assert(extraDrawers.sceneFlow().includes('补充关键信息'));assert(d.flow.missing.length);assert(d.flow.history.some(entry => entry.text.includes(sceneFlowStageConfig(scene(), 'recognize').noMatchPrompt)));
  actionsMap['scene-flow-choose-material']({dataset: {id: 'MAT-20260081'}});assert(d.error);assert(!d.flow.generated);assert(!d.draft.materialCode);
  actionsMap['scene-flow-submit']();assert(!d.flow.receipt);
`));

test('删除首页配置入口不影响统一 finish 提交方式行内编辑、保存与重开', () => full()(editing + `
  const s = scene(), before = sceneFlowFingerprint(s), other = JSON.stringify(appScenes.trial.workflow);
  assert.equal(sceneFlowConfig(s).submissionMode, 'authorized');assert.equal(sceneFlowConfig(s).allowAssistantSubmit, true);assert.equal(sceneFlowConfig(s).autoSubmit, false);
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'finish'}});
  const html = sceneFlowStageDetailHTML(s, 'finish');noClarificationSelector(html);
  const tags = (html.match(/<select\\b[^>]*>[\\s\\S]*?<[/]select>/g) || []).filter(tag => tag.includes('data-flow-inline-field="submissionMode"'));
  assert.equal(tags.length, 1);assert(!html.includes('data-flow-inline-field="allowAssistantSubmit"'));assert(!html.includes('data-flow-inline-field="autoSubmit"'));
  const tag = tags[0];assert(tag.includes('aria-label="提交方式"'));assert(tag.includes('语义授权提交（默认）'));assert(tag.includes('AI 自动提交'));assert(tag.includes('人工提交'));
  assert(/<option\\b[^>]*value="authorized"[^>]*\\bselected\\b/.test(tag));assert(!/\\bdisabled\\b/.test(tag));
  dispatchTestEvent('change', {dataset: {flowInlineField: 'submissionMode'}, tagName: 'SELECT', checked: false, value: 'auto'});
  assert.equal(sceneFlowUI.editor.draft.submissionMode, 'auto');assert.equal(sceneFlowUI.editor.draft.autoSubmit, true);assert.equal(sceneFlowUI.editor.draft.allowAssistantSubmit, true);assert.equal(sceneFlowFingerprint(s), before);
  actionsMap['scene-flow-inline-save']();assert.equal(sceneFlowUI.editor, null);assert.equal(s.workflow.sceneFlow.submissionMode, 'auto');assert.equal(s.workflow.sceneFlow.autoSubmit, true);assert.equal(s.workflow.sceneFlow.allowAssistantSubmit, true);
  assert.notEqual(sceneFlowFingerprint(s), before);assert.equal(JSON.stringify(appScenes.trial.workflow), other);assert.equal(sceneFlowConfig(s).clarification, 'candidates');
  actionsMap['scene-flow-inline-edit']({dataset: {stage: 'finish'}});assert.equal(sceneFlowUI.editor.draft.submissionMode, 'auto');assert.equal(sceneFlowUI.editor.draft.autoSubmit, true);assert.equal(sceneFlowUI.editor.draft.allowAssistantSubmit, true);
  const reopened = sceneFlowStageDetailHTML(s, 'finish');assert(!reopened.includes('data-flow-inline-field="allowAssistantSubmit"'));assert(!reopened.includes('data-flow-inline-field="autoSubmit"'));
  assert(/<select\\b[^>]*data-flow-inline-field="submissionMode"[^>]*>[\\s\\S]*?<option\\b[^>]*value="auto"[^>]*\\bselected\\b/.test(reopened));
  dispatchTestEvent('change', {dataset: {flowInlineField: 'submissionMode'}, tagName: 'SELECT', checked: true, value: 'authorized'});
  actionsMap['scene-flow-inline-save']();assert.equal(s.workflow.sceneFlow.submissionMode, 'authorized');assert.equal(s.workflow.sceneFlow.autoSubmit, false);assert.equal(s.workflow.sceneFlow.allowAssistantSubmit, true);assert.equal(sceneFlowConfig(s).clarification, 'candidates');
`));
