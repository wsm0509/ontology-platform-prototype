const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');
const root = path.join(__dirname, '..');
function fullWorkspace() {
  const run = workspace(), loaded = new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);
  for (const [, file] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/src="([^"?]+)\?/g)) {
    if (!loaded.has(file)) {run(fs.readFileSync(path.join(root,file),'utf8'));loaded.add(file);}
  }
  run(`function assertJSON(actual,expected){assert.equal(JSON.stringify(actual),JSON.stringify(expected));}`);
  return run;
}
const edit = `selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});`;
const open = (text, object='ReleaseOrder', scope='main') => `actionsMap['workflow-rule-authoring']();dispatchTestEvent('input',{dataset:{field:'originalText'},value:${JSON.stringify(text)}});dispatchTestEvent('change',{dataset:{field:'objectId'},value:${JSON.stringify(object)},tagName:'SELECT'});dispatchTestEvent('change',{dataset:{field:'scope'},value:${JSON.stringify(scope)},tagName:'SELECT'});actionsMap['workflow-rule-generate']();`;

test('规则配置仅包装智能提单，保留人工入口并展示本地受控说明', () => fullWorkspace()(`
  selectScene('release');const html=workflowRulesView(scene());
  assert(html.includes('<h3>规则配置</h3>'));assert(html.includes('data-action="workflow-rule-authoring"'));assert(html.includes('data-action="workflow-add-rule"'));assert(html.includes('data-action="workflow-edit-rule"'));assert(html.includes('本地受控解析'));
  scene().workflow.type='validation';assert(workflowRulesView(scene()).includes('<h3>校验规则</h3>'));assert(!workflowRulesView(scene()).includes('workflow-rule-authoring'));
`));
test('真实输入事件生成安全DI草稿，不写入场景、日志或执行规则', () => fullWorkspace()(edit + `const before=JSON.stringify(scene().workflow.rules),logs=state.logs.length;` + open('项目安全 DI 必须为 0') + `
  assert.equal(state.drawer.type,'workflowRuleAuthoring');const r=state.drawer.generated;
  assert(r);assert.equal(r.scope,'main');assertJSON(r.assertions,[{fact:'Project.safetyDI',op:'eq',value:'0'}]);assertJSON(r.params,{projectCode:'order.projectCode'});assert.equal(r.enabled,false);assert.equal(r.level,'阻断');assert.equal(validateWorkflowRule(scene(),r),'');
  assert.equal(JSON.stringify(scene().workflow.rules),before);assert.equal(state.logs.length,logs);assert(extraDrawers.workflowRuleAuthoring().includes('结构化条件与断言'));
`));
test('自然语言元数据引用真实锁定对象、主单项目和本次校验字段', () => fullWorkspace()(edit + open('安全DI不大于2.5') + `
  const meta=state.drawer.generated.naturalLanguage;assert.equal(meta.originalText,'安全DI不大于2.5');assert.equal(meta.template,'safety-di');assert.equal(meta.engine,'local-controlled-parser');
  assert(meta.objects.some(o=>o.id==='ReleaseOrder'&&o.version===scene().ontologyVersions.ReleaseOrder));
  assert(meta.properties.some(p=>p.fact==='Project.safetyDI'&&p.path==='Context.project.safetyDI'&&p.kind==='business-context'));
  assert(meta.properties.some(p=>p.path==='ReleaseOrder.projectCode'&&p.kind==='ontology-property'));
`));
test('安全数字不截断或猜测，拒绝负数、科学计数、算式和附加未支持条件', () => fullWorkspace()(edit + `
  for(const text of ['安全DI不大于-1','安全DI不大于1e3','安全DI不大于1+2','安全DI不大于1.2.3','安全DI不大于9007199254740992','安全DI=1','安全DI=0且金额不得大于100']){
    actionsMap['workflow-rule-authoring']();state.drawer.draft={originalText:text,objectId:'ReleaseOrder',scope:'main'};actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null,text);assert(state.drawer.error,text);closeOverlay(true);
  }
`));
test('商品目录显式条件与四项非空断言，匹配物料版本与型号查询参数', () => fullWorkspace()(edit + open('商品目录的图片、资料、规格和功能必须存在且非空','ReleaseItem','items') + `
  const r=state.drawer.generated;assert(r,state.drawer.error);assertJSON(r.conditions,[{fact:'Material.inCatalog',op:'eq',value:'true'}]);
  assertJSON(r.assertions.map(a=>a.fact),['Product.images','Product.documents','Product.specifications','Product.features']);assert(r.assertions.every(a=>a.op==='exists'));assertJSON(r.params,{modelCode:'material.modelCode'});
  assert(r.naturalLanguage.objects.some(o=>o.id==='Material'&&o.version===scene().ontologyVersions.Material));assert(r.naturalLanguage.properties.some(p=>p.path==='Material.inCatalog'));assert(r.naturalLanguage.properties.some(p=>p.path==='Context.product.images'&&p.kind==='business-context'));
`));
test('后端业务部最小系统精确映射部门条件、发布状态及三个身份版本参数', () => fullWorkspace()(edit + open('后端业务部提交时，软管最小系统必须已发布','ModuleOrder','modules') + `
  const r=state.drawer.generated;assert(r,state.drawer.error);assertJSON(r.conditions,[{fact:'Order.submitDepartment',op:'eq',value:'后端业务部'}]);assertJSON(r.assertions,[{fact:'Minimum.status',op:'eq',value:'已发布'}]);assertJSON(r.params,{projectCode:'order.projectCode',softwareCode:'row.softwareCode',version:'row.version'});assert.equal(validateWorkflowRule(scene(),r),'');
`));
test('模糊资料完整、正常、符合要求必须澄清，不生成也不确认', () => fullWorkspace()(edit + `
  for(const text of ['商品目录资料完整','安全DI正常','最小系统符合要求']){
    actionsMap['workflow-rule-authoring']();state.drawer.draft={originalText:text,objectId:'ReleaseOrder',scope:'main'};actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.clarifications.length);assert(extraDrawers.workflowRuleAuthoring().includes('需澄清'));actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');closeOverlay(true);
  }
`));
test('无模板、无匹配属性和不相关对象不能生成猜测', () => fullWorkspace()(edit + `
  actionsMap['workflow-rule-authoring']();state.drawer.draft={originalText:'销售额必须增长',objectId:'ReleaseOrder',scope:'main'};actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.error.includes('支持模板'));
  state.drawer.draft={originalText:'商品目录图片必须存在且非空',objectId:'ReleaseOrder',scope:'main'};actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.error.includes('适用'));
  closeOverlay(true);scene().workflow.blocks.modules.fields=scene().workflow.blocks.modules.fields.filter(f=>f.key!=='version');
  actionsMap['workflow-rule-authoring']();state.drawer.draft={originalText:'后端业务部最小系统已发布',objectId:'ModuleOrder',scope:'modules'};actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.error.includes('version'));
`));
test('多个适用区块必须人工选定，不选择第一个；对象选择变化使草稿失效', () => fullWorkspace()(edit + `
  scene().workflow.blocks.items2={...structuredClone(scene().workflow.blocks.items),id:'items2',label:'第二明细',path:'items2'};scene().bindings.items2=structuredClone(scene().bindings.items);
  actionsMap['workflow-rule-authoring']();dispatchTestEvent('input',{dataset:{field:'originalText'},value:'商品目录图片必须存在且非空'});dispatchTestEvent('change',{dataset:{field:'objectId'},value:'ReleaseItem'});actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.error.includes('区块'));assert(extraDrawers.workflowRuleAuthoring().includes('第二明细'));
  dispatchTestEvent('change',{dataset:{field:'scope'},value:'items2'});actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated.scope,'items2');dispatchTestEvent('change',{dataset:{field:'objectId'},value:'Material'});assert.equal(state.drawer.generated,null);assert.equal(state.drawer.draft.scope,'');
`));
test('人工确认只进入既有结构化编辑器，尚不保存；取消隔离', () => fullWorkspace()(edit + `const before=JSON.stringify(scene().workflow.rules);` + open('安全DI=0') + `
  const generatedId=state.drawer.generated.id;actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRule');assert.equal(state.drawer.draft.id,generatedId);assert.equal(state.drawer.isNew,true);assert(extraDrawers.workflowRule().includes('自然语言来源'));assert(extraDrawers.workflowRule().includes('data-action="workflow-save-rule"'));assert.equal(JSON.stringify(scene().workflow.rules),before);closeOverlay(true);assert.equal(JSON.stringify(scene().workflow.rules),before);
`));
test('既有editor真实事件修改保存保留原文并标记结构化修改，默认停用', () => fullWorkspace()(edit + open('安全DI=0') + `
  actionsMap['workflow-rule-confirm']();const id=state.drawer.draft.id;dispatchTestEvent('input',{dataset:{field:'name'},value:'人工调整阈值'});dispatchTestEvent('change',{dataset:{ruleClause:'assertions',index:'0',key:'op'},value:'lte'});dispatchTestEvent('input',{dataset:{ruleClause:'assertions',index:'0',key:'value'},value:'3'});actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);
  const r=scene().workflow.rules.find(r=>r.id===id);assert(r);assert.equal(r.assertions[0].value,'3');assert.equal(r.naturalLanguage.originalText,'安全DI=0');assert.equal(r.naturalLanguage.correspondence,'structured-edited');assert.equal(r.naturalLanguage.reviewStatus,'saved-after-human-review');assert.equal(r.enabled,false);assert(workflowRulesView(scene()).includes('已人工调整'));
  actionsMap['workflow-edit-rule']({dataset:{id}});dispatchTestEvent('input',{dataset:{field:'message'},value:'再次人工修改'});actionsMap['workflow-save-rule']();assert.equal(scene().workflow.rules.find(r=>r.id===id).naturalLanguage.originalText,'安全DI=0');
`));
test('原文改动input/change立即清空生成预览，重新生成才能确认', () => fullWorkspace()(edit + open('安全DI=0') + `
  const first=state.drawer.generated.id;dispatchTestEvent('input',{dataset:{field:'originalText'},value:'安全DI不大于5'});assert.equal(state.drawer.generated,null);actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');actionsMap['workflow-rule-generate']();assert.notEqual(state.drawer.generated.id,first);assert.equal(state.drawer.generated.assertions[0].value,'5');dispatchTestEvent('change',{dataset:{field:'scope'},value:'main'});assert.equal(state.drawer.generated,null);
`));
test('生成与确认检查场景切换，不能写到另一场景', () => fullWorkspace()(edit + open('安全DI=0') + `
  const before=JSON.stringify(appScenes.release.workflow.rules);selectScene('trial');actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert.equal(JSON.stringify(appScenes.release.workflow.rules),before);assert(!scene().workflow.rules.some(r=>r.naturalLanguage));
`));
test('来源查询、锁定版本快照或表单变化后预览过期，需重新生成', () => fullWorkspace()(edit + open('安全DI=0') + `
  ability('demo.safetyDI').maps[0].source='changed';actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert(state.drawer.error.includes('变化'));actionsMap['workflow-rule-generate']();assert(state.drawer.generated);const h=objectReleaseVersion('ReleaseOrder',scene().ontologyVersions.ReleaseOrder);h.object.props.find(p=>p.id==='projectCode').name='快照被变更';actionsMap['workflow-rule-confirm']();assert(state.drawer.error.includes('变化'));
`));
test('未发布修订中的属性不能代替锁定定义，缺少实际映射不生成', () => fullWorkspace()(edit + `
  obj('Material').props.find(p=>p.id==='inCatalog').id='draftCatalog';
` + open('商品目录图片必须存在且非空','Material','items') + `
  assert(state.drawer.generated,state.drawer.error);assert(state.drawer.generated.naturalLanguage.properties.some(p=>p.path==='Material.inCatalog'));closeOverlay(true);
  const h=objectReleaseVersion('Material',scene().ontologyVersions.Material);h.object.props=h.object.props.filter(p=>p.id!=='inCatalog');
` + open('商品目录图片必须存在且非空','Material','items') + `
  assert.equal(state.drawer.generated,null);assert(state.drawer.error.includes('属性'));
`));
test('非编辑、已发布、非智能提单以及确认后过期草稿都不能新保存', () => fullWorkspace()(`
  selectScene('release');actionsMap['workflow-rule-authoring']();assert.equal(state.drawer,null);actionsMap['scene-release-edit']({dataset:{id:'release'}});
` + open('安全DI=0') + `
  actionsMap['workflow-rule-confirm']();const before=JSON.stringify(scene().workflow.rules);ability('demo.safetyDI').revision++;actionsMap['workflow-save-rule']();assert(state.drawer);assert(state.drawer.error.includes('变化'));assert.equal(JSON.stringify(scene().workflow.rules),before);closeOverlay(true);sceneReleaseEnsure(scene()).status='已发布';actionsMap['workflow-rule-authoring']();assert.equal(state.drawer,null);
  sceneReleaseEnsure(scene()).status='草稿';scene().workflow.type='validation';actionsMap['workflow-rule-authoring']();assert.equal(state.drawer,null);
`));
test('同一毫秒生成多份规则ID唯一，查询禁用或输出字段缺失拒绝生成', () => fullWorkspace()(edit + `
  const ids=new Set();for(let i=0;i<20;i++){actionsMap['workflow-rule-authoring']();state.drawer.draft={originalText:'安全DI=0',objectId:'ReleaseOrder',scope:'main'};actionsMap['workflow-rule-generate']();ids.add(state.drawer.generated.id);closeOverlay(true);}assert.equal(ids.size,20);
  connector('irdms').enabled=false;actionsMap['workflow-rule-authoring']();state.drawer.draft={originalText:'安全DI=0',objectId:'ReleaseOrder',scope:'main'};actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);connector('irdms').enabled=true;ability('demo.safetyDI').maps=[];actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);
`));
