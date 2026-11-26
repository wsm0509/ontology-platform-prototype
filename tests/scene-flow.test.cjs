const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');
const root = path.join(__dirname, '..');
function fullWorkspace() {
  const run = workspace();
  const loaded = new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);
  for (const [,file] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/src="([^"?]+)\?/g)) {
    if (loaded.has(file)) continue;
    run(fs.readFileSync(path.join(root,file),'utf8')); loaded.add(file);
  }
  return run;
}
const open = `selectScene('release','actions');actionsMap['scene-flow-open']();`;
const mapped = `actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();`;
const example = id => `actionsMap['scene-flow-example']({dataset:{id:'${id}'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();`;
const clickStage = stage => `dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage:'${stage}'},closest(){return this;}});`;

test('仅智能提单包装完整场景流，旧高级测试与其他应用保持可达', () => fullWorkspace()(`
  selectScene('release','actions');const html=applicationActionsView(scene());
  for(const text of ['场景流','语义 / 意图识别','追问 / 澄清','字段建议','复核','本地确定性模拟'])assert(html.includes(text));
  assert(html.includes('data-action="scene-flow-open"'));assert(html.includes('data-action="workflow-test"'));
  const qa=appScenes.release_qa;assert(!applicationActionsView(qa).includes('data-action="scene-flow-open"'));
  actionsMap['workflow-test']();assert.equal(state.drawer.type,'workflowTest');
`));
test('未识别和模糊必须澄清，不能直接提交或任意选择本体', () => fullWorkspace()(open + `
  actionsMap['scene-flow-example']({dataset:{id:'unknown'}});actionsMap['scene-flow-recognize']();
  assert.equal(state.drawer.flow.branch,'unknown');assert.equal(state.drawer.flow.stage,'clarify');
  actionsMap['scene-flow-submit']();assert(!state.drawer.flow.receipt);
  actionsMap['scene-flow-example']({dataset:{id:'ambiguous'}});actionsMap['scene-flow-recognize']();
  assert.equal(state.drawer.flow.branch,'ambiguous');assert(state.drawer.flow.candidates.length>1);
  actionsMap['scene-flow-choose-material']({dataset:{id:'NOT-EXISTING'}});assert(!state.drawer.flow.generated);
  actionsMap['scene-flow-choose-material']({dataset:{id:'MAT-20260081'}});
  assert.equal(state.drawer.draft.materialCode,'MAT-20260081');assert(state.drawer.flow.generated);
`));
test('识别具体输入，建议逐字段确认后执行真实规则，复核后重新终检；防重不计真实成功', () => fullWorkspace()(open + mapped + `
  const d=state.drawer;assert.equal(d.flow.branch,'recognized');assert(d.flow.generated.suggestions.length);
  assert.equal(d.flow.stage,'ready-check');const before=runtimeRecords.length;
  actionsMap['scene-flow-validate']();assert.equal(d.flow.result.passed,true);assert.equal(d.flow.stage,'review');
  actionsMap['scene-flow-submit']();assert(!d.flow.receipt,'未复核不允许提交');
  actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();
  assert(d.flow.receipt);assert.equal(d.flow.receipt.mode,'配置测试');assert.equal(d.flow.finalResult.event,'submit');
  const receipt=d.flow.receipt.id;actionsMap['scene-flow-submit']();assert.equal(d.flow.receipt.id,receipt);
  assert.equal(runtimeRecords.length,before);assert(!state.logs.some(l=>l.type==='场景流配置测试'&&l.result==='成功'));
`));
test('缺图片先解释和提出处理，不得按钮直接通过；只更新对应型号样例并单独重检', () => fullWorkspace()(open + example('missing-image') + `
  const d=state.drawer;assert.equal(d.flow.result.passed,false);assert(d.flow.blockers.some(b=>b.fix==='images'));
  const original=JSON.stringify(d.flow.authority);actionsMap['scene-flow-simulate-external']({dataset:{kind:'images'}});
  assert.equal(JSON.stringify(d.flow.authority),original);assert(d.flow.pendingExternal);
  assert(extraDrawers.sceneFlow().includes('非真实处理'));
  actionsMap['scene-flow-apply-external']();assert.equal(d.flow.result,null);assert(!d.flow.receipt);
  assert(d.flow.authority.products['IPC-A400-EU'].images[0].includes('模拟'));
  actionsMap['scene-flow-validate']();assert.equal(d.flow.result.passed,true);
`));
test('安全 DI 与最小系统不可绕过，显式模拟外部事实后重新检查；安全规则不能停用', () => fullWorkspace()(open + example('di-positive') + `
  const d=state.drawer;assert.equal(d.flow.result.passed,false);
  actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();assert(!d.flow.receipt);
  scene().workflow.rules.find(r=>r.id==='safety-di').enabled=false;
  closeOverlay(true);actionsMap['scene-flow-open']();
` + example('di-positive') + `
  assert.equal(state.drawer.flow.result.passed,false);
  actionsMap['scene-flow-simulate-external']({dataset:{kind:'di'}});actionsMap['scene-flow-apply-external']();
  actionsMap['scene-flow-validate']();assert.equal(state.drawer.flow.result.passed,true);
  actionsMap['scene-flow-example']({dataset:{id:'minimum-unreleased'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();
  assert.equal(state.drawer.flow.result.passed,false);
  actionsMap['scene-flow-simulate-external']({dataset:{kind:'minimum'}});actionsMap['scene-flow-apply-external']();
  actionsMap['scene-flow-validate']();assert.equal(state.drawer.flow.result.passed,true);
`));
test('超时未知阻断，受控重试明确模拟恢复，不允许无限重试', () => fullWorkspace()(open + example('timeout') + `
  const d=state.drawer;assert.equal(d.flow.result.passed,false);assert(d.flow.result.checks.some(c=>c.status==='未知'));
  actionsMap['scene-flow-retry']();assert.equal(d.flow.result.passed,true);assert.equal(d.flow.retries,1);
  assert(d.flow.history.some(h=>h.text.includes('模拟查询恢复')));
  actionsMap['scene-flow-retry']();assert.equal(d.flow.retries,1);
  actionsMap['scene-flow-example']({dataset:{id:'unknown'}});actionsMap['scene-flow-recognize']();
  actionsMap['scene-flow-retry']();actionsMap['scene-flow-retry']();actionsMap['scene-flow-retry']();
  assert.equal(d.flow.retries,2);assert.equal(d.flow.branch,'unknown');assert(!d.flow.receipt);
`));
test('输入、场景、区块、配置和外部事实变更使建议/检查/复核失效，不能提交过期结果', () => fullWorkspace()(open + mapped + `
  const d=state.drawer;actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();
  d.draft.request+=' changed';actionsMap['scene-flow-submit']();assert(!d.flow.receipt);
  sceneFlowInputChange({dataset:{field:'request'},value:'新的问题'});assert.equal(d.flow.result,null);assert.equal(d.flow.generated,null);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();
  d.flow.authority.projects['PRJ-2026-A'].safetyDI=9;actionsMap['scene-flow-submit']();assert(!d.flow.receipt);
  actionsMap['scene-flow-validate']();assert.equal(d.flow.result.passed,false);
  closeOverlay(true);actionsMap['scene-flow-open']();
` + mapped + `
  scene().selectedBlock=state.drawer.blockId==='items'?'main':'items';actionsMap['scene-flow-validate']();assert(state.drawer.error.includes('区块'));assert(!state.drawer.flow.result);
  closeOverlay(true);scene().selectedBlock='main';actionsMap['scene-flow-open']();
` + mapped + `
  scene().workflow.blocks.main.fields.push({key:'newField',label:'新增字段',type:'文本'});
  actionsMap['scene-flow-validate']();assert(state.drawer.error.includes('配置'));assert(!state.drawer.flow.result);
  selectScene('trial');actionsMap['scene-flow-submit']();assert(!state.drawer.flow.receipt);
`));
test('配置仅保存当前场景，必须编辑、校验有效选项并复核指纹；安全检查无开关', () => fullWorkspace()(`
  selectScene('release');actionsMap['scene-flow-settings']();assert.notEqual(state.drawer?.type,'sceneFlowSettings');
  actionsMap['scene-release-edit']({dataset:{id:'release'}});actionsMap['scene-flow-settings']();
  assert.equal(state.drawer.type,'sceneFlowSettings');state.drawer.draft.maxRetries=99;
  actionsMap['scene-flow-save-settings']();assert(state.drawer.error);state.drawer.draft.maxRetries=1;
  const other=JSON.stringify(appScenes.trial.workflow);actionsMap['scene-flow-save-settings']();
  assert.equal(scene().workflow.sceneFlow.maxRetries,1);assert.equal(JSON.stringify(appScenes.trial.workflow),other);
  assert.equal(scene().workflow.sceneFlow.safety,'mandatory');
  assert(sceneReleaseEnsure(scene()).history.some(h=>h.action==='保存草稿'));
  const savedRetries=scene().workflow.sceneFlow.maxRetries;scene().workflow.sceneFlow.maxRetries=99;
  assert(sceneReleaseCheck(scene()).groups.find(g=>g.label==='本应用的专属配置').issues.some(x=>x.includes('场景流')));
  scene().workflow.sceneFlow.maxRetries=savedRetries;
  actionsMap['scene-flow-settings']();scene().workflow.blocks.main.label='变更';actionsMap['scene-flow-save-settings']();assert(state.drawer.error.includes('配置'));
`));
test('已发布场景入口仍明确当前配置测试，使用锁定对象定义，不变更已发布快照或runtimeRecords', () => fullWorkspace()(`
  selectScene('release');const s=scene(),m=sceneReleaseEnsure(s);m.check=sceneReleaseCheck(s);sceneReleasePublish(s.id);
  const saved=JSON.stringify(m.snapshot),count=runtimeRecords.length;
  actionsMap['scene-flow-open']();assert.equal(state.drawer.objectRunMode,'draft');
  assert(extraDrawers.sceneFlow().includes('当前配置测试'));
  assert(!extraDrawers.sceneFlow().includes('data-object-run-mode'));
` + mapped + `
  actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();
  assert(state.drawer.flow.receipt);assert.equal(JSON.stringify(m.snapshot),saved);assert.equal(runtimeRecords.length,count);
`));
test('业务问题仅回答规则依据，混合先解释；只有用户主动选择才进入提单', () => fullWorkspace()(open + `
  state.drawer.draft.request='MAT-20260081 为什么不能提交？';actionsMap['scene-flow-recognize']();
  const d=state.drawer;assert.equal(d.flow.stage,'answer');assert.equal(d.flow.intent,'explain');
  assert(!d.flow.generated);assert(d.flow.answer.evidence.length);actionsMap['scene-flow-submit']();assert(!d.flow.receipt);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});d.draft.request+='，为什么不能提交？';actionsMap['scene-flow-recognize']();
  assert.equal(d.flow.intent,'mixed');assert.equal(d.flow.stage,'answer');assert(!d.flow.generated);
  actionsMap['scene-flow-continue-draft']();assert(d.flow.generated);assert.equal(d.flow.intent,'draft');
`));
test('编号型号/多编号/项目版本冲突必须澄清；未知身份不由来源模拟器虚构通过', () => fullWorkspace()(open + `
  state.drawer.draft.request='创建发布单 MAT-20260081 IPC-B800-EU 项目 PRJ-2026-A 软件 SW-20260032 V5.8.2 后端业务部 主题“冲突”';
  actionsMap['scene-flow-recognize']();assert.equal(state.drawer.flow.branch,'ambiguous');assert(!state.drawer.flow.generated);
  actionsMap['scene-flow-choose-material']({dataset:{id:'MAT-20260082'}});assert(state.drawer.flow.generated);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request+=' MAT-20260082';actionsMap['scene-flow-recognize']();
  assert.equal(state.drawer.flow.branch,'ambiguous');assert(!state.drawer.flow.generated);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request+=' PRJ-2026-B V6.0.0';actionsMap['scene-flow-recognize']();
  assert.equal(state.drawer.flow.branch,'ambiguous');assert(!state.drawer.flow.generated);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request=state.drawer.draft.request.replace('SW-20260032','SW-99999999');actionsMap['scene-flow-recognize']();
  assert.equal(state.drawer.flow.stage,'clarify');assert(!state.drawer.flow.generated);
`));
test('终检精确核对本体唯一身份、软件版本和Mapping业务行，不能只靠ok或pick first', () => fullWorkspace()(open + mapped + `
  const d=state.drawer;actionsMap['scene-flow-validate']();assert(d.flow.result.passed);
  const correct=structuredClone(d.flow.payload);correct.mapping[0].releaseItemId='MAT-20260081';
  const broken=sceneFlowExecute(scene(),correct);assert.equal(broken.passed,false);assert(broken.checks.some(c=>c.name.includes('Mapping')&&c.status==='阻断'));
  const oldCall=callCapability;callCapability=function(id,...args){const r=oldCall(id,...args);if(id===scene().master&&r.normalized?.[0])r.normalized[0].identity='Material:WRONG';return r;};
  actionsMap['scene-flow-validate']();assert.equal(d.flow.result.passed,false);assert(d.flow.result.checks.some(c=>c.name.includes('精确身份')));
`));
test('人工澄清与整单确认配置真正影响交互，输入事件清除旧提取值而非沿用上一任务', () => fullWorkspace()(`
  selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});actionsMap['scene-flow-settings']();
  state.drawer.draft.unknown='manual';state.drawer.draft.confirmation='summary';actionsMap['scene-flow-save-settings']();
  actionsMap['scene-flow-open']();actionsMap['scene-flow-example']({dataset:{id:'unknown'}});actionsMap['scene-flow-recognize']();
  assert(extraDrawers.sceneFlow().includes('data-action="scene-flow-choose-material"'));
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();
  assert(extraDrawers.sceneFlow().includes('data-action="scene-flow-confirm-all"'));actionsMap['scene-flow-confirm-all']();
  const d=state.drawer;actionsMap['scene-flow-validate']();assert(d.flow.result.passed);
  sceneFlowInputChange({dataset:{field:'request'},value:'创建发布单 MAT-20260082'});assert.equal(d.draft.projectCode,'');assert.equal(d.draft.materialCode,'');
  actionsMap['scene-flow-recognize']();assert.equal(d.draft.materialCode,'MAT-20260082');assert.equal(d.flow.stage,'clarify');assert(!d.flow.generated);
`));
test('复核后重新终检发现新来源失败时不创建回执，已完成请求跨会话防重', () => fullWorkspace()(open + mapped + `
  const d=state.drawer;actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();
  const originalCall=callCapability;callCapability=function(id,...args){if(id==='demo.safetyDI')return {ok:false,error:'模拟新故障',capability:id,params:args[0]};return originalCall(id,...args);};
  actionsMap['scene-flow-submit']();assert(!d.flow.receipt);assert.equal(d.flow.stage,'blocked');assert.equal(d.flow.finalResult.passed,false);
  callCapability=originalCall;actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();
  assert(d.flow.receipt);const id=d.flow.receipt.id,logs=state.logs.filter(l=>l.type==='场景流配置测试').length;
  closeOverlay(true);actionsMap['scene-flow-open']();
` + mapped + `
  actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();
  assert.equal(state.drawer.flow.receipt.id,id);assert.equal(state.logs.filter(l=>l.type==='场景流配置测试').length,logs);
`));
test('渲染和打开不隐式初始化场景流配置，保存后可进入发布快照；更严规则不被底线替换', () => fullWorkspace()(`
  selectScene('release');const s=scene(),before=sceneReleaseFingerprint(s);applicationActionsView(s);actionsMap['scene-flow-open']();
  assert.equal(s.workflow.sceneFlow,undefined);assert.equal(sceneReleaseFingerprint(s),before);closeOverlay(true);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});actionsMap['scene-flow-settings']();actionsMap['scene-flow-save-settings']();
  assert.equal(sceneReleaseConfiguration(s).scene.workflow.sceneFlow.safety,'mandatory');
  s.workflow.rules.find(r=>r.id==='safety-di').assertions[0]={fact:'Project.safetyDI',op:'lt',value:'0'};
  actionsMap['scene-flow-open']();
` + mapped + `
  actionsMap['scene-flow-validate']();assert.equal(state.drawer.flow.result.passed,false);
  assert(state.drawer.flow.result.checks.some(c=>c.rule==='safety-di-configured'&&c.status==='阻断'));
`));
test('快捷生成字段映射后仍可完成完整场景流，字段和配置修改使旧结果失效', () => fullWorkspace()(`
  selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});scene().selectedBlock='main';
  actionsMap['workflow-ai-map']();actionsMap['workflow-ai-apply']();assert.equal(state.drawer,null);
  assert(scene().bindings.main.some(b=>b.target==='mainOrder.projectManager'));
  actionsMap['scene-flow-open']();
` + mapped + `
  actionsMap['scene-flow-validate']();assert(state.drawer.flow.result.passed);actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();assert(state.drawer.flow.receipt);
`));
test('非法编号或版本后缀不可截断成已登记身份并提交', () => fullWorkspace()(open + `
  for(const [from,to] of [['MAT-20260081','MAT-20260081XYZ'],['PRJ-2026-A','PRJ-2026-AB'],['SW-20260032','SW-20260032XYZ'],['V5.8.2','V5.8.2-beta']]){
    actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request=state.drawer.draft.request.replace(from,to);actionsMap['scene-flow-recognize']();
    assert.equal(state.drawer.flow.branch,'unknown');assert(!state.drawer.flow.generated);actionsMap['scene-flow-confirm-all']();actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();assert(!state.drawer.flow.receipt);
  }
`));
test('字段式澄清通过真实input/change解除物料冲突；混合原文末尾空白不阻止继续', () => fullWorkspace()(open + `
  closeOverlay(true);actionsMap['scene-release-edit']({dataset:{id:'release'}});actionsMap['scene-flow-settings']();state.drawer.draft.clarification='fields';actionsMap['scene-flow-save-settings']();actionsMap['scene-flow-open']();
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request+=' MAT-20260082';actionsMap['scene-flow-recognize']();assert.equal(state.drawer.flow.branch,'ambiguous');
  const el={dataset:{field:'materialCode'},value:'MAT-20260081',tagName:'INPUT'};dispatchTestEvent('input',el);dispatchTestEvent('change',el);actionsMap['scene-flow-recognize']();assert(state.drawer.flow.generated);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request+=' 为什么不能提交？ \\n';actionsMap['scene-flow-recognize']();assert.equal(state.drawer.flow.stage,'answer');actionsMap['scene-flow-continue-draft']();assert(state.drawer.flow.generated);
`));
test('未知物料显式纠错可继续，但不能忽略其他非法上下文；相同业务内容防重', () => fullWorkspace()(open + `
  closeOverlay(true);actionsMap['scene-release-edit']({dataset:{id:'release'}});actionsMap['scene-flow-settings']();state.drawer.draft.unknown='manual';actionsMap['scene-flow-save-settings']();actionsMap['scene-flow-open']();
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request=state.drawer.draft.request.replace('MAT-20260081','MAT-99999999');actionsMap['scene-flow-recognize']();assert.equal(state.drawer.flow.branch,'unknown');
  actionsMap['scene-flow-choose-material']({dataset:{id:'MAT-20260081'}});assert(state.drawer.flow.generated);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request=state.drawer.draft.request.replace('MAT-20260081','MAT-99999999').replace('SW-20260032','SW-20260032XYZ');actionsMap['scene-flow-recognize']();actionsMap['scene-flow-choose-material']({dataset:{id:'MAT-20260081'}});assert(!state.drawer.flow.generated);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();const id=state.drawer.flow.receipt.id;
  closeOverlay(true);actionsMap['scene-flow-open']();actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request+='。';actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();assert.equal(state.drawer.flow.receipt.id,id);
`));
test('外部修复只取当前失败断言证据，不更新其他查询或跳过规则的型号', () => fullWorkspace()(open + example('missing-image') + `
  const d=state.drawer;d.flow.result.calls.push({capability:'demo.productDocuments',ok:true,params:{modelCode:'IPC-B800-EU'},raw:{images:[]}});
  d.flow.authority.products['IPC-B800-EU'].images=[];
  d.flow.resultStamp=sceneFlowExecutionStamp(scene(),d.flow.payload);
  d.flow.result.checks.push({rule:'skipped-rule',status:'跳过',target:'releaseItems[RI-002]',evidence:[{field:'Product.images',source:'demo.productDocuments',params:{modelCode:'IPC-B800-EU'},actual:[],status:'不满足'}]});
  d.flow.blockers=sceneFlowBlockers(d.flow.result);actionsMap['scene-flow-simulate-external']({dataset:{kind:'images'}});
  assert.deepEqual(JSON.parse(JSON.stringify(d.flow.pendingExternal.targets)),['IPC-A400-EU']);actionsMap['scene-flow-apply-external']();assert.equal(d.flow.authority.products['IPC-B800-EU'].images.length,0);
`));
test('阶段页签通过真实click切换，tab语义与当前详情一致', () => fullWorkspace()(`
  selectScene('release','actions');let html=applicationActionsView(scene());
  assert(html.includes('role="tablist"'));assert(html.includes('role="tab"'));
  assert(html.includes('data-flow-stage-panel="input"'));assert.equal(sceneFlowUI.stage,'input');
` + clickStage('recognize') + `
  html=applicationActionsView(scene());assert.equal(sceneFlowUI.stage,'recognize');
  assert(html.includes('data-stage="recognize" role="tab" aria-selected="true"'));
  assert(html.includes('data-flow-stage-panel="recognize"'));assert(!html.includes('data-flow-stage-panel="input"'));
  assert(html.includes('提单 / 问答 / 混合 / 不支持'));assert(html.includes('唯一 / 未知 / 多候选'));
`));
test('页面七个阶段展示各自详细节点和策略，配置仍只有统一受guard入口', () => fullWorkspace()(`
  selectScene('release','actions');const panels=new Set();
  const expectations={input:['接受任务 / 问题','提取字段','缺失'],recognize:['提单 / 问答 / 混合 / 不支持','唯一 / 未知 / 多候选'],clarify:['候选','关键字段','纠错','重试'],mapping:['英文','中文','用户确认'],check:['逐行','未知阻断','附件','DI','最小系统','责任'],review:['内容','证据'],submitted:['终检','权限','版本','幂等','安全模拟']};
  for(const [stage,words]of Object.entries(expectations)){
    dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage},closest(){return this;}});
    const html=applicationActionsView(scene()),panel=html.split('<section')[1]?.split('</section>')[0];
    assert(panel,stage);for(const word of words)assert(panel.includes(word),stage+': '+word);panels.add(panel);
    assert.equal((html.match(/data-action="scene-flow-settings"/g)||[]).length,1);
  }
  assert.equal(panels.size,7);assert(!sceneReleaseMutations.has('scene-flow-stage'));
  dispatchTestEvent('click',{dataset:{action:'scene-flow-settings'},closest(){return this;}});
  assert.notEqual(state.drawer?.type,'sceneFlowSettings');
`));
test('默认与已保存策略在对应详情显示，浏览不写workflow或发布fingerprint', () => fullWorkspace()(`
  selectScene('release','actions');const s=scene(),before=sceneReleaseFingerprint(s),workflow=JSON.stringify(s.workflow),history=JSON.stringify(sceneReleaseEnsure(s).history);
` + clickStage('clarify') + `
  let html=applicationActionsView(s);assert(html.includes('最多 2 次'));assert(html.includes('候选卡片 + 关键信息'));
  assert.equal(JSON.stringify(s.workflow),workflow);assert.equal(sceneReleaseFingerprint(s),before);assert.equal(JSON.stringify(sceneReleaseEnsure(s).history),history);assert.equal(s.workflow.sceneFlow,undefined);
  s.workflow.sceneFlow={...sceneFlowDefaults(),unknown:'manual',clarification:'fields',maxRetries:1,confirmation:'summary'};
  html=applicationActionsView(s);assert(html.includes('最多 1 次'));assert(html.includes('只追问编号与关键字段'));assert(html.includes('人工本体选择'));
` + clickStage('mapping') + `
  assert(applicationActionsView(s).includes('整单复核后确认'));
`));
test('页面非法阶段忽略且不render、不影响浏览和fingerprint', () => fullWorkspace()(`
  selectScene('release','actions');const before=sceneReleaseFingerprint(scene()),renderBefore=render;let calls=0;render=()=>{calls++;};
  for(const stage of ['submit','answer','blocked','__proto__','<script>',''])dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage},closest(){return this;}});
  assert.equal(sceneFlowUI.stage,'input');assert.equal(calls,0);assert.equal(sceneReleaseFingerprint(scene()),before);render=renderBefore;
`));
test('drawer浏览未来提交阶段不能让未识别输入跳过执行门禁', () => fullWorkspace()(open + `
  const d=state.drawer,before=JSON.stringify(d.flow);const pageStage=sceneFlowUI.stage;
` + clickStage('submitted') + `
  assert.equal(d.flow.stage,'input');assert.equal(d.flow.viewStage,'submitted');assert.equal(sceneFlowUI.stage,pageStage);
  const viewedFlow=JSON.parse(JSON.stringify(d.flow));delete viewedFlow.viewStage;assert.equal(JSON.stringify(viewedFlow),before);
  const html=extraDrawers.sceneFlow();assert(html.includes('data-flow-stage-panel="submitted"'));assert(html.includes('真实执行阶段：用户输入'));assert(html.includes('查看阶段：模拟提交'));
  dispatchTestEvent('click',{dataset:{action:'scene-flow-submit'},closest(){return this;}});assert(!d.flow.receipt);assert.equal(d.flow.stage,'input');
  dispatchTestEvent('click',{dataset:{action:'scene-flow-review'},closest(){return this;}});assert.equal(d.flow.reviewStamp,undefined);
`));
test('drawer阶段浏览不清除结果、确认和复核，保留happy path与指纹', () => fullWorkspace()(open + mapped + `
  const d=state.drawer;actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();
  const before=JSON.stringify(d.flow),fingerprint=sceneFlowFingerprint(scene()),pageStage=sceneFlowUI.stage;
  const result=d.flow.result,confirmations=d.flow.confirmations,reviewStamp=d.flow.reviewStamp;const drawBefore=drawOverlay;let draws=0;drawOverlay=()=>{draws++;};
` + clickStage('input') + clickStage('check') + `
  assert.equal(draws,2);drawOverlay=drawBefore;assert.equal(d.flow.stage,'review');assert.equal(d.flow.viewStage,'check');assert.equal(sceneFlowUI.stage,pageStage);
  assert.equal(d.flow.result,result);assert.equal(d.flow.confirmations,confirmations);assert.equal(d.flow.reviewStamp,reviewStamp);
  const viewedFlow=JSON.parse(JSON.stringify(d.flow));delete viewedFlow.viewStage;assert.equal(JSON.stringify(viewedFlow),before);assert.equal(sceneFlowFingerprint(scene()),fingerprint);
  assert(extraDrawers.sceneFlow().includes('data-flow-stage-panel="check"'));assert(extraDrawers.sceneFlow().includes('当前阶段内容 · 只读快照'));
  dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage:'review'},closest(){return this;}});
  assert(extraDrawers.sceneFlow().includes('已有复核记录'));assert.equal(d.flow.result,result);assert.equal(d.flow.reviewStamp,reviewStamp);
  dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage:'check'},closest(){return this;}});
  dispatchTestEvent('click',{dataset:{action:'scene-flow-submit'},closest(){return this;}});assert(d.flow.receipt);assert.equal(d.flow.stage,'submitted');assert.equal(d.flow.viewStage,'check');
`));
test('drawer非法阶段不更改flow或绘制，未知澄清无法通过stage selection提交', () => fullWorkspace()(open + `
  actionsMap['scene-flow-example']({dataset:{id:'unknown'}});actionsMap['scene-flow-recognize']();const d=state.drawer;
  const before=JSON.stringify(d.flow),drawBefore=drawOverlay;let draws=0;drawOverlay=()=>{draws++;};
  for(const stage of ['submit','ready-check','answer','undefined'])dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage},closest(){return this;}});
  assert.equal(JSON.stringify(d.flow),before);assert.equal(draws,0);drawOverlay=drawBefore;
` + clickStage('submitted') + `
  dispatchTestEvent('click',{dataset:{action:'scene-flow-validate'},closest(){return this;}});
  dispatchTestEvent('click',{dataset:{action:'scene-flow-review'},closest(){return this;}});
  dispatchTestEvent('click',{dataset:{action:'scene-flow-submit'},closest(){return this;}});
  assert.equal(d.flow.stage,'clarify');assert(!d.flow.result);assert(!d.flow.reviewStamp);assert(!d.flow.receipt);
`));
test('页浏览与drawer独立且场景切换不影响流程指纹，打开后默认跟随真实执行阶段', () => fullWorkspace()(`
  selectScene('release','actions');const before=sceneFlowFingerprint(scene());
` + clickStage('mapping') + `
  actionsMap['scene-flow-open']();assert.equal(state.drawer.flow.viewStage,undefined);assert(extraDrawers.sceneFlow().includes('data-flow-stage-panel="input"'));
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();assert(extraDrawers.sceneFlow().includes('data-flow-stage-panel="mapping"'));
  assert.equal(sceneFlowUI.stage,'mapping');assert.equal(sceneFlowFingerprint(scene()),before);closeOverlay(true);
  selectScene('release_qa');selectScene('release','actions');assert.equal(sceneFlowFingerprint(scene()),before);assert.equal(sceneFlowUI.stage,'mapping');
  actionsMap['scene-flow-open']();assert.equal(state.drawer.flow.stage,'input');assert.equal(state.drawer.flow.viewStage,undefined);
`));
test('查看页签映射真实ready-check、blocked与answer状态而不把内部阶段用作可点击id', () => fullWorkspace()(open + `
  const d=state.drawer;for(const [actual,view]of [['ready-check','check'],['blocked','check'],['answer','recognize']]){
    d.flow.stage=actual;const html=extraDrawers.sceneFlow();assert(html.includes('data-flow-stage-panel="'+view+'"'));assert(html.includes('data-stage="'+view+'" role="tab" aria-selected="true"'));assert.equal(d.flow.stage,actual);
  }
`));
test('新增objectless表技术parent不注入主单归属，同名系统字段不触发本体提取与查询', () => fullWorkspace()(`
  selectScene('release','actions');actionsMap['scene-release-edit']({dataset:{id:'release'}});
  systemConnectors.push({id:'flowdb',name:'流程附加库',enabled:true,types:['database'],configs:{database:{tables:[{name:'FLOW_EXTRA',description:'附加记录',columns:[{name:'RECORD_ID',label:'记录编号',type:'文本',primary:true},{name:'MATERIAL_CODE',label:'用户整机编码',type:'文本'},{name:'SOFTWARE_CODE',label:'用户软件编码',type:'文本'},{name:'VERSION',label:'用户版本',type:'文本'}]}]}}});
  actionsMap['workflow-add-block']();sceneTableInput({type:'change',target:{dataset:{tableDatabase:''},value:'flowdb'}});sceneTableInput({type:'change',target:{dataset:{tableSelect:''},value:'FLOW_EXTRA'}});
  state.drawer.draft.fields.forEach(f=>f.mappingMode='system');actionsMap['workflow-save-block']();assert.equal(state.drawer,null);
  const b=scene().workflow.blocks.flowExtra;assert.equal(b.object,null);assert.equal(b.parent,'main');
  actionsMap['scene-flow-open']();actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();
  const d=state.drawer,row=d.flow.document.flowExtra[0];assert(row.materialCode.includes('模拟系统生成'));assert(row.softwareCode.includes('模拟系统生成'));assert(row.version.includes('模拟系统生成'));assert(!Object.hasOwn(row,'mainOrderId'));
  dispatchTestEvent('click',{dataset:{action:'scene-flow-confirm-all'},closest(){return this;}});
  dispatchTestEvent('click',{dataset:{action:'scene-flow-confirm-ordinary'},closest(){return this;}});
  dispatchTestEvent('click',{dataset:{action:'scene-flow-validate'},closest(){return this;}});
  assert(d.flow.result.passed);assert(!d.flow.result.checks.some(c=>c.target.startsWith('flowExtra[')&&(/归属|整机本体|软件本体/.test(c.name))));
  dispatchTestEvent('click',{dataset:{action:'scene-flow-review'},closest(){return this;}});dispatchTestEvent('click',{dataset:{action:'scene-flow-submit'},closest(){return this;}});assert(d.flow.receipt);
`));
test('新表非映射必填字段由用户实际填写，数字不自动假填，系统样例须确认', () => fullWorkspace()(`
  selectScene('release','actions');actionsMap['scene-release-edit']({dataset:{id:'release'}});
  scene().workflow.blocks.extra={id:'extra',label:'备注表',path:'extra',object:null,parent:'main',many:true,keyField:'id',fields:[{key:'id',label:'编号',type:'文本',mappingMode:'system'},{key:'note',label:'备注',type:'文本',mappingMode:'user',required:true},{key:'amount',label:'金额',type:'数字',mappingMode:'user',required:true},{key:'status',label:'状态',type:'文本',mappingMode:'system',sample:'待审核'}]};scene().bindings.extra=[];scene().names.extra='备注表';
  actionsMap['scene-flow-open']();
` + mapped + `
  const d=state.drawer;assert.equal(d.flow.document.extra[0].note,'');assert.equal(d.flow.document.extra[0].amount,'');assert(extraDrawers.sceneFlow().includes('data-flow-user="extra.note"'));
  actionsMap['scene-flow-validate']();assert(!d.flow.result);actionsMap['scene-flow-confirm-ordinary']();assert(d.error.includes('备注'));
  dispatchTestEvent('input',{dataset:{flowUser:'extra.note'},value:'用户填写备注',tagName:'INPUT'});
  dispatchTestEvent('input',{dataset:{flowUser:'extra.amount'},value:'200',tagName:'INPUT'});actionsMap['scene-flow-confirm-ordinary']();assert(d.flow.systemConfirmed);
  actionsMap['scene-flow-validate']();assert(d.flow.result.passed);assert.equal(d.flow.payload.extra[0].amount,200);assert.equal(d.flow.payload.extra[0].note,'用户填写备注');assert.equal(d.flow.payload.extra[0].status,'待审核');
  sceneFlowInputChange({dataset:{field:'request'},value:'新的任务'});assert.equal(d.flow.payload,null);actionsMap['scene-flow-stage']({dataset:{stage:'review'}});assert(!extraDrawers.sceneFlow().includes('用户填写备注'));
`));
test('字段未确认、任意外部修复、建议篡改和关键信息缺失均不能绕过流程', () => fullWorkspace()(open + `
  state.drawer.draft.request='创建发布单 MAT-20260081';actionsMap['scene-flow-recognize']();
  assert.equal(state.drawer.flow.stage,'clarify');assert(!state.drawer.flow.generated);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();
  actionsMap['scene-flow-validate']();assert(!state.drawer.flow.result);
  const d=state.drawer;d.flow.generated.suggestions[0].suggested='篡改';sceneFlowConfirmAll();assert(d.error);assert(!d.flow.result);
  actionsMap['scene-flow-simulate-external']({dataset:{kind:'di'}});assert(!d.flow.pendingExternal);
`));
