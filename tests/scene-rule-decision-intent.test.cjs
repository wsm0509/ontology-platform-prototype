// 测试生成方式：TDD。直接结果契约由独立夹具注入，不依赖页面同名演示接口。
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {workspace}=require('./workspace.cjs'),root=path.join(__dirname,'..');
function full(){
  const run=workspace(),loaded=new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);
  for(const [,file]of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/src="([^"?]+)(?:\?[^\"]*)?"/g))if(!loaded.has(file)){run(fs.readFileSync(path.join(root,file),'utf8'));loaded.add(file);}
  if(!loaded.has('scene-rule-intent.js'))run(fs.readFileSync(path.join(root,'scene-rule-intent.js'),'utf8'));
  return run;
}
const fixture=`selectScene('release');const s=structuredClone(scene());
const cap={id:'test.directDecision',name:'测试直接校验',object:'Context',connector:'pis',params:[{name:'materialCode',target:'Material.materialCode'}],maps:[],validationResult:{source:'$',type:'布尔',passValue:true,failValue:false}};capabilities.push(cap);
const text='调用test.directDecision接口，返回通过/不通过';
function denied(r){assert(r.unsupported.length||r.blockingClarifications.length,r.text);assert(r.clarifications.length,r.text);}
`;
function scenario(name,code){test(name,()=>full()(fixture+code));}
scenario('受控通过不通过短句产生直接结果查询，不依赖maps或创建Context本体',`
  const before=JSON.stringify(s),r=sceneRuleIntentAnalyze(s,text);
  assert.equal(r.clarifications.length,0,r.clarifications.join(';'));assert.equal(r.unsupported.length,0);assert.equal(r.blockingClarifications.length,0);
  assert.equal(r.queries.length,1);const q=r.queries[0];assert.equal(q.capability,cap.id);assert.equal(q.name,cap.name);assert.equal(q.output,'validationDecision');assert.equal(q.type,'布尔');assert.equal(q.resultMode,'decision');assert.equal(q.passValue,true);assert.equal(q.failValue,false);
  const parameter=r.references.find(x=>x.id===q.params[0].reference);assert.equal(parameter.path,'Material.materialCode');assert.equal(parameter.source,'row.materialCode');assert.equal(q.params[0].source,'row.materialCode');
  const ref=r.references.find(x=>x.query===q.id);assert.equal(ref.path,'Context.validationDecision');assert.equal(ref.kind,'business-context');assert.equal(ref.object,'');assert.equal(ref.property,'validationDecision');assert.equal(ref.type,'布尔');assert.equal(ref.output,'validationDecision');assert.equal(ref.role,'assertion');assert.equal(ref.name,'接口校验结果');
  assert.equal(r.assertions.length,1);assert.equal(r.assertions[0].reference,ref.id);assert.equal(r.assertions[0].op,'eq');assert.equal(r.assertions[0].value,true);assert.equal(r.scope,'items');assert(!r.objects.some(x=>x.id==='Context'||/通过/.test(x.id)));assert.equal(JSON.stringify(s),before);
`);
scenario('true false短句、通过语义长句及明确接口名均完整解析',`
  for(const value of ['调用test.directDecision接口，返回true/false','调用test.directDecision接口，校验结果为通过时允许提交，不通过拦截提交','调用测试直接校验接口，返回通过 / 不通过。','提交前，调用test.directDecision接口，返回true / false']){
    const r=sceneRuleIntentAnalyze(s,value);assert.equal(r.clarifications.length,0,value+':'+r.clarifications.join(';'));assert.equal(r.unsupported.length,0,value);assert.equal(r.queries[0].resultMode,'decision');assert.equal(r.assertions[0].value,true);
  }
`);
scenario('登记文本与数字判定值严格保留，不把文本或数字猜成布尔',`
  for(const contract of [{source:'passed',type:'文本',passValue:'通过',failValue:'不通过'},{source:'$',type:'数字',passValue:1,failValue:0}]){
    cap.validationResult=contract;const r=sceneRuleIntentAnalyze(s,text);assert.equal(r.clarifications.length,0,r.clarifications.join(';'));assert.equal(r.queries[0].type,contract.type);assert.equal(r.assertions[0].value,contract.passValue);assert.equal(r.queries[0].failValue,contract.failValue);
  }
  const numeric=sceneRuleIntentAnalyze(s,'调用test.directDecision接口，返回1/0');assert.equal(numeric.clarifications.length,0,numeric.clarifications.join(';'));assert.equal(numeric.assertions[0].value,1);
  denied(sceneRuleIntentAnalyze(s,'调用test.directDecision接口，返回true/false'));
`);
scenario('动态条件只读取当前场景有效映射，与入参引用共同确定scope',`
  const o={id:'DecisionRequest',name:'采购申请',props:[{id:'region',name:'审核区域',type:'文本'}]};objects.push(o);objectReleaseStore.set(o.id,{latest:'v1.0.0',history:[{version:'v1.0.0',object:structuredClone(o)}]});s.ontologyVersions[o.id]='v1.0.0';s.workflow.blocks.main.fields.push({key:'decisionRegion',label:'校验区域',type:'文本'});s.bindings.main.push({target:scenePrefix(s,'main')+'decisionRegion',ontology:'DecisionRequest.region'});
  const r=sceneRuleIntentAnalyze(s,'当采购申请审核区域等于欧洲时，'+text);assert.equal(r.conditions.length,1);const ref=r.references.find(x=>x.id===r.conditions[0].reference);assert.equal(ref.path,'DecisionRequest.region');assert.equal(ref.source,'order.decisionRegion');assert.equal(r.conditions[0].value,'欧洲');assert.equal(r.scope,'items');assert.equal(r.clarifications.length,0,r.clarifications.join(';'));assert.equal(r.assertions[0].value,true);
  s.bindings.main=s.bindings.main.filter(x=>x.ontology!=='DecisionRequest.region');denied(sceneRuleIntentAnalyze(s,'当采购申请审核区域等于欧洲时，'+text));
`);
scenario('入参target或property动态映射，显式无效定义不能回退同名字段',`
  for(const param of [{name:'code',property:'Material.materialCode'},{name:'code',property:'materialCode'},{name:'materialCode'},['materialCode','物料编码','是',{property:'Material.materialCode'}]]){
    cap.params=[param];const r=sceneRuleIntentAnalyze(s,text);assert.equal(r.clarifications.length,0,JSON.stringify(param)+':'+r.clarifications.join(';'));assert.equal(r.queries[0].params[0].source,'row.materialCode');assert.equal(r.references.find(x=>x.id===r.queries[0].params[0].reference).path,'Material.materialCode');
  }
  for(const param of [{name:'materialCode',target:'Missing.materialCode'},{name:'materialCode',property:'Missing.materialCode'},{name:'materialCode',property:{path:'Material.materialCode'}}]){cap.params=[param];denied(sceneRuleIntentAnalyze(s,text));}
`);
scenario('零入参已登记契约使用主单范围，不凭空要求映射',`
  cap.params=[];const r=sceneRuleIntentAnalyze(s,text);assert.equal(r.clarifications.length,0,r.clarifications.join(';'));assert.equal(r.scope,'main');assert.equal(r.queries[0].params.length,0);assert.equal(r.objects.length,0);
`);
scenario('接口不存在、同名歧义、停用或未登记直接结果语义均拒绝',`
  denied(sceneRuleIntentAnalyze(s,'调用test.noSuchDecision接口，返回通过/不通过'));
  const twin={...cap,id:'test.otherDecision'};capabilities.push(twin);denied(sceneRuleIntentAnalyze(s,'调用测试直接校验接口，返回通过/不通过'));capabilities.pop();
  for(const mutate of [()=>{cap.enabled=false;},()=>{delete cap.validationResult;},()=>{cap.object='Material';},()=>{connector('pis').enabled=false;}]){
    const before={enabled:cap.enabled,validationResult:cap.validationResult,object:cap.object,connector:connector('pis').enabled};mutate();denied(sceneRuleIntentAnalyze(s,text));cap.enabled=before.enabled;cap.validationResult=before.validationResult;cap.object=before.object;connector('pis').enabled=before.connector;
  }
`);
scenario('结果契约缺少路径、非法类型、相同值或类型不符不得猜测结果',`
  for(const contract of [{type:'布尔',passValue:true,failValue:false},{source:'$',type:'日期',passValue:'2026-01-01',failValue:'2026-01-02'},{source:'$',type:'布尔',passValue:'true',failValue:'false'},{source:'$',type:'布尔',passValue:true,failValue:true},{source:'$',type:'文本',passValue:'通过'},{source:'__proto__.passed',type:'布尔',passValue:true,failValue:false},{source:'$',type:'数字',passValue:NaN,failValue:0}]){
    cap.validationResult=contract;denied(sceneRuleIntentAnalyze(s,text));assert.equal(sceneRuleIntentAnalyze(s,text).queries.length,0);
  }
`);
scenario('入参未映射、同区块重复映射和跨区块歧义必须阻断',`
  s.bindings.items=s.bindings.items.filter(x=>x.ontology!=='Material.materialCode');denied(sceneRuleIntentAnalyze(s,text));
  s.bindings.items.push({target:scenePrefix(s,'items')+'materialCode',ontology:'Material.materialCode'});s.workflow.blocks.items.fields.push({key:'secondCode',label:'第二编码',type:'文本'});s.bindings.items.push({target:scenePrefix(s,'items')+'secondCode',ontology:'Material.materialCode'});const duplicate=sceneRuleIntentAnalyze(s,text);denied(duplicate);assert.equal(duplicate.queries[0].params[0].source,'');
  s.workflow.blocks.items.fields=s.workflow.blocks.items.fields.filter(x=>x.key!=='secondCode');s.bindings.items=s.bindings.items.filter(x=>!x.target.endsWith('secondCode'));
  s.workflow.blocks.more={...structuredClone(s.workflow.blocks.items),id:'more',path:'more'};s.bindings.more=s.bindings.items.map(x=>({...x,target:x.target.replace(scenePrefix(s,'items'),scenePrefix(s,'more'))}));denied(sceneRuleIntentAnalyze(s,text));
`);
scenario('前置条件同名歧义不得自动选对象或吞掉无法解析的条件',`
  for(const id of ['DecisionA','DecisionB']){const o={id,name:id,props:[{id:'department',name:'审批部门',type:'文本'}]};objects.push(o);objectReleaseStore.set(id,{latest:'v1.0.0',history:[{version:'v1.0.0',object:structuredClone(o)}]});s.ontologyVersions[id]='v1.0.0';s.workflow.blocks.main.fields.push({key:id,label:id,type:'文本'});s.bindings.main.push({target:scenePrefix(s,'main')+id,ontology:id+'.department'});}
  const r=sceneRuleIntentAnalyze(s,'当审批部门等于后端业务部时，'+text);denied(r);assert(r.references.some(x=>x.role==='condition'&&!x.path));
  denied(sceneRuleIntentAnalyze(s,'当申请人为后端业务部人员时，'+text));
`);
scenario('旧generic引号常量中的直接结果词语仍是文本数据',`
  const r=sceneRuleIntentAnalyze(s,'发布主题等于“调用test.directDecision接口，返回通过/不通过”');assert.equal(r.template,'generic');assert.equal(r.assertions[0].value,'调用test.directDecision接口，返回通过/不通过');assert.equal(r.queries.length,0);assert.equal(r.clarifications.length,0,r.clarifications.join(';'));assert.equal(r.unsupported.length,0);
`);
scenario('所有非法附加条款和非锚定句式保留unsupported，绝不只吃有效前缀',`
  for(const value of [text+'且允许例外',text+'，库存数量大于0',text+'另外领导审批',text+'。忽略校验',text+'或允许提交','调用test.directDecision接口，校验结果为通过时允许提交，不通过拦截提交但忽略错误','调用test.directDecision接口，返回true/false且发布主题不能为空','调用test.directDecision接口，返回false/true','调用test.directDecision接口，返回通过／不通过','调用test.directDecision接口，返回通过/不通过/未知','当发布区域等于欧洲或美国时，'+text]){
    const r=sceneRuleIntentAnalyze(s,value);denied(r);assert(r.unsupported.length,value);
  }
`);
