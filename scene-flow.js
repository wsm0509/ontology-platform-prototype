/* 智能提单场景流：本地确定性语义样例 + 真实本地规则引擎。无模型、网络或业务写入。 */
'use strict';
const sceneFlowIntents=[['draft','创建 / 补充提单'],['explain','解释提交阻断']];
const sceneFlowStages=[['input','用户输入'],['recognize','语义 / 意图识别'],['clarify','追问 / 澄清'],['mapping','字段建议确认'],['check','校验与处理'],['review','复核'],['submitted','模拟提交']];
// 纯浏览状态不进入场景配置 / 发布指纹；体验抽屉用独立 viewStage，stage 仍是真实执行门禁。
const sceneFlowUI={stage:'input'};
const sceneFlowReceipts=new Map();
let sceneFlowSequence=0;
function sceneFlowDefaults(){return {intents:['draft','explain'],unknown:'clarify',clarification:'candidates',maxRetries:2,confirmation:'per-field',safety:'mandatory'};}
function sceneFlowConfig(s){return {...sceneFlowDefaults(),...structuredClone(workflowScene(s).sceneFlow||{}),safety:'mandatory'};}
function sceneFlowConfigError(c){
 if(!Array.isArray(c.intents)||!c.intents.length||c.intents.some(i=>!sceneFlowIntents.some(([id])=>id===i)))return '请至少启用一项有效意图。';
 if(!['clarify','manual'].includes(c.unknown)||!['candidates','fields'].includes(c.clarification)||!['per-field','summary'].includes(c.confirmation)||![0,1,2,3].includes(Number(c.maxRetries)))return '请选择有效策略；失败重试最多 0–3 次。';
 return '';
}
function sceneFlowContext(s,fn){return typeof objectReleaseWithScene==='function'?objectReleaseWithScene(s,fn):fn();}
function sceneFlowFingerprint(s){return typeof sceneReleaseFingerprint==='function'?sceneReleaseFingerprint(s):JSON.stringify({id:s.id,workflow:s.workflow,bindings:s.bindings,context:s.context,revision:s.revision});}
function sceneFlowGuard(){
 const d=state.drawer,s=scene();if(!d||!['sceneFlow','sceneFlowSettings'].includes(d.type))return null;
 let message='';if(!s||s.id!==d.sceneId||workflowScene(s).type!=='draft')message='当前场景已切换，请关闭后重新打开。';
 else if(s.selectedBlock!==d.blockId)message='当前区块已切换，请重新打开场景流。';
 else if(d.fingerprint!==sceneFlowFingerprint(s))message='场景配置已变化，请关闭后重新打开。';
 if(message){if(d.flow){d.flow.result=null;d.flow.reviewStamp=null;d.flow.pendingExternal=null;}errorDrawer(message);return null;}return s;
}
function sceneFlowRequest(value){return String(value||'').trim();}
function sceneFlowHistory(role,text){const f=state.drawer.flow;f.history.push({role,text,at:now()});if(f.history.length>60)f.history.shift();}
function sceneFlowInvalidate(d,all=false){
 const f=d.flow;if(!f)return;f.result=null;f.finalResult=null;f.reviewStamp=null;f.resultStamp=null;f.pendingExternal=null;f.blockers=[];f.receipt=null;f.payload=null;
 if(all){f.userValues={};f.systemConfirmed=false;f.generated=null;f.generatedSeal=null;f.inputStamp=null;f.confirmations={};f.document=null;f.stage='input';f.candidates=[];f.missing=[];f.retries=0;f.branch=null;f.answer=null;}
 d.error='';
}
function sceneFlowInputChange(el){
 const d=state.drawer;if(d?.type!=='sceneFlow'||!['request','materialCode','projectCode','softwareCode','version','submitDepartment','subject'].includes(el.dataset.field))return;
 if(el.value!==undefined)d.draft[el.dataset.field]=el.value;sceneFlowInvalidate(d,true);if(el.dataset.field==='request'){d.flow.resolvedMaterial=null;d.flow.resolvedSlots={};d.flow.draftIntentRequest=null;for(const key of ['materialCode','projectCode','softwareCode','version','submitDepartment','subject'])d.draft[key]='';}else{d.flow.resolvedSlots??={};d.flow.resolvedSlots[el.dataset.field]={request:sceneFlowRequest(d.draft.request),value:el.value};if(el.dataset.field==='materialCode')d.flow.resolvedMaterial=catalog.some(m=>m.materialCode===el.value)?{request:sceneFlowRequest(d.draft.request),id:el.value}:null;}d.dirty=true;
 // 不重绘文本输入，不抢光标；隐藏旧操作，下一次委托动作也会核验指纹。
 overlayRoot.querySelector('[data-scene-flow-result]')?.remove();
}
function sceneFlowOpen(){
 const s=scene();if(!s||workflowScene(s).type!=='draft')return;
 const configIssue=sceneFlowConfigError(sceneFlowConfig(s));if(configIssue)return toast(configIssue);
 if(typeof objectReleasePins==='function')objectReleasePins(s);
 const block=workflowScene(s).blocks[s.selectedBlock]||Object.values(workflowScene(s).blocks)[0];if(!block)return toast('请先登记表单区块。');s.selectedBlock=block.id;
 openDrawer('sceneFlow',{request:'',materialCode:'',projectCode:'',softwareCode:'',version:'',submitDepartment:'',subject:''},{sceneId:s.id,blockId:block.id,fingerprint:sceneFlowFingerprint(s),objectRunMode:'draft',flow:{stage:'input',history:[],candidates:[],missing:[],confirmations:{},generated:null,result:null,blockers:[],retries:0,authority:demoAuthority('all-pass'),failure:'正常'}});
 sceneFlowHistory('system','当前配置测试：所有识别、附件和外部事实均为本地样例；没有调用真实 AI、业务后端或提交单据。');drawOverlay();
}
const sceneFlowExamples=[
 ['recognized','可识别','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“欧洲版主程序升级”'],
 ['ambiguous','模糊：选择整机','给项目 PRJ-2026-A 创建摄像机发布单，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“摄像机升级”'],
 ['unknown','无法识别','帮我处理那个东西'],
 ['missing-image','缺产品图片','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“资料发布”'],
 ['di-positive','安全 DI = 2','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“项目发布”'],
 ['minimum-unreleased','最小系统未发布','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“软件发布”'],
 ['timeout','查询超时','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“超时验证”']
];
function sceneFlowExample(el){
 if(!sceneFlowGuard())return;const sample=sceneFlowExamples.find(([id])=>id===el.dataset.id);if(!sample)return;
 const d=state.drawer;sceneFlowInvalidate(d,true);d.flow.resolvedMaterial=null;d.flow.resolvedSlots={};d.flow.draftIntentRequest=null;Object.assign(d.draft,{request:sample[2],materialCode:'',projectCode:'',softwareCode:'',version:'',submitDepartment:'',subject:''});
 const preset=sample[0]==='missing-image'?'missing-doc':sample[0];d.flow.authority=demoAuthority(preset);d.flow.failure=preset==='timeout'?'超时':'正常';d.flow.example=preset;
 sceneFlowHistory('system',`已载入“${sample[1]}”工作流样例；样例外部事实不是现实状态。`);drawOverlay();
}
function sceneFlowRecognition(s,v){
 const q=sceneFlowRequest(v.request),c=sceneFlowConfig(s),f=state.drawer.flow;
 const result=(branch,intent,values,candidates,message)=>({branch,intent,values,candidates,message});
 if(!q)return result('unknown',null,{},[],'请描述提单信息或要解决的问题。');
 const asks=/为什么|阻断|不能提交|解释|怎么办|需要哪些|Mapping/i.test(q),drafts=/创建|提单|填单|补充.*(?:发布|单)/.test(q);
 const intent=f.draftIntentRequest===q?'draft':asks&&drafts?'mixed':asks?'explain':drafts?'draft':null;
 const allowed=intent==='mixed'?c.intents.includes('draft')&&c.intents.includes('explain'):c.intents.includes(intent);
 const matches=pattern=>[...new Set((q.match(pattern)||[]).map(x=>x.toUpperCase()))];
 const ids=matches(/(?<![A-Z0-9_])MAT-[A-Z0-9_.-]+/gi),models=matches(/(?<![A-Z0-9_])IPC-[A-Z0-9_.-]+/gi),projects=matches(/(?<![A-Z0-9_])PRJ-[A-Z0-9_.-]+/gi),software=matches(/(?<![A-Z0-9_])SW-[A-Z0-9_.-]+/gi),versions=matches(/(?<![A-Z0-9_])V\d[A-Z0-9_.-]*/gi);
 const invalidProjects=projects.filter(x=>!/^PRJ-\d{4}-[A-Z]$/.test(x)),invalidSoftware=software.filter(x=>!/^SW-\d+$/.test(x)),invalidVersions=versions.filter(x=>!/^V\d+(?:\.\d+)+$/.test(x));
 const modelMatches=catalog.filter(m=>models.includes(m.modelCode)||q.includes(m.materialName));
 const explicit=catalog.filter(m=>ids.includes(m.materialCode)),resolved=f.resolvedMaterial?.request===q&&f.resolvedMaterial.id===v.materialCode;
 const material=v.materialCode||(ids.length===1?ids[0]:modelMatches.length===1?modelMatches[0].materialCode:'');
 const known=catalog.find(m=>m.materialCode===material);
 const candidates=[...new Map([...explicit,...modelMatches,...(!material&&/摄像机|整机|型号/.test(q)?catalog:[])].map(m=>[m.materialCode,m])).values()];
 const slot=(key,list)=>String(v[key]||'').trim()||(list.length===1?list[0]:'');
 const values={materialCode:known?material:'',projectCode:slot('projectCode',projects),softwareCode:slot('softwareCode',software),version:slot('version',versions),submitDepartment:v.submitDepartment||(/后端业务部/.test(q)&&!/前端业务部/.test(q)?'后端业务部':/前端业务部/.test(q)&&!/后端业务部/.test(q)?'前端业务部':''),subject:v.subject||q.match(/(?:主题|题目)(?:为|是)?[：:]?[“"「]([^”"」]+)[”"」]/)?.[1]||''};
 const unknownMaterial=ids.some(id=>!catalog.some(m=>m.materialCode===id))||models.some(id=>!catalog.some(m=>m.modelCode===id));
 if(!intent||!allowed||invalidProjects.length||invalidSoftware.length||invalidVersions.length||unknownMaterial&&!resolved)return result('unknown',intent,values,[],!intent?'表达不在受控业务词典内；当前只支持明确提单和发布规则问题。':!allowed?'此意图未启用，请改为支持的业务任务。':invalidProjects.length||invalidSoftware.length||invalidVersions.length?'编号或版本完整格式不合法；不能截断后缀当作另一个已登记身份。请纠正原文。':'编号 / 型号不在本地样例中，不能推测不存在的本体实例。');
 const conflict=!resolved&&(ids.length>1||models.length>1||explicit.length&&modelMatches.length&&explicit.some(m=>!modelMatches.some(x=>x.materialCode===m.materialCode))||v.materialCode&&ids.length&&!ids.includes(v.materialCode));
 if(conflict||candidates.length>1&&!material)return result('ambiguous',intent,{...values,materialCode:''},candidates,'编号、型号或多个实例有歧义 / 冲突，请明确选择本体身份；不取第一条。');
 const ambiguousSlots=[['projectCode',projects],['softwareCode',software],['version',versions]].filter(([key,list])=>list.length>1&&!(sceneFlowRequest(f.resolvedSlots?.[key]?.request)===q&&f.resolvedSlots[key].value===v[key]));
 if(ambiguousSlots.length)return result('ambiguous',intent,values,[],`上下文冲突：${ambiguousSlots.map(([key])=>key).join('、')} 有多个值；请在关键字段明确填写，不挑第一项。`);
 return result('recognized',intent,values,[],'通过受控关键词和确切编号匹配（非模型理解），已识别任务；权威事实仍需精确校验。');
}
function sceneFlowBlockUses(s,b,field,ontology){return b.fields.some(f=>f.key===field)&&(!!b.object||(s.bindings[b.id]||[]).some(m=>m.ontology===ontology));}
function sceneFlowRequired(s){
 const blocks=Object.values(workflowScene(s).blocks);return [['projectCode','项目编号'],['subject','发布主题'],['submitDepartment','提交业务部门'],...(blocks.some(b=>sceneFlowBlockUses(s,b,'materialCode','Material.materialCode'))?[['materialCode','整机物料编号']]:[]),...(blocks.some(b=>sceneFlowBlockUses(s,b,'softwareCode','Software.softwareCode'))?[['softwareCode','软件物料编号'],['version','软件版本']]:[])];
}
function sceneFlowAnswer(s){
 const d=state.drawer,f=d.flow,w=workflowScene(s),rules=sceneFlowExecutionScene(s).workflow.rules.filter(r=>r.enabled);
 const evidence=rules.map(r=>({source:'当前配置规则（本地，非单据实时事实）',location:r.id,version:`场景修订 ${s.revision}`,requirement:r.assertions.map(a=>ruleText(s,r,a)).join('；'),message:r.message}));
 f.answer={answer:'发布提交需要满足以下当前规则要求。没有绑定已保存单据和实时校验，不能断言某单当前阻断或通过；问题回答不会自动生成提单。',evidence};
 f.stage='answer';f.inputStamp=JSON.stringify(d.draft);sceneFlowHistory('assistant',f.answer.answer);
}
function sceneFlowContinueDraft(){
 const s=sceneFlowGuard(),d=state.drawer;if(!s||d.flow.stage!=='answer'||d.flow.inputStamp!==JSON.stringify(d.draft)||!sceneFlowConfig(s).intents.includes('draft'))return errorDrawer('请先得到当前问题回答，再明确选择继续提单。');
 d.flow.draftIntentRequest=sceneFlowRequest(d.draft.request);sceneFlowHistory('user','明确确认：使用当前已知信息继续本地提单测试。');sceneFlowRecognize();
}
function sceneFlowRecognize(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow,retries=f.retries,recognition=sceneFlowRecognition(s,d.draft);sceneFlowInvalidate(d,true);f.retries=retries;
 sceneFlowHistory('user',d.draft.request||'（未输入）');Object.assign(d.draft,recognition.values);f.branch=recognition.branch;f.intent=recognition.intent;f.candidates=recognition.candidates;f.stage='clarify';sceneFlowHistory('assistant',recognition.message);
 f.missing=sceneFlowRequired(s).filter(([key])=>!String(d.draft[key]||'').trim());
 if(f.branch!=='recognized')return drawOverlay();
 if(['explain','mixed'].includes(f.intent)){sceneFlowAnswer(s);return drawOverlay();}
 if(d.draft.softwareCode&&!['SW-20260032','SW-20260077'].includes(d.draft.softwareCode)){f.missing.push(['softwareCode','有效的软件样例编号']);sceneFlowHistory('assistant','软件编号不在已登记本地样例中，不能使用模拟器编造的返回身份。');}
 if(f.missing.length){sceneFlowHistory('assistant','还需明确：'+f.missing.map(([,label])=>label).join('、')+'。请补充后再次识别；未填信息不会用样例默认值偷偷提交。');return drawOverlay();}
 try{
   const document=sceneFlowContext(s,()=>workflowDemoDocument(s,'all-pass'));
   for(const b of Object.values(workflowScene(s).blocks))for(const row of b.many?document[b.path]:[document[b.path]]){
     if(!b.parent){Object.assign(row,{projectCode:d.draft.projectCode,submitDepartment:d.draft.submitDepartment});if(b.fields.some(f=>f.key==='releaseSubject'))row.releaseSubject=d.draft.subject;}
     if(sceneFlowBlockUses(s,b,'materialCode','Material.materialCode'))row.materialCode=d.draft.materialCode;
     if(sceneFlowBlockUses(s,b,'softwareCode','Software.softwareCode'))Object.assign(row,{softwareCode:d.draft.softwareCode,version:d.draft.version});
   }
   // 业务行身份与共享物料身份分开；样例引用指向当前副本中的确切行，不沿用静态 RI/MO 默认值。
   const blocks=Object.values(workflowScene(s).blocks),main=blocks.find(b=>!b.parent),orderId=document[main.path][main.keyField];
   for(const b of blocks)for(const row of b.many?document[b.path]:[document[b.path]]){
     if(b.parent&&b.object)row.mainOrderId=orderId;
     const p=b.object?sceneFlowContext(s,()=>obj(b.object)?.props.find(p=>p.key)):null;for(const binding of s.bindings[b.id]||[])if(binding.ontology===`${b.object}.${p?.id}`)row[binding.target.split('.').at(-1)]=row[b.keyField];
   }
   const items=blocks.filter(b=>b.object==='ReleaseItem').flatMap(b=>document[b.path]),modules=blocks.filter(b=>b.object==='ModuleOrder').flatMap(b=>document[b.path]);
   for(const b of blocks.filter(b=>b.object==='Mapping'))for(const row of b.many?document[b.path]:[document[b.path]]){
     if(items.length===1&&modules.length===1){const itemBlock=blocks.find(b=>b.object==='ReleaseItem'),moduleBlock=blocks.find(b=>b.object==='ModuleOrder');row.releaseItemId=items[0][itemBlock.keyField];row.moduleOrderId=modules[0][moduleBlock.keyField];row.softwareCode=modules[0].softwareCode;}
   }
   const errors=workflowDocumentErrors(s,document);if(errors.length)throw Error(errors.join('；'));
   f.userValues={};f.systemConfirmed=false;
   for(const b of Object.values(workflowScene(s).blocks))for(const row of b.many?document[b.path]:[document[b.path]])for(const field of b.fields){
     if(field.mappingMode==='user'&&field.key!==b.keyField){row[field.key]='';f.userValues[b.id+'.'+field.key]='';}
     else if(field.mappingMode==='system'&&!field.technical&&field.key!==b.keyField){row[field.key]=field.sample!==undefined?structuredClone(field.sample):field.type==='数字'?0:field.type==='布尔'?false:field.type==='日期'?'2026-11-25':'模拟系统生成：'+field.key;}
   }
   f.document=document;f.generated=sceneFlowContext(s,()=>workflowSuggestions(s,document));f.generatedSeal=JSON.stringify(f.generated);f.inputStamp=JSON.stringify(d.draft);f.confirmations={};f.stage='mapping';
   sceneFlowHistory('assistant',`已按当前 ${Object.keys(s.bindings).length} 个区块生成 ${f.generated.suggestions.length} 项字段建议。来源、当前值和保存位置可见；确认仅写入本地测试副本。`);
 }catch(e){d.error=e.message;f.generated=null;}
 drawOverlay();
}
function sceneFlowChooseMaterial(el){
 if(!sceneFlowGuard())return;const d=state.drawer,f=d.flow,id=el.dataset.id;
 const permitted=f.candidates.some(m=>m.materialCode===id)||f.branch==='unknown'&&sceneFlowConfig(scene()).unknown==='manual'&&catalog.some(m=>m.materialCode===id);
 if(!permitted)return errorDrawer('请选择当前澄清列表中的有效本体实例。');
 d.draft.materialCode=id;if(f.branch==='unknown')d.draft.request='创建发布提单：'+d.draft.request;f.resolvedMaterial={request:sceneFlowRequest(d.draft.request),id};
 sceneFlowHistory('user','澄清选择物料 '+id);sceneFlowRecognize();
}
function sceneFlowGeneratedCurrent(){
 const d=state.drawer,f=d?.flow;if(!f?.generated||f.inputStamp!==JSON.stringify(d.draft)||f.generatedSeal!==JSON.stringify(f.generated))return false;return true;
}
function sceneFlowOrdinaryFields(s){return Object.values(workflowScene(s).blocks).flatMap(b=>b.fields.filter(field=>field.mappingMode==='user'||field.mappingMode==='system').filter(field=>!field.technical&&field.key!==b.keyField).map(field=>({block:b,field,id:b.id+'.'+field.key})));}
function sceneFlowConfirmed(){const f=state.drawer.flow,s=scene();return sceneFlowGeneratedCurrent()&&f.generated.suggestions.every((r,i)=>['current','suggested'].includes(f.confirmations[i])&&!r.blocking)&&(!sceneFlowOrdinaryFields(s).length||f.systemConfirmed);}
function sceneFlowConfirmField(el){
 if(!sceneFlowGuard())return;const f=state.drawer.flow;if(!sceneFlowGeneratedCurrent())return errorDrawer('输入或字段建议已变化，请重新识别生成。');
 const i=Number(el.dataset.index),r=f.generated.suggestions[i],choice=el.dataset.choice;
 if(!r||r.blocking||!['current','suggested'].includes(choice)||choice==='current'&&(r.current===undefined||r.current===null||r.current===''))return errorDrawer('该字段尚有来源缺失 / 冲突或无有效现值，请先处理映射和取数来源。');
 sceneFlowInvalidate(state.drawer);f.confirmations[i]=choice;f.stage=sceneFlowConfirmed()?'ready-check':'mapping';drawOverlay();
}
function sceneFlowConfirmAll(){
 if(!sceneFlowGuard())return;const f=state.drawer.flow;if(!sceneFlowGeneratedCurrent())return errorDrawer('输入或字段建议已变化，请重新识别生成。');
 if(f.generated.suggestions.some(r=>r.blocking))return errorDrawer('有来源缺失或冲突，不可整单确认。请先处理场景映射 / 来源。');
 sceneFlowInvalidate(state.drawer);f.confirmations=Object.fromEntries(f.generated.suggestions.map((r,i)=>[i,r.status==='保留现值，待确认差异'?'current':'suggested']));f.stage='ready-check';sceneFlowHistory('user','已复核并确认所有字段建议；差异项保留当前用户值。');drawOverlay();
}
function sceneFlowOrdinaryChange(el){
 const d=state.drawer;if(d?.type!=='sceneFlow'||el.dataset.flowUser===undefined)return;const s=sceneFlowGuard();if(!s||!sceneFlowGeneratedCurrent())return;
 const item=sceneFlowOrdinaryFields(s).find(x=>x.id===el.dataset.flowUser);if(!item||item.field.mappingMode!=='user')return;
 sceneFlowInvalidate(d);d.flow.userValues??={};d.flow.userValues[item.id]=el.value;d.flow.systemConfirmed=false;d.dirty=true;
}
function sceneFlowConfirmOrdinary(){
 const s=sceneFlowGuard();if(!s||!sceneFlowGeneratedCurrent())return;const f=state.drawer.flow;
 for(const {field,id}of sceneFlowOrdinaryFields(s).filter(x=>x.field.mappingMode==='user')){
  const v=f.userValues?.[id]??'';if(field.required&&!String(v).trim())return errorDrawer(`请填写 ${field.label}。`);
  if(v!==''&&(field.type==='数字'&&!Number.isFinite(Number(v))||field.type==='布尔'&&!['true','false'].includes(v)||field.type==='日期'&&!/^\d{4}-\d{2}-\d{2}$/.test(v)))return errorDrawer(`${field.label} 类型不正确。`);
 }
 f.systemConfirmed=true;state.drawer.error='';drawOverlay();
}
function sceneFlowPayload(s){
 const f=state.drawer.flow,payload=structuredClone(f.generated.payload);
 for(const {block,field,id}of sceneFlowOrdinaryFields(s).filter(x=>x.field.mappingMode==='user')){
  const v=f.userValues?.[id]??'',value=v===''?undefined:field.type==='数字'?Number(v):field.type==='布尔'?v==='true':v;
  for(const row of block.many?payload[block.path]:[payload[block.path]]){if(value===undefined)delete row[field.key];else row[field.key]=value;}
 }
 for(const [i,r]of f.generated.suggestions.entries()){
   const match=r.target.match(/^(.+)\[([^\]]+)\]\.([^.]+)$/);if(!match)throw Error('建议定位不合法。');
   const [,path,identity,key]=match,b=Object.values(workflowScene(s).blocks).find(b=>b.path===path);if(!b)throw Error('建议区块不存在。');
   const row=(b.many?payload[path]:[payload[path]]).find(row=>String(row[b.keyField])===identity);if(!row)throw Error('具体业务行已变化。');
   const value=f.confirmations[i]==='current'?r.current:r.suggested;row[key]=structuredClone(value);
 }
 return payload;
}
function sceneFlowExecutionStamp(s,payload){const d=state.drawer,f=d.flow;return JSON.stringify([d.sceneId,d.blockId,sceneFlowFingerprint(s),d.draft,payload,f.authority,f.failure,f.generatedSeal,f.confirmations]);}
// 场景流安全校验不可关闭：发布类场景固定执行目录资料、DI 和最小系统底线，再叠加自定义规则。
function sceneFlowExecutionScene(s){
 const copy=structuredClone(s),w=workflowScene(copy),blocks=Object.values(w.blocks);
 if(sceneKind(s)==='release')for(const rule of releaseRuleTemplates()){
   const b=rule.id==='safety-di'?blocks.find(b=>!b.parent):rule.id==='catalog-docs'?blocks.find(b=>b.fields.some(f=>f.key==='materialCode')):blocks.find(b=>b.fields.some(f=>f.key==='softwareCode'));
   if(!b)throw Error('缺少发布安全校验所需区块，请先补齐结构。');
   // 底线检查不替换用户额外的、更严格的启用条件；同 ID 自定义规则另行保留执行。
   w.rules=w.rules.map(r=>r.id===rule.id?{...r,id:`${r.id}-configured`}:r);w.rules.push({...rule,scope:b.id,enabled:true,level:'阻断'});
 }
 return copy;
}
function sceneFlowExecute(s,payload){return sceneFlowContext(s,()=>{
 const result=executeWorkflow(sceneFlowExecutionScene(s),payload,state.drawer.flow.authority,'submit',state.drawer.flow.failure);
 if(result.errors.length)return result;
 const blocks=Object.values(workflowScene(s).blocks),main=blocks.find(b=>!b.parent),order=payload[main.path],orderId=order[main.keyField];
 const add=(name,target,pass,detail,unknown=false,evidence=[])=>result.checks.push({name,target,status:unknown?'未知':pass?'通过':'阻断',level:'阻断',detail,evidence});
 const rows=b=>b.many?payload[b.path]:[payload[b.path]];
 for(const b of blocks)for(const row of rows(b)){
   const target=`${b.path}[${row[b.keyField]}]`;
   if(b.parent&&b.object)add('业务行主单归属',target,row.mainOrderId===orderId,'子行必须属于当前测试主单；不能跨单引用。');
   for(const field of b.fields){if(field.mappingMode==='system')continue;const binding=(s.bindings[b.id]||[]).find(m=>m.target===scenePrefix(s,b.id)+field.key),[oid,pid]=(binding?.ontology||'').split('.'),property=obj(oid)?.props.find(p=>p.id===pid),value=row[field.key];if(field.required||binding?.required||property?.required)add('必填字段完整性',target+'.'+field.key,value!==undefined&&value!==null&&String(value).trim()!==''&&value!=='未知',`必填字段 ${field.label} 不能以空值 / 未知提交。`);}
   for(const binding of s.bindings[b.id]||[]){const [oid,pid]=binding.ontology.split('.'),p=obj(oid)?.props.find(p=>p.id===pid),key=binding.target.split('.').at(-1);if(p?.key&&oid===b.object)add('区块唯一编号与本体身份',target,row[key]===row[b.keyField],'区块唯一编号必须等于对应本体主键，业务行身份不以物料编号代替。');}
   if(row.materialCode&&sceneFlowBlockUses(s,b,'materialCode','Material.materialCode')){
     if(workflowScene(s).instanceSource!=='manual'){
       const call=result.calls.find(c=>c.capability===s.master&&c.params?.materialCode===row.materialCode),records=call?.normalized?.filter(r=>r.properties?.materialCode===row.materialCode)||[];
       add('整机本体精确身份',target,records.length===1&&records[0].identity===`Material:${row.materialCode}`,'取数必须返回唯一且确切的当前物料身份；不能用 ok 或第一条记录代替核验。',!call?.ok||!records.length);
     }
   }
   if(b.object==='ModuleOrder'){
     const call=callCapability('software.getPackage',{softwareCode:row.softwareCode},state.drawer.flow.failure);result.calls.push(call);
     const records=(call.normalized||[]).filter(r=>r.properties?.softwareCode===row.softwareCode);
     add('软件本体精确身份与版本',target,['SW-20260032','SW-20260077'].includes(row.softwareCode)&&records.length===1&&records[0].identity===`Software:${row.softwareCode}`&&records[0].properties.version===row.version,'软件编号及版本必须与唯一来源记录一致；未登记的软件不能由模拟器虚构通过。',!call.ok,records.map(r=>({source:'software.getPackage',actual:r.properties,expected:{softwareCode:row.softwareCode,version:row.version}})));
   }
   if(b.object==='Mapping'){
     const items=blocks.filter(x=>x.object==='ReleaseItem').flatMap(x=>rows(x).map(r=>({block:x,row:r}))).filter(x=>String(x.row[x.block.keyField])===String(row.releaseItemId));
     const modules=blocks.filter(x=>x.object==='ModuleOrder').flatMap(x=>rows(x).map(r=>({block:x,row:r}))).filter(x=>String(x.row[x.block.keyField])===String(row.moduleOrderId));
     add('Mapping 具体业务行引用',target,items.length===1&&modules.length===1&&items[0].row.mainOrderId===orderId&&modules[0].row.mainOrderId===orderId&&(!row.softwareCode||row.softwareCode===modules[0].row.softwareCode),'Mapping 必须精确引用同一主单的发布行 / 模块行并匹配软件，不允许按共享物料编码关联。');
   }
 }
 result.passed=result.checks.every(c=>c.status==='通过'||c.status==='跳过'||c.status==='阻断'&&c.level==='警告');return result;
});}
function sceneFlowBlockers(result){
 return result.checks.filter(c=>c.status==='未知'||c.status==='阻断').map(c=>{
 let fix='',guide='按对应字段、业务行和事实来源处理，修正后重新校验；不支持跳过检查。';
 if(c.status==='未知')guide='检查取数连接、查询参数和记录编号；超时可在重试次数内明确模拟查询恢复。未知不能视为通过。';
 else if(c.rule==='catalog-docs'&&c.evidence?.some(e=>e.field==='Product.images'&&e.status==='不满足')){fix='images';guide='由商品资料维护人在对应产品型号补齐图片，再查询确认。此处仅允许补充本地图片样例。';}
 else if(c.rule==='safety-di'){fix='di';guide='请项目安全负责人处理安全 DI，待权威系统实际归零后重新取数。按钮不会解决真实 DI；仅可显式模拟外部事实更新。';}
 else if(c.rule==='minimum-system'){fix='minimum';guide='在软管完成对应项目 / 软件编码 / 版本的最小系统发布后重新查询。此处不能触发真实发布，仅可显式模拟事实更新。';}
 return {...c,fix,guide};
 });
}
function sceneFlowValidate(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow;
 if(!sceneFlowConfirmed())return errorDrawer('请先完成澄清、生成有效字段建议，并确认每项字段。');
 try{const payload=sceneFlowPayload(s),result=sceneFlowExecute(s,payload);sceneFlowInvalidate(d);f.payload=payload;f.result=result;f.resultStamp=sceneFlowExecutionStamp(s,payload);f.blockers=sceneFlowBlockers(result);f.stage=result.passed?'review':'blocked';
   sceneFlowHistory('assistant',result.passed?'已执行提交级本地校验。当前事实满足，需复核单据；提交时仍会重新终检。':`校验未通过：${result.errors.length} 项结构错误，${f.blockers.length} 项阻断 / 未知。处理建议不能替代事实重检。`);
 }catch(e){sceneFlowInvalidate(d);d.error=e.message;}drawOverlay();
}
function sceneFlowResultCurrent(s){const f=state.drawer.flow;if(!sceneFlowConfirmed()||!f.result)return false;try{return f.resultStamp===sceneFlowExecutionStamp(s,sceneFlowPayload(s));}catch{return false;}}
function sceneFlowReview(){
 const s=sceneFlowGuard();if(!s)return;const f=state.drawer.flow;
 if(!sceneFlowResultCurrent(s)||!f.result.passed)return errorDrawer('校验未通过或已过期，请重新校验，不能跳过阻断。');
 f.reviewStamp=f.resultStamp;sceneFlowHistory('user','已复核提交副本、字段来源、具体业务行和当前本地校验证据。');state.drawer.error='';drawOverlay();
}
function sceneFlowSubmit(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow;
 if(f.receipt&&sceneFlowResultCurrent(s))return toast('本地测试已完成，相同提交不重复执行。');
 if(!sceneFlowResultCurrent(s)||!f.result.passed||f.reviewStamp!==f.resultStamp)return errorDrawer('请完成有效校验和人工复核；输入、配置或外部事实变化后必须重新检查。');
 try{
   const payload=sceneFlowPayload(s),finalResult=sceneFlowExecute(s,payload);f.finalResult=finalResult;
   if(!finalResult.passed){f.result=finalResult;f.blockers=sceneFlowBlockers(finalResult);f.reviewStamp=null;f.stage='blocked';return errorDrawer('重新终检未通过，模拟提交未执行，请处理最新阻断。');}
   const key=JSON.stringify([s.id,d.fingerprint,payload]);let receipt=sceneFlowReceipts.get(key);
   if(!receipt){receipt={id:`FLOW-TEST-${String(++sceneFlowSequence).padStart(4,'0')}`,mode:'配置测试',sceneId:s.id,at:now(),businessSubmitted:false};sceneFlowReceipts.set(key,receipt);
     log('场景流配置测试',s.name,'测试通过','人工确认 → 校验 → 复核 → 再终检；未提交真实单据，不计真实执行成功。');state.logs[0].evidence={receipt:structuredClone(receipt),payload:structuredClone(payload),checks:structuredClone(finalResult.checks)};
   }
   f.receipt=structuredClone(receipt);f.stage='submitted';sceneFlowHistory('assistant',`本地模拟提交完成（${receipt.id}）。没有调用业务后端、写入数据库或新增真实执行成功记录。`);d.error='';drawOverlay();
 }catch(e){f.reviewStamp=null;d.error=e.message;drawOverlay();}
}
function sceneFlowExternalTargets(s,kind){
 const f=state.drawer.flow;if(!sceneFlowResultCurrent(s)||f.result.passed||!f.blockers.some(b=>b.fix===kind))return [];
 const fields={images:'Product.images',di:'Project.safetyDI',minimum:'Minimum.status'},targets=[];
 for(const blocker of f.blockers.filter(b=>b.fix===kind&&b.status==='阻断'))for(const e of blocker.evidence||[]){
   if(e.field!==fields[kind]||e.status!=='不满足'||!e.params)continue;
   if(kind==='images'&&e.source==='demo.productDocuments'&&e.params.modelCode)targets.push(e.params.modelCode);
   if(kind==='di'&&e.source==='demo.safetyDI'&&e.params.projectCode)targets.push(e.params.projectCode);
   if(kind==='minimum'&&e.source==='demo.minimumSystem'&&e.params.projectCode&&e.params.softwareCode&&e.params.version)targets.push(`${e.params.projectCode}|${e.params.softwareCode}|${e.params.version}`);
 }
 return [...new Set(targets)];
}
function sceneFlowSimulateExternal(el){
 const s=sceneFlowGuard();if(!s)return;const f=state.drawer.flow,kind=el.dataset.kind,targets=sceneFlowExternalTargets(s,kind);if(!targets.length)return errorDrawer('没有与当前有效校验对应的可模拟事实，不能任意改变阻断。');
 f.pendingExternal={kind,targets,stamp:f.resultStamp,evidence:f.blockers.filter(b=>b.fix===kind).map(b=>({rule:b.rule,target:b.target,evidence:b.evidence.filter(e=>e.status==='不满足')}))};drawOverlay();
}
function sceneFlowApplyExternal(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow,p=f.pendingExternal;
 if(!p||p.stamp!==f.resultStamp||JSON.stringify(p.targets)!==JSON.stringify(sceneFlowExternalTargets(s,p.kind)))return errorDrawer('外部事实模拟确认已过期，请重新校验。');
 for(const id of p.targets){if(p.kind==='images')f.authority.products[id].images=['模拟补充：本地产品图片样例.png'];if(p.kind==='di')f.authority.projects[id].safetyDI=0;if(p.kind==='minimum')f.authority.minimumSystems[id].status='已发布';}
 sceneFlowInvalidate(d);f.stage='ready-check';sceneFlowHistory('system',`非真实处理：仅更新本次测试的 ${p.kind==='images'?'产品图片':p.kind==='di'?'安全 DI = 0':'最小系统已发布'} 样例事实（${p.targets.join('、')}），未操作外部系统；请重新校验。`);drawOverlay();
}
function sceneFlowRetry(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow,max=Number(sceneFlowConfig(s).maxRetries);
 const recognitionFailure=['unknown','ambiguous'].includes(f.branch)&&!f.generated,queryTimeout=sceneFlowResultCurrent(s)&&!f.result.passed&&f.failure==='超时';
 if(!recognitionFailure&&!queryTimeout)return errorDrawer('当前没有可重试的识别失败或查询超时。');if(f.retries>=max)return errorDrawer('已达到失败重试上限，请补充信息或在来源系统处理后重新开始。');
 f.retries++;if(queryTimeout){f.failure='正常';sceneFlowHistory('system','模拟查询恢复：仅将本地超时故障替身恢复正常，没有真实网络重连。');sceneFlowValidate();}else{sceneFlowHistory('system',`识别重试 ${f.retries}/${max}：相同输入使用相同词典，不凭重试捏造本体。`);sceneFlowRecognize();}drawOverlay();
}
function sceneFlowOpenSettings(){
 const s=scene();if(!s||workflowScene(s).type!=='draft')return;if(typeof sceneReleaseCanEdit==='function'&&!sceneReleaseCanEdit(s))return toast('请先点击场景的“编辑”。');
 if(typeof objectReleasePins==='function')objectReleasePins(s);openDrawer('sceneFlowSettings',sceneFlowConfig(s),{sceneId:s.id,blockId:s.selectedBlock,fingerprint:sceneFlowFingerprint(s)});
}
function sceneFlowSaveSettings(){
 const s=sceneFlowGuard();if(!s)return;if(typeof sceneReleaseCanEdit==='function'&&!sceneReleaseCanEdit(s))return errorDrawer('请先进入场景编辑。');
 const c=state.drawer.draft,error=sceneFlowConfigError(c);if(error)return errorDrawer(error);
 workflowScene(s).sceneFlow={intents:[...new Set(c.intents)],unknown:c.unknown,clarification:c.clarification,maxRetries:Number(c.maxRetries),confirmation:c.confirmation,safety:'mandatory'};
 workflowInvalidate();closeOverlay(true);render();toast('场景流策略已保存；安全校验和提交终检始终生效');
}
function sceneFlowSettingsDrawer(){const c=state.drawer.draft;return frame('配置智能提单场景流','只保存当前场景策略；不提供关闭安全校验或跳过人工确认的选项。',`
 <fieldset class="inset-panel"><legend>支持的用户意图</legend>${sceneFlowIntents.map(([id,label])=>`<label class="check-row"><input type="checkbox" data-scene-flow-intent="${id}" ${c.intents.includes(id)?'checked':''}>${label}</label>`).join('')}</fieldset>
 <div class="form-grid section-gap">${field('无法识别时','unknown',c.unknown,'select',[['clarify','追问关键信息'],['manual','提供人工本体选择入口']])}${field('澄清形式','clarification',c.clarification,'select',[['candidates','候选卡片 + 关键信息'],['fields','只追问编号与关键字段']])}${field('失败最多重试','maxRetries',c.maxRetries,'select',[[0,'不重试'],[1,'1 次'],[2,'2 次'],[3,'3 次']])}${field('字段确认模式','confirmation',c.confirmation,'select',[['per-field','逐字段确认（可保留用户值）'],['summary','整单复核后确认（差异保留现值）']])}</div>
 <div class="section-gap">${inf('不可关闭：本体/业务行身份校验、来源未知阻断、发布安全底线、人工复核、提交前重新终检和提交防重。纯本地确定性模拟，不连接 AI 或后端。')}</div>`,btn('保存场景流策略','scene-flow-save-settings','primary','check'),true);}
function sceneFlowStageId(stage){return ['ready-check','blocked'].includes(stage)?'check':stage==='answer'?'recognize':sceneFlowStages.some(([id])=>id===stage)?stage:'input';}
function sceneFlowStageLabel(stage){return ({'ready-check':'待执行校验',blocked:'校验阻断',answer:'问题解释'})[stage]||sceneFlowStages.find(([id])=>id===stage)?.[1]||'用户输入';}
function sceneFlowSelectStage(el){
 const stage=el?.dataset?.stage;if(!sceneFlowStages.some(([id])=>id===stage))return;
 const d=state.drawer;
 if(d?.type==='sceneFlow'&&d.flow){d.flow.viewStage=stage;drawOverlay();return;}
 if(d||!scene()||workflowScene(scene()).type!=='draft')return;
 sceneFlowUI.stage=stage;render();
}
function sceneFlowStageHTML(stage,viewStage=stage,scope='page'){
 const selected=sceneFlowStageId(viewStage),actual=sceneFlowStageId(stage),prefix=`scene-flow-${scope}`;
 return `<div class="scene-flow-stage-status row section-gap">${scope==='drawer'?pill('真实执行阶段：'+sceneFlowStageLabel(stage),'blue'):pill('配置浏览 · 不执行流程')}${pill('查看阶段：'+sceneFlowStageLabel(selected))}</div><div class="scene-flow-stages" role="tablist" aria-label="提单流程阶段详情" style="display:flex;gap:8px;flex-wrap:wrap">${sceneFlowStages.map(([id,label],i)=>btn(`${i+1} · ${label}`,'scene-flow-stage',`sm scene-flow-stage-tab${id===selected?' active':''}`,'',`data-stage="${id}" role="tab" aria-selected="${id===selected}" id="${prefix}-tab-${id}" aria-controls="${prefix}-panel"${scope==='drawer'&&id===actual?' aria-current="step"':''}`)).join('')}</div>`;
}
function sceneFlowStageSnapshotHTML(s,id){
 const d=state.drawer,f=d.flow,empty=text=>`<p class="tiny muted section-gap">${esc(text)}（浏览本阶段不会自动执行）</p>`;
 let content='';
 if(id==='input')content=`<dl class="kv section-gap"><dt>当前任务 / 问题</dt><dd>${esc(d.draft.request||'尚未输入')}</dd>${sceneFlowRequired(s).map(([key,label])=>`<dt>${esc(label)} · ${esc(key)}</dt><dd>${esc(d.draft[key]||'缺失 / 尚未提取')}</dd>`).join('')}</dl>`;
 else if(id==='recognize')content=f.branch?`<dl class="kv section-gap"><dt>匹配结果</dt><dd>${esc(({recognized:'唯一 / 已识别',ambiguous:'多候选 / 冲突',unknown:'未知 / 不支持'})[f.branch]||f.branch)}</dd><dt>意图</dt><dd>${esc(({draft:'提单',explain:'问答',mixed:'混合'})[f.intent]||'未确定')}</dd></dl>${f.answer?`<p>${esc(f.answer.answer)}</p>${jsonView(f.answer.evidence)}`:''}`:empty('尚未识别；先在执行区识别任务');
 else if(id==='clarify')content=`<dl class="kv section-gap"><dt>候选</dt><dd>${esc(f.candidates.map(m=>m.materialCode+' · '+m.materialName).join('、')||'暂无候选')}</dd><dt>缺失关键字段</dt><dd>${esc(f.missing.map(([,label])=>label).join('、')||'暂无已识别缺失项')}</dd><dt>已用重试</dt><dd>${f.retries} / ${sceneFlowConfig(s).maxRetries}</dd></dl>`;
 else if(id==='mapping')content=f.generated?`<div class="table-wrap section-gap"><table class="config-table"><thead><tr><th>英文字段 / 本体属性</th><th>现值 → 建议值</th><th>来源 / 用户确认</th></tr></thead><tbody>${f.generated.suggestions.map((r,i)=>`<tr><td>${esc(r.target)}<small>${esc(r.ontology)}</small></td><td>${esc(sceneFlowDisplay(r.current))} → ${esc(sceneFlowDisplay(r.suggested))}</td><td>${esc(r.source)}<small>${esc(({current:'保留现值',suggested:'采用建议'})[f.confirmations[i]]||'待用户确认')}</small></td></tr>`).join('')}</tbody></table></div>`:empty('尚未生成字段建议；先澄清任务与关键字段');
 else if(id==='check')content=f.result?jsonView({passed:f.result.passed,errors:f.result.errors,checks:f.result.checks,calls:f.result.calls}):empty('尚无校验结果；先完成字段确认并在执行区校验');
 else if(id==='review')content=f.payload?`${pill(f.reviewStamp?'已有复核记录；提交仍核验有效性':'待人工复核','blue')}${jsonView({content:f.payload,evidence:f.result?.checks||[]})}`:empty('尚无待复核内容与校验证据');
 else if(id==='submitted')content=f.receipt?jsonView({receipt:f.receipt,finalChecks:f.finalResult?.checks||[]}):empty('尚无模拟提交回执；有效校验与人工复核后才可终检提交');
 return `<div class="scene-flow-stage-snapshot section-gap"><h3>当前阶段内容 · 只读快照</h3>${content}</div>`;
}
function sceneFlowStageDetailHTML(s,stage,scope='page'){
 const id=sceneFlowStageId(stage),c=sceneFlowConfig(s),intents=sceneFlowIntents.filter(([key])=>c.intents.includes(key)).map(([,label])=>label).join('、'),unknown=c.unknown==='manual'?'人工本体选择入口 + 补充信息':'追问业务任务 / 对象编号',clarification=c.clarification==='candidates'?'候选卡片 + 关键信息':'只追问编号与关键字段',confirmation=c.confirmation==='per-field'?'逐字段确认；可保留用户修改':'整单复核后确认；差异保留现值';
 const details={
  input:{summary:'接受任务 / 问题，保留用户原文；提取字段并标记缺失，不偷偷用默认样例补齐。',nodes:[['接受任务 / 问题','业务任务与发布规则问题均可输入；问答不自动创建单据。'],['提取字段','提取项目、整机物料、软件、版本、提交部门和主题；用户补充值仍需核对。'],['识别缺失','按当前表单区块检查关键字段；必填缺失先追问，不能直接生成或提交。']],policies:[['支持意图',intents],['字段要求',sceneFlowRequired(s).map(([,label])=>label).join('、')],['输入变化','旧建议、确认、校验与复核失效，重新识别']]},
  recognize:{summary:'提单 / 问答 / 混合 / 不支持分别分流；匹配唯一 / 未知 / 多候选，绝不取第一条。',nodes:[['意图分流','提单进入字段建议；问答仅解释规则；混合先回答，由用户明确选择继续提单；不支持转澄清。'],['唯一匹配','确切编号 / 型号与受控本地词典匹配，展示身份及字段；并非真实 AI 理解。'],['未知 / 多候选','未知、格式非法或上下文冲突不编造身份；多个候选由用户选择确切记录。']],policies:[['支持意图',intents],['无法识别',unknown],['问答证据','仅当前规则要求与来源；不冒充实时单据诊断']]},
  clarify:{summary:'候选与关键字段由用户明确；支持纠错与有限重试，不凭重试改变未知事实。',nodes:[['确认候选','展示多个本体候选编号和中文名称；只能选择当前候选，不能自动挑第一项。'],['补充关键字段','追问项目、对象编号、软件版本、部门和主题；保留原文，明确冲突字段。'],['纠错 / 重试','修正输入后重新识别；同一表达使用同一词典，查询恢复仅为显式本地模拟。']],policies:[['无法识别',unknown],['澄清形式',clarification],['失败重试',`最多 ${c.maxRetries} 次；未知始终阻断`]]},
  mapping:{summary:'字段建议关联英文键与中文含义，展示现值、来源和保存位置；用户确认后才填入本地副本。',nodes:[['英文 / 中文字段','对照英文表单键、本体属性与中文业务名称，定位具体业务行和保存字段。'],['建议与差异','展示现值 → 建议值、来源和持久化位置；来源缺失 / 冲突先处理，不能整单盖过。'],['用户确认','采用建议或保留用户值；所有字段明确确认后才允许校验，保留值也不跳过规则。']],policies:[['字段确认',confirmation],['生效范围','仅本地测试副本，不修改场景映射配置或真实业务表单'],['放行条件','全部字段确认且无来源缺失 / 冲突；必填未知不可继续']]},
  check:{summary:'逐行执行规则和精确身份校验；未知阻断。附件、DI、最小系统的处理责任必须明确。',nodes:[['逐行检查','定位主单 / 子行业务身份、主单归属、Mapping 关联、必填与软件版本；不能仅凭查询 ok。'],['附件 / DI / 最小系统责任','图片附件由资料维护人补齐；安全 DI 由项目安全负责人处理；最小系统由软件负责人在软管完成对应项目 / 软件 / 版本发布。'],['未知阻断与重检','查询失败、来源未知和不满足均不可提交；显式模拟外部事实更新清除旧结果，必须独立重检。']],policies:[['安全底线','附件齐全、DI = 0、对应最小系统已发布；不可关闭'],['查询重试',`最多 ${c.maxRetries} 次；仅本地故障恢复样例`],['处理边界','处理建议不替代权威事实，真实外部系统不由本原型操作']]},
  review:{summary:'人工复核单据内容、字段来源、业务行与当前证据；通过校验不代表自动完成复核。',nodes:[['核对内容','检查本地提交副本、用户保留值、字段差异、具体业务行和关联身份。'],['核对证据','查看逐行判断、规则要求、实际值与查询来源；不把规则解释当实时事实。'],['明确复核','有效校验通过后由用户明确确认；输入、配置或事实变化必须重新校验和复核。']],policies:[['复核门禁','人工复核不可跳过；只认可当前有效结果'],['证据有效性','校验指纹与当前输入 / 配置 / 外部样例事实一致'],['提交准备','完成复核后仍需独立提交终检']]},
  submitted:{summary:'提交前重新终检；生产权限 / 版本校验与幂等必须由后端承接。本原型仅安全模拟，不提交业务单据。',nodes:[['重新终检','有效字段确认、校验与人工复核是前提；提交时再次逐行检查，新失败阻断并撤销旧复核。'],['权限 / 版本','体验只测试当前配置与锁定对象定义，不替换已发布配置；真实执行须由后端校验用户权限、配置版本和事实版本。'],['幂等 / 安全模拟','相同场景、配置和内容防重，回执明确标记配置测试；不连接 AI / 业务后端，不写数据库或新增真实执行成功。']],policies:[['提交控制','安全校验不可关闭；过期结果不可提交'],['幂等范围','本地会话 / 同内容测试防重；生产幂等由业务后端承接'],['执行模式','纯本地确定性安全模拟，businessSubmitted = false']]}
 },detail=details[id],prefix=`scene-flow-${scope}`;
 return `<section class="scene-flow-stage-detail inset-panel section-gap" id="${prefix}-panel" role="tabpanel" aria-labelledby="${prefix}-tab-${id}" data-flow-stage-panel="${id}"><div class="between"><h3>${esc(sceneFlowStageLabel(id))} · 节点详情</h3>${pill(scope==='drawer'?'仅查看，不推进执行':'详情 / 策略','blue')}</div><p class="section-gap">${esc(detail.summary)}</p><div class="workflow-cards section-gap">${detail.nodes.map(([title,text])=>`<article class="scene-flow-stage-node inset-panel"><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join('')}</div><dl class="kv section-gap">${detail.policies.map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>${scope==='drawer'?`<p class="tiny muted section-gap">阶段页签仅查看内容，不改变真实执行阶段；所有操作仍核验字段确认、有效校验与人工复核。</p>${sceneFlowStageSnapshotHTML(s,id)}`:''}</section>`;
}
function sceneFlowView(s){return `<div class="panel-body"><div class="between"><div><h3>场景流</h3><p class="tiny muted section-gap">点击阶段查看节点详情和当前策略。从用户表达开始，先澄清，再确认字段和证据；阻断必须处理事实，不能由建议覆盖。</p></div>${btn('配置场景流','scene-flow-settings','sm','settings')}</div>${sceneFlowStageHTML('input',sceneFlowUI.stage)}${sceneFlowStageDetailHTML(s,sceneFlowUI.stage)}
 <div class="section-gap">${inf('本地确定性模拟 · 没有真实 AI 或后端。体验入口仅测试当前配置及锁定对象定义，不调用已发布用户运行、不写真实单据、不计真实执行成功。')}</div><div class="row section-gap">${btn('体验完整提单流程（配置测试）','scene-flow-open','primary','play')}${btn('高级 JSON / 规则调试','workflow-test','','shield')}</div></div>`;}
function sceneFlowDisplay(value){return value===undefined?'（空）':typeof value==='object'?JSON.stringify(value):String(value);}
function sceneFlowOrdinaryHTML(s){
 const d=state.drawer;if(!d.flow.generated)return '';const fields=sceneFlowOrdinaryFields(s);if(!fields.length)return '';
 return `<div class="inset-panel section-gap"><h3>非映射字段 · 填写与确认</h3><p class="tiny muted section-gap">手动输入字段不会由 AI 代填；系统生成值仅为本地样例，真实生成由业务系统完成。</p><div class="form-grid section-gap">${fields.map(({block,field,id})=>field.mappingMode==='user'?`<div class="form-field"><label for="flow-user-${esc(id)}">${esc(block.label)} / ${esc(field.label)}${field.required?' *':''}</label>${field.type==='布尔'?`<select id="flow-user-${esc(id)}" data-flow-user="${esc(id)}">${options([['','请选择'],['true','是'],['false','否']],d.flow.userValues?.[id]||'')}</select>`:`<input id="flow-user-${esc(id)}" data-flow-user="${esc(id)}" type="${field.type==='数字'?'number':field.type==='日期'?'date':'text'}" value="${esc(d.flow.userValues?.[id]||'')}">`}</div>`:`<div class="form-field"><label>${esc(block.label)} / ${esc(field.label)} · 系统生成（模拟）</label><div class="sample">${esc(sceneFlowDisplay((block.many?d.flow.generated.payload[block.path]?.[0]:d.flow.generated.payload[block.path])?.[field.key]))}</div></div>`).join('')}</div><div class="section-gap">${btn(d.flow.systemConfirmed?'已确认非映射字段':'确认填写与系统样例','scene-flow-confirm-ordinary','sm','check')}</div></div>`;
}
function sceneFlowMappingHTML(s){
 const f=state.drawer.flow;if(!f.generated)return '';const summary=sceneFlowConfig(s).confirmation==='summary';
 return `<div class="section-gap"><div class="between"><h3>字段建议 · 确认后填入测试副本</h3>${pill(`${Object.keys(f.confirmations).length}/${f.generated.suggestions.length} 已确认`,'blue')}</div><div class="table-wrap section-gap"><table class="config-table"><thead><tr><th>字段 / 本体属性</th><th>当前值 → 建议值</th><th>来源 / 保存位置</th><th>确认</th></tr></thead><tbody>${f.generated.suggestions.map((r,i)=>`<tr><td class="field-name">${esc(r.target)}<small>${esc(r.ontology)}</small></td><td>${esc(sceneFlowDisplay(r.current))}<small class="field-path">→ ${esc(sceneFlowDisplay(r.suggested))}</small>${pill(r.status,r.blocking?'red':'blue')}</td><td class="tiny">${esc(r.source)}<small class="field-path">${esc(r.persistence?.table)}.${esc(r.persistence?.column)}</small></td><td>${r.blocking?'<span class="danger-text">处理来源 / 映射后重新生成</span>':f.receipt?pill('测试完成','green'):summary?pill(f.confirmations[i]?'已确认':'待整单复核',f.confirmations[i]?'green':'amber'):`${btn(f.confirmations[i]==='suggested'?'已采用建议':'采用建议','scene-flow-confirm-field','sm','','data-index="'+i+'" data-choice="suggested"')}${r.current!==undefined&&r.current!==null&&r.current!==''?btn(f.confirmations[i]==='current'?'已保留现值':'保留现值','scene-flow-confirm-field','sm','','data-index="'+i+'" data-choice="current"'):''}`}</td></tr>`).join('')}</tbody></table></div>${summary&&!f.receipt?btn('已复核全部字段，确认填入','scene-flow-confirm-all','','check'):''}<p class="tiny muted section-gap">有差异时可保留当前值，但校验不因此跳过。字段确认不修改场景映射配置或真实业务表单。</p></div>`;
}
function sceneFlowResultHTML(s){
 const f=state.drawer.flow;if(!f.result)return '';const r=f.result,current=sceneFlowResultCurrent(s),p=f.pendingExternal;
 return `<div class="section-gap"><h3>校验结果与解决方案</h3>${inf(!current?'结果已过期，请重新生成 / 校验。':r.passed?'当前本地校验通过；请复核下方副本，再模拟提交。':'存在阻断或未知；没有执行提交。',current&&r.passed?'green':'amber')}${r.errors.length?inf(r.errors.map(esc).join('；'),'red'):''}${f.blockers.map(b=>`<article class="result-card fail"><div class="between"><b>${esc(b.name)}</b>${pill(b.status,'red')}</div><code class="field-path">${esc(b.target)}</code><p>${esc(b.detail)}</p><p class="tiny">处理建议：${esc(b.guide)}</p>${b.fix?btn(b.fix==='images'?'模拟补充对应产品图片':'查看外部处理 / 模拟事实更新','scene-flow-simulate-external','sm','','data-kind="'+b.fix+'"'):''}</article>`).join('')}
 ${p?`<div class="inset-panel section-gap">${inf('非真实处理：只更新本次测试替身事实，绝不代表外部业务已完成。确认后清除旧结果，需要独立重新校验。','amber')}<p class="tiny section-gap">${esc(p.targets.join('、'))} → ${p.kind==='images'?'本地图片样例':p.kind==='di'?'安全 DI = 0':'最小系统已发布'}</p>${btn('明确确认：仅模拟外部事实更新','scene-flow-apply-external','sm','','')}${btn('取消此模拟','scene-flow-cancel-external','sm')}</div>`:''}
 <details class="plain-details section-gap"><summary>完整规则判断与查询证据（${r.checks.length} 项 / ${r.calls.length} 次）</summary>${jsonView({checks:r.checks,calls:r.calls,event:r.event,revision:r.revision,at:r.at})}</details>
 ${r.passed&&!f.receipt?`<details open class="plain-details section-gap"><summary>提交前复核：当前单据副本</summary>${jsonView(f.payload)}</details><div class="row section-gap">${btn(f.reviewStamp?'已完成复核':'我已复核字段、业务行与证据','scene-flow-review','','check')}${btn('模拟提交（重新终检）','scene-flow-submit','primary','upload',(!current||f.reviewStamp!==f.resultStamp?'disabled':''))}</div>`:''}
 ${f.receipt?`<div class="section-gap">${inf(`配置测试通过 · ${esc(f.receipt.id)}。未提交真实单据，未新增真实执行成功记录。`,'green')}</div>`:''}</div>`;
}
function sceneFlowDrawer(){
 const d=state.drawer,s=appScenes[d.sceneId];if(!s)return frame('场景已不存在','','');const f=d.flow,c=sceneFlowConfig(s),manual=f.branch==='unknown'&&c.unknown==='manual';
 return frame('智能提单 · 完整场景流','当前配置测试 · 仅本地确定性模拟，无真实 AI / 后端 / 业务提交。',`
 ${inf('使用当前配置及锁定对象定义进行测试，不替换已发布配置、不计真实运行成功。附件、DI 和发布状态变化必须显式标注样例并重检。')}${sceneFlowStageHTML(f.stage,f.viewStage||f.stage,'drawer')}${sceneFlowStageDetailHTML(s,f.viewStage||f.stage,'drawer')}
 <h3 class="section-gap">执行区 · ${esc(sceneFlowStageLabel(f.stage))}</h3><p class="tiny muted">下方操作按真实流程门禁执行；上方查看阶段不改变输入、字段确认、校验或复核状态。</p>
 <div class="application-question-list section-gap" aria-label="工作流样例">${sceneFlowExamples.map(([id,label])=>btn(label,'scene-flow-example','sm','','data-id="'+id+'"')).join('')}</div>
 <div class="section-gap">${field('描述提单信息 / 问题','request',d.draft.request,'textarea',[],'受控词典支持“创建发布单”和“为什么不能提交”；明确编号才关联本体实例。',true)}</div>
 <details ${f.stage==='clarify'?'open':''} class="plain-details section-gap"><summary>补充关键信息${f.missing?.length?'（待补充 '+f.missing.map(([,label])=>label).join('、')+'）':''}</summary><div class="form-grid section-gap">${field('项目编号','projectCode',d.draft.projectCode)}${field('整机物料编号','materialCode',d.draft.materialCode)}${field('软件物料编号','softwareCode',d.draft.softwareCode)}${field('软件版本','version',d.draft.version)}${field('提交业务部门','submitDepartment',d.draft.submitDepartment,'select',[['','请选择部门'],['后端业务部','后端业务部'],['前端业务部','前端业务部']])}${field('发布主题','subject',d.draft.subject)}</div></details>
 <div class="row section-gap">${btn('识别意图 / 根据补充继续','scene-flow-recognize','primary','chat')}${btn('失败重试（'+f.retries+'/'+c.maxRetries+'）','scene-flow-retry','sm','refresh',(f.retries>=c.maxRetries?'disabled':''))}</div>
 <div class="section-gap"><h3>对话历史</h3><div role="log" aria-live="polite" class="scene-flow-history" style="max-height:240px;overflow:auto">${f.history.map(h=>`<div class="execution-step"><b>${h.role==='user'?'用户':h.role==='assistant'?'本地流程助手':'模拟器'}</b><small>${esc(h.at)}</small><p>${esc(h.text)}</p></div>`).join('')}</div></div>
 <div data-scene-flow-result>${f.branch?`<div class="scene-scope section-gap">${pill(({recognized:'已识别本体',ambiguous:'需要澄清',unknown:'无法识别'})[f.branch],'blue')}<span>${esc(sceneFlowIntents.find(([id])=>id===f.intent)?.[1]||'意图未确定')}</span></div>`:''}
 ${(f.candidates.length&&c.clarification==='candidates'||manual)?`<div class="section-gap"><h3>请选择确切本体实例</h3><div class="row section-gap">${(manual?catalog:f.candidates).map(m=>btn(`${m.materialCode} · ${m.materialName}`,'scene-flow-choose-material','sm','file','data-id="'+esc(m.materialCode)+'"')).join('')}</div></div>`:''}
 ${f.answer?`<div class="inset-panel section-gap"><h3>问题解释（不自动提单）</h3><p>${esc(f.answer.answer)}</p><details class="plain-details section-gap"><summary>当前规则依据（不是实时单据结论）</summary>${jsonView(f.answer.evidence)}</details>${c.intents.includes('draft')?btn('明确选择：继续本地提单测试','scene-flow-continue-draft','sm','file'):''}</div>`:''}
 ${sceneFlowMappingHTML(s)}${sceneFlowOrdinaryHTML(s)}${f.generated&&!f.receipt?`<div class="row section-gap">${btn('执行校验 / 处理后重检','scene-flow-validate','primary','shield',sceneFlowConfirmed()?'':'disabled')}</div>`:''}${sceneFlowResultHTML(s)}</div>`,'',true);
}
const sceneFlowActionsViewBefore=applicationActionsView;
applicationActionsView=function(s){return workflowScene(s).type==='draft'?sceneFlowView(s):sceneFlowActionsViewBefore(s);};
Object.assign(extraDrawers,{sceneFlow:sceneFlowDrawer,sceneFlowSettings:sceneFlowSettingsDrawer});
// 必须在 scene-release.js 的动作包装器运行之前注册；只有 settings/save-settings 是配置变更。
Object.assign(actionsMap,{
 'scene-flow-stage':sceneFlowSelectStage,'scene-flow-open':sceneFlowOpen,'scene-flow-settings':sceneFlowOpenSettings,'scene-flow-save-settings':sceneFlowSaveSettings,
 'scene-flow-example':sceneFlowExample,'scene-flow-recognize':sceneFlowRecognize,'scene-flow-choose-material':sceneFlowChooseMaterial,'scene-flow-continue-draft':sceneFlowContinueDraft,
 'scene-flow-confirm-field':sceneFlowConfirmField,'scene-flow-confirm-all':sceneFlowConfirmAll,'scene-flow-confirm-ordinary':sceneFlowConfirmOrdinary,'scene-flow-validate':sceneFlowValidate,
 'scene-flow-review':sceneFlowReview,'scene-flow-submit':sceneFlowSubmit,'scene-flow-retry':sceneFlowRetry,
 'scene-flow-simulate-external':sceneFlowSimulateExternal,'scene-flow-apply-external':sceneFlowApplyExternal,
 'scene-flow-cancel-external':()=>{if(sceneFlowGuard()){state.drawer.flow.pendingExternal=null;drawOverlay();}}
});
document.addEventListener('input',e=>{sceneFlowInputChange(e.target);sceneFlowOrdinaryChange(e.target);});
document.addEventListener('change',e=>{
 const d=state.drawer,el=e.target;if(d?.type==='sceneFlow'){sceneFlowInputChange(el);sceneFlowOrdinaryChange(el);if(el.dataset.flowUser!==undefined)drawOverlay();if(el.dataset.field==='submitDepartment')drawOverlay();}
 if(d?.type==='sceneFlowSettings'&&el.dataset.sceneFlowIntent){const id=el.dataset.sceneFlowIntent;d.draft.intents=d.draft.intents.filter(i=>i!==id);if(el.checked)d.draft.intents.push(id);d.dirty=true;}
});
if(state.route==='scenes')render();
