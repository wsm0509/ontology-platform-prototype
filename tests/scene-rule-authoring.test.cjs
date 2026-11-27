// 测试生成方式：TDD
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
  run(`function assertJSON(actual,expected){assert.equal(JSON.stringify(actual),JSON.stringify(expected));}
    function cardClauses(r,kind){return r.ruleCard[kind].map(a=>({path:r.ruleCard.references.find(ref=>ref.id===a.reference)?.path,op:a.op,value:a.value}));}
    function requireGenerated(){assert(state.drawer.generated,state.drawer.error);assert.equal(validateWorkflowRule(scene(),state.drawer.generated),'');return state.drawer.generated;}
    function assertBlocked(){const before=JSON.stringify(scene().workflow.rules);actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.error);actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert.equal(JSON.stringify(scene().workflow.rules),before);}
    function duplicateItems(){const s=scene();s.workflow.blocks.modules={...structuredClone(s.workflow.blocks.items),id:'modules',label:'第二物料行',path:'moduleOrders'};s.bindings.modules=structuredClone(s.bindings.items).map(m=>({...m,target:m.target.replace('releaseItems', 'moduleOrders')}));}
  `);
  return run;
}
const edit = `selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});`;
const input = text => `dispatchTestEvent('input',{dataset:{field:'originalText'},value:${JSON.stringify(text)}});`;
const open = text => `actionsMap['workflow-rule-authoring']();` + input(text);
const generate = text => open(text) + `actionsMap['workflow-rule-generate']();requireGenerated();`;
const chainFixture = `
  scene().workflow.blocks.main.fields.push({key:'applicantDepartment',label:'申请人所属部门',type:'文本'});
  scene().bindings.main.push({target:scenePrefix(scene(),'main')+'applicantDepartment',ontology:'Person.department',instanceMode:'input'});
`;
const catalogFixture = `
  scene().workflow.blocks.items.fields.push({key:'inCatalog',label:'是否进入商品目录',type:'布尔'});
  scene().bindings.items.push({target:scenePrefix(scene(),'items')+'inCatalog',ontology:'Material.inCatalog',instanceMode:'input'});
`;
const chainExample = chainFixture + `actionsMap['workflow-rule-authoring']();dispatchTestEvent('input',{dataset:{field:'originalText'},value:typeof workflowRuleAuthoringExample==='function'?workflowRuleAuthoringExample():workflowRuleAuthoringExample});actionsMap['workflow-rule-generate']();requireGenerated();`;
const numericFixture = `
  const stock={id:'Inventory',name:'库存',version:'v1.0.0',status:'已发布',props:[{id:'stockCode',name:'库存编号',type:'文本',key:true},{id:'availableQuantity',name:'可用数量',type:'数字'},{id:'enabled',name:'是否可用',type:'布尔'}]};objects.push(stock);objectReleaseEnsure(stock);scene().ontologyVersions.Inventory='v1.0.0';
  for(const [key,label,type] of [['stockCode','库存编号','文本'],['availableQuantity','可用数量','数字'],['enabled','是否可用','布尔']]){scene().workflow.blocks.main.fields.push({key,label,type});scene().bindings.main.push({target:scenePrefix(scene(),'main')+key,ontology:'Inventory.'+key});}
`;

// 保留权限、归属、版本、指纹与人工保存边界；断言通用 card，不再约束专用 chain UI。
test('智能提单仅自然语言新增，既有配置入口保留，本地解析说明不冒充真实AI', () => fullWorkspace()(edit + `
  const html=workflowRulesView(scene());assert(html.includes('<h3>规则配置</h3>'));assert(html.includes('data-action="workflow-rule-authoring"'));assert(!html.includes('data-action="workflow-add-rule"'));assert(html.includes('data-action="workflow-edit-rule"'));
  actionsMap['workflow-rule-authoring']();const drawer=extraDrawers.workflowRuleAuthoring();assert(drawer.includes('本地解析'));assert(drawer.includes('不是真实模型'));closeOverlay(true);
  scene().workflow.type='validation';assert(workflowRulesView(scene()).includes('<h3>校验规则</h3>'));assert(!workflowRulesView(scene()).includes('workflow-rule-authoring'));
`));
test('默认空白通用卡没有单对象入口或固定人员物料链字段，空原文不能生成', () => fullWorkspace()(edit + `
  actionsMap['workflow-rule-authoring']();assert.equal(state.drawer.draft.originalText,'');assert.equal(state.drawer.draft.scope,'');assert(state.drawer.draft.card);assert.equal(state.drawer.draft.card.references.length,1);assert.equal(state.drawer.draft.card.references[0].path,'');assert.equal(state.drawer.draft.card.assertions[0].op,'exists');assert.equal(state.drawer.draft.card.queries.length,0);
  const html=extraDrawers.workflowRuleAuthoring();assert(html.includes('通用规则卡'));assert(!html.includes('data-field="objectId"'));assert(!html.includes('data-field="chain'));assert(!html.includes('确认本体、接口与返回判断'));assertBlocked();
`));
test('真实input即时调用intent并预填drawer，不保存、执行、调用接口或写日志', () => fullWorkspace()(edit + `
  const before=JSON.stringify(scene()),logs=state.logs.length;let analyzed=0,calls=0;const analyzeBefore=sceneRuleIntentAnalyze,callBefore=callCapability;
  sceneRuleIntentAnalyze=function(s,text){analyzed++;assert.equal(s.id,'release');assert.equal(text,'发布主题不能为空');return analyzeBefore(s,text);};callCapability=function(){calls++;return callBefore(...arguments);};
` + open('发布主题不能为空') + `
  assert.equal(analyzed,1);assert(state.drawer.draft.card);assert.equal(state.drawer.generated,null);assert.equal(state.drawer.draft.card.references[0].path,'ReleaseOrder.releaseSubject');assert.equal(JSON.stringify(scene()),before);assert.equal(state.logs.length,logs);assert.equal(calls,0);
`));
test('纯字段卡不显示API节点或查询选择，生成ruleCard仍默认停用且不写场景', () => fullWorkspace()(edit + `const before=JSON.stringify(scene()),logs=state.logs.length;` + open('发布主题不能为空') + `
  const html=extraDrawers.workflowRuleAuthoring();assert(!html.includes('接口校验节点'));assert(!html.includes('data-card-query='));assert(!html.includes('data-card-param='));assert(!html.includes('查询节点（需要接口时）'));
  actionsMap['workflow-rule-generate']();const r=requireGenerated();assertJSON(cardClauses(r,'assertions'),[{path:'ReleaseOrder.releaseSubject',op:'exists',value:''}]);assert.equal(r.ruleCard.queries.length,0);assert.equal(r.enabled,false);assert.equal(r.active,'停用');assert.equal(r.ruleCard.unknown,'block');assert.equal(JSON.stringify(scene()),before);assert.equal(state.logs.length,logs);
`));
test('安全DI插件编译通用引用、严格数字与真实主单参数，而非旧fact和顶层params', () => fullWorkspace()(edit + generate('项目安全 DI 必须为 0') + `
  const r=requireGenerated();assert.equal(r.scope,'main');assertJSON(cardClauses(r,'assertions'),[{path:'Context.project.safetyDI',op:'eq',value:0}]);
  const q=r.ruleCard.queries.find(q=>q.capability==='demo.safetyDI');assert(q);assert.equal(r.ruleCard.references.find(ref=>ref.id===q.params.find(p=>p.name==='projectCode').reference).source,'order.projectCode');assert.equal(r.enabled,false);assert.equal(r.level,'阻断');assert.equal(r.naturalLanguage.reviewStatus,'generated-awaiting-human-review');
`));
test('自然语言元数据记录场景锁定版本、本体参数与非本体接口返回，不伪造对象', () => fullWorkspace()(edit + generate('安全DI不大于2.5') + `
  const r=requireGenerated(),meta=r.naturalLanguage;assert.equal(meta.originalText,'安全DI不大于2.5');assert.equal(meta.engine,'local-controlled-parser');assert.equal(meta.sceneId,'release');assert.equal(meta.scope,'main');
  assert(meta.objects.some(o=>o.id==='ReleaseOrder'&&o.version===scene().ontologyVersions.ReleaseOrder));assert(meta.properties.some(p=>p.path==='Context.project.safetyDI'&&p.kind==='business-context'));assert(meta.properties.some(p=>p.path==='ReleaseOrder.projectCode'&&p.kind==='ontology-property'));assert(!meta.objects.some(o=>o.id==='Context'));assert.equal(r.ruleCard.assertions[0].value,2.5);
`));
test('安全数值不截断或猜测，科学计数、算式、溢出和非法DI负数均拒绝', () => fullWorkspace()(edit + `
  for(const text of ['安全DI不大于-1','安全DI不大于1e3','安全DI不大于1+2','安全DI不大于1.2.3','安全DI不大于9007199254740992']){
    actionsMap['workflow-rule-authoring']();dispatchTestEvent('input',{dataset:{field:'originalText'},value:text});assertBlocked();closeOverlay(true);
  }
`));
test('商品目录四属性动态断言与布尔条件，使用已登记物料和型号来源', () => fullWorkspace()(edit + catalogFixture + generate('商品目录的图片、资料、规格和功能必须存在且非空') + `
  const r=requireGenerated();assertJSON(cardClauses(r,'conditions'),[{path:'Material.inCatalog',op:'eq',value:true}]);assertJSON(cardClauses(r,'assertions').map(a=>a.path),['Context.product.images','Context.product.documents','Context.product.specifications','Context.product.features']);assert(r.ruleCard.assertions.every(a=>a.op==='exists'));
  const qs=r.ruleCard.queries.filter(q=>q.capability==='demo.productDocuments');assert(qs.length);assert(qs.every(q=>r.ruleCard.references.find(ref=>ref.id===q.params.find(p=>p.name==='modelCode').reference).source==='row.modelCode'));assert(r.naturalLanguage.objects.some(o=>o.id==='Material'&&o.version===scene().ontologyVersions.Material));assert(r.naturalLanguage.properties.some(p=>p.path==='Context.product.images'&&p.kind==='business-context'));
`));
test('模糊短句必须澄清，不以提交部门和软件编码替代申请人与物料链', () => fullWorkspace()(edit + open('后端业务部提交时，软管最小系统必须已发布') + `
  assertBlocked();const html=extraDrawers.workflowRuleAuthoring();assert(html.includes('解析待确认项'));assert(!html.includes('data-field="chainApplicantProperty"'));assert(!state.drawer.draft.card.references.some(r=>r.path==='ReleaseOrder.submitDepartment'));assert(!state.drawer.draft.card.queries.some(q=>q.params.some(p=>String(p.source).includes('softwareCode'))));
`));
test('资料完整、正常、符合要求以及部分已识别的未知条款不能生成或保存', () => fullWorkspace()(edit + `
  for(const text of ['商品目录资料完整','安全DI正常','最小系统符合要求','发布主题不能为空，且未知属性必须正常','安全DI=0且金额不得大于100']){
    actionsMap['workflow-rule-authoring']();dispatchTestEvent('input',{dataset:{field:'originalText'},value:text});assert(state.drawer.draft.card);assertBlocked();assert(extraDrawers.workflowRuleAuthoring().includes('解析待确认项'));closeOverlay(true);
  }
`));
test('未知对象、未支持逻辑OR和额外范围冲突不被静默丢弃', () => fullWorkspace()(edit + `
  for(const text of ['销售额必须增长','未知对象.未知字段不能为空','发布主题不能为空或发布主题等于测试',workflowRuleAuthoringExample+'仅适用于软件模块行 modules，不适用于物料行 items。']){
    actionsMap['workflow-rule-authoring']();dispatchTestEvent('input',{dataset:{field:'originalText'},value:text});assertBlocked();closeOverlay(true);
  }
`));
test('通用多对象纯字段预填无需单选对象，主单与明细属性可共同生成', () => fullWorkspace()(edit + generate('整机物料编码不能为空，且发布主题不能为空') + `
  const r=requireGenerated();assert.equal(r.scope,'items');assertJSON(cardClauses(r,'assertions').map(a=>a.path),['Material.materialCode','ReleaseOrder.releaseSubject']);assert.equal(r.ruleCard.queries.length,0);
  assert(r.ruleCard.references.some(r=>r.path==='Material.materialCode'&&r.source==='row.materialCode'));assert(r.ruleCard.references.some(r=>r.path==='ReleaseOrder.releaseSubject'&&r.source==='order.releaseSubject'));assert(r.naturalLanguage.objects.some(o=>o.id==='Material'));assert(r.naturalLanguage.objects.some(o=>o.id==='ReleaseOrder'));const html=extraDrawers.workflowRuleAuthoring();assert(html.includes('可多个'));assert(!html.includes('data-field="objectId"'));
`));
test('同对象多属性数量随原文动态变化，不保留上一条固定链卡', () => fullWorkspace()(edit + open('发布主题不能为空，且所属项目不能为空') + `
  assert.equal(state.drawer.draft.card.assertions.length,2);assertJSON(state.drawer.draft.card.references.map(r=>r.path),['ReleaseOrder.releaseSubject','ReleaseOrder.projectCode']);
  dispatchTestEvent('input',{dataset:{field:'originalText'},value:'整机物料编码不能为空'});assert.equal(state.drawer.draft.card.assertions.length,1);assert.equal(state.drawer.draft.card.references[0].path,'Material.materialCode');assert(!state.drawer.draft.card.references.some(r=>r.object==='Person'));
`));
test('未映射人员部门不自动查接口，补齐映射后仅读取当前表单值', () => fullWorkspace()(edit + open('人员所属部门等于后端业务部，且整机物料编码不能为空') + `
  assertBlocked();assert(!state.drawer.draft.card.queries.some(q=>q.capability==='demo.personDepartment'));assert(state.drawer.draft.card.clarifications.some(x=>/对象与表单映射/.test(x)));closeOverlay(true);
` + chainFixture + generate('人员所属部门等于后端业务部，且整机物料编码不能为空') + `
  const r=requireGenerated();assert(r.ruleCard.references.some(ref=>ref.path==='Person.department'&&ref.source==='order.applicantDepartment'));assert(r.ruleCard.references.some(ref=>ref.path==='Material.materialCode'));assert.equal(r.ruleCard.queries.length,0);assert(!extraDrawers.workflowRuleAuthoring().includes('data-key="source"'));
`));
test('通用API候选仅来自已登记可用连接，伪造能力不能生成', () => fullWorkspace()(edit + open('安全DI=0') + `
  const html=extraDrawers.workflowRuleAuthoring();const select=html.match(/<select[^>]*data-card-query="0"[^>]*>([\\s\\S]*?)<\\/select>/);assert(select);const ids=[...select[1].matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]).filter(Boolean);assert(ids.length);assert(ids.includes('demo.safetyDI'));assert(ids.every(id=>ability(id)&&connector(ability(id).connector)?.enabled));assert(!ids.includes('fakeAPI'));
  dispatchTestEvent('change',{dataset:{cardQuery:'0',key:'capability'},value:'fakeAPI'});assertBlocked();
`));
test('多物料区块不得自动取第一个，人工选择范围和实际来源后才能生成', () => fullWorkspace()(edit + `duplicateItems();` + open('整机物料编码不能为空') + `
  assert.equal(state.drawer.draft.scope,'');assert.equal(state.drawer.draft.card.scope,'');assert.equal(state.drawer.draft.card.scopeCandidates.length,2);assertBlocked();assert(extraDrawers.workflowRuleAuthoring().includes('第二物料行'));
  dispatchTestEvent('change',{dataset:{field:'scope'},value:'modules'});actionsMap['workflow-rule-generate']();assert.equal(requireGenerated().scope,'modules');
`));
test('对象锁定变化事件使预览失效并清除旧属性、来源和查询，不沿用错对象数据', () => fullWorkspace()(edit + generate('发布主题不能为空') + `
  const old=workflowRuleAuthoringFingerprint(scene(),state.drawer.draft);dispatchTestEvent('change',{dataset:{cardRef:'0',key:'object'},value:'Material'});assert.equal(state.drawer.generated,null);const ref=state.drawer.draft.card.references[0];assert.equal(ref.path,'');assert.equal(ref.source,'');assert.equal(ref.query,'');assert.notEqual(workflowRuleAuthoringFingerprint(scene(),state.drawer.draft),old);assertBlocked();
`));
test('人工确认只进入通用只读核对卡，未保存无场景或日志变更，取消隔离', () => fullWorkspace()(edit + `const before=JSON.stringify(scene().workflow.rules),logs=state.logs.length;` + generate('发布主题不能为空') + `
  const id=state.drawer.generated.id;actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRule');assert.equal(state.drawer.draft.id,id);assert.equal(state.drawer.isNew,true);assert.equal(state.drawer.draft.naturalLanguage.reviewStatus,'human-confirmed-awaiting-save');
  const html=extraDrawers.workflowRule();assert(html.includes('通用规则卡'));assert(html.includes('自然语言来源'));assert(html.includes('data-action="workflow-save-rule"'));assert(!html.includes('data-rule-clause='));assert(!html.includes('data-rule-param='));assert.equal(JSON.stringify(scene().workflow.rules),before);assert.equal(state.logs.length,logs);closeOverlay(true);assert.equal(JSON.stringify(scene().workflow.rules),before);
`));
test('确认页真实名称提示事件保存保留原文，人工修改标记与默认停用', () => fullWorkspace()(edit + generate('发布主题不能为空') + `
  actionsMap['workflow-rule-confirm']();const id=state.drawer.draft.id;dispatchTestEvent('input',{dataset:{field:'name'},value:'人工核对必填规则'});dispatchTestEvent('input',{dataset:{field:'message'},value:'请补充发布主题'});actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);
  const r=scene().workflow.rules.find(r=>r.id===id);assert(r);assert.equal(r.name,'人工核对必填规则');assert.equal(r.message,'请补充发布主题');assert.equal(r.naturalLanguage.originalText,'发布主题不能为空');assert.equal(r.naturalLanguage.correspondence,'structured-edited');assert.equal(r.naturalLanguage.reviewStatus,'saved-after-human-review');assert.equal(r.enabled,false);
  actionsMap['workflow-edit-rule']({dataset:{id}});dispatchTestEvent('input',{dataset:{field:'message'},value:'再次核对'});actionsMap['workflow-save-rule']();assert.equal(scene().workflow.rules.find(r=>r.id===id).naturalLanguage.originalText,'发布主题不能为空');
`));
test('人工修改通用卡比较值后生成保存，以卡为准且完整保留原文和人工卡来源', () => fullWorkspace()(edit + generate('发布主题等于测试') + `
  dispatchTestEvent('input',{dataset:{cardClause:'assertions',index:'0',key:'value'},value:'正式发布'});assert.equal(state.drawer.generated,null);actionsMap['workflow-rule-generate']();const generated=requireGenerated();assert.equal(generated.ruleCard.assertions[0].value,'正式发布');assert.equal(generated.naturalLanguage.originalText,'发布主题等于测试');assert.equal(generated.naturalLanguage.authoringInput.card.assertions[0].value,'正式发布');
  actionsMap['workflow-rule-confirm']();const id=state.drawer.draft.id;actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);const saved=scene().workflow.rules.find(r=>r.id===id);assert.equal(saved.ruleCard.assertions[0].value,'正式发布');assert.equal(saved.naturalLanguage.authoringInput.card.assertions[0].value,'正式发布');assert.equal(saved.naturalLanguage.originalText,'发布主题等于测试');assert.equal(saved.naturalLanguage.reviewStatus,'saved-after-human-review');assert.equal(saved.enabled,false);
`));
test('原文input/change即刻清空生成预览，重新生成使用新card且ID唯一', () => fullWorkspace()(edit + generate('发布主题不能为空') + `
  const first=state.drawer.generated.id;dispatchTestEvent('input',{dataset:{field:'originalText'},value:'发布主题等于测试'});assert.equal(state.drawer.generated,null);actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');actionsMap['workflow-rule-generate']();assert.notEqual(requireGenerated().id,first);assert.equal(state.drawer.generated.ruleCard.assertions[0].value,'测试');
  dispatchTestEvent('change',{dataset:{field:'originalText'},value:'发布主题等于正式'});assert.equal(state.drawer.generated,null);assert.equal(state.drawer.draft.card.assertions[0].value,'正式');
`));
test('scope真实change即使同值也使预览失效，不能沿用确认', () => fullWorkspace()(edit + generate('发布主题不能为空') + `
  dispatchTestEvent('change',{dataset:{field:'scope'},value:'main'});assert.equal(state.drawer.generated,null);actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');actionsMap['workflow-rule-generate']();requireGenerated();
`));
test('生成和确认检查场景所有权，切换后不能污染任一场景', () => fullWorkspace()(edit + generate('发布主题不能为空') + `
  const before=JSON.stringify(appScenes.release.workflow.rules),other=JSON.stringify(appScenes.trial.workflow.rules);selectScene('trial');actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert(document.getElementById('toast').textContent.includes('场景已切换'));actionsMap['workflow-rule-generate']();assert.equal(JSON.stringify(appScenes.release.workflow.rules),before);assert.equal(JSON.stringify(appScenes.trial.workflow.rules),other);
`));
test('确认后场景切换仍不能新保存到另一场景', () => fullWorkspace()(edit + generate('发布主题不能为空') + `
  actionsMap['workflow-rule-confirm']();const before=JSON.stringify(appScenes.release.workflow.rules),other=JSON.stringify(appScenes.trial.workflow.rules);selectScene('trial');actionsMap['workflow-save-rule']();assert.equal(state.drawer.type,'workflowRule');assert(document.getElementById('toast').textContent.includes('场景已切换'));assert.equal(JSON.stringify(appScenes.release.workflow.rules),before);assert.equal(JSON.stringify(appScenes.trial.workflow.rules),other);
`));
for (const [label,mutation] of [
  ['接口映射',`ability('demo.safetyDI').maps[0].source='changed';`],
  ['接口修订',`ability('demo.safetyDI').revision++;`],
  ['连接配置',`connector('irdms').enabled=false;`],
  ['锁定本体快照',`objectReleaseVersion('ReleaseOrder',scene().ontologyVersions.ReleaseOrder).object.props.find(p=>p.id==='projectCode').name='变更';`],
  ['表单字段',`scene().workflow.blocks.main.fields.find(f=>f.key==='projectCode').label='变更';`],
  ['本体映射',`scene().bindings.main.find(m=>m.ontology==='ReleaseOrder.projectCode').target='order.changed';`],
]) test(label+'配置指纹变化导致生成预览过期，不能人工确认', () => fullWorkspace()(edit + generate('安全DI=0') + `
  const before=JSON.stringify(scene().workflow.rules);` + mutation + `actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert.equal(state.drawer.generated,null);assert(state.drawer.error.includes('变化'));assert.equal(JSON.stringify(scene().workflow.rules),before);
`));
test('确认后来源接口变化不能保存，重新生成确认后才可继续', () => fullWorkspace()(edit + generate('安全DI=0') + `
  actionsMap['workflow-rule-confirm']();const before=JSON.stringify(scene().workflow.rules);ability('demo.safetyDI').revision++;actionsMap['workflow-save-rule']();assert.equal(state.drawer.type,'workflowRule');assert(state.drawer.error.includes('变化'));assert.equal(JSON.stringify(scene().workflow.rules),before);
  actionsMap['workflow-rule-authoring-return']();actionsMap['workflow-rule-generate']();requireGenerated();actionsMap['workflow-rule-confirm']();actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);
`));
test('未发布工作副本属性不能替代场景锁定定义，锁定属性缺失时不能生成', () => fullWorkspace()(edit + `
  obj('ReleaseOrder').props.find(p=>p.id==='releaseSubject').id='draftSubject';
` + generate('发布主题不能为空') + `
  assert(state.drawer.generated.naturalLanguage.properties.some(p=>p.path==='ReleaseOrder.releaseSubject'));closeOverlay(true);const h=objectReleaseVersion('ReleaseOrder',scene().ontologyVersions.ReleaseOrder);h.object.props=h.object.props.filter(p=>p.id!=='releaseSubject');
` + open('ReleaseOrder.releaseSubject不能为空') + `assertBlocked();`));
test('未锁定对象不得借全局定义生成，缺少实际binding的对象属性不能猜测来源', () => fullWorkspace()(edit + `
  scene().ontologyVersions.ReleaseOrder=null;
` + open('ReleaseOrder.releaseSubject不能为空') + `assertBlocked();closeOverlay(true);scene().ontologyVersions.ReleaseOrder='v1.2.0';scene().bindings.main=scene().bindings.main.filter(m=>m.ontology!=='ReleaseOrder.releaseSubject');
` + open('ReleaseOrder.releaseSubject不能为空') + `assertBlocked();`));
test('非编辑、已发布和非智能提单均无法进入自然语言新增', () => fullWorkspace()(`
  selectScene('release');actionsMap['workflow-rule-authoring']();assert.equal(state.drawer,null);actionsMap['scene-release-edit']({dataset:{id:'release'}});sceneReleaseEnsure(scene()).status='已发布';actionsMap['workflow-rule-authoring']();assert.equal(state.drawer,null);sceneReleaseEnsure(scene()).status='草稿';scene().workflow.type='validation';actionsMap['workflow-rule-authoring']();assert.equal(state.drawer,null);
`));
test('确认后退出编辑或场景发布也不能保存规则', () => {
  for(const mutation of [`sceneReleaseEnsure(scene()).editing=false;`,`sceneReleaseEnsure(scene()).status='已发布';`,`scene().workflow.type='validation';`]) {
    const run=fullWorkspace();run(edit + generate('发布主题不能为空') + `actionsMap['workflow-rule-confirm']();const before=JSON.stringify(scene().workflow.rules);` + mutation + `actionsMap['workflow-save-rule']();assert.equal(state.drawer.type,'workflowRule');assert(state.drawer.error||document.getElementById('toast').textContent.includes('编辑'));assert.equal(JSON.stringify(scene().workflow.rules),before);`);
  }
});
test('空规则列表仍只有自然语言入口，旧新增动作draft重定向而其它类型保留编辑', () => fullWorkspace()(edit + `
  scene().workflow.rules=[];const html=workflowRulesView(scene());assert(!html.includes('workflow-add-rule'));assert(!html.includes('点击“添加规则”'));assert(html.includes('自然语言'));actionsMap['workflow-add-rule']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert.equal(state.drawer.draft.originalText,'');closeOverlay(true);scene().workflow.type='validation';actionsMap['workflow-add-rule']();assert.equal(state.drawer.type,'workflowRule');
`));
test('当前场景动态示例仅填卡片，不提前改场景或日志', () => fullWorkspace()(edit + `
  const before=JSON.stringify(scene()),logs=state.logs.length;actionsMap['workflow-rule-authoring']();actionsMap['workflow-rule-chain-example']({dataset:{example:'interface'}});assert(state.drawer.draft.card.references.some(ref=>ref.kind==='business-context'&&ref.query));assert.equal(state.drawer.generated,null);
  actionsMap['workflow-rule-chain-example']({dataset:{example:'required'}});assert(state.drawer.draft.originalText.includes('不能为空'));assert.equal(state.drawer.draft.card.queries.length,0);assert.equal(state.drawer.draft.card.references.length,1);assert(!state.drawer.draft.card.references.some(ref=>ref.path==='Person.department'));assert.equal(JSON.stringify(scene()),before);assert.equal(state.logs.length,logs);
`));
test('跨对象接口示例编译通用card，引用真实人员和物料，未知默认阻断', () => fullWorkspace()(edit + chainExample + `
  const r=requireGenerated();assert(r.ruleCard);assertJSON(cardClauses(r,'conditions'),[{path:'Person.department',op:'eq',value:'后端业务部'}]);assertJSON(cardClauses(r,'assertions'),[{path:'Context.minimumSystem.status',op:'eq',value:'已发布'}]);assert(r.ruleCard.references.some(ref=>ref.path==='Person.department'&&ref.source==='order.applicantDepartment'&&!ref.query));assert.equal(r.ruleCard.queries.length,1);assert(r.naturalLanguage.properties.some(p=>p.path==='Material.materialCode'));assert(!r.naturalLanguage.properties.some(p=>p.path==='ReleaseOrder.submitDepartment'));assert.equal(r.ruleCard.unknown,'block');assert.equal(r.enabled,false);
  const html=extraDrawers.workflowRuleAuthoring();assert(html.includes('minimumSystem.status'));assert(html.includes('未知'));assert(html.includes('阻断'));assert(html.includes('查看结构化规则'));assert(!html.includes('data-field="chain'));
`));
test('跨对象接口确认保存保留真实引用、全原文与来源元数据，默认不执行', () => fullWorkspace()(edit + `const before=JSON.stringify(scene().workflow.rules),logs=state.logs.length;let calls=0;const callBefore=callCapability;callCapability=function(){calls++;return callBefore(...arguments);};` + chainExample + `
  const meta=structuredClone(state.drawer.generated.naturalLanguage);assert.equal(JSON.stringify(scene().workflow.rules),before);assert.equal(state.logs.length,logs);actionsMap['workflow-rule-confirm']();assert.equal(JSON.stringify(scene().workflow.rules),before);const id=state.drawer.draft.id;actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);const saved=scene().workflow.rules.find(r=>r.id===id);assert(saved.ruleCard);assert.equal(saved.enabled,false);assert.equal(saved.naturalLanguage.originalText,meta.originalText);assert.equal(saved.naturalLanguage.reviewStatus,'saved-after-human-review');assert(saved.naturalLanguage.properties.some(p=>p.path==='Person.department'));assert.equal(calls,0);
`));
test('返回自然语言保留人工卡与原文但清空生成，不把确认页改动提前保存', () => fullWorkspace()(edit + `const before=JSON.stringify(scene().workflow.rules);` + generate('发布主题等于测试') + `
  dispatchTestEvent('change',{dataset:{cardClause:'assertions',index:'0',key:'value'},value:'人工值'});actionsMap['workflow-rule-generate']();requireGenerated();actionsMap['workflow-rule-confirm']();dispatchTestEvent('input',{dataset:{field:'name'},value:'尚未保存名称'});actionsMap['workflow-rule-authoring-return']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert.equal(state.drawer.draft.originalText,'发布主题等于测试');assert.equal(state.drawer.draft.card.assertions[0].value,'人工值');assert.equal(state.drawer.generated,null);assert.equal(JSON.stringify(scene().workflow.rules),before);closeOverlay(true);assert.equal(JSON.stringify(scene().workflow.rules),before);
`));
test('示例动作检查草稿编辑权限与场景归属，跨场景不能修改旧drawer', () => fullWorkspace()(`
  selectScene('release');actionsMap['workflow-rule-chain-example']({dataset:{example:'chain'}});assert.equal(state.drawer,null);
` + edit + open('发布主题不能为空') + `
  const before=JSON.stringify(state.drawer.draft);selectScene('trial');actionsMap['workflow-rule-chain-example']({dataset:{example:'required'}});assert.equal(JSON.stringify(state.drawer.draft),before);
`));
test('同一毫秒多次生成ID唯一，不依赖旧专用字段或Date随机碰撞', () => fullWorkspace()(edit + `
  const originalDateNow=Date.now;Date.now=()=>123456;const ids=new Set();for(let i=0;i<20;i++){actionsMap['workflow-rule-authoring']();dispatchTestEvent('input',{dataset:{field:'originalText'},value:'发布主题不能为空'});actionsMap['workflow-rule-generate']();ids.add(requireGenerated().id);closeOverlay(true);}Date.now=originalDateNow;assert.equal(ids.size,20);
`));
test('查询连接停用和输出映射缺失均不能生成，恢复连接仍需重新解析确认', () => fullWorkspace()(edit + `
  connector('irdms').enabled=false;
` + open('安全DI=0') + `assertBlocked();closeOverlay(true);connector('irdms').enabled=true;ability('demo.safetyDI').maps=[];
` + open('安全DI=0') + `assertBlocked();`));
test('表单来源类型不匹配或被错映射不生成，不能用字符串伪装真实数字本体', () => fullWorkspace()(edit + `
  scene().workflow.blocks.main.fields.find(f=>f.key==='releaseSubject').type='数字';
` + open('发布主题不能为空') + `assertBlocked();closeOverlay(true);scene().workflow.blocks.main.fields.find(f=>f.key==='releaseSubject').type='文本';
` + open('发布主题不能为空') + `scene().bindings.main.find(m=>m.ontology==='ReleaseOrder.releaseSubject').target=scenePrefix(scene(),'main')+'projectCode';assertBlocked();`));
test('查询返回sourceType必须匹配已登记引用，不以接口成功替代类型判断', () => fullWorkspace()(edit + `ability('demo.safetyDI').maps.find(m=>m.target==='Context.project.safetyDI').sourceType='文本';` + open('安全DI=0') + `assertBlocked();`));
test('未知结果策略不可手工改成放行，未支持条款不能清空原文后保存', () => fullWorkspace()(edit + generate('发布主题不能为空') + `
  actionsMap['workflow-rule-confirm']();const before=JSON.stringify(scene().workflow.rules);state.drawer.draft.ruleCard.unknown='pass';actionsMap['workflow-save-rule']();assert.equal(state.drawer.type,'workflowRule');assert(state.drawer.error);assert.equal(JSON.stringify(scene().workflow.rules),before);
`));
test('ruleCard结构纳入来源一致性，篡改引用不能以元信息绕过验证', () => fullWorkspace()(edit + generate('发布主题不能为空') + `
  const r=requireGenerated(),before=workflowRuleAuthoringStructure(r);r.ruleCard.references[0].source='order.projectCode';assert.notEqual(workflowRuleAuthoringStructure(r),before);actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert(state.drawer.error);assert(!scene().workflow.rules.some(r=>r.naturalLanguage));
`));
test('链示例入口短句无需技术属性或接口id，按登记契约生成并人工保存', () => fullWorkspace()(edit + chainExample + `
  const r=requireGenerated(),text=r.naturalLanguage.originalText;assert(!text.includes('Person.'));assert(!text.includes('Material.'));assert(!text.includes('demo.'));assert(!r.ruleCard.queries.some(q=>q.capability==='demo.personDepartment'));assert(r.ruleCard.references.some(ref=>ref.path==='Person.department'&&ref.source==='order.applicantDepartment'));assert(r.ruleCard.queries.some(q=>q.capability==='demo.minimumByMaterial'));actionsMap['workflow-rule-confirm']();const id=state.drawer.draft.id;actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);const saved=scene().workflow.rules.find(r=>r.id===id);assert.equal(saved.naturalLanguage.originalText,text);assert.equal(saved.enabled,false);
`));
test('任意新增已发布对象通用数字阈值和布尔预填，不依赖人员物料或DI模板', () => fullWorkspace()(edit + numericFixture + generate('库存可用数量必须大于等于10，且库存是否可用必须为是') + `
  const r=requireGenerated();assert.equal(r.naturalLanguage.template,'generic');assertJSON(cardClauses(r,'assertions'),[{path:'Inventory.availableQuantity',op:'gte',value:10},{path:'Inventory.enabled',op:'eq',value:true}]);assert(r.naturalLanguage.objects.some(o=>o.id==='Inventory'&&o.version==='v1.0.0'));assert.equal(r.ruleCard.queries.length,0);assert(!r.ruleCard.references.some(r=>['Person','Material'].includes(r.object)));actionsMap['workflow-rule-confirm']();const id=state.drawer.draft.id;actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);assert.equal(scene().workflow.rules.find(r=>r.id===id).enabled,false);
`));
test('通用数字集合和范围人工真实事件编译严格数字，不接受字符串猜测', () => fullWorkspace()(edit + numericFixture + generate('库存可用数量必须大于等于10') + `
  dispatchTestEvent('change',{dataset:{cardClause:'assertions',index:'0',key:'op'},value:'between'});dispatchTestEvent('input',{dataset:{cardClause:'assertions',index:'0',key:'value'},value:'[0, 100]'});actionsMap['workflow-rule-generate']();assertJSON(requireGenerated().ruleCard.assertions[0].value,[0,100]);dispatchTestEvent('input',{dataset:{cardClause:'assertions',index:'0',key:'value'},value:'[0, "错误数字"]'});assertBlocked();
`));
test('默认停用通用多对象卡不执行，但停用不能绕过保存时schema校验', () => fullWorkspace()(edit + generate('整机物料编码不能为空，且发布主题不能为空') + `
  actionsMap['workflow-rule-confirm']();const id=state.drawer.draft.id;actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);const saved=scene().workflow.rules.find(r=>r.id===id);assert.equal(saved.enabled,false);const doc=structuredClone(workflowScene(scene()).sample),out=executeWorkflow(scene(),doc,demoAuthority('all-pass'));assert(!out.checks.some(c=>c.rule===id));
  actionsMap['workflow-edit-rule']({dataset:{id}});state.drawer.draft.ruleCard.references[0].type='数字';const before=JSON.stringify(scene().workflow.rules);actionsMap['workflow-save-rule']();assert.equal(state.drawer.type,'workflowRule');assert(state.drawer.error);assert.equal(JSON.stringify(scene().workflow.rules),before);
`));
test('Object.Release schema始终检查锁定版本，停用卡缺失属性仍无效', () => fullWorkspace()(edit + generate('发布主题不能为空') + `
  const r=structuredClone(requireGenerated());assert.equal(r.enabled,false);objectReleaseVersion('ReleaseOrder',scene().ontologyVersions.ReleaseOrder).object.props=objectReleaseVersion('ReleaseOrder',scene().ontologyVersions.ReleaseOrder).object.props.filter(p=>p.id!=='releaseSubject');const issue=workflowRuleAuthoringContext(scene(),()=>validateWorkflowRule(scene(),r));assert(issue);assert(issue.includes('属性')||issue.includes('发布版本'));actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert.equal(state.drawer.generated,null);
`));
test('对象新发布版本不得自动替代锁定schema，停用规则按原引用保存', () => fullWorkspace()(edit + numericFixture + generate('库存可用数量必须大于等于10') + `
  const original=objectReleaseVersion('Inventory','v1.0.0'),next=structuredClone(original);next.version='v2.0.0';next.object.props.find(p=>p.id==='availableQuantity').type='文本';objectReleaseStore.get('Inventory').history.push(next);objectReleaseStore.get('Inventory').latest='v2.0.0';obj('Inventory').props.find(p=>p.id==='availableQuantity').type='文本';assert.equal(scene().ontologyVersions.Inventory,'v1.0.0');actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRule');const id=state.drawer.draft.id;actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);const saved=scene().workflow.rules.find(r=>r.id===id);assert.equal(saved.ruleCard.references[0].type,'数字');assert.equal(saved.naturalLanguage.objects.find(o=>o.id==='Inventory').version,'v1.0.0');assert.equal(saved.enabled,false);
`));
