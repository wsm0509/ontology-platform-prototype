const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {workspace}=require('./workspace.cjs');
function full(){const run=workspace(),loaded=new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);for(const [,f]of fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').matchAll(/src="([^"?]+)\?/g))if(!loaded.has(f))run(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));return run;}
const edit=`selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});actionsMap['workflow-rule-authoring']();`;
const input=text=>`dispatchTestEvent('input',{dataset:{field:'originalText'},value:${JSON.stringify(text)}});`;
test('规则卡移除值来源，本体候选只含当前场景有效映射属性',()=>full()(edit+input('发布主题不能为空')+`
 const html=extraDrawers.workflowRuleAuthoring();assert(!html.includes('值的来源'));assert(!/data-card-ref="\d+" data-key="source"/.test(html));assert(html.includes('value="ReleaseOrder.releaseSubject"'));assert(!html.includes('value="Person.department"'));assert(!html.includes('value="ProductModel"'));
 const mappedPaths=workflowRuleAuthoringPaths(scene());assert(mappedPaths.some(p=>p.path==='ReleaseOrder.releaseSubject'));assert(!mappedPaths.some(p=>p.path==='Person.department'));
`));
test('已发布但未映射属性不预填，不可绕过选项生成',()=>full()(edit+input('人员所属部门等于后端业务部')+`
 const c=state.drawer.draft.card;assert(!c.references.some(r=>r.path==='Person.department'));assert(c.clarifications.some(x=>x.includes('映射')));actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);
 const ref=c.references[0];Object.assign(ref,{path:'Person.department',object:'Person',property:'department',name:'人员所属部门',type:'文本',kind:'ontology-property',query:'forged'});c.unsupported=[];c.blockingClarifications=[];c.queries=[{id:'forged',capability:'demo.personDepartment',params:[{name:'personCode',source:'order.applicantCode'}],output:'department',type:'文本'}];actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.error.includes('映射'));
`));
test('普通属性修改后来源由映射自动同步，无需填写；生成不会使用篡改来源',()=>full()(edit+input('发布主题不能为空')+`
 const ref=state.drawer.draft.card.references[0];assert.equal(ref.source,'order.releaseSubject');dispatchTestEvent('change',{dataset:{cardRef:'0',key:'path'},value:'ReleaseOrder.region'});assert.equal(ref.source,'order.region');ref.source='order.applicantCode';actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.ruleCard.references[0].source,'order.region');assert.equal(state.drawer.generated.ruleCard.mappingScope,'scene-bindings');
`));
test('不存在的目标字段、非映射用途、重复映射与跨场景属性均不进入候选',()=>full()(edit+`
 const s=scene();s.bindings.main.push({target:'mainOrder.missing',ontology:'Person.department'});assert(!workflowRuleAuthoringPaths(s).some(p=>p.path==='Person.department'));
 s.workflow.blocks.main.fields.find(f=>f.key==='releaseSubject').mappingMode='user';assert(!workflowRuleAuthoringPaths(s).some(p=>p.path==='ReleaseOrder.releaseSubject'));
 s.workflow.blocks.main.fields.find(f=>f.key==='region').mappingMode='mapping';s.bindings.main.push({target:'mainOrder.region',ontology:'Person.department'});assert(!workflowRuleAuthoringPaths(s).some(p=>p.path==='ReleaseOrder.region'));assert(!workflowRuleAuthoringPaths(s).some(p=>p.path==='Person.department'));
`));
test('相同属性跨区块映射通过执行范围自动取值，同区块重复映射不得猜测',()=>full()(edit+`
 const s=scene(),b=s.workflow.blocks.items; b.fields.push({key:'releaseSubject',label:'明细主题',type:'文本'});s.bindings.items.push({target:'releaseItems[].releaseSubject',ontology:'ReleaseOrder.releaseSubject'});
`+input('发布主题不能为空')+`
 dispatchTestEvent('change',{dataset:{field:'scope'},value:'items'});actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.ruleCard.references[0].source,'row.releaseSubject');
 const main=s.workflow.blocks.main;main.fields.push({key:'secondSubject',label:'另一主题',type:'文本'});s.bindings.main.push({target:'mainOrder.secondSubject',ontology:'ReleaseOrder.releaseSubject'});dispatchTestEvent('change',{dataset:{field:'scope'},value:'main'});actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.error.includes('不唯一'));
`));
test('新规则发布和执行复核映射，解绑后旧来源不能继续生效',()=>full()(edit+input('发布主题不能为空')+`
 actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);actionsMap['workflow-rule-confirm']();actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);const r=scene().workflow.rules.at(-1);r.enabled=true;
 scene().bindings.main=scene().bindings.main.filter(b=>b.ontology!=='ReleaseOrder.releaseSubject');assert(sceneRuleCardValidate(scene(),r).includes('映射'));
 const result=executeWorkflow(scene(),workflowDemoDocument(scene(),'all-pass'),demoAuthority('all-pass'));assert(result.checks.some(c=>c.rule===r.id&&c.status==='未知'));assert(!result.passed);
`));
test('接口返回单独判断，入参仍从已映射属性自动取值',()=>full()(edit+`
 const s=scene();capabilities.push({id:'test.subjectCheck',name:'主题校验',connector:'pis',object:'Context',params:[['releaseSubject','主题','是']],maps:[{source:'ok',target:'Context.subject.valid',sourceType:'布尔',description:'主题是否有效'}]});
`+input('调用主题校验接口，返回Context.subject.valid等于true')+`
 const c=state.drawer.draft.card;assert(c.queries.some(q=>q.capability==='test.subjectCheck'));assert(c.references.some(r=>r.path==='ReleaseOrder.releaseSubject'));const html=extraDrawers.workflowRuleAuthoring();assert(!html.includes('值的来源'));assert(!/data-card-param="\d+" data-index="\d+" data-key="source"/.test(html));assert(html.includes('入参'));actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);const q=state.drawer.generated.ruleCard.queries[0];assert(q.params[0].reference);assert(!q.params[0].source);
`));
