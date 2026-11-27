const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {workspace}=require('./workspace.cjs');
function fullWorkspace(){const run=workspace(),loaded=new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);for(const [,file]of fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').matchAll(/src="([^"?]+)\?/g))if(!loaded.has(file))run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));return run;}
const edit=`selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});actionsMap['workflow-rule-authoring']();`;
const mappedPeople=`const main=scene().workflow.blocks.main;main.fields.push({key:'applicantDepartment',label:'申请人所属部门',type:'文本'});scene().bindings.main.push({target:'mainOrder.applicantDepartment',ontology:'Person.department',instanceMode:'input'});`;
const input=text=>`dispatchTestEvent('input',{dataset:{field:'originalText'},value:${JSON.stringify(text)}});`;
test('默认空白通用规则卡，不固定申请人、物料或接口字段',()=>fullWorkspace()(edit+`
 const html=extraDrawers.workflowRuleAuthoring();assert.equal(state.drawer.draft.originalText,'');assert(html.includes('通用规则卡'));assert(html.includes('data-rule-card-basic'));assert(/<details\\b[^>]*data-rule-card-advanced/.test(html));assert(!/<details\\b[^>]*data-rule-card-advanced[^>]*\\sopen(?:[\\s=>])/.test(html));assert(!html.includes('chainApplicantProperty'));assert(!html.includes('确认本体、接口与返回判断'));assert(!html.includes('人员部门属性'));assert.equal(state.drawer.generated,null);
`));
test('输入即解析意图并预填多对象属性，不保存或执行',()=>fullWorkspace()(edit+mappedPeople+input('人员所属部门等于后端业务部，且整机物料编码不能为空')+`
 const d=state.drawer;assert(d.draft.card);assert(d.draft.card.references.some(r=>r.path==='Person.department'));assert(d.draft.card.references.some(r=>r.path==='Material.materialCode'));assert.equal(d.generated,null);assert(!scene().workflow.rules.some(r=>r.ruleCard));const html=extraDrawers.workflowRuleAuthoring();assert(html.includes('人员'));assert(html.includes('整机物料'));assert(html.includes('自动预填'));
`));
test('纯字段规则不出现接口节点，生成后确认保存默认停用',()=>fullWorkspace()(edit+input('发布主题不能为空')+`
 const html=extraDrawers.workflowRuleAuthoring();assert(!html.includes('接口校验节点'));actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);const r=state.drawer.generated;assert(r.ruleCard);assert.equal(r.enabled,false);assert(r.naturalLanguage.properties.some(p=>p.path==='ReleaseOrder.releaseSubject'));const count=scene().workflow.rules.length;
 actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRule');assert.equal(scene().workflow.rules.length,count);actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);assert.equal(scene().workflow.rules.length,count+1);assert.equal(scene().workflow.rules.at(-1).enabled,false);
`));
test('短句最小系统作为可选解析例子，接口自动建议且无固定专用控件',()=>fullWorkspace()(edit+mappedPeople+input('当申请人为后端业务部人员时，检查整机物料的最小系统是否发布，未发布拦截提交')+`
 const c=state.drawer.draft.card;assert(c.references.some(r=>r.path==='Person.department'));assert(c.references.some(r=>r.path==='Material.materialCode'));assert(c.queries.some(q=>q.capability==='demo.minimumByMaterial'));const html=extraDrawers.workflowRuleAuthoring();assert(html.includes('接口校验节点'));assert(!html.includes('data-field="chainApplicantSource"'));assert(html.includes('demo.minimumByMaterial'));assert(html.includes('接口返回'));
`));
test('修改原文或生成卡立即使旧草稿不可确认，重新生成才能保存',()=>fullWorkspace()(edit+input('发布主题不能为空')+`
 actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);dispatchTestEvent('input',{dataset:{field:'originalText'},value:'发布主题等于测试'});assert.equal(state.drawer.generated,null);actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);
 dispatchTestEvent('change',{dataset:{cardClause:'assertions',index:'0',key:'value'},value:'正式发布'});assert.equal(state.drawer.generated,null);actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.ruleCard.assertions[0].value,'正式发布');
`));
test('多属性卡支持人工改对象属性，歧义或未支持文本不可猜测保存',()=>fullWorkspace()(edit+input('未知对象的未知属性必须正常')+`
 assert(state.drawer.draft.card);assert(state.drawer.draft.card.unsupported.length||state.drawer.draft.card.clarifications.length);actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.error);actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');
`));
test('生成与确认受场景、本体与接口指纹保护，不允许跨场景保存',()=>fullWorkspace()(edit+input('发布主题不能为空')+`
 actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);const old=scene().workflow.rules.length;objectReleaseVersion('ReleaseOrder',scene().ontologyVersions.ReleaseOrder).object.props[0].name+='锁定版本变更';actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert(state.drawer.error.includes('变化'));actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);selectScene('trial');actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert.equal(appScenes.release.workflow.rules.length,old);
`));
test('多个对象明确比较可生成同一卡，接口参数与返回要求均进入规则保存',()=>fullWorkspace()(edit+mappedPeople+input('当申请人为后端业务部人员时，检查整机物料的最小系统是否发布，未发布拦截提交')+`
 actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);const r=state.drawer.generated;assert.equal(r.ruleCard.conditions.length,1);assert.equal(r.ruleCard.assertions.length,1);assert(r.naturalLanguage.objects.some(o=>o.id==='Person'));assert(r.naturalLanguage.objects.some(o=>o.id==='Material'));assert(sceneReleaseDependencies(scene()).queries);actionsMap['workflow-rule-confirm']();actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);const saved=scene().workflow.rules.at(-1);assert(saved.ruleCard.queries.some(q=>q.capability==='demo.minimumByMaterial'));assert(sceneReleaseDependencies(scene()).queries.some(q=>q.id==='demo.minimumByMaterial'));
`));
test('更换已登记接口后返回与参数需重确认，选完新返回才能生成',()=>fullWorkspace()(edit+mappedPeople+input('当申请人为后端业务部人员时，检查整机物料的最小系统是否发布，未发布拦截提交')+`
 const c=state.drawer.draft.card,i=c.queries.findIndex(q=>q.capability==='demo.minimumByMaterial');capabilities.push({id:'demo.otherCheck',name:'其他校验',connector:'software',object:'Context',params:[{name:'materialCode',required:true}],maps:[{source:'result.other',target:'Context.otherStatus',sourceType:'文本'}]});
 dispatchTestEvent('change',{dataset:{cardQuery:String(i),key:'capability'},value:'demo.otherCheck'});assert.equal(c.queries[i].output,'');actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);
 const ri=c.references.findIndex(r=>r.query===c.queries[i].id);dispatchTestEvent('change',{dataset:{cardRef:String(ri),key:'output'},value:'otherStatus'});assert.equal(c.references[ri].path,'Context.otherStatus');const ai=c.assertions.findIndex(a=>a.reference===c.references[ri].id);assert.equal(c.assertions[ai].value,'');dispatchTestEvent('change',{dataset:{cardClause:'assertions',index:String(ai),key:'value'},value:'通过'});actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.ruleCard.queries[i].output,'otherStatus');
`));
test('结构化卡内容必须对应当前原文，不能沿用旧意图冒充新描述',()=>fullWorkspace()(edit+input('发布主题不能为空')+`
 state.drawer.draft.originalText='发布主题等于其他';actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);assert(state.drawer.error.includes('不一致'));
`));
test('规则仍只能自然语言新增，通用确认页不提供旧固定链路字段',()=>fullWorkspace()(edit+input('发布主题不能为空')+`
 assert(!workflowRulesView(scene()).includes('data-action="workflow-add-rule"'));actionsMap['workflow-rule-generate']();actionsMap['workflow-rule-confirm']();const html=extraDrawers.workflowRule();assert(html.includes('通用规则卡'));assert(!html.includes('chainApplicant'));assert(html.includes('workflow-rule-authoring-return'));actionsMap['workflow-rule-authoring-return']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert.equal(state.drawer.draft.originalText,'发布主题不能为空');
`));
