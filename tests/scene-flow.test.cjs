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
// Legacy simulated-submission fixtures explicitly enable delegation before opening or stamping configuration.
const enableAssistantSubmit = `scene().workflow.sceneFlow={autoSubmit:false,allowAssistantSubmit:true};`;
const open = `selectScene('release','actions');` + enableAssistantSubmit + `actionsMap['scene-flow-open']();`;
const mapped = `actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();`;
const example = id => `actionsMap['scene-flow-example']({dataset:{id:'${id}'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();`;
const clickStage = stage => `dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage:'${stage}'},closest(){return this;}});`;
// Presentation fixtures opt into template rows explicitly; rendering itself must not save defaults.
const selectAllBranchTemplates = `s.workflow.flow={...(s.workflow.flow||{}),branchSelections:Object.fromEntries(sceneFlowStages.map(([stage])=>[stage,sceneFlowBranchRows(s).filter(([id])=>sceneFlowBranchStage(id)===stage).map(([id])=>id)]))};`;

test('场景流用输入起点和后续业务主路径及当前阶段操作表，替代重复只读节点卡', () => fullWorkspace()(`
  selectScene('release','actions');const s=scene(),before=sceneReleaseFingerprint(s);
  let html=applicationActionsView(s);
  assert(html.includes('场景流只管理提单时的交互和流转，不重复字段映射/校验条件'));
  assert.equal(sceneFlowDefaults().allowAssistantSubmit,false);assert.equal(sceneFlowConfig(s).submissionMode,'authorized');assert.equal(sceneFlowConfig(s).allowAssistantSubmit,true);assert.equal(sceneFlowConfig(s).autoSubmit,false);
  assert.deepEqual(sceneFlowStages.map(([id])=>id),['input','recognize','clarify','mapping','check','review','submitted']);
  assert.equal(sceneFlowStageLabel('submitted'),'模拟提交');
  assert(html.includes('输入起点 → 语义识别 → 按需澄清 → 生成单据与校验反馈 → 复核提交 · 语义授权提交（默认）'));
  assert(!html.includes('data-action="scene-flow-submit"'));
  assert(html.includes('data-flow-main-path'));assert(html.includes('data-action="scene-flow-open"'));
  for(const [stage]of sceneFlowDisplayStages){
    actionsMap['scene-flow-stage']({dataset:{stage}});html=applicationActionsView(s);
    const panel=html.match(/<section[^>]*data-flow-stage-panel="[^"]+"[\\s\\S]*?<[/]section>/)?.[0];assert(panel,stage);
    assert(panel.includes('data-flow-operation-table="'+stage+'"'));
    for(const heading of ['发生什么','系统动作','用户交互','下一步'])assert(panel.includes('<th scope="col">'+heading+'</th>'),stage+': '+heading);
    assert(!panel.includes('scene-flow-stage-node'));assert(!panel.includes('workflow-cards'));
    const header=panel.split('<table')[0];assert.equal((header.match(/data-action="scene-flow-inline-edit"/g)||[]).length,1);assert(header.includes('data-stage="'+stage+'"'));assert(!panel.includes('data-action="scene-flow-edit-stage"'));assert(!panel.includes('data-focusfield='));assert(panel.includes('role="tabpanel"'));
  }
  assert.equal(sceneReleaseFingerprint(s),before);assert.equal(s.workflow.flow,undefined);
`));
test('分流异常表明确触发、处理、追问、用户操作和继续条件，而不是标签说明', () => fullWorkspace()(`
  selectScene('release','actions');const s=scene();${selectAllBranchTemplates}const before=sceneFlowFingerprint(s),html=sceneFlowBranchesHTML(s,'all');
  const table=html.match(/<table[^>]*data-flow-branches[\\s\\S]*?<[/]table>/)?.[0];assert(table);
  for(const heading of ['何时发生','系统如何处理','问用户什么','用户可做什么','满足何条件继续'])assert(table.includes('<th scope="col">'+heading+'</th>'));
  assert.equal((table.match(/<tr data-flow-branch=/g)||[]).length,sceneFlowBranchRows(s).length);
  for(const [branch]of sceneFlowBranchRows(s)){
    const row=table.split('<tr data-flow-branch="'+branch+'">')[1]?.split('</tr>')[0];assert(row,branch);assert.equal((row.match(/<td[ >]/g)||[]).length,6,branch);
  }
  assert(table.includes('不取第一条'));assert(table.includes('来源系统'));assert(table.includes('重新校验'));assert(table.includes('人工复核'));assert.equal(sceneFlowFingerprint(s),before);
`));
test('首屏连贯提单示例使用同一请求与本地样例，连续五步明确示意而不冒充执行', () => fullWorkspace()(`
  selectScene('release','actions');const s=scene(),before=sceneReleaseFingerprint(s),records=runtimeRecords.length;
  const html=applicationActionsView(s),sample=html.match(/<div[^>]*data-flow-business-example[\\s\\S]*?<[/]details>/)?.[0];assert(sample);
  assert(html.indexOf('data-flow-main-path')<html.indexOf('data-flow-operation-table'));assert(html.indexOf('data-flow-operation-table')<html.indexOf('data-flow-branches'));assert(html.indexOf('data-flow-branches')<html.indexOf('data-flow-business-example'));
  assert(sample.includes('仅说明性示例'));assert(sample.includes('非执行结果'));assert(sample.includes('本地样例'));
  const labels=['用户请求与语义识别','按需澄清与选择','生成单据与校验反馈','处理与正式重检','复核提交'];
  const list=sample.match(/<ol[^>]*data-flow-example-timeline[\\s\\S]*?<[/]ol>/)?.[0];assert(list);let at=-1;
  labels.forEach((label,index)=>{const pos=list.indexOf('data-flow-example-step="'+(index+1)+'"');assert(pos>at,label);at=pos;assert(list.includes(label));});assert.equal((list.match(/data-flow-example-step=/g)||[]).length,5);assert(!/data-flow-example-step="[6-9]"/.test(list));for(const text of ['草稿已生成','校验未通过','原因','处理建议','尚未正式确认'])assert(list.includes(text));
  assert(sample.includes(esc(sceneFlowExamples.find(([id])=>id==='ambiguous')[2])));
  for(const [stage,key]of [['clarify','clarifyPrompt'],['mapping','mappingPrompt'],['check','blockerPrompt'],['check','imagesGuide'],['review','reviewPrompt']])assert(sample.includes(esc(sceneFlowStageConfig(s,stage)[key])),stage);
  assert.equal(sceneFlowConfig(s).submissionMode,'authorized');assert.equal(sceneFlowConfig(s).allowAssistantSubmit,true);assert.equal(sceneFlowConfig(s).autoSubmit,false);assert(sample.includes('语义授权提交（默认）'));assert(sample.includes('复核本身不授权'));assert(sample.includes('未知或失败不发回执'));assert(sample.includes(esc(sceneFlowStageConfig(s,'submitted').receiptPrompt)));
  assert.equal(sceneReleaseFingerprint(s),before);assert.equal(runtimeRecords.length,records);assert.equal(state.drawer,null);assert.equal(sceneFlowReceipts.size,0);
`));
test('首页不再提供映射规则快捷行，原tab仍可到达，浏览不新增配置或真实执行动作', () => fullWorkspace()(`
  selectScene('release','actions');const s=scene(),before=sceneReleaseFingerprint(s),w=JSON.stringify(s.workflow);
  const html=applicationActionsView(s);
  assert(!html.includes('引用当前场景配置：'));assert(!html.includes('对象与表单映射 ↗'));assert(!html.includes('规则配置 ↗'));assert(!html.includes('data-action="scene-tab" data-tab="strategy"'));assert(!html.includes('data-action="scene-tab" data-tab="rules"'));
  for(const tab of ['strategy','rules']){dispatchTestEvent('click',{dataset:{action:'scene-tab',tab},closest(){return this;}});assert.equal(studio.sceneTab,tab);assert.equal(scene().id,s.id);assert(!state.drawer);}
  assert.equal(sceneReleaseFingerprint(s),before);assert.equal(JSON.stringify(s.workflow),w);
  actionsMap['scene-flow-open']();assert.equal(state.drawer.type,'sceneFlow');assert.equal(state.drawer.flow.stage,'input');
  actionsMap['scene-flow-stage']({dataset:{stage:'submitted'}});actionsMap['scene-flow-submit']();assert(!state.drawer.flow.receipt);
`));
test('已保存阶段提示及受控策略同步进入业务操作表、异常表和连续示例并转义', () => fullWorkspace()(`
  selectScene('release','actions');const s=scene();
  s.workflow.sceneFlow={...sceneFlowConfig(s),allowAssistantSubmit:true,unknown:'manual',clarification:'fields',maxRetries:1,confirmation:'summary'};
  s.workflow.flow={stages:{input:{inputPrompt:'业务输入 <script>示例</script>'},clarify:{clarifyPrompt:'请明确选择升级整机'},mapping:{mappingPrompt:'核对本次发布单'},check:{recoveryMode:'manual',blockerPrompt:'回来源系统处理后重查',imagesGuide:'请资料责任人补图'},review:{reviewPrompt:'请确认本次升级内容'},submitted:{receiptPrompt:'仅本地回执，无真实单据'}}};${selectAllBranchTemplates}
  const html=applicationActionsView(s);assert(html.includes('业务输入 &lt;script&gt;示例&lt;/script&gt;'));assert(!html.includes('<script>示例</script>'));
  assert(html.includes('请明确选择升级整机'));assert(html.includes('核对本次发布单'));assert(html.includes('请资料责任人补图'));assert(html.includes('仅本地回执，无真实单据'));
  const branches=sceneFlowBranchesHTML(s,'all').match(/<table[^>]*data-flow-branches[\\s\\S]*?<[/]table>/)?.[0];assert(branches.includes('人工本体选择'));assert(branches.includes('候选卡片 + 关键信息'));assert(!branches.includes('只追问编号与关键字段'));assert.equal(sceneFlowConfig(s).clarification,'candidates');assert(branches.includes('最多 1 次'));assert(branches.includes('仅回来源系统处理'));
`));

test('仅智能提单包装完整场景流，旧高级测试与其他应用保持可达', () => fullWorkspace()(`
  selectScene('release','actions');const html=applicationActionsView(scene());
  for(const text of ['场景流','语义识别','按需澄清','生成单据与校验反馈','复核提交','本地确定性模拟'])assert(html.includes(text));
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
  selectScene('release');${enableAssistantSubmit}const s=scene(),m=sceneReleaseEnsure(s);m.check=sceneReleaseCheck(s);sceneReleasePublish(s.id);
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
  selectScene('release');${enableAssistantSubmit}actionsMap['scene-release-edit']({dataset:{id:'release'}});scene().selectedBlock='main';
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
test('旧字段式澄清配置仍固定候选卡片解除物料冲突；混合原文末尾空白不阻止继续', () => fullWorkspace()(open + `
  closeOverlay(true);scene().workflow.sceneFlow={...sceneFlowConfig(scene()),clarification:'fields'};actionsMap['scene-flow-open']();assert.equal(sceneFlowConfig(scene()).clarification,'candidates');
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request+=' MAT-20260082';actionsMap['scene-flow-recognize']();assert.equal(state.drawer.flow.branch,'ambiguous');
  assert(extraDrawers.sceneFlow().includes('data-action="scene-flow-choose-material"'));actionsMap['scene-flow-choose-material']({dataset:{id:'MAT-20260081'}});assert(state.drawer.flow.generated);
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
  assert(html.includes('data-flow-stage-panel="recognize"'));assert(!html.includes('data-flow-stage-panel="input"'));assert.equal(sceneFlowUI.stage,'recognize');
` + clickStage('recognize') + `
  html=applicationActionsView(scene());assert.equal(sceneFlowUI.stage,'recognize');
  assert(html.includes('data-stage="recognize" role="tab" aria-selected="true"'));
  assert(html.includes('data-flow-stage-panel="recognize"'));assert(!html.includes('data-flow-stage-panel="input"'));
  assert(html.includes('提单 / 问答 / 提交当前单据（submit-current，固定能力） / 混合 / 不支持'));assert(html.includes('唯一 / 未知 / 多候选'));
`));
test('页面输入起点后的四个业务展示组展示各自节点和策略，不再提供基础配置入口', () => fullWorkspace()(`
  selectScene('release','actions');const panels=new Set();
  const expectations={recognize:['提单 / 问答 / 提交当前单据（submit-current，固定能力） / 混合 / 不支持','唯一 / 未知 / 多候选'],clarify:['候选','关键字段','纠错','重试'],prepare:['草稿','字段现值','建议与来源','失败证据中的对象与入参','只读预检','明确确认','独立正式校验','未知与失败阻断'],finish:['单据','来源','业务行','证据','独立终检','用户复核','语义授权提交（默认）','复核本身不授权','人工提交','复核后点击确认提交']};
  assert.equal(sceneFlowConfig(scene()).submissionMode,'authorized');assert.equal(sceneFlowConfig(scene()).allowAssistantSubmit,true);assert.equal(sceneFlowConfig(scene()).autoSubmit,false);
  for(const [stage,words]of Object.entries(expectations)){
    dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage},closest(){return this;}});
    const html=applicationActionsView(scene()),panel=html.split('<section')[1]?.split('</section>')[0];
    assert(panel,stage);for(const word of words)assert(panel.includes(word),stage+': '+word);panels.add(panel);
    assert(!html.includes('data-action="scene-flow-settings"'));assert(!html.includes('基础配置 / 输入引导'));
  }
  assert.equal(panels.size,sceneFlowDisplayStages.length);assert(!sceneReleaseMutations.has('scene-flow-stage'));
  dispatchTestEvent('click',{dataset:{action:'scene-flow-settings'},closest(){return this;}});
  assert.notEqual(state.drawer?.type,'sceneFlowSettings');
`));
test('删除重复策略汇总展示，默认与已保存策略仍可在行内编辑维护', () => fullWorkspace()(`
  selectScene('release','actions');const s=scene(),before=sceneReleaseFingerprint(s),workflow=JSON.stringify(s.workflow),history=JSON.stringify(sceneReleaseEnsure(s).history);
` + clickStage('clarify') + `
  let html=applicationActionsView(s);assert(!html.includes('本阶段详细配置与业务提示'));assert(html.includes('scene-flow-inline-edit'));
  assert.equal(JSON.stringify(s.workflow),workflow);assert.equal(sceneReleaseFingerprint(s),before);assert.equal(JSON.stringify(sceneReleaseEnsure(s).history),history);assert.equal(s.workflow.sceneFlow,undefined);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});actionsMap['scene-flow-inline-edit']({dataset:{stage:'clarify'}});assert.equal(sceneFlowUI.editor.draft.maxRetries,2);assert(!applicationActionsView(s).includes('data-flow-inline-field="clarification"'));actionsMap['scene-flow-inline-cancel']();
  s.workflow.sceneFlow={...sceneFlowDefaults(),unknown:'manual',clarification:'fields',maxRetries:1,confirmation:'summary'};
  actionsMap['scene-flow-inline-edit']({dataset:{stage:'clarify'}});assert.equal(sceneFlowUI.editor.draft.maxRetries,1);assert.equal(sceneFlowConfig(s).clarification,'candidates');assert(!applicationActionsView(s).includes('data-flow-inline-field="clarification"'));actionsMap['scene-flow-inline-cancel']();
` + clickStage('mapping') + `
  actionsMap['scene-flow-inline-edit']({dataset:{stage:'mapping'}});assert.equal(sceneFlowUI.editor.draft.confirmation,'summary');actionsMap['scene-flow-inline-cancel']();
`));
test('页面非法阶段忽略且不render、不影响浏览和fingerprint', () => fullWorkspace()(`
  selectScene('release','actions');const before=sceneReleaseFingerprint(scene()),renderBefore=render;let calls=0;render=()=>{calls++;};
  for(const stage of ['submit','answer','blocked','__proto__','<script>',''])dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage},closest(){return this;}});
  assert.equal(sceneFlowUI.stage,'recognize');assert.equal(calls,0);assert.equal(sceneReleaseFingerprint(scene()),before);render=renderBefore;
`));
test('drawer浏览未来提交阶段不能让未识别输入跳过执行门禁', () => fullWorkspace()(open + `
  const d=state.drawer,before=JSON.stringify(d.flow);const pageStage=sceneFlowUI.stage;
` + clickStage('submitted') + `
  assert.equal(d.flow.stage,'input');assert.equal(d.flow.viewStage,'finish');assert.equal(sceneFlowUI.stage,pageStage);
  const viewedFlow=JSON.parse(JSON.stringify(d.flow));delete viewedFlow.viewStage;assert.equal(JSON.stringify(viewedFlow),before);
  const html=extraDrawers.sceneFlow();assert(html.includes('data-flow-stage-panel="finish"'));assert(html.includes('真实执行阶段：用户输入'));assert.equal(sceneFlowStageLabel('submitted'),'模拟代提交');assert(html.includes('查看阶段：复核提交'));
  dispatchTestEvent('click',{dataset:{action:'scene-flow-submit'},closest(){return this;}});assert(!d.flow.receipt);assert.equal(d.flow.stage,'input');
  dispatchTestEvent('click',{dataset:{action:'scene-flow-review'},closest(){return this;}});assert.equal(d.flow.reviewStamp,null);assert(!sceneFlowTrustedReview(scene()));assert(!d.flow.authorization);
`));
test('drawer阶段浏览不清除结果、确认和复核，保留happy path与指纹', () => fullWorkspace()(open + mapped + `
  const d=state.drawer;actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();
  const before=JSON.stringify(d.flow),fingerprint=sceneFlowFingerprint(scene()),pageStage=sceneFlowUI.stage;
  const result=d.flow.result,confirmations=d.flow.confirmations,reviewStamp=d.flow.reviewStamp;const drawBefore=drawOverlay;let draws=0;drawOverlay=()=>{draws++;};
` + clickStage('recognize') + clickStage('check') + `
  assert.equal(draws,2);drawOverlay=drawBefore;assert.equal(d.flow.stage,'review');assert.equal(d.flow.viewStage,'prepare');assert.equal(sceneFlowUI.stage,pageStage);
  assert.equal(d.flow.result,result);assert.equal(d.flow.confirmations,confirmations);assert.equal(d.flow.reviewStamp,reviewStamp);
  const viewedFlow=JSON.parse(JSON.stringify(d.flow));delete viewedFlow.viewStage;assert.equal(JSON.stringify(viewedFlow),before);assert.equal(sceneFlowFingerprint(scene()),fingerprint);
  const html=extraDrawers.sceneFlow(),panel=html.split('data-flow-stage-panel="prepare"')[1].split('</section>')[0],execution=html.split('<h3 class="section-gap">执行区')[1];assert(panel.includes('data-flow-stage-summary="prepare"'));assert(!panel.includes('当前阶段内容 · 只读快照'));assert(execution.includes('校验结果与解决方案'));assert(execution.includes('复核：当前单据副本'));assert(execution.includes('data-action="scene-flow-review"'));
  dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage:'review'},closest(){return this;}});
  assert(extraDrawers.sceneFlow().split('<h3 class="section-gap">执行区')[1].includes('已完成复核'));assert.equal(d.flow.result,result);assert.equal(d.flow.reviewStamp,reviewStamp);
  dispatchTestEvent('click',{dataset:{action:'scene-flow-stage',stage:'check'},closest(){return this;}});
  dispatchTestEvent('click',{dataset:{action:'scene-flow-submit'},closest(){return this;}});assert(d.flow.receipt);assert.equal(d.flow.stage,'submitted');assert.equal(d.flow.viewStage,'prepare');
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
  actionsMap['scene-flow-open']();assert.equal(state.drawer.flow.stage,'input');assert.equal(state.drawer.flow.viewStage,undefined);assert(extraDrawers.sceneFlow().includes('data-flow-input-start'));assert(!extraDrawers.sceneFlow().includes('data-flow-stage-panel="input"'));
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();assert.equal(state.drawer.flow.stage,'mapping');assert(extraDrawers.sceneFlow().includes('data-flow-stage-panel="prepare"'));
  assert.equal(sceneFlowUI.stage,'prepare');assert.equal(sceneFlowFingerprint(scene()),before);closeOverlay(true);
  selectScene('release_qa');selectScene('release','actions');assert.equal(sceneFlowFingerprint(scene()),before);assert.equal(sceneFlowUI.stage,'prepare');
  actionsMap['scene-flow-open']();assert.equal(state.drawer.flow.stage,'input');assert.equal(state.drawer.flow.viewStage,undefined);
`));
test('查看页签映射真实ready-check、blocked与answer状态而不把内部阶段用作可点击id', () => fullWorkspace()(open + `
  const d=state.drawer;for(const [actual,view]of [['ready-check','prepare'],['blocked','prepare'],['answer','recognize']]){
    d.flow.stage=actual;const html=extraDrawers.sceneFlow();assert(html.includes('data-flow-stage-panel="'+view+'"'));assert(html.includes('data-stage="'+view+'" role="tab" aria-selected="true"'));assert.equal(d.flow.stage,actual);
  }
`));
test('新增objectless表技术parent不注入主单归属，同名系统字段不触发本体提取与查询', () => fullWorkspace()(`
  selectScene('release','actions');${enableAssistantSubmit}actionsMap['scene-release-edit']({dataset:{id:'release'}});
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
test('AI按规则生成字段展示已配置描述，未接入结果不得被忽略后模拟提交', () => fullWorkspace()(`
  selectScene('release');${enableAssistantSubmit}actionsMap['scene-release-edit']({dataset:{id:'release'}});
  const s=scene();s.workflow.blocks.extra={id:'extra',label:'AI字段表',path:'extra',object:null,parent:'main',many:true,keyField:'id',fields:[{key:'id',label:'编号',type:'文本',mappingMode:'system'},{key:'summary',label:'摘要',type:'文本',mappingMode:'ai',aiGenerationRule:'基于本次提单信息生成简洁摘要'}]};s.bindings.extra=[];s.names.extra='AI字段表';actionsMap['scene-flow-open']();
` + mapped + `
  assert(extraDrawers.sceneFlow().includes('AI 按规则生成'));assert(extraDrawers.sceneFlow().includes('基于本次提单信息生成简洁摘要'));
  actionsMap['scene-flow-confirm-ordinary']();assert(state.drawer.error.includes('尚未接入'));actionsMap['scene-flow-validate']();assert(!state.drawer.flow.result);actionsMap['scene-flow-submit']();assert(!state.drawer.flow.receipt);
`));
test('字段未确认、任意外部修复、建议篡改和关键信息缺失均不能绕过流程', () => fullWorkspace()(open + `
  state.drawer.draft.request='创建发布单 MAT-20260081';actionsMap['scene-flow-recognize']();
  assert.equal(state.drawer.flow.stage,'clarify');assert(!state.drawer.flow.generated);
  actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();
  actionsMap['scene-flow-validate']();assert(!state.drawer.flow.result);
  const d=state.drawer;d.flow.generated.suggestions[0].suggested='篡改';sceneFlowConfirmAll();assert(d.error);assert(!d.flow.result);
  actionsMap['scene-flow-simulate-external']({dataset:{kind:'di'}});assert(!d.flow.pendingExternal);
`));

const editFlowBranch = id => `dispatchTestEvent('click',{dataset:{action:'scene-flow-edit-stage',stage:sceneFlowBranchStage('${id}'),branch:'${id}'},closest(){return this;}});`;
test('阶段四列只在表头统一行内编辑，已选分支五列加操作列唯一编辑与移除，安全底线独立说明', () => fullWorkspace()(`
  selectScene('release','actions');const s=scene(),before=sceneFlowFingerprint(s);
  for(const [stage]of sceneFlowDisplayStages){
    const html=sceneFlowStageDetailHTML(s,stage),header=html.split('<table')[0],table=html.match(/<table[^>]*data-flow-operation-table[\\s\\S]*?<[/]table>/)[0],cells=table.match(/<td[^>]*>[\\s\\S]*?<[/]td>/g);
    assert.equal(cells.length,4);assert.equal((header.match(/data-action="scene-flow-inline-edit"/g)||[]).length,1);assert(header.includes('data-stage="'+stage+'"'));assert.equal((html.match(/data-action="scene-flow-inline-edit"/g)||[]).length,1);assert(!html.includes('data-action="scene-flow-edit-stage"'));assert(!html.includes('data-focusfield='));
    cells.forEach(cell=>{assert(!cell.includes('<button'));assert(!cell.includes('data-action='));assert(!cell.includes('固定安全机制'));});
  }
  assert(!sceneFlowBranchesHTML(s,'all').includes('<tr data-flow-branch='));assert.equal(sceneFlowFingerprint(s),before);assert.equal(s.workflow.flow,undefined);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});${selectAllBranchTemplates}const selectedBefore=sceneFlowFingerprint(s);
  const html=sceneFlowBranchesHTML(s,'all');assert.equal((html.match(/<tr data-flow-branch=/g)||[]).length,sceneFlowBranchRows(s).length);
  for(const [id]of sceneFlowBranchRows(s)){
    const row=html.split('<tr data-flow-branch="'+id+'">')[1].split('</tr>')[0],cells=row.match(/<td[^>]*>[\\s\\S]*?<[/]td>/g);assert.equal(cells.length,6);
    cells.slice(0,5).forEach(cell=>{assert(!cell.includes('<button'));assert(!cell.includes('data-action='));assert(!cell.includes('固定安全机制'));});
    assert.equal((row.match(/<button[ >]/g)||[]).length,2);assert.equal((row.match(/data-action="scene-flow-inline-edit"/g)||[]).length,1);assert.equal((row.match(/data-action="scene-flow-remove-branch"/g)||[]).length,1);assert(cells[5].includes('data-branch="'+id+'"'));assert(cells[5].includes('data-stage="'+sceneFlowDisplayGroup(sceneFlowBranchStage(id))+'"'));assert(!row.includes('data-action="scene-flow-edit-stage"'));assert(!row.includes('data-focusfield='));
  }
  assert(sceneFlowView(s).includes(sceneFlowDefinitionNote));assert.equal(sceneFlowFingerprint(s),selectedBefore);
`));
// Legacy compatibility helpers below retain drawer security coverage; the page only exposes inline-edit routes.
test('legacy兼容：分支抽屉五项受控定义默认预填，取消隔离并保留当前默认文案', () => fullWorkspace()(`
  selectScene('release','actions');sceneFlowOpenStageSettings({dataset:{stage:'check',branch:'blocked'}});assert(!state.drawer);actionsMap['scene-release-edit']({dataset:{id:'release'}});
  const s=scene(),before=sceneFlowFingerprint(s),defaults=sceneFlowBranchConfig(s,'blocked');sceneFlowOpenStageSettings({dataset:{stage:'check',branch:'blocked'}});assert.equal(state.drawer.mode,'branch');assert.equal(state.drawer.branch,'blocked');assert.equal(JSON.stringify(state.drawer.draft),JSON.stringify(defaults));const html=extraDrawers.sceneFlowStageSettings();assert(html.includes('data-field="question"'));assert(html.includes('data-field="guide"'));assert(!html.includes('data-field="maxRetries"'));assert(!html.includes('data-field="nextStage"'));
  dispatchTestEvent('input',{dataset:{field:'question'},value:'取消的修改',tagName:'TEXTAREA'});assert(state.drawer.dirty);assert.equal(sceneFlowFingerprint(s),before);closeOverlay(true);assert.equal(s.workflow.flow,undefined);
  sceneFlowOpenStageSettings({dataset:{stage:'check',branch:'blocked'}});state.drawer.draft.question='  通用流程单追问 <script>禁止</script>  ';state.drawer.draft.guide='联系业务负责人按当前证据处理并重检';actionsMap['scene-flow-save-stage']();assert.equal(state.drawer,null);assert.equal(s.workflow.flow.branches.blocked.question,'通用流程单追问 <script>禁止</script>');assert.equal(s.workflow.flow.branches.blocked.guide,'联系业务负责人按当前证据处理并重检');assert(sceneFlowBranchesHTML(s,'all').includes('&lt;script&gt;禁止&lt;/script&gt;'));assert(sceneReleaseEnsure(s).history.some(h=>h.action==='保存草稿'));
`));
test('分支保存自身guard拒绝未知schema、非法内容、伪造owner与场景区块指纹权限变更', () => fullWorkspace()(`
  selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});const s=scene();
  for(const [key,value]of [['question',''],['guide','  '],['question','x'.repeat(801)],['guide',8],['nextStage','submitted'],['safety','off']]){sceneFlowOpenStageSettings({dataset:{stage:'check',branch:'blocked'}});const before=JSON.stringify(s.workflow);state.drawer.draft[key]=value;sceneFlowSaveStage();assert(state.drawer.error,key);assert.equal(JSON.stringify(s.workflow),before);closeOverlay(true);}
  for(const mutation of ['branch','mode','stage','scene','block','fingerprint','permission','owner']){selectScene('release');s.selectedBlock='main';sceneReleaseEnsure(s).editing=true;sceneFlowOpenStageSettings({dataset:{stage:'check',branch:'blocked'}});state.drawer.draft.question='不应保存';if(mutation==='branch')state.drawer.branch='timeout';if(mutation==='mode')state.drawer.mode='stage';if(mutation==='stage')state.drawer.stage='input';if(mutation==='scene')selectScene('trial');if(mutation==='block')s.selectedBlock='items';if(mutation==='fingerprint')s.workflow.action+='变更';if(mutation==='permission')sceneReleaseEnsure(s).editing=false;if(mutation==='owner')state.drawer={...state.drawer};const before=JSON.stringify(s.workflow);sceneFlowSaveStage();assert(state.drawer.error,mutation);assert.equal(JSON.stringify(s.workflow),before);closeOverlay(true);}
  selectScene('release');sceneReleaseEnsure(s).editing=true;for(const branch of ['__proto__','not-real','']){sceneFlowOpenStageSettings({dataset:{stage:'check',branch}});assert(!state.drawer);}
`));
test('已保存所有识别分支追问与指引进入真实历史，修改文案不能跳过未知或澄清', () => fullWorkspace()(`
  selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});
  for(const id of ['recognized','ambiguous','unknown','vague-question']){sceneFlowOpenStageSettings({dataset:{stage:sceneFlowBranchStage(id),branch:id}});state.drawer.draft.question='自定义 '+id+' 追问';state.drawer.draft.guide='自定义 '+id+' 处理';sceneFlowSaveStage();}
  actionsMap['scene-flow-open']();for(const id of ['recognized','ambiguous','unknown']){actionsMap['scene-flow-example']({dataset:{id}});if(id==='unknown')state.drawer.draft.request='创建发布单 MAT-NOT-EXIST';actionsMap['scene-flow-recognize']();assert(state.drawer.flow.history.some(h=>h.text==='自定义 '+id+' 追问'));assert(state.drawer.flow.history.some(h=>h.text==='自定义 '+id+' 处理'));if(id!=='recognized'){assert(!state.drawer.flow.generated);actionsMap['scene-flow-submit']();assert(!state.drawer.flow.receipt);}}
  actionsMap['scene-flow-example']({dataset:{id:'unknown'}});actionsMap['scene-flow-recognize']();assert.equal(state.drawer.flow.branch,'unknown');assert(state.drawer.flow.history.some(h=>h.text==='自定义 vague-question 追问'));assert(state.drawer.flow.history.some(h=>h.text==='自定义 vague-question 处理'));assert(!state.drawer.flow.generated);
`));
test('阻塞超时待复核分支文案真实用于校验与处理，阶段及连续示例优先保存值', () => fullWorkspace()(`
  selectScene('release');${enableAssistantSubmit}actionsMap['scene-release-edit']({dataset:{id:'release'}});const s=scene();
  for(const id of ['ambiguous','blocked','timeout','passed-review']){sceneFlowOpenStageSettings({dataset:{stage:sceneFlowBranchStage(id),branch:id}});state.drawer.draft.question='业务 '+id+' 追问';state.drawer.draft.guide='业务 '+id+' 处理';sceneFlowSaveStage();}
  assert(sceneFlowStageDetailHTML(s,'clarify').includes('业务 ambiguous 追问'));for(const [group,key,id]of [['prepare','blockerPrompt','blocked'],['finish','reviewPrompt','passed-review']]){sceneFlowInlineEdit({dataset:{stage:group}});assert.equal(sceneFlowUI.editor.draft[key],'业务 '+id+' 追问');assert(sceneFlowStageDetailHTML(s,group).includes('业务 '+id+' 追问'));sceneFlowInlineCancel();}const demo=sceneFlowBusinessExampleHTML(s);for(const id of ['ambiguous','blocked','passed-review'])assert(demo.includes('业务 '+id+' 追问'));assert.equal((demo.match(/data-flow-example-step=/g)||[]).length,5);assert(demo.includes('仅说明性示例'));
  actionsMap['scene-flow-open']();for(const [sample,id]of [['missing-image','blocked'],['timeout','timeout'],['recognized','passed-review']]){actionsMap['scene-flow-example']({dataset:{id:sample}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();assert(state.drawer.flow.history.some(h=>h.text==='业务 '+id+' 追问'));assert(state.drawer.flow.history.some(h=>h.text==='业务 '+id+' 处理'));if(id==='passed-review'){actionsMap['scene-flow-submit']();assert(!state.drawer.flow.receipt);actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();assert(state.drawer.flow.receipt);}else {assert(!state.drawer.flow.result.passed);assert(!state.drawer.flow.receipt);assert(extraDrawers.sceneFlow().includes('业务 '+id+' 处理'));}}
`));
test('分支保存改变指纹使旧结果复核失效，发布快照锁定可恢复并兼容旧flow', () => fullWorkspace()(`
  selectScene('release');${enableAssistantSubmit}actionsMap['scene-release-edit']({dataset:{id:'release'}});const s=scene();actionsMap['scene-flow-open']();actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();const old=state.drawer;closeOverlay(true);
  sceneFlowOpenStageSettings({dataset:{stage:'review',branch:'passed-review'}});state.drawer.draft.question='复核本次流程单';actionsMap['scene-flow-save-stage']();state.drawer=old;assert(!sceneFlowGeneratedCurrent());actionsMap['scene-flow-submit']();assert(!old.flow.receipt);assert(old.error.includes('配置'));closeOverlay(true);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});const m=sceneReleaseEnsure(s);m.check=sceneReleaseCheck(s);sceneReleasePublish(s.id);assert.equal(m.status,'已发布');const snapshot=JSON.stringify(m.snapshot);sceneFlowOpenStageSettings({dataset:{stage:'review',branch:'passed-review'}});assert(!state.drawer);actionsMap['scene-release-edit']({dataset:{id:s.id}});sceneFlowOpenStageSettings({dataset:{stage:'review',branch:'passed-review'}});state.drawer.draft.question='修订追问';sceneFlowSaveStage();assert.equal(JSON.stringify(m.snapshot),snapshot);sceneReleaseRestore(s.id);assert.equal(scene().workflow.flow.branches['passed-review'].question,'复核本次流程单');actionsMap['scene-release-edit']({dataset:{id:s.id}});delete m.snapshot.scene.workflow.flow;sceneReleaseRestore(s.id);assert.equal(scene().workflow.flow,undefined);assert(!sceneFlowBranchesHTML(scene(),'all').includes('<tr data-flow-branch='));assert(sceneFlowBranchConfig(scene(),'passed-review').guide.includes('复核'));
`));

const editFlowStage = stage => `dispatchTestEvent('click',{dataset:{action:'scene-flow-edit-stage',stage:'${stage}'},closest(){return this;}});`;
const saveFlowStage = `dispatchTestEvent('click',{dataset:{action:'scene-flow-save-stage'},closest(){return this;}});`;
const editingFlow = `selectScene('release','actions');` + enableAssistantSubmit + `actionsMap['scene-release-edit']({dataset:{id:'release'}});`;
test('输入起点后各阶段统一行内编辑受权限保护，legacy兼容抽屉仅展示本阶段字段', () => fullWorkspace()(`
  selectScene('release','actions');const before=sceneFlowFingerprint(scene());
  for(const [stage]of sceneFlowDisplayStages){actionsMap['scene-flow-stage']({dataset:{stage}});const html=applicationActionsView(scene()),panel=html.match(/<section[^>]*data-flow-stage-panel="[^"]+"[\\s\\S]*?<[/]section>/)[0],header=panel.split('<table')[0];assert(header.includes('编辑本阶段'));assert.equal((header.match(/data-action="scene-flow-inline-edit"/g)||[]).length,1);assert(header.includes('data-stage="'+stage+'"'));assert(!html.includes('data-action="scene-flow-edit-stage"'));assert(!html.includes('data-focusfield='));assert(html.includes('请先点击场景的“编辑”'));actionsMap['scene-flow-inline-edit']({dataset:{stage}});assert(!state.drawer);assert.equal(sceneFlowFingerprint(scene()),before);actionsMap['scene-flow-edit-stage']({dataset:{stage}});assert(!state.drawer);}
  assert.equal(sceneFlowFingerprint(scene()),before);actionsMap['scene-release-edit']({dataset:{id:'release'}});
  const fields={input:['inputMode','inputPrompt'],recognize:['unknown','noMatchPrompt'],clarify:['maxRetries','clarifyPrompt'],mapping:['confirmation','mappingPrompt'],check:['recoveryMode','blockerPrompt','imagesGuide'],review:['reviewPrompt'],submitted:['receiptPrompt']};
  for(const [stage,keys]of Object.entries(fields)){actionsMap['scene-flow-edit-stage']({dataset:{stage}});assert.equal(state.drawer.type,'sceneFlowStageSettings');assert.equal(state.drawer.stage,stage);const html=extraDrawers.sceneFlowStageSettings();for(const key of keys)assert(html.includes('data-field="'+key+'"'));assert(!html.includes('data-field="safety"'));assert(!html.includes('data-field="skipStage"'));if(stage!=='input')assert(!html.includes('data-field="inputMode"'));closeOverlay(true);}
`));
test('阶段保存复用sceneFlowConfig，flow业务引导真实进入页面和体验，取消不写入', () => fullWorkspace()(editingFlow + editFlowStage('input') + `
  const s=scene(),before=sceneFlowFingerprint(s);dispatchTestEvent('input',{dataset:{field:'inputPrompt'},value:'请先填写项目和软件版本',tagName:'TEXTAREA'});assert(state.drawer.dirty);assert.equal(sceneFlowFingerprint(s),before);closeOverlay(true);assert.equal(s.workflow.flow,undefined);
` + editFlowStage('input') + `
  state.drawer.draft.inputPrompt='请先填写项目和软件版本';state.drawer.draft.inputMode='structured';
` + saveFlowStage + `
  assert.equal(state.drawer,null);assert.equal(s.workflow.flow.stages.input.inputMode,'structured');assert.notEqual(sceneFlowFingerprint(s),before);assert(sceneReleaseEnsure(s).history.some(h=>h.action==='保存草稿'));assert(applicationActionsView(s).includes('请先填写项目和软件版本'));
  actionsMap['scene-flow-open']();assert(extraDrawers.sceneFlow().includes('请先填写项目和软件版本'));assert(extraDrawers.sceneFlow().includes('<details open class="plain-details section-gap"><summary>补充关键信息'));closeOverlay(true);
` + editFlowStage('mapping') + `state.drawer.draft.confirmation='summary';state.drawer.draft.mappingPrompt='核对字段来源后确认';` + saveFlowStage + `
  assert.equal(s.workflow.sceneFlow.confirmation,'summary');assert.equal(s.workflow.flow.stages.input.inputMode,'structured');actionsMap['scene-flow-open']();actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();assert(extraDrawers.sceneFlow().includes('scene-flow-confirm-all'));assert(state.drawer.flow.history.some(h=>h.text.includes('核对字段来源后确认')));
`));
test('识别澄清提示进入实际历史，关闭本地事实模拟只能回来源系统不允许通过', () => fullWorkspace()(editingFlow + editFlowStage('recognize') + `state.drawer.draft.unknown='manual';state.drawer.draft.noMatchPrompt='请明确业务任务与本体编号';` + saveFlowStage + editFlowStage('clarify') + `assert(!extraDrawers.sceneFlowStageSettings().includes('data-field="clarification"'));state.drawer.draft.maxRetries=1;state.drawer.draft.clarifyPrompt='请补齐项目、部门与主题';` + saveFlowStage + editFlowStage('check') + `state.drawer.draft.recoveryMode='manual';state.drawer.draft.blockerPrompt='联系负责人处理后重新校验';state.drawer.draft.imagesGuide='请资料管理员补图';` + saveFlowStage + `
  actionsMap['scene-flow-open']();actionsMap['scene-flow-example']({dataset:{id:'unknown'}});actionsMap['scene-flow-recognize']();assert(state.drawer.flow.history.some(h=>h.text.includes('请明确业务任务与本体编号')));assert(extraDrawers.sceneFlow().includes('scene-flow-choose-material'));actionsMap['scene-flow-example']({dataset:{id:'recognized'}});state.drawer.draft.request='创建发布单 MAT-20260081';actionsMap['scene-flow-recognize']();assert(state.drawer.flow.history.some(h=>h.text.includes('请补齐项目、部门与主题')));
` + example('missing-image') + `
  const d=state.drawer;assert(!d.flow.result.passed);assert(extraDrawers.sceneFlow().includes('请资料管理员补图'));assert(!extraDrawers.sceneFlow().includes('data-action="scene-flow-simulate-external"'));actionsMap['scene-flow-simulate-external']({dataset:{kind:'images'}});assert(!d.flow.pendingExternal);actionsMap['scene-flow-submit']();assert(!d.flow.receipt);
`));
test('阶段保存自身Allowed拒绝伪造stage、跨区块跨场景、过期指纹与编辑权限撤销', () => fullWorkspace()(editingFlow + `
  for(const mutation of ['stage','block','scene','fingerprint','permission']){
    selectScene('release','actions');const s=scene();sceneReleaseEnsure(s).editing=true;actionsMap['scene-flow-edit-stage']({dataset:{stage:'input'}});const before=JSON.stringify(s.workflow);state.drawer.draft.inputPrompt='不应保存';
    if(mutation==='stage')state.drawer.stage='review';if(mutation==='block')s.selectedBlock=s.selectedBlock==='main'?'items':'main';if(mutation==='scene')selectScene('trial');if(mutation==='fingerprint')s.workflow.action+='变更';if(mutation==='permission')sceneReleaseEnsure(s).editing=false;
    const expected=JSON.stringify(s.workflow);sceneFlowSaveStage();assert.equal(JSON.stringify(s.workflow),expected);assert(state.drawer.error);if(mutation!=='fingerprint')assert.equal(JSON.stringify(s.workflow),before);closeOverlay(true);
  }
  selectScene('release');sceneReleaseEnsure(scene()).editing=true;for(const stage of ['__proto__','blocked','answer','']){sceneFlowOpenStageSettings({dataset:{stage}});assert(!state.drawer);}
`));
test('阶段字段白名单及枚举校验拒绝关闭安全和任意跳阶段，无效内容不保存', () => fullWorkspace()(editingFlow + `
  for(const [key,value]of [['inputMode','skip'],['inputPrompt',''],['inputPrompt','x'.repeat(801)],['safety','off'],['skipStage',true],['confirmation','none']]){
    actionsMap['scene-flow-edit-stage']({dataset:{stage:'input'}});const before=JSON.stringify(scene().workflow);state.drawer.draft[key]=value;sceneFlowSaveStage();assert(state.drawer.error,key);assert.equal(JSON.stringify(scene().workflow),before);closeOverlay(true);
  }
`));
test('通用规则卡失败按证据对象入参处理，不提示错误软件身份或伪造本地修复', () => fullWorkspace()(open + `
  const blocker={rule:'minimum-system',name:'整机最小系统',status:'阻断',target:'Material:MAT-20260081',evidence:[{field:'Material.minimumStatus',source:'pis.materialMinimum',params:{materialCode:'MAT-20260081'},status:'不满足'}]};const b=sceneFlowBlockers({checks:[blocker]})[0];assert.equal(b.fix,'');assert(b.guide.includes('失败证据对应对象 / 入参'));assert(b.guide.includes('MAT-20260081'));assert(!b.guide.includes('软件编码 / 版本'));
  const generic=sceneFlowBlockers({checks:[{...blocker,rule:'rule-card-custom'}]})[0];assert.equal(generic.fix,'');assert(generic.guide.includes('业务负责人'));assert(generic.guide.includes('来源系统处理后重新查询'));assert(generic.guide.includes('materialCode'));
  const html=sceneFlowStageDetailHTML(scene(),'check');assert(html.includes('失败证据中的对象与入参'));assert(!html.includes('软管完成对应项目 / 软件 / 版本'));
`));
test('复核与回执提示进入真实流程，global保存不覆盖阶段，manual模式不模拟超时恢复', () => fullWorkspace()(editingFlow + editFlowStage('review') + `state.drawer.draft.reviewPrompt='请逐行复核当前证据';` + saveFlowStage + editFlowStage('submitted') + `state.drawer.draft.receiptPrompt='仅本地回执，无真实单据';` + saveFlowStage + `
  actionsMap['scene-flow-settings']();state.drawer.draft.confirmation='summary';actionsMap['scene-flow-save-settings']();assert.equal(scene().workflow.flow.stages.review.reviewPrompt,'请逐行复核当前证据');actionsMap['scene-flow-open']();
` + mapped + `
  actionsMap['scene-flow-validate']();assert(state.drawer.flow.history.some(h=>h.text==='请逐行复核当前证据'));actionsMap['scene-flow-submit']();assert(!state.drawer.flow.receipt);actionsMap['scene-flow-review']();actionsMap['scene-flow-submit']();assert(state.drawer.flow.receipt);assert(state.drawer.flow.history.some(h=>h.text==='仅本地回执，无真实单据'));closeOverlay(true);
` + editFlowStage('check') + `state.drawer.draft.recoveryMode='manual';` + saveFlowStage + `actionsMap['scene-flow-open']();` + example('timeout') + `
  const d=state.drawer;assert(!d.flow.result.passed);actionsMap['scene-flow-retry']();assert(!d.flow.result.passed);assert.equal(d.flow.failure,'超时');assert.equal(d.flow.retries,0);assert(d.error.includes('来源系统'));closeOverlay(true);
  sceneFlowOpenStageSettings({dataset:{stage:'input'}});const draft=state.drawer;state.drawer={...draft};sceneFlowSaveStage();assert(state.drawer.error.includes('所有权'));state.drawer=draft;const before=JSON.stringify(scene().workflow);sceneReleaseEnsure(scene()).status='已发布';sceneFlowSaveStage();assert.equal(JSON.stringify(scene().workflow),before);assert(state.drawer.error.includes('发布'));
`));
test('阶段保存使旧生成检查和复核失效，发布锁定，修订快照可恢复并兼容旧无flow版本', () => fullWorkspace()(editingFlow + editFlowStage('review') + `state.drawer.draft.reviewPrompt='核对具体业务行及来源';` + saveFlowStage + `
  const s=scene();actionsMap['scene-flow-open']();
` + mapped + `
  actionsMap['scene-flow-validate']();actionsMap['scene-flow-review']();const old=state.drawer;assert(old.flow.result.passed);closeOverlay(true);
` + editFlowStage('submitted') + `state.drawer.draft.receiptPrompt='本地测试已完成，请勿当作真实提交';` + saveFlowStage + `
  state.drawer=old;assert(!sceneFlowGeneratedCurrent());actionsMap['scene-flow-submit']();assert(!old.flow.receipt);assert(old.error.includes('配置'));closeOverlay(true);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});const m=sceneReleaseEnsure(s);m.check=sceneReleaseCheck(s);sceneReleasePublish(s.id);assert.equal(m.status,'已发布');const snapshot=JSON.stringify(m.snapshot);sceneFlowOpenStageSettings({dataset:{stage:'review'}});assert(!state.drawer);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});assert.equal(m.status,'修订');sceneFlowOpenStageSettings({dataset:{stage:'review'}});state.drawer.draft.reviewPrompt='修订复核文案';sceneFlowSaveStage();assert.equal(JSON.stringify(m.snapshot),snapshot);sceneReleaseRestore(s.id);assert.equal(scene().workflow.flow.stages.review.reviewPrompt,'核对具体业务行及来源');assert.equal(sceneReleaseEnsure(scene()).editing,false);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});delete m.snapshot.scene.workflow.flow;sceneReleaseRestore(s.id);assert.equal(scene().workflow.flow,undefined);assert(sceneFlowStageDetailHTML(scene(),'finish').includes('用户复核'));actionsMap['scene-flow-open']();assert.equal(state.drawer.type,'sceneFlow');
`));
