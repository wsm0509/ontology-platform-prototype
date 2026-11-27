const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {workspace}=require('./workspace.cjs');
function full(){const run=workspace(),loaded=new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);for(const [,file]of fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').matchAll(/src="([^"?]+)\?/g))if(!loaded.has(file))run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));return run;}
const open=`selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});actionsMap['workflow-rule-authoring']();`;
// Extract balanced marked elements, rather than treating closed technical details as visible UI.
const helpers=`
 function marked(html,attribute){const result=[],tags=/<\\/?([a-z][a-z0-9-]*)\\b[^>]*>/gi;let token;while((token=tags.exec(html))){if(token[0].startsWith('</')||!new RegExp('\\\\b'+attribute+'(?:[\\\\s=>])').test(token[0]))continue;const start=token.index,opening=token[0],tag=token[1].toLowerCase();let depth=1,end=tags.lastIndex,next;while(depth&&(next=tags.exec(html))){if(next[1].toLowerCase()!==tag)continue;depth+=next[0].startsWith('</')?-1:1;end=tags.lastIndex;}assert.equal(depth,0,'marked element must close: '+attribute);result.push({opening,html:html.slice(start,end)});}return result;}
 function cardUI(){const html=extraDrawers.workflowRuleAuthoring(),basic=marked(html,'data-rule-card-basic'),advanced=marked(html,'data-rule-card-advanced');assert(basic.length,'main business area must have data-rule-card-basic');assert.equal(advanced.length,1,'one advanced technical review');assert(/^<details\\b/i.test(advanced[0].opening),'advanced review must be a details element');assert(!/\\sopen(?:[\\s=>])/i.test(advanced[0].opening),'advanced review is closed by default');return {html,main:basic.map(x=>x.html).join(''),advanced:advanced[0].html};}
 function choose(kind,index,value){dispatchTestEvent('change',{dataset:{cardChoice:kind,index:String(index)},value});}
 function clause(kind,index,key,value){dispatchTestEvent('change',{dataset:{cardClause:kind,index:String(index),key},value});}
 function reference(kind,index){const c=state.drawer.draft.card;return c.references.find(r=>r.id===c[kind][index].reference);}
 function valueInputs(main,kind,index){return (main.match(/<input\\b[^>]*>|<textarea\\b[^>]*>/g)||[]).filter(tag=>tag.includes('data-card-clause="'+kind+'"')&&tag.includes('data-index="'+index+'"')&&tag.includes('data-key="value"'));}
`;
function scenario(name,code){test(name,()=>full()(helpers+open+code));}
scenario('主规则卡展示条件属性与校验方式；执行范围仍在收起的高级核对',`
 const {main,advanced}=cardUI();const headings=[...main.matchAll(/<h[2-6]\\b[^>]*>([\\s\\S]*?)<\\/h[2-6]>/g)].map(m=>m[1].replace(/<[^>]+>/g,'').trim()).filter(title=>title!=='通用规则卡').map(title=>title.replace(/^\\d+\\s*[·.、]\\s*/,''));assert.deepEqual(headings,['条件本体对象 / 属性','校验配置','未通过怎么办']);
 assert(main.includes('data-card-validation-mode'));assert(main.includes('接口校验'));assert(main.includes('本地校验'));assert(!/data-field="scope"|data-key="object"|data-key="source"|JSON/.test(main));
 assert(advanced.includes('data-field="scope"'));assert(advanced.includes('data-card-ref="0"'));assert(!/data-card-ref="\\d+" data-key="source"/.test(advanced),'mapping remains the only source of truth');
 assert(main.includes('data-card-setting="level"'));assert(main.includes('data-card-setting="message"'));assert(!main.includes('data-card-clause="assertions" data-index="0" data-key="reference"'));
`);
scenario('检查行只用一个对象加属性的合并路径选择器，候选仅来自本场景映射',`
 const {main}=cardUI();const choices=[...main.matchAll(/<select\\b[^>]*data-card-choice="assertions"[^>]*>[\\s\\S]*?<\\/select>/g)];assert.equal(choices.length,1);assert(choices[0][0].includes('data-index="0"'));assert(choices[0][0].includes('value="ReleaseOrder.releaseSubject"'));assert(choices[0][0].includes('value="ReleaseOrder.region"'));assert(!choices[0][0].includes('value="Person.department"'));
 assert.equal(valueInputs(main,'assertions',0).length,0,'exists does not need a literal comparison value');assert(!main.includes('data-key="valueReference"'),'optional reference comparison belongs in advanced review');
`);
scenario('无自然语言直接选择映射路径、判断和值，自动主单范围后生成确认保存',`
 const before=scene().workflow.rules.length;choose('assertions',0,'ReleaseOrder.releaseSubject');assert.equal(reference('assertions',0).path,'ReleaseOrder.releaseSubject');assert.equal(reference('assertions',0).source,'order.releaseSubject');assert.equal(state.drawer.draft.scope,'main');
 clause('assertions',0,'op','eq');clause('assertions',0,'value','正式发布');dispatchTestEvent('input',{dataset:{cardSetting:'message'},value:'请使用正式发布主题'});assert.equal(state.drawer.draft.originalText,'');assert.equal(valueInputs(cardUI().main,'assertions',0).length,1);
 actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);const r=state.drawer.generated;assert.equal(r.scope,'main');assert.equal(r.ruleCard.mappingScope,'scene-bindings');assert.equal(r.ruleCard.assertions[0].value,'正式发布');assert.equal(r.ruleCard.references[0].source,'order.releaseSubject');assert.equal(r.ruleCard.unknown,'block');assert.equal(r.enabled,false);assert.equal(scene().workflow.rules.length,before);
 actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRule');assert.equal(scene().workflow.rules.length,before);actionsMap['workflow-save-rule']();assert.equal(state.drawer,null);const saved=scene().workflow.rules.at(-1);assert.equal(scene().workflow.rules.length,before+1);assert.equal(saved.enabled,false);assert.equal(saved.naturalLanguage.originalText,'');assert.equal(saved.ruleCard.assertions[0].value,'正式发布');
`);
scenario('新增条件自带独立空白引用，直接选择新映射属性不必先添加属性',`
 choose('assertions',0,'ReleaseOrder.releaseSubject');const assertion=reference('assertions',0),count=state.drawer.draft.card.references.length;actionsMap['workflow-rule-card-add-clause']({dataset:{kind:'conditions'}});const condition=reference('conditions',0);assert(condition,'new condition must own a reference');assert.notEqual(condition.id,assertion.id);assert.equal(condition.path,'');assert.equal(state.drawer.draft.card.references.length,count+1);
 const {main}=cardUI();const select=main.match(/<select\\b[^>]*data-card-choice="conditions"[^>]*>[\\s\\S]*?<\\/select>/);assert(select);assert(select[0].includes('value="ReleaseOrder.region"'));choose('conditions',0,'ReleaseOrder.region');clause('conditions',0,'op','eq');clause('conditions',0,'value','欧洲');assert.equal(reference('assertions',0).path,'ReleaseOrder.releaseSubject');assert.equal(reference('conditions',0).path,'ReleaseOrder.region');assert.equal(reference('conditions',0).source,'order.region');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.ruleCard.conditions.length,1);
`);
scenario('新增检查同样空白独立，可直接选择另一个映射属性',`
 choose('assertions',0,'ReleaseOrder.releaseSubject');actionsMap['workflow-rule-card-add-clause']({dataset:{kind:'assertions'}});assert.equal(reference('assertions',1).path,'');assert.notEqual(reference('assertions',1).id,reference('assertions',0).id);choose('assertions',1,'ReleaseOrder.region');clause('assertions',1,'op','exists');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.ruleCard.assertions.length,2);
`);
scenario('明细属性直接选择后自动逐行范围，不错误使用主单来源',`
 choose('assertions',0,'Material.materialCode');assert.equal(reference('assertions',0).source,'row.materialCode');assert.equal(state.drawer.draft.scope,'items');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.scope,'items');assert.equal(state.drawer.generated.ruleCard.references[0].source,'row.materialCode');
`);
scenario('主单主题改选明细物料编码时重新自动推导范围和映射来源',`
 choose('assertions',0,'ReleaseOrder.releaseSubject');assert.equal(state.drawer.draft.scope,'main');assert.equal(reference('assertions',0).source,'order.releaseSubject');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);
 choose('assertions',0,'Material.materialCode');assert.equal(state.drawer.generated,null);assert.equal(state.drawer.draft.scope,'items');assert.equal(state.drawer.draft.card.scope,'items');assert.equal(reference('assertions',0).path,'Material.materialCode');assert.equal(reference('assertions',0).source,'row.materialCode');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.scope,'items');assert.equal(state.drawer.generated.ruleCard.references[0].source,'row.materialCode');
`);
scenario('比较值输入仅在运算符需要且未选择另一属性时显示',`
 choose('assertions',0,'ReleaseOrder.releaseSubject');for(const op of ['exists','notExists']){clause('assertions',0,'op',op);assert.equal(valueInputs(cardUI().main,'assertions',0).length,0);}clause('assertions',0,'op','eq');assert.equal(valueInputs(cardUI().main,'assertions',0).length,1);
 actionsMap['workflow-rule-card-add-clause']({dataset:{kind:'conditions'}});choose('conditions',0,'ReleaseOrder.region');clause('conditions',0,'op','exists');clause('assertions',0,'valueReference',reference('conditions',0).id);assert.equal(valueInputs(cardUI().main,'assertions',0).length,0);assert(cardUI().main.includes('发布区域'));clause('assertions',0,'valueReference','');assert.equal(valueInputs(cardUI().main,'assertions',0).length,1);
`);
scenario('日期比较给出日期输入而非原始 JSON 文本',`
 objectReleaseVersion('ReleaseOrder',scene().ontologyVersions.ReleaseOrder).object.props.push({id:'effectiveDate',name:'生效日期',type:'日期'});scene().workflow.blocks.main.fields.push({key:'effectiveDate',label:'生效日期',type:'日期'});scene().bindings.main.push({target:'mainOrder.effectiveDate',ontology:'ReleaseOrder.effectiveDate',instanceMode:'input'});const p=workflowRuleAuthoringPaths(scene()).find(p=>p.path==='ReleaseOrder.effectiveDate');assert(p,'date fixture must be mapped');choose('assertions',0,p.path);clause('assertions',0,'op','gte');const inputs=valueInputs(cardUI().main,'assertions',0);assert.equal(inputs.length,1);assert(/type="date"/.test(inputs[0]));clause('assertions',0,'value','2026-01-01');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.ruleCard.assertions[0].value,'2026-01-01');
`);
scenario('集合业务输入可用分隔值，不要求用户写 JSON；保存仍是严格数组',`
 choose('assertions',0,'ReleaseOrder.region');clause('assertions',0,'op','in');const {main}=cardUI();assert(!main.includes('JSON'));assert.equal(valueInputs(main,'assertions',0).length,1);clause('assertions',0,'value','欧洲, 北美');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(JSON.stringify(state.drawer.generated.ruleCard.assertions[0].value),JSON.stringify(['欧洲','北美']));
`);
scenario('合并路径不能越过映射约束；映射取值被手工篡改也会重新核对',`
 choose('assertions',0,'ReleaseOrder.releaseSubject');const before=JSON.stringify(state.drawer.draft.card);choose('assertions',0,'Person.department');assert.equal(JSON.stringify(state.drawer.draft.card),before);assert(state.drawer.error.includes('映射'));reference('assertions',0).source='order.applicantCode';actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.ruleCard.references[0].source,'order.releaseSubject');
`);
scenario('合并路径改变立即失效旧草稿，不可确认沿用旧检查',`
 choose('assertions',0,'ReleaseOrder.releaseSubject');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);choose('assertions',0,'ReleaseOrder.region');assert.equal(state.drawer.generated,null);actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);assert.equal(state.drawer.generated.ruleCard.references[0].path,'ReleaseOrder.region');
`);
scenario('简洁控件仍受场景编辑权限保护',`
 const before=JSON.stringify(state.drawer.draft);actionsMap['scene-release-edit']({dataset:{id:'release'}});choose('assertions',0,'ReleaseOrder.releaseSubject');actionsMap['workflow-rule-card-add-clause']({dataset:{kind:'conditions'}});assert.equal(JSON.stringify(state.drawer.draft),before);actionsMap['workflow-rule-generate']();assert.equal(state.drawer.generated,null);
`);
scenario('锁定本体版本变化仍拒绝确认与保存简洁卡',`
 choose('assertions',0,'ReleaseOrder.releaseSubject');actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);const before=scene().workflow.rules.length;objectReleaseVersion('ReleaseOrder',scene().ontologyVersions.ReleaseOrder).object.props[0].name+='变化';actionsMap['workflow-rule-confirm']();assert.equal(state.drawer.type,'workflowRuleAuthoring');assert(state.drawer.error.includes('变化'));assert.equal(scene().workflow.rules.length,before);
`);
scenario('自然语言接口规则保留精确返回判断，主区直接配置接口和入参',`
 scene().workflow.blocks.main.fields.push({key:'applicantDepartment',label:'申请人所属部门',type:'文本'});scene().bindings.main.push({target:'mainOrder.applicantDepartment',ontology:'Person.department',instanceMode:'input'});dispatchTestEvent('input',{dataset:{field:'originalText'},value:'当申请人为后端业务部人员时，检查整机物料的最小系统是否发布，未发布拦截提交'});
 const {main,advanced}=cardUI();assert(main.includes('data-card-query='));assert(main.includes('data-card-param-path='));assert(main.includes('demo.minimumByMaterial'));assert(advanced.includes('demo.minimumByMaterial'));assert(advanced.includes('接口返回'));actionsMap['workflow-rule-generate']();assert(state.drawer.generated,state.drawer.error);const r=state.drawer.generated;assert.equal(r.ruleCard.conditions.length,1);assert.equal(r.ruleCard.assertions.length,1);assert(r.ruleCard.queries.some(q=>q.capability==='demo.minimumByMaterial'));assert.equal(r.ruleCard.unknown,'block');assert(r.ruleCard.assertions[0].value!=='','interface success alone is not a passing value');
`);
