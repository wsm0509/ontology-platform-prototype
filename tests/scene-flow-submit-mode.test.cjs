// 测试生成方式：TDD
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');

function fullWorkspace() {
  const run = workspace(), loaded = new Set(['app.js', 'scene-system.js', 'deletion.js', 'graph-explorer.js']);
  for (const [, file] of fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').matchAll(/src="([^"?]+)\?/g)) {
    if (!loaded.has(file)) {run(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));loaded.add(file);}
  }
  run(`
    function modeSelect(html, inline = false) {
      const tags = (html.match(/<select\\b[^>]*>[\\s\\S]*?<[/]select>/g) || []).filter(tag => tag.includes((inline ? 'data-flow-inline-field' : 'data-field') + '="submissionMode"'));
      assert.equal(tags.length, 1, '复核提交只展示一个提交方式 selector');
      assert(tags[0].includes('aria-label="提交方式"'));
      const choices = [...tags[0].matchAll(/<option\\b[^>]*value="([^"]+)"[^>]*>([^<]*)<[/]option>/g)].map(([, value, label]) => [value, label]);
      assert.equal(JSON.stringify(choices), JSON.stringify([['authorized','语义授权提交（默认）'],['auto','AI 自动提交'],['manual','人工提交']]), '提交方式严格为三模式及指定标签');
      assert(!html.includes((inline ? 'data-flow-inline-field' : 'data-field') + '="autoSubmit"'));
      assert(!html.includes((inline ? 'data-flow-inline-field' : 'data-field') + '="allowAssistantSubmit"'));return tags[0];
    }
    function modeSelected(tag, value) {assert(new RegExp('<option\\\\b[^>]*value="' + value + '"[^>]*\\\\bselected\\\\b').test(tag));}
    function autoButton(html, action) {return (html.match(/<button\\b[^>]*>[\\s\\S]*?<[/]button>/g) || []).find(tag => tag.includes('data-action="' + action + '"')) || '';}
    function autoExample(id = 'recognized') {actionsMap['scene-flow-example']({dataset:{id}});actionsMap['scene-flow-recognize']();}
    function autoValidated() {autoExample();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();assert(state.drawer.flow.result.passed);}
    function autoNoReceipt() {assert(!state.drawer.flow.receipt);assert(!state.drawer.flow.handoff);assert.equal(sceneFlowReceipts.size, 0);}
    function modeChange(value) {dispatchTestEvent('change', {dataset:{flowInlineField:'submissionMode'}, tagName:'SELECT', checked:value !== 'auto', value});}
  `);
  return run;
}
const selected = `selectScene('release', 'actions');`;
const editing = selected + `actionsMap['scene-release-edit']({dataset:{id:'release'}});`;
const autoOpen = selected + `scene().workflow.sceneFlow = {...sceneFlowDefaults(), autoSubmit:true, allowAssistantSubmit:true};actionsMap['scene-flow-open']();`;

for (const [mode, auto, allowance] of [['authorized',false,true],['auto',true,true],['manual',false,false]]) {
  test('三模式 '+mode+' 枚举读取派生一致布尔、有效且可打开，读取不迁移原配置', () => fullWorkspace()(selected + `
    const s=scene();s.workflow.sceneFlow={submissionMode:'${mode}'};const before=JSON.stringify(s.workflow),fingerprint=sceneFlowFingerprint(s),c=sceneFlowConfig(s);
    assert.equal(c.submissionMode,'${mode}');assert.equal(c.autoSubmit,${auto});assert.equal(c.allowAssistantSubmit,${allowance});assert.equal(sceneFlowConfigError(c),'');
    assert.equal(sceneFlowEffectiveSubmissionMode(s),'${mode}');assert.equal(sceneFlowAssistantSubmitAllowed(s),${allowance});assert.equal(sceneFlowAutoSubmitAllowed(s),${auto});
    modeSelected(modeSelect(sceneFlowStageDetailHTML(s,'finish'),true),'${mode}');actionsMap['scene-flow-open']();assert.equal(state.drawer.type,'sceneFlow');extraDrawers.sceneFlow();autoNoReceipt();
    assert.equal(JSON.stringify(s.workflow),before);assert.equal(sceneFlowFingerprint(s),fingerprint);
  `));
  test('三模式 '+mode+' 真实 change 保存精确枚举及布尔，保存不提交', () => fullWorkspace()(editing + `
    const s=scene();actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});modeChange('${mode}');
    assert.equal(sceneFlowUI.editor.draft.submissionMode,'${mode}');assert.equal(sceneFlowUI.editor.draft.autoSubmit,${auto});assert.equal(sceneFlowUI.editor.draft.allowAssistantSubmit,${allowance});
    actionsMap['scene-flow-inline-save']();assert(!sceneFlowUI.editor);assert.equal(s.workflow.sceneFlow.submissionMode,'${mode}');assert.equal(s.workflow.sceneFlow.autoSubmit,${auto});assert.equal(s.workflow.sceneFlow.allowAssistantSubmit,${allowance});
    assert.equal(sceneFlowConfigError(sceneFlowConfig(s)),'');assert.equal(sceneFlowReceipts.size,0);
  `));
}

test('manual 草稿取消不污染，保存进入指纹与发布版本，切换后恢复 manual false/false', () => fullWorkspace()(editing + `
  const s=scene(),before=JSON.stringify(s.workflow),fingerprint=sceneFlowFingerprint(s);actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});modeChange('manual');
  assert.equal(sceneFlowUI.editor.draft.submissionMode,'manual');assert.equal(sceneFlowUI.editor.draft.autoSubmit,false);assert.equal(sceneFlowUI.editor.draft.allowAssistantSubmit,false);
  assert.equal(JSON.stringify(s.workflow),before);assert.equal(sceneFlowFingerprint(s),fingerprint);actionsMap['scene-flow-inline-cancel']();assert.equal(JSON.stringify(s.workflow),before);assert.equal(sceneFlowFingerprint(s),fingerprint);
  actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});modeChange('manual');actionsMap['scene-flow-inline-save']();assert(!sceneFlowUI.editor);assert.notEqual(sceneFlowFingerprint(s),fingerprint);
  const saved=sceneReleaseConfiguration(s).scene.workflow.sceneFlow;assert.equal(saved.submissionMode,'manual');assert.equal(saved.autoSubmit,false);assert.equal(saved.allowAssistantSubmit,false);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});const m=sceneReleaseEnsure(s);m.check=sceneReleaseCheck(s);assert(m.check.ok);sceneReleasePublish(s.id);
  assert.equal(m.snapshot.scene.workflow.sceneFlow.submissionMode,'manual');assert.equal(m.snapshot.scene.workflow.sceneFlow.autoSubmit,false);assert.equal(m.snapshot.scene.workflow.sceneFlow.allowAssistantSubmit,false);
  const version=JSON.stringify(m.snapshot);actionsMap['scene-release-edit']({dataset:{id:s.id}});actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});modeChange('authorized');actionsMap['scene-flow-inline-save']();assert.equal(s.workflow.sceneFlow.allowAssistantSubmit,true);assert.equal(JSON.stringify(m.snapshot),version);
  sceneReleaseRestore(s.id);const restored=sceneFlowConfig(scene());assert.equal(restored.submissionMode,'manual');assert.equal(restored.autoSubmit,false);assert.equal(restored.allowAssistantSubmit,false);assert.equal(sceneFlowConfigError(restored),'');
  actionsMap['scene-flow-open']();assert.equal(state.drawer.type,'sceneFlow');autoNoReceipt();
`));

for (const [auto,allowance] of [[true,false],[false,true],[true,true],['false',false],[false,'false'],[0,false],[false,0],[null,false],[false,null]]) {
  test('manual 非法布尔组合拒绝全部保存和体验：'+JSON.stringify([auto,allowance]), () => fullWorkspace()(editing + `
    const s=scene(),before=JSON.stringify(s.workflow),bad={...sceneFlowConfig(s),submissionMode:'manual',autoSubmit:${JSON.stringify(auto)},allowAssistantSubmit:${JSON.stringify(allowance)}};assert(sceneFlowConfigError(bad));
    actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});Object.assign(sceneFlowUI.editor.draft,bad);actionsMap['scene-flow-inline-save']();assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow),before);actionsMap['scene-flow-inline-cancel']();
    actionsMap['scene-flow-settings']();Object.assign(state.drawer.draft,bad);sceneFlowSaveSettings();assert(state.drawer.error);assert.equal(JSON.stringify(s.workflow),before);closeOverlay(true);
    s.workflow.sceneFlow=bad;sceneFlowOpenStageSettings({dataset:{stage:'submitted'}});assert.equal(state.drawer?.type,'sceneFlowStageSettings');state.drawer.draft.allowAssistantSubmit=${JSON.stringify(allowance)};const stageBefore=JSON.stringify(s.workflow);sceneFlowSaveStage();assert(state.drawer.error);assert.equal(JSON.stringify(s.workflow),stageBefore);closeOverlay(true);s.workflow=JSON.parse(before);
    s.workflow.sceneFlow=bad;const saved=JSON.stringify(s.workflow);actionsMap['scene-flow-open']();assert(!state.drawer);assert.equal(JSON.stringify(s.workflow),saved);
  `));
}

test('提交方式默认 authorized 且 auto 布尔仍默认 false：读取/render/打开不保存默认也不推进流程', () => fullWorkspace()(selected + `
  const s=scene(), before=JSON.stringify(s.workflow), fingerprint=sceneFlowFingerprint(s);
  assert.equal(sceneFlowDefaults().autoSubmit, false);assert.equal(sceneFlowDefaults().allowAssistantSubmit, false);
  assert.equal(sceneFlowConfig(s).autoSubmit, false);assert.equal(sceneFlowConfig(s).allowAssistantSubmit, true);assert.equal(sceneFlowEffectiveSubmissionMode(s), 'authorized');
  const html=sceneFlowStageDetailHTML(s,'finish'), tag=modeSelect(html,true);
  assert(/\\bdisabled\\b/.test(tag));modeSelected(tag,'authorized');
  assert(html.indexOf('data-flow-inline-field="submissionMode"') < html.indexOf('data-flow-operation-table="finish"'));
  assert(html.includes('复核本身不授权'));assert(html.includes('独立终检'));
  applicationActionsView(s);sceneFlowBusinessExampleHTML(s);actionsMap['scene-flow-open']();extraDrawers.sceneFlow();
  assert.equal(state.drawer.flow.stage,'input');autoNoReceipt();assert.equal(JSON.stringify(s.workflow),before);assert.equal(sceneFlowFingerprint(s),fingerprint);
`));

test('仅打开统一编辑本阶段才能修改提交方式，草稿隔离并可取消', () => fullWorkspace()(editing + `
  const s=scene(), before=JSON.stringify(s.workflow), fingerprint=sceneFlowFingerprint(s);
  assert(/\\bdisabled\\b/.test(modeSelect(sceneFlowStageDetailHTML(s,'finish'),true)), '场景已编辑也不能直接选择提交方式');
  dispatchTestEvent('change',{dataset:{flowInlineField:'submissionMode'},value:'auto'});assert.equal(JSON.stringify(s.workflow),before);
  actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});let html=sceneFlowStageDetailHTML(s,'finish');
  assert(!/\\bdisabled\\b/.test(modeSelect(html,true)));assert(!html.includes('data-flow-inline-field="allowAssistantSubmit"'));
  assert(autoButton(html,'scene-flow-inline-save'));assert(autoButton(html,'scene-flow-inline-cancel'));
  modeChange('auto');assert.equal(sceneFlowUI.editor.draft.submissionMode,'auto');assert.equal(sceneFlowUI.editor.draft.autoSubmit,true);assert.equal(sceneFlowUI.editor.draft.allowAssistantSubmit,true);
  assert.equal(JSON.stringify(s.workflow),before);assert.equal(sceneFlowFingerprint(s),fingerprint);
  actionsMap['scene-flow-stage']({dataset:{stage:'recognize'}});assert.equal(sceneFlowUI.stage,'finish');assert(sceneFlowUI.editor);
  actionsMap['scene-flow-inline-cancel']();assert.equal(JSON.stringify(s.workflow),before);assert.equal(sceneFlowFingerprint(s),fingerprint);
  modeSelected(modeSelect(sceneFlowStageDetailHTML(s,'finish'),true),'authorized');
`));

test('真实change事件按枚举value保存mode：内部legacy布尔同步，保存进入指纹和发布version', () => fullWorkspace()(editing + `
  const s=scene(), fingerprint=sceneFlowFingerprint(s);actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});
  modeChange('auto');actionsMap['scene-flow-inline-save']();assert(!sceneFlowUI.editor);
  assert.equal(s.workflow.sceneFlow.submissionMode,'auto');assert.equal(s.workflow.sceneFlow.autoSubmit,true);assert.equal(s.workflow.sceneFlow.allowAssistantSubmit,true);assert.notEqual(sceneFlowFingerprint(s),fingerprint);
  assert.equal(sceneReleaseConfiguration(s).scene.workflow.sceneFlow.submissionMode,'auto');assert.equal(sceneReleaseConfiguration(s).scene.workflow.sceneFlow.autoSubmit,true);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});const m=sceneReleaseEnsure(s);m.check=sceneReleaseCheck(s);assert(m.check.ok);sceneReleasePublish(s.id);
  assert.equal(m.snapshot.scene.workflow.sceneFlow.submissionMode,'auto');assert.equal(m.snapshot.scene.workflow.sceneFlow.autoSubmit,true);assert.equal(m.snapshot.scene.workflow.sceneFlow.allowAssistantSubmit,true);
  const version=JSON.stringify(m.snapshot);actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});assert(!sceneFlowUI.editor);
  assert(/\\bdisabled\\b/.test(modeSelect(sceneFlowStageDetailHTML(s,'finish'),true)));
  actionsMap['scene-release-edit']({dataset:{id:s.id}});actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});
  modeChange('authorized');actionsMap['scene-flow-inline-save']();assert.equal(s.workflow.sceneFlow.submissionMode,'authorized');assert.equal(s.workflow.sceneFlow.autoSubmit,false);assert.equal(s.workflow.sceneFlow.allowAssistantSubmit,true);
  assert.equal(JSON.stringify(m.snapshot),version);sceneReleaseRestore(s.id);assert.equal(sceneFlowConfig(scene()).submissionMode,'auto');assert.equal(sceneFlowConfig(scene()).autoSubmit,true);
`));

for (const [mode,auto,allowance] of [['authorized',false,true],['auto',true,true],['manual',false,false]]) {
  test('new settings 单一三模式 selector 真实 change 保存 '+mode+'，读取和取消隔离', () => fullWorkspace()(editing + `
    const s=scene();s.workflow.sceneFlow={submissionMode:'authorized'};const before=JSON.stringify(s.workflow),fp=sceneFlowFingerprint(s);actionsMap['scene-flow-settings']();assert.equal(state.drawer.type,'sceneFlowSettings');
    const tag=modeSelect(sceneFlowSettingsDrawer());modeSelected(tag,'authorized');assert(!/\\bdisabled\\b/.test(tag));assert.equal(JSON.stringify(s.workflow),before);
    dispatchTestEvent('change',{dataset:{field:'submissionMode'},tagName:'SELECT',value:'${mode}',checked:${!auto}});assert.equal(state.drawer.draft.submissionMode,'${mode}');assert.equal(state.drawer.draft.autoSubmit,${auto});assert.equal(state.drawer.draft.allowAssistantSubmit,${allowance});assert.equal(JSON.stringify(s.workflow),before);assert.equal(sceneFlowFingerprint(s),fp);
    closeOverlay(true);assert.equal(JSON.stringify(s.workflow),before);assert.equal(sceneFlowFingerprint(s),fp);actionsMap['scene-flow-settings']();dispatchTestEvent('change',{dataset:{field:'submissionMode'},tagName:'SELECT',value:'${mode}',checked:${!auto}});actionsMap['scene-flow-save-settings']();assert(!state.drawer);
    assert.equal(s.workflow.sceneFlow.submissionMode,'${mode}');assert.equal(s.workflow.sceneFlow.autoSubmit,${auto});assert.equal(s.workflow.sceneFlow.allowAssistantSubmit,${allowance});assert.equal(sceneFlowConfigError(sceneFlowConfig(s)),'');assert.notEqual(sceneFlowFingerprint(s),fp);assert.equal(sceneFlowReceipts.size,0);
  `));
}

for (const value of ['true','false','on',1,0,null,undefined,{},[]]) {
  const literal=value===undefined?'undefined':JSON.stringify(value);
  test('autoSubmit非布尔拒绝所有保存与体验路径：'+String(value), () => fullWorkspace()(editing + `
    const s=scene(), before=JSON.stringify(s.workflow), bad=${literal};assert(sceneFlowConfigError({...sceneFlowDefaults(),autoSubmit:bad}));
    actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});sceneFlowUI.editor.draft.autoSubmit=bad;actionsMap['scene-flow-inline-save']();
    assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow),before);actionsMap['scene-flow-inline-cancel']();
    actionsMap['scene-flow-settings']();state.drawer.draft.autoSubmit=bad;sceneFlowSaveSettings();assert(state.drawer.error);assert.equal(JSON.stringify(s.workflow),before);closeOverlay(true);
    s.workflow.sceneFlow={...sceneFlowDefaults(),autoSubmit:bad};actionsMap['scene-flow-open']();assert(!state.drawer);
  `));
}

test('auto开启但allowance不是true的草稿拒绝，兼容读值不会借保存归一化绕过', () => fullWorkspace()(editing + `
  const s=scene();for(const allowance of [false,'true',1,null,undefined]) {
    assert(sceneFlowConfigError({...sceneFlowDefaults(),autoSubmit:true,allowAssistantSubmit:allowance}));
    const before=JSON.stringify(s.workflow);actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});
    sceneFlowUI.editor.draft.autoSubmit=true;sceneFlowUI.editor.draft.allowAssistantSubmit=allowance;
    actionsMap['scene-flow-inline-save']();assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow),before);actionsMap['scene-flow-inline-cancel']();
    actionsMap['scene-flow-settings']();state.drawer.draft.autoSubmit=true;state.drawer.draft.allowAssistantSubmit=allowance;sceneFlowSaveSettings();
    assert(state.drawer.error);assert.equal(JSON.stringify(s.workflow),before);closeOverlay(true);
  }
  s.workflow.sceneFlow={autoSubmit:true,allowAssistantSubmit:false};const saved=JSON.stringify(s.workflow), fingerprint=sceneFlowFingerprint(s);
  assert.equal(sceneFlowConfig(s).autoSubmit,true);assert.equal(sceneFlowConfig(s).allowAssistantSubmit,false);
  assert.equal(sceneFlowAutoSubmitAllowed(s),false);assert(sceneFlowConfigError(sceneFlowConfig(s)));
  sceneFlowStageDetailHTML(s,'finish');actionsMap['scene-flow-open']();assert(!state.drawer);
  assert.equal(JSON.stringify(s.workflow),saved);assert.equal(sceneFlowFingerprint(s),fingerprint);
`));

for (const mutation of ['permission','scene','block','owner','fingerprint']) {
  test('auto行内草稿复用'+mutation+'保护且不能污染配置', () => fullWorkspace()(editing + `
    const s=scene(), other=JSON.stringify(appScenes.trial.workflow);actionsMap['scene-flow-inline-edit']({dataset:{stage:'finish'}});modeChange('auto');
    if(${JSON.stringify(mutation)}==='permission')sceneReleaseEnsure(s).editing=false;
    if(${JSON.stringify(mutation)}==='scene')selectScene('trial');
    if(${JSON.stringify(mutation)}==='block')s.selectedBlock=sceneFlowUI.editor.blockId==='items'?'main':'items';
    if(${JSON.stringify(mutation)}==='owner')sceneFlowUI.editor={...sceneFlowUI.editor};
    if(${JSON.stringify(mutation)}==='fingerprint')s.workflow.action+=' changed';
    const before=JSON.stringify(s.workflow);modeChange('authorized');sceneFlowInlineSave();assert(sceneFlowUI.editor.error);
    assert.equal(JSON.stringify(s.workflow),before);assert.equal(JSON.stringify(appScenes.trial.workflow),other);sceneFlowInlineCancel();
  `));
}

test('legacy allowance仅允许显式代理提交，缺auto保持关闭；auto文案同步主页面/finish下一步/示例', () => fullWorkspace()(selected + `
  const s=scene();s.workflow.sceneFlow={allowAssistantSubmit:true};assert.equal(sceneFlowConfig(s).autoSubmit,false);
  assert(applicationActionsView(s).includes('可选代理提交'));assert(sceneFlowStageDetails(s,'finish').row[3].includes('可选'));
  actionsMap['scene-flow-open']();autoValidated();actionsMap['scene-flow-review']();autoNoReceipt();assert(autoButton(extraDrawers.sceneFlow(),'scene-flow-submit'));
  actionsMap['scene-flow-submit']();assert(state.drawer.flow.receipt);closeOverlay(true);
  s.workflow.sceneFlow={autoSubmit:true,allowAssistantSubmit:true};
  assert(applicationActionsView(s).includes('系统自动提交'));assert(sceneFlowStageDetails(s,'finish').row[3].includes('自动提交'));
  assert(sceneFlowBusinessExampleHTML(s).includes('复核后系统自动提交'));
`));

test('auto开启时保存/render/打开/字段确认/预检/正式校验都不提交；明确review用户动作才独立终检', () => fullWorkspace()(autoOpen + `
  const s=scene(), d=state.drawer;extraDrawers.sceneFlow();autoNoReceipt();autoExample();assert(d.flow.precheck.result.passed);
  extraDrawers.sceneFlow();sceneFlowPrecheck(s);actionsMap['scene-flow-review']();assert(!d.flow.reviewStamp);autoNoReceipt();
  sceneFlowConfirmAll();actionsMap['scene-flow-review']();assert(!d.flow.reviewStamp);autoNoReceipt();
  actionsMap['scene-flow-validate']();assert(d.flow.result.passed);autoNoReceipt();
  const html=extraDrawers.sceneFlow(), review=autoButton(html,'scene-flow-review');
  assert(html.includes('复核后系统自动提交'));assert(review.includes('确认复核并自动提交（模拟）'));assert(!/\\bdisabled\\b/.test(review));
  assert(!autoButton(html,'scene-flow-submit'));assert(!autoButton(html,'scene-flow-handoff'));
  const original=sceneFlowExecute, originalHandoff=sceneFlowHandoff;let calls=0,handoffs=0;
  sceneFlowExecute=function(...args){calls++;return original(...args);};sceneFlowHandoff=function(){handoffs++;};
  dispatchTestEvent('click',{dataset:{action:'scene-flow-review'},closest(){return this;}});
  sceneFlowExecute=original;sceneFlowHandoff=originalHandoff;
  assert.equal(calls,1);assert.equal(handoffs,0);assert(d.flow.reviewStamp);assert(d.flow.finalResult.passed);assert(d.flow.receipt);
  assert.equal(d.flow.receipt.businessSubmitted,false);assert.equal(d.flow.stage,'submitted');assert(!d.flow.handoff);
`));

for(const failure of ['unknown','blocked','throw']) {
  test('auto review独立终检'+failure+'不生成回执，撤销复核，必须重新正式校验', () => fullWorkspace()(autoOpen + `
    autoValidated();const d=state.drawer, original=sceneFlowExecute;
    sceneFlowExecute=function(...args){if(${JSON.stringify(failure)}==='throw')throw Error('终检新来源故障');const r=original(...args);r.passed=false;
      r.checks.push({name:'终检新增失败',target:'mainOrder',status:${JSON.stringify(failure==='unknown'?'未知':'阻断')},level:'阻断',detail:'事实变化',evidence:[]});return r;};
    actionsMap['scene-flow-review']();sceneFlowExecute=original;autoNoReceipt();assert(!d.flow.reviewStamp);
    if(${JSON.stringify(failure)}!=='throw'){assert.equal(d.flow.stage,'blocked');assert(d.flow.blockers.some(b=>b.name==='终检新增失败'));}
    else assert(d.error.includes('终检新来源故障'));
    actionsMap['scene-flow-review']();autoNoReceipt();assert(!d.flow.reviewStamp,'来源恢复不能沿用旧校验直接重试review');
    actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();assert(d.flow.receipt);
  `));
}

test('auto终检实际来源unknown不得沿用正式passed发回执', () => fullWorkspace()(autoOpen + `
  autoValidated();const d=state.drawer, original=callCapability;
  callCapability=function(id,...args){return id==='demo.safetyDI'?{ok:false,error:'终检故障',capability:id,params:args[0]}:original(id,...args);};
  actionsMap['scene-flow-review']();callCapability=original;autoNoReceipt();assert.equal(d.flow.stage,'blocked');
  assert(d.flow.finalResult.checks.some(c=>c.status==='未知'));assert(!d.flow.reviewStamp);
`));

for(const mutation of ['input','authority','mapping','confirmations','config']) {
  test('auto用户review前'+mutation+'变化仍拒绝旧结果不提交', () => fullWorkspace()(autoOpen + `
    autoValidated();const d=state.drawer;
    if(${JSON.stringify(mutation)}==='input')d.draft.request+=' changed';
    if(${JSON.stringify(mutation)}==='authority')d.flow.authority.projects['PRJ-2026-A'].safetyDI=9;
    if(${JSON.stringify(mutation)}==='mapping')scene().bindings.main[0].target+=' changed';
    if(${JSON.stringify(mutation)}==='confirmations')delete d.flow.confirmations[0];
    if(${JSON.stringify(mutation)}==='config')scene().workflow.sceneFlow.autoSubmit=false;
    actionsMap['scene-flow-review']();autoNoReceipt();assert(!d.flow.reviewStamp);
  `));
}

test('auto重复用户review幂等：不重复终检/回执/日志，跨会话同配置payload复用回执', () => fullWorkspace()(autoOpen + `
  autoValidated();actionsMap['scene-flow-review']();const d=state.drawer,id=d.flow.receipt.id, logs=state.logs.filter(l=>l.type==='场景流配置测试').length;
  const original=sceneFlowExecute;let calls=0;sceneFlowExecute=function(...args){calls++;return original(...args);};
  actionsMap['scene-flow-review']();actionsMap['scene-flow-review']();sceneFlowExecute=original;
  assert.equal(calls,0);assert.equal(d.flow.receipt.id,id);assert.equal(sceneFlowReceipts.size,1);
  assert.equal(state.logs.filter(l=>l.type==='场景流配置测试').length,logs);
  closeOverlay(true);actionsMap['scene-flow-open']();autoValidated();actionsMap['scene-flow-review']();
  assert.equal(state.drawer.flow.receipt.id,id);assert.equal(sceneFlowReceipts.size,1);assert.equal(state.logs.filter(l=>l.type==='场景流配置测试').length,logs);
`));

test('finish schema保留auto+allow内部字段；legacy阶段保存也拒绝不一致配置', () => fullWorkspace()(editing + `
  assert(sceneFlowStageFields.finish.config.includes('autoSubmit'));assert(sceneFlowStageFields.finish.config.includes('allowAssistantSubmit'));
  const s=scene();s.workflow.sceneFlow={...sceneFlowDefaults(),autoSubmit:true,allowAssistantSubmit:true};
  sceneFlowOpenStageSettings({dataset:{stage:'submitted'}});state.drawer.draft.allowAssistantSubmit=false;
  const before=JSON.stringify(s.workflow);sceneFlowSaveStage();assert(state.drawer.error);assert.equal(JSON.stringify(s.workflow),before);closeOverlay(true);
`));
