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
  if (!loaded.has('scene-rule-intent.js')) run(fs.readFileSync(path.join(root,'scene-rule-intent.js'),'utf8'));
  return run;
}
const fixture = `
  selectScene('release');const s=scene();
  const stock={id:'Inventory',name:'库存',version:'v1.0.0',status:'已发布',props:[
    {id:'stockCode',name:'库存编号',type:'文本',key:true},
    {id:'availableQuantity',name:'可用数量',type:'数字'},
    {id:'warehouse',name:'仓库名称',type:'文本'},
    {id:'enabled',name:'是否可用',type:'布尔'}]};
  const request={id:'PurchaseRequest',name:'采购申请',version:'v1.0.0',status:'已发布',props:[
    {id:'requestCode',name:'申请编号',type:'文本',key:true},
    {id:'requestedQuantity',name:'申请数量',type:'数字'},
    {id:'warehouse',name:'仓库名称',type:'文本'}]};
  for(const o of [stock,request]){objects.push(o);objectReleaseStore.set(o.id,{latest:'v1.0.0',history:[{version:'v1.0.0',object:structuredClone(o)}]});s.ontologyVersions[o.id]='v1.0.0';}
  s.workflow.blocks.inventory={id:'inventory',label:'库存明细',path:'inventory',many:true,parent:'main',object:'Inventory',fields:[
    {key:'stockCode',label:'库存编号',type:'文本'},
    {key:'availableQuantity',label:'可用数量',type:'数字'},
    {key:'warehouse',label:'仓库名称',type:'文本'},
    {key:'enabled',label:'是否可用',type:'布尔'},
    {key:'localNote',label:'业务备注',type:'文本',sinkColumn:'LOCAL_NOTE'}]};
  s.bindings.inventory=['stockCode','availableQuantity','warehouse','enabled'].map(key=>({target:scenePrefix(s,'inventory')+key,ontology:'Inventory.'+key}));
  const main=s.workflow.blocks.main;main.fields.push({key:'requestedQuantity',label:'申请数量',type:'数字'},{key:'requestWarehouse',label:'申请仓库名称',type:'文本'});
  s.bindings.main.push({target:scenePrefix(s,'main')+'requestedQuantity',ontology:'PurchaseRequest.requestedQuantity'},{target:scenePrefix(s,'main')+'requestWarehouse',ontology:'PurchaseRequest.warehouse'});
`;

// 仅测试夹具补齐映射，不改变实际业务样例。
const mappedChainFixture = `
  selectScene('release');const s=scene();
  s.workflow.blocks.main.fields.push({key:'applicantDepartment',label:'申请人所属部门',type:'文本'});
  s.bindings.main.push({target:scenePrefix(s,'main')+'applicantDepartment',ontology:'Person.department',instanceMode:'input'});
`;
const mappedCatalogFixture = `
  selectScene('release');const s=scene();
  s.workflow.blocks.items.fields.push({key:'inCatalog',label:'是否进入商品目录',type:'布尔'});
  s.bindings.items.push({target:scenePrefix(s,'items')+'inCatalog',ontology:'Material.inCatalog',instanceMode:'input'});
`;
// 本体候选必须有当前场景真实、有效、类型一致且锁定版本的映射。
test('strict候选拒绝未映射属性，即使全局登记接口可返回也不预填或自动查询', () => fullWorkspace()(fixture + `
  s.bindings.inventory=s.bindings.inventory.filter(m=>m.ontology!=='Inventory.availableQuantity');
  capabilities.push({id:'demo.strictStock',name:'库存查询',object:'Inventory',connector:'pis',params:[['stockCode','库存编号','是']],maps:[{source:'remaining',target:'Inventory.availableQuantity',sourceType:'数字'}]});
  const r=sceneRuleIntentAnalyze(s,'Inventory.availableQuantity必须大于0');
  assert(r.references.some(ref=>!ref.path));assert(!r.references.some(ref=>ref.path==='Inventory.availableQuantity'));
  assert(r.references.every(ref=>!ref.candidates.some(c=>c.path==='Inventory.availableQuantity')));assert.equal(r.queries.length,0);
  assert(r.clarifications.some(x=>/对象与表单映射/.test(x)));assert(r.unsupported.length||r.blockingClarifications.length);
`));
test('strict候选排除悬空target、非mapping字段、类型错配和未显式锁定对象', () => {
  for(const mutation of [
    `s.workflow.blocks.inventory.fields=s.workflow.blocks.inventory.fields.filter(f=>f.key!=='availableQuantity');`,
    `s.workflow.blocks.inventory.fields.find(f=>f.key==='availableQuantity').mappingMode='system';`,
    `s.workflow.blocks.inventory.fields.find(f=>f.key==='availableQuantity').type='文本';`,
    `delete s.ontologyVersions.Inventory;`,
    `s.ontologyVersions.Inventory=null;`,
    `s.ontologyVersions.Inventory='v404';`,
  ]) fullWorkspace()(fixture + mutation + `
    const r=sceneRuleIntentAnalyze(s,'Inventory.availableQuantity必须大于0');
    assert(!r.references.some(ref=>ref.path==='Inventory.availableQuantity'));assert(r.references.every(ref=>!ref.candidates.some(c=>c.path==='Inventory.availableQuantity')));assert.equal(r.queries.length,0);assert(r.clarifications.some(x=>/对象与表单映射/.test(x)));
  `);
});
test('strict目标重复binding不可作为有效候选，未映射比较右属性不可吞成文本', () => fullWorkspace()(fixture + `
  s.bindings.inventory.push({...s.bindings.inventory.find(m=>m.ontology==='Inventory.enabled')});
  const duplicate=sceneRuleIntentAnalyze(s,'Inventory.enabled等于true');assert(!duplicate.references.some(ref=>ref.path==='Inventory.enabled'));assert(duplicate.clarifications.some(x=>/对象与表单映射/.test(x)));
  s.bindings.inventory=s.bindings.inventory.filter(m=>m.ontology!=='Inventory.warehouse');
  const right=sceneRuleIntentAnalyze(s,'PurchaseRequest.warehouse等于Inventory.warehouse');assert(right.references.some(ref=>ref.mention==='Inventory.warehouse'&&!ref.path));assert(right.clarifications.some(x=>/对象与表单映射/.test(x)));assert(right.unsupported.length);
`));
test('strict接口Context显式target未映射时不退回同名业务字段', () => fullWorkspace()(fixture + `
  s.bindings.inventory=s.bindings.inventory.filter(m=>m.ontology!=='Inventory.stockCode');
  capabilities.push({id:'demo.strictContext',name:'库存校验',object:'Context',connector:'pis',params:[{name:'stockCode',required:true,target:'Inventory.stockCode'}],maps:[{source:'status',target:'Context.stock.status',sourceType:'文本'}]});
  const r=sceneRuleIntentAnalyze(s,'调用demo.strictContext返回Context.stock.status等于通过');assert(r.references.some(ref=>ref.kind==='business-context'&&ref.query));assert(!r.references.some(ref=>ref.kind==='business-form'));assert.equal(r.queries[0].params[0].source,'');assert(r.clarifications.length);assert(!r.objects.some(o=>o.id==='Context'));
`));
test('strict候选同scope多个字段映射同一属性提示统一映射，不得任意选source', () => fullWorkspace()(fixture + `
  s.workflow.blocks.inventory.fields.push({key:'secondQuantity',label:'备用数量',type:'数字'});
  s.bindings.inventory.push({target:scenePrefix(s,'inventory')+'secondQuantity',ontology:'Inventory.availableQuantity'});
  const r=sceneRuleIntentAnalyze(s,'Inventory.availableQuantity必须大于0'),ref=r.references.find(ref=>ref.path==='Inventory.availableQuantity');
  assert(ref);assert.equal(ref.source,undefined);assert.equal(ref.sources.length,2);assert(r.clarifications.some(x=>/统一映射/.test(x)));assert.equal(r.queries.length,0);
`));
test('strict模板未映射department和inCatalog必须先映射，Context仍是单独接口返回', () => fullWorkspace()(`
  selectScene('release');const s=scene();
  for(const text of ['当申请人为后端业务部人员时，检查整机物料的最小系统是否发布，未发布拦截提交','商品目录图片、资料必须存在且非空']){
    const r=sceneRuleIntentAnalyze(s,text);assert(!r.references.some(ref=>['Person.department','Material.inCatalog'].includes(ref.path)));assert(!r.queries.some(q=>q.capability==='demo.personDepartment'||q.capability===s.master));assert(r.clarifications.some(x=>/对象与表单映射/.test(x)));assert(r.references.some(ref=>ref.kind==='business-context'&&ref.query));assert(!r.objects.some(o=>o.id==='Context'));
  }
`));

test('empty input is an empty state, never a default chain', () => fullWorkspace()(`
  selectScene('release');const r=sceneRuleIntentAnalyze(scene(),'   ');
  assert.equal(r.text,'');assert.equal(r.intent,'');assert.equal(r.scope,'');
  for(const key of ['objects','references','conditions','assertions','queries','scopeCandidates','clarifications','unsupported'])assert.equal(r[key].length,0,key);
  assert.equal(r.template,undefined);
`));
test('new published business objects and multi-property AND are prefilled with real bindings', () => fullWorkspace()(fixture + `
  const before=JSON.stringify(s),r=sceneRuleIntentAnalyze(s,'库存可用数量必须大于等于10且采购申请申请数量必须小于20且库存是否可用必须为是');
  assert.equal(r.template,'generic');assert.equal(r.assertions.length,3);assert.equal(r.clarifications.length,0,r.clarifications.join(';'));
  assert(r.objects.some(o=>o.id==='Inventory'&&o.version==='v1.0.0'));assert(r.objects.some(o=>o.id==='PurchaseRequest'));
  assert(r.references.some(x=>x.path==='Inventory.availableQuantity'&&x.source==='row.availableQuantity'));
  assert(r.references.some(x=>x.path==='PurchaseRequest.requestedQuantity'&&x.source==='order.requestedQuantity'));
  assert.equal(r.assertions[0].op,'gte');assert.equal(r.assertions[0].value,'10');assert.equal(r.assertions[2].value,'true');assert.equal(r.scope,'inventory');assert.equal(JSON.stringify(s),before);
`));
test('English paths, Chinese object-property qualification, text and existence comparisons', () => fullWorkspace()(fixture + `
  const r=sceneRuleIntentAnalyze(s,'Inventory.availableQuantity >= 2 AND 库存.仓库名称等于“上海” AND stockCode必须存在且非空');
  assert.equal(r.assertions.length,3);assert.equal(r.clarifications.length,0,r.clarifications.join(';'));
  assert.equal(r.assertions[1].value,'上海');assert.equal(r.assertions[2].op,'exists');assert(r.references.every(x=>x.kind==='ontology-property'));
`));
test('conditional and cross-property comparisons retain condition and assertion roles', () => fullWorkspace()(fixture + `
  const r=sceneRuleIntentAnalyze(s,'当库存是否可用等于true时，库存可用数量必须大于等于采购申请申请数量');
  assert.equal(r.conditions.length,1);assert.equal(r.assertions.length,1);assert.equal(r.conditions[0].value,'true');
  const a=r.assertions[0];assert(a.valueReference);assert.equal(r.references.find(x=>x.id===a.valueReference).path,'PurchaseRequest.requestedQuantity');assert.equal(r.clarifications.length,0,r.clarifications.join(';'));
  const en=sceneRuleIntentAnalyze(s,'if Inventory.enabled = true then Inventory.availableQuantity > 0');assert.equal(en.conditions.length,1);assert.equal(en.assertions.length,1);
`));
test('unqualified ambiguous labels leave path empty and enumerate all candidates', () => fullWorkspace()(fixture + `
  const r=sceneRuleIntentAnalyze(s,'仓库名称必须等于上海');const ref=r.references.find(x=>x.mention==='仓库名称');
  assert(ref);assert.equal(ref.path,'');assert(ref.candidates.some(c=>c.path==='Inventory.warehouse'));assert(ref.candidates.some(c=>c.path==='PurchaseRequest.warehouse'));assert(r.clarifications.length);
`));
test('business database fields cannot impersonate ontology properties', () => fullWorkspace()(fixture + `
  const r=sceneRuleIntentAnalyze(s,'LOCAL_NOTE必须非空');assert.equal(r.assertions.length,1);
  const ref=r.references[0];assert.equal(ref.path,'');assert(!ref.source);assert(!ref.candidates.some(c=>c.path==='row.localNote'));assert(!r.objects.some(x=>x.id==='localNote'));assert(r.clarifications.some(x=>/对象与表单映射/.test(x)));assert(r.unsupported.length);
`));
test('unknown references and unpublished draft fields remain unresolved', () => fullWorkspace()(fixture + `
  stock.props.push({id:'draftQuantity',name:'草稿数量',type:'数字'});
  for(const text of ['不存在的对象.数量必须大于0','库存草稿数量必须大于1']){
    const r=sceneRuleIntentAnalyze(s,text);assert(r.clarifications.length,text);assert(r.references.some(x=>!x.path),text);assert(!r.references.some(x=>x.path==='Inventory.draftQuantity'));
  }
`));
test('OR, arithmetic and unsupported appended clauses cannot be silently dropped', () => fullWorkspace()(fixture + `
  for(const text of ['库存可用数量大于1或采购申请申请数量小于3','Inventory.availableQuantity > 1 OR Inventory.enabled = true','库存可用数量必须大于1+2','库存可用数量必须大于1且还需要领导审批','安全DI=0且金额必须大于100','商品目录图片必须非空并且金额不得大于100']){
    const r=sceneRuleIntentAnalyze(s,text);assert(r.clarifications.length,text);assert(r.unsupported.length,text);
  }
`));
test('fuzzy phrases and invalid typed literals are blocked, while exact matches remain prefilled', () => fullWorkspace()(fixture + `
  for(const text of ['库存资料完整','库存可用数量必须正常','库存可用数量必须大于1e3','库存可用数量必须大于9007199254740992','库存是否可用等于也许']){const r=sceneRuleIntentAnalyze(s,text);assert(r.clarifications.length,text);}
`));
test('未映射属性不因唯一已登记能力而自动查询，接口Context可显式检查', () => fullWorkspace()(fixture + `
  s.bindings.inventory=s.bindings.inventory.filter(x=>x.ontology!=='Inventory.availableQuantity');
  capabilities.push({id:'demo.inventoryQuantity',name:'查询库存可用数量',object:'Inventory',connector:'pis',params:[['stockCode','库存编号','是']],maps:[{source:'available',target:'Inventory.availableQuantity',sourceType:'数字'}]});
  const r=sceneRuleIntentAnalyze(s,'Inventory.availableQuantity必须大于0');assert.equal(r.queries.length,0);assert(!r.references.some(x=>x.path==='Inventory.availableQuantity'));assert(r.clarifications.some(x=>/对象与表单映射/.test(x)));
`));
test('missing query parameters and repeated row scopes remain partial, not arbitrarily selected', () => fullWorkspace()(fixture + `
  s.workflow.blocks.inventory2={...structuredClone(s.workflow.blocks.inventory),id:'inventory2',path:'inventory2',label:'第二库存明细'};s.bindings.inventory2=structuredClone(s.bindings.inventory).map(x=>({...x,target:x.target.replace('inventory[]','inventory2[]')}));
  let r=sceneRuleIntentAnalyze(s,'库存可用数量必须大于0');assert.equal(r.scope,'');assert.equal(r.scopeCandidates.length,2);assert(r.clarifications.length);
  delete s.workflow.blocks.inventory2;delete s.bindings.inventory2;s.bindings.inventory=s.bindings.inventory.filter(x=>x.ontology!=='Inventory.availableQuantity');
  capabilities.push({id:'demo.missingParam',name:'未知查询条件',object:'Context',connector:'pis',params:[['unknownKey','未知条件','是']],maps:[{source:'available',target:'Context.inventory.availableQuantity',sourceType:'数字'}]});
  r=sceneRuleIntentAnalyze(s,'调用demo.missingParam返回Context.inventory.availableQuantity必须大于0');assert(r.queries.length);assert.equal(r.queries[0].params[0].source,'');assert(r.clarifications.length);
`));
test('safety and catalog plugins produce registered references, not fixed generic fields', () => fullWorkspace()(mappedCatalogFixture + `
  const safety=sceneRuleIntentAnalyze(s,'安全DI=0');assert.equal(safety.template,'safety-di');assert(safety.legacyInput);assert(safety.references.some(x=>x.path==='Context.project.safetyDI'&&x.kind==='business-context'));
  const catalogIntent=sceneRuleIntentAnalyze(s,'商品目录图片、资料必须存在且非空');assert.equal(catalogIntent.template,'catalog-documents');assert(catalogIntent.references.some(x=>x.path==='Context.product.images'));assert(catalogIntent.references.some(x=>x.path==='Material.inCatalog'));
`));
test('minimal chain sentence suggests real Person and Material paths and registered contracts', () => fullWorkspace()(`
  selectScene('release');const r=sceneRuleIntentAnalyze(scene(),'需要校验后端的最小系统如没有发布则拦截提交');
  assert.equal(r.template,'applicant-material-chain');assert(!r.references.some(x=>x.path==='Person.department'));assert(r.references.some(x=>x.path==='Material.materialCode'));
  assert(!r.queries.some(x=>x.capability==='demo.personDepartment'));assert(r.queries.some(x=>x.capability==='demo.minimumByMaterial'));assert(r.clarifications.some(x=>/对象与表单映射/.test(x)));
  assert.equal(r.legacyInput.chainPublishedValue,'已发布');assert.equal(r.legacyInput.chainUnpublishedValue,'未发布');
`));
test('映射后的完整chain使用表单部门与Context接口，枚举仍需契约证明', () => fullWorkspace()(mappedChainFixture + `
  const example=typeof workflowRuleAuthoringExample==='function'?workflowRuleAuthoringExample():workflowRuleAuthoringExample;
  const r=sceneRuleIntentAnalyze(s,example);assert(r.legacyInput);assert.equal(r.legacyInput.scope,'items');assert.equal(r.legacyInput.chainApplicantSource,'order.applicantCode');assert.equal(r.clarifications.length,0,r.clarifications.join(';'));const compatibilityInput={...r.legacyInput,originalText:'申请人 Person.department 人员所属部门通过接口获取；物料编码 Material.materialCode 作为接口参数，返回 minimumSystem.status；未发布拦截提交，未知阻断'};assert(sceneRuleChainDraft(s,compatibilityInput).rule);
  ability('demo.minimumByMaterial').maps[0].description='返回业务状态，由业务方确认含义';
  const partial=sceneRuleIntentAnalyze(s,'后端申请人最小系统未发布则拦截提交');assert.equal(partial.legacyInput.chainPublishedValue,'');assert.equal(partial.legacyInput.chainUnpublishedValue,'');assert(partial.clarifications.some(x=>/返回|发布/.test(x)));
`));
test('original technical full chain string remains an optional parser plugin', () => fullWorkspace()(mappedChainFixture + `
  const original='提交前逐条校验物料行：如果申请人为后端业务部人员，使用主单申请人编号 order.applicantCode（映射 Person.personCode），通过人员查询接口 demo.personDepartment 获取 Person.department，并判断 Person.department 等于后端业务部。使用当前物料行 row.materialCode 映射的 Material.materialCode，作为参数 materialCode 调用校验接口 demo.minimumByMaterial；返回路径 minimumSystem.status，返回类型为文本，判断 minimumSystem.status=已发布（eq），已发布才允许提交，未发布拦截提交。返回空值、接口超时、人员身份不一致或未知状态均按未知阻断；生成后默认停用，必须人工确认并保存。';
  const r=sceneRuleIntentAnalyze(scene(),original);assert.equal(r.clarifications.length,0,r.clarifications.join(';'));assert.equal(r.legacyInput.scope,'items');assert(sceneRuleChainDraft(scene(),r.legacyInput).rule);
`));
test('extra unknown clauses after a full chain are blocked rather than swallowed by plugin', () => fullWorkspace()(`
  selectScene('release');const example=typeof workflowRuleAuthoringExample==='function'?workflowRuleAuthoringExample():workflowRuleAuthoringExample;
  const r=sceneRuleIntentAnalyze(scene(),example+'另外供应商评分必须超过90');assert(r.clarifications.length);assert(r.unsupported.length);
`));
test('common set, range, string and absent operations preserve AND and typed values', () => fullWorkspace()(fixture + `
  const cases=[['库存仓库名称必须属于[上海,北京]','in',['上海','北京']],['库存仓库名称必须不属于[上海,北京]','notIn',['上海','北京']],['Inventory.availableQuantity必须在1到10之间','between',[1,10]],['库存仓库名称必须包含上海','contains','上海'],['库存仓库名称必须以华东开头','startsWith','华东'],['库存仓库名称必须以库结尾','endsWith','库'],['库存仓库名称必须不存在','notExists',''],['Inventory.enabled != false','neq','false']];
  for(const [text,op,value]of cases){const r=sceneRuleIntentAnalyze(s,text);assert.equal(r.clarifications.length,0,text+':'+r.clarifications.join(';'));assert.equal(r.assertions[0].op,op,text);assert.equal(JSON.stringify(r.assertions[0].value),JSON.stringify(value));}
  const combined=sceneRuleIntentAnalyze(s,'库存仓库名称属于[上海,北京]且Inventory.availableQuantity在1到10之间');assert.equal(combined.assertions.length,2);assert.equal(combined.clarifications.length,0,combined.clarifications.join(';'));
`));
test('short Chinese existence phrasing and structured query links match UI input', () => fullWorkspace()(mappedChainFixture + `
  const title=sceneRuleIntentAnalyze(s,'发布主题不能为空');assert.equal(title.assertions.length,1);assert.equal(title.assertions[0].op,'exists');assert.equal(title.scope,'main');assert.equal(title.clarifications.length,0,title.clarifications.join(';'));
  const multi=sceneRuleIntentAnalyze(s,'人员所属部门等于后端业务部，且整机物料编码不能为空');assert.equal(multi.assertions.length,2);assert(multi.references.some(r=>r.path==='Person.department'&&!r.query&&r.source==='order.applicantDepartment'));assert(multi.references.some(r=>r.path==='Material.materialCode'&&r.source==='row.materialCode'));
  const chain=sceneRuleIntentAnalyze(s,'当申请人为后端业务部人员时，检查整机物料的最小系统是否发布，未发布拦截提交');assert.equal(chain.queries.length,1);assert(chain.references.filter(r=>r.role==='assertion').every(r=>r.query));assert.equal(chain.unsupported.length,0);
`));
test('generic registered Context interfaces resolve names, outputs and parameter references', () => fullWorkspace()(fixture + `
  capabilities.push({id:'demo.stockCheck',name:'库存查询',object:'Context',connector:'pis',params:[['stockCode','库存编号','是']],maps:[{source:'remaining',target:'Context.stock.available',sourceType:'数字',description:'可用库存'}]});
  for(const text of ['调用 库存查询 检查 可用库存 大于 申请数量','调用 demo.stockCheck 接口，返回 Context.stock.available 大于 0']){
    const r=sceneRuleIntentAnalyze(s,text);assert.equal(r.assertions.length,1,text);assert.equal(r.clarifications.length,0,text+':'+r.clarifications.join(';'));const ref=r.references.find(x=>x.path==='Context.stock.available');assert(ref&&ref.query);assert.equal(r.queries.find(q=>q.id===ref.query).params[0].source,'row.stockCode');
  }
  const extra=sceneRuleIntentAnalyze(s,'调用库存查询检查可用库存大于0但忽略校验');assert(extra.unsupported.length);
`));
test('plugin must preserve arbitrary unknown tails even without known business keywords', () => fullWorkspace()(`
  selectScene('release');for(const text of ['当申请人为后端业务部人员时，检查整机物料的最小系统是否发布，未发布拦截提交但忽略校验','需要校验后端的最小系统如没有发布则拦截提交且允许例外']){const r=sceneRuleIntentAnalyze(scene(),text);assert(r.unsupported.length||r.blockingClarifications.length,text);}
`));
test('ambiguous refs can be manually resolved without permanent unsupported flags', () => fullWorkspace()(fixture + `
  const r=sceneRuleIntentAnalyze(s,'仓库名称必须等于上海');assert(r.clarifications.length);assert.equal(r.unsupported.length,0);assert.equal(r.blockingClarifications.length,0);
  const fuzzy=sceneRuleIntentAnalyze(s,'库存资料完整');assert(fuzzy.unsupported.length||fuzzy.blockingClarifications.length);
`));
test('legacy plugins cannot bypass safe numeric or duplicate assertion checks', () => fullWorkspace()(`
  selectScene('release');for(const text of ['安全DI不大于9007199254740992','商品目录图片、图片必须非空']){const r=sceneRuleIntentAnalyze(scene(),text);assert(r.unsupported.length||r.blockingClarifications.length,text);}
`));
test('failure handling and repeated left operand remain explicit without dropping text', () => fullWorkspace()(fixture + `
  const r=sceneRuleIntentAnalyze(s,'提交前申请数量必须大于0且不能超过库存可用数量，否则拦截提交');assert.equal(r.conditions.length,0);assert.equal(r.assertions.length,2);assert.equal(r.assertions[1].op,'lte');assert(r.assertions[1].valueReference);assert.equal(r.message,'否则拦截提交');assert.equal(r.level,'阻断');assert.equal(r.clarifications.length,0,r.clarifications.join(';'));
  const warning=sceneRuleIntentAnalyze(s,'库存仓库名称不能为空，不通过提醒');assert.equal(warning.level,'警告');assert.equal(warning.message,'不通过提醒');assert.equal(warning.assertions.length,1);
`));
test('多个能力也不能为未映射本体属性创建候选查询，Context接口歧义保留待选', () => fullWorkspace()(fixture + `
  s.bindings.inventory=s.bindings.inventory.filter(x=>x.ontology!=='Inventory.availableQuantity');
  for(const id of ['demo.stockA','demo.stockB'])capabilities.push({id,name:id,object:'Context',connector:'pis',params:[['stockCode','库存编号','是']],maps:[{source:'remaining',target:'Context.stock.remaining',sourceType:'数字',description:'接口库存'}]});
  const r=sceneRuleIntentAnalyze(s,'Inventory.availableQuantity必须大于0');assert.equal(r.queries.length,0);assert(r.clarifications.some(x=>/对象与表单映射/.test(x)));
  const context=sceneRuleIntentAnalyze(s,'接口库存必须大于0'),ref=context.references[0];assert(ref.query);const q=context.queries.find(q=>q.id===ref.query);assert.equal(q.capability,'');assert.equal(q.candidates.length,2);assert.equal(context.unsupported.length,0);assert(context.clarifications.length);
`));
test('strict ISO calendar dates and ranges reject invalid dates without dropping clauses', () => fullWorkspace()(fixture + `
  objectReleaseVersion('Inventory','v1.0.0').object.props.push({id:'businessDate',name:'业务日期',type:'日期'});
  s.workflow.blocks.inventory.fields.push({key:'businessDate',label:'业务日期',type:'日期'});
  s.bindings.inventory.push({target:scenePrefix(s,'inventory')+'businessDate',ontology:'Inventory.businessDate',instanceMode:'input'});
  let r=sceneRuleIntentAnalyze(s,'业务日期必须在2026-01-01到2026-12-31之间');assert.equal(r.clarifications.length,0,r.clarifications.join(';'));assert.equal(r.assertions[0].op,'between');assert.equal(JSON.stringify(r.assertions[0].value),JSON.stringify(['2026-01-01','2026-12-31']));
  for(const text of ['业务日期等于2026-02-30','Inventory.availableQuantity在10到1之间','Inventory.availableQuantity属于[1,未知]']){r=sceneRuleIntentAnalyze(s,text);assert(r.clarifications.length,text);}
`));
