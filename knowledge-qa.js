/* One configuration and execution path for platform and embedded knowledge Q&A. */
'use strict';

const knowledgeQAProjects = [['ALL','用户可访问的项目'],['PRJ-2026-A','项目 A'],['PRJ-2026-B','项目 B']];
const knowledgeQAIdentities = [['projectA','项目 A 验证身份'],['projectB','项目 B 验证身份']];
const knowledgeQACapabilities = [
  ['knowledge','本体知识问答'],
  ['diagnosis','解释阻断'],
  ['simulation','修复预演'],
  ['recheck','实时复查']
];
const knowledgeQALocalRuns = new Map();

function knowledgeQAProfile(s){
  const w=workflowScene(s);
  if(w.knowledgeQA)return w.knowledgeQA;
  const platform=appConfig(s).qaScope==='platform';
  return {
    scope:'objects',objectIds:platform?['Project']:[...new Set([s.root,...w.qa.objects].filter(Boolean))],
    domains:[],relationIds:[],libraries:[],documentMode:'inherited',documentIds:[],project:appConfig(s).qaProject||'ALL',
    capabilities:platform?['knowledge']:knowledgeQACapabilities.map(([id])=>id)
  };
}
function knowledgeQAObjects(config){
  return objects.filter(o=>config.scope==='domains'?config.domains.includes(o.domain):config.objectIds.includes(o.id));
}
function knowledgeQASources(objectIds,sceneId){
  const entries=new Map();
  for(const link of knowledgeLinks){
    const sourceObjects=(link.scope||'object')==='object'?link.objects.filter(id=>objectIds.includes(id)):[];
    const sourceScene=link.scope==='scene'&&(link.scenes||[]).includes(sceneId)?sceneId:null;
    if(!sourceObjects.length&&!sourceScene)continue;
    const doc=contextKnowledgeDocument(link);
    if(!doc?.text)continue;
    const entry=entries.get(doc.id)||{doc:structuredClone(doc),objectIds:[],sceneIds:[]};
    entry.objectIds=[...new Set([...entry.objectIds,...sourceObjects])];
    if(sourceScene&&!entry.sceneIds.includes(sourceScene))entry.sceneIds.push(sourceScene);
    entries.set(doc.id,entry);
  }
  return [...entries.values()];
}
function knowledgeQAAllowedSources(config,sources){
  return sources.filter(({doc})=>(!config.libraries.length||config.libraries.includes(doc.library))
    &&(config.documentMode!=='selected'||config.documentIds.includes(doc.id))
    &&(!doc.project||config.project==='ALL'||doc.project===config.project));
}
function knowledgeQARelationId(r){return JSON.stringify([r.from,r.to,r.name]);}
function knowledgeQACompile(s,config=knowledgeQAProfile(s)){
  const objectIds=knowledgeQAObjects(config).map(o=>o.id);
  const sources=knowledgeQASources(objectIds,s.id);
  const links=relations.filter(r=>objectIds.includes(r.from)&&objectIds.includes(r.to)
    &&config.relationIds?.includes(knowledgeQARelationId(r)));
  return {config:structuredClone(config),objectIds,relations:structuredClone(links),sources:knowledgeQAAllowedSources(config,sources)};
}
function knowledgeQAConfigurationIssues(s,config){
  const compiled=knowledgeQACompile(s,config), issues=[];
  if(!compiled.objectIds.length)issues.push('请选择至少一个可用本体对象。');
  if(config.scope==='objects'&&config.objectIds.some(id=>!compiled.objectIds.includes(id)))issues.push('对象范围包含已不存在的对象。');
  if(!knowledgeQAProjects.some(([id])=>id===config.project))issues.push('请选择有效的项目边界。');
  if((config.relationIds||[]).some(id=>!compiled.relations.some(r=>knowledgeQARelationId(r)===id)))issues.push('可遍历关系的两端必须属于所选对象。');
  if(!config.capabilities.length)issues.push('请启用至少一项问答能力。');
  if(config.capabilities.includes('knowledge')&&!compiled.sources.length)issues.push('当前范围没有可检索的已关联文档。请调整范围或补充知识关联。');
  if(config.documentMode==='selected'&&!config.documentIds.length)issues.push('指定文档模式至少选择一份文档。');
  if(config.documentMode==='selected'&&config.documentIds.some(id=>!compiled.sources.some(x=>x.doc.id===id)))issues.push('有选中文档不在对象、场景、知识库或项目的生效范围内。');
  if(config.capabilities.some(id=>id!=='knowledge')&&!['ReleaseOrder','ReleaseItem','ModuleOrder','Material'].every(id=>compiled.objectIds.includes(id)))issues.push('发布诊断、预演和复查需要发布主单、整机发布项、模块发布单和整机物料。');
  return issues;
}
function knowledgeQAPublished(id,version){
  const s=appScenes[id],m=s&&sceneReleaseStore.get(id);
  if(!m||m.deleted||!m.published)return null;
  const selected=version||m.published;
  const snapshot=selected===m.published?m.snapshot:m.history.find(h=>h.action==='发布配置'&&h.version===selected)?.snapshot;
  return snapshot?.knowledgeQA?{id,version:selected,scene:s,...structuredClone(snapshot.knowledgeQA)}:null;
}
function knowledgeQAEntry(s,runMode){
  const m=sceneReleaseStore.get(s.id);
  if(runMode!=='draft')return m?.snapshot?.knowledgeQAEntry||null;
  const w=workflowScene(s),ref=w.knowledgeQAEntry;
  const objectIds=[...new Set([s.root,...Object.values(w.blocks).map(b=>b.object),
    ...Object.values(s.bindings).flat().map(b=>b.ontology.split('.')[0])])];
  return ref?{...ref,objectIds,sources:knowledgeQASources([],s.id)}:null;
}
function knowledgeQACombined(profile,entry){
  if(!entry)return profile;
  const objectIds=profile.objectIds.filter(id=>entry.objectIds.includes(id));
  const sources=new Map();
  for(const source of profile.sources){
    const relevant=source.objectIds.filter(id=>objectIds.includes(id));
    if(relevant.length)sources.set(source.doc.id,{doc:structuredClone(source.doc),objectIds:relevant,sceneIds:[]});
  }
  for(const source of knowledgeQAAllowedSources(profile.config,entry.sources)){
    const existing=sources.get(source.doc.id);
    if(existing)existing.sceneIds=[...new Set([...existing.sceneIds,...source.sceneIds])];
    else sources.set(source.doc.id,structuredClone(source));
  }
  return {...profile,objectIds,relations:profile.relations.filter(r=>objectIds.includes(r.from)&&objectIds.includes(r.to)),
    sources:[...sources.values()]};
}
function knowledgeQAProjectAllowed(config,project,persona){
  const allowed={projectA:'PRJ-2026-A',projectB:'PRJ-2026-B'}[persona];
  return Boolean(allowed)&&(!project||project===allowed)&&(config.project==='ALL'||config.project===allowed);
}
function knowledgeQASearch(profile,input){
  const focus=input.focus;
  const related=new Map(focus&&profile.objectIds.includes(focus)?[[focus,name(focus)]]:[]);
  if(related.size)for(const r of profile.relations){
    const adjacent=r.from===focus?r.to:r.to===focus?r.from:null;
    if(adjacent&&!related.has(adjacent))related.set(adjacent,`${name(focus)} → ${r.name} → ${name(adjacent)}`);
  }
  const visible=profile.sources.filter(({doc,objectIds,sceneIds})=>{
    if(focus&&!related.size)return false;
    if(focus&&!objectIds.some(id=>related.has(id))&&!sceneIds.length)return false;
    const current=knowledgeDocuments.find(d=>d.id===doc.id&&d.version===doc.version&&d.library===doc.library);
    return current&&knowledgeQAProjectAllowed(profile.config,doc.project,input.persona)
      &&knowledgeQAProjectAllowed(profile.config,current.project,input.persona);
  });
  const docs=visible.map(({doc})=>doc);
  const result=platformKnowledgeAnswer({qaLibrary:'ALL',qaProject:profile.config.project},input,docs);
  const evidence=(result.evidence||[]).map(e=>{
    const source=visible.find(({doc})=>doc.id===e.documentId);
    return {...e,origin:[...(source?.objectIds||[]).filter(id=>!focus||related.has(id)).map(id=>`对象 · ${related.get(id)||name(id)}`),
      ...(source?.sceneIds||[]).map(id=>`场景 · ${appScenes[id]?.name||id}`)].join('、')};
  });
  return {...result,evidence,scope:input.focus?name(input.focus):profile.objectIds.map(name).join('、')};
}

function knowledgeQAMarkSaved(s){
  const m=sceneReleaseEnsure(s);
  m.check=null;
  s.revision++;
  changed();
  sceneReleaseRecord(s,m.published?'保存修订':'保存草稿',m.status,'保存智能问答配置');
}
function knowledgeQAList(label,group,items,selected){
  return `<fieldset class="knowledge-object-options"><legend>${label}</legend>${items.map(([id,text])=>
    `<label class="check-row"><input type="checkbox" data-knowledge-qa-list="${group}" value="${esc(id)}" ${selected.includes(id)?'checked':''}>${esc(text)}</label>`
  ).join('')||'<span class="tiny muted">当前没有候选项</span>'}</fieldset>`;
}
function knowledgeQASourceRows(sources){
  return sources.length?`<div class="table-wrap"><table class="config-table"><thead><tr><th>文档及版本</th><th>继承或补充来源</th><th>适用项目</th></tr></thead><tbody>${sources.map(({doc,objectIds,sceneIds})=>
    `<tr><td class="field-name">${esc(doc.title)}<small>${esc(doc.library)} · ${esc(doc.version)}</small></td><td>${esc([...objectIds.map(id=>`对象 · ${name(id)}`),...sceneIds.map(id=>`场景 · ${appScenes[id]?.name||id}`)].join('、'))}</td><td>${esc(doc.project||'公共')}</td></tr>`
  ).join('')}</tbody></table></div>`:'<div class="empty">当前配置下没有可检索文档</div>';
}
function knowledgeQASettings(){
  const d=state.drawer,s=appScenes[d.sceneId],v=d.draft,compiled=knowledgeQACompile(s,v);
  const domains=[...new Set(objects.map(o=>o.domain))].map(id=>[id,({BASELINE:'项目管理域',COMMON:'公共域'})[id]||id]);
  const libraries=[...new Set(knowledgeDocuments.map(doc=>doc.library))].map(id=>[id,id]);
  const available=knowledgeQAAllowedSources({...v,documentMode:'inherited'},knowledgeQASources(compiled.objectIds,s.id));
  return frame('配置智能问答','对象范围决定继承哪些知识，场景关联用于补充当前入口的文档。',`
    <div class="form-grid">${field('本体范围选择方式','scope',v.scope,'select',[['objects','按本体对象'],['domains','按对象所属域']])}
    ${field('项目边界','project',v.project,'select',knowledgeQAProjects)}</div>
    ${v.scope==='domains'?knowledgeQAList('所属域','domains',domains,v.domains):knowledgeQAList('本体对象','objectIds',objects.map(o=>[o.id,o.name]),v.objectIds)}
    ${knowledgeQAList('可关联检索的关系（当前对象一跳）','relationIds',
      relations.filter(r=>compiled.objectIds.includes(r.from)&&compiled.objectIds.includes(r.to))
        .map(r=>[knowledgeQARelationId(r),`${name(r.from)} · ${r.name} · ${name(r.to)}`]),v.relationIds||[])}
    ${knowledgeQAList('可用知识库（未选择时继承所有已关联知识库）','libraries',libraries,v.libraries)}
    <div class="form-grid section-gap">${field('文档范围','documentMode',v.documentMode,'select',[['inherited','继承对象知识与场景补充'],['selected','限定到指定文档']])}</div>
    ${v.documentMode==='selected'?knowledgeQAList('可检索文档','documentIds',available.map(({doc})=>[doc.id,doc.title]),v.documentIds):''}
    ${knowledgeQAList('启用能力','capabilities',knowledgeQACapabilities,v.capabilities)}
    <div class="section-gap"><h3>生效范围预览</h3><p class="tiny muted">${esc(compiled.objectIds.map(name).join('、')||'尚未选择本体对象')}</p>${knowledgeQASourceRows(compiled.sources)}</div>
  `,btn('保存问答配置','knowledge-qa-save','primary','check'),true);
}
function knowledgeQAReferenceSettings(){
  const d=state.drawer,s=appScenes[d.sceneId],v=d.draft;
  const candidates=Object.values(appScenes).filter(item=>workflowScene(item).type==='qa').map(item=>knowledgeQAPublished(item.id)).filter(p=>p?.objectIds.includes(s.root));
  const ref=workflowScene(s).knowledgeQAEntry,previous=ref&&knowledgeQAPublished(ref.id,ref.version);
  if(previous?.objectIds.includes(s.root)&&!candidates.some(p=>p.id===previous.id&&p.version===previous.version))candidates.push(previous);
  return frame('配置辅助问答','引用已发布配置，并继承当前业务场景的主对象和补充文档。',`
    <div class="form-grid">${field('问答配置及版本','reference',v.reference,'select',[['','未启用'],...candidates.map(p=>[JSON.stringify([p.id,p.version]),`${p.scene.name} · v${p.version}`])],null,true)}</div>
    ${candidates.length?'':inf('尚无覆盖当前主对象的已发布配置。请先发布对应的智能问答配置。','amber')}
  `,btn('保存辅助问答','knowledge-qa-save-reference','primary','check'),true);
}
function knowledgeQAStrategy(s){
  const m=sceneReleaseEnsure(s),published=knowledgeQAPublished(s.id);
  const draft=knowledgeQACompile(s),effective=m.editing||!published?draft:published;
  return `<div class="panel-body">
    <div class="between"><div><h3>问答范围与策略</h3><p class="tiny muted">统一配置可在平台运行，也可被业务场景引用。</p></div>${btn('编辑配置','workflow-settings','sm','edit')}</div>
    <div class="scene-scope section-gap"><span>${m.editing||!published?'待发布配置':`已发布 v${published.version}`}</span><span>对象 · ${esc(effective.objectIds.map(name).join('、')||'未配置')}</span></div>
    <div class="section-gap"><h3>继承的对象知识与场景补充</h3>${knowledgeQASourceRows(effective.sources)}</div>
    <div class="row section-gap">${btn('配置场景补充文档','knowledge-open-scene','sm','book',`data-scene="${esc(s.id)}"`)}
    ${m.editing?btn('调试当前草稿','knowledge-qa-open-draft','sm','play'):''}</div>
  </div>`;
}
function knowledgeQAEmbeddedPanel(s){
  const m=sceneReleaseEnsure(s),draft=workflowScene(s).knowledgeQAEntry,entry=m.editing?draft:knowledgeQAEntry(s,'published')||draft;
  const profile=entry&&knowledgeQAPublished(entry.id,entry.version);
  return `<section class="panel section-gap"><div class="panel-head between"><div><h3>智能提单辅助问答</h3><p class="tiny muted section-gap">${profile?esc(`${profile.scene.name} · v${profile.version}`):'尚未绑定可用于当前主对象的已发布问答配置'}</p></div>
    ${btn('配置辅助问答','knowledge-qa-reference','sm','settings')}</div>
    ${profile?`<div class="panel-body">${knowledgeQASourceRows(knowledgeQACombined(profile,entry.sources?entry:knowledgeQAEntry(s,'draft')).sources)}</div>`:''}
  </section>`;
}
function knowledgeQACase(s,d){
  if(d?.type!=='workflowTest')return null;
  const m=sceneReleaseStore.get(s.id);
  const effective=m?.snapshot?.scene&&d.objectRunMode!=='draft'?m.snapshot.scene:s;
  const main=Object.values(workflowScene(effective).blocks).find(b=>!b.parent);
  if(!main)return null;
  try{
    const document=JSON.parse(d.draft.documentText),authority=JSON.parse(d.draft.authorityText);
    const record=document?.[main.path],id=record?.[main.keyField],project=record?.projectCode;
    if(!id||!project||!authority?.products||!authority.projects||!authority.minimumSystems)return null;
    return {id,project,sceneId:s.id,scene:structuredClone(effective),document,authority,event:d.draft.event||'submit',
      failure:d.draft.preset==='timeout'?'超时':'正常',version:effective===s?0:m.published,
      historical:d.result?.event!=='suggest'&&JSON.stringify(d.result?.document)===JSON.stringify(document)?structuredClone(d.result):null};
  }catch{return null;}
}
function knowledgeQAMaterialRows(context){
  if(!context)return [];
  return Object.values(workflowScene(context.scene).blocks).filter(b=>b.many&&b.object==='ReleaseItem').flatMap(b=>
    (Array.isArray(context.document[b.path])?context.document[b.path]:[]).filter(r=>r[b.keyField]&&r.materialCode)
      .map(row=>({id:String(row[b.keyField]),materialCode:row.materialCode})));
}
function knowledgeQAWorkflowRun(context,authority){
  const previous=objectReleaseRunningPublished;
  objectReleaseRunningPublished=Boolean(context.version);
  try{return objectReleaseWithScene(context.scene,()=>executeWorkflow(context.scene,context.document,authority,context.event,context.failure));}
  finally{objectReleaseRunningPublished=previous;}
}
function knowledgeQAChecks(result){
  return result.checks.filter(c=>c.status==='阻断'||c.status==='未知').map(c=>({
    name:c.name,target:c.target,status:c.status,detail:c.detail,evidence:c.evidence||[]
  }));
}
function knowledgeQARuleAnswer(profile,input,operation,context){
  const evidenceFor=checks=>checks.map(c=>({type:c.status,source:c.name,location:c.target,value:c.detail}));
  const unavailable=answer=>({status:'证据不足',answer,evidence:[]});
  if(!profile.config.capabilities.includes(operation))return {status:'能力未启用',answer:'当前问答配置未启用此操作。',evidence:[]};
  if(!context||!profile.objectIds.includes('ReleaseOrder')||!knowledgeQAProjectAllowed(profile.config,context.project,input.persona))
    return {status:'无可访问记录',answer:'当前可访问范围内无匹配单据。',evidence:[]};
  if(operation==='diagnosis'){
    if(!context.historical)return unavailable('没有匹配当前单据的校验记录，请先在业务页面执行校验或发起复查。');
    if(context.historical.errors?.length)return unavailable(context.historical.errors.join('；'));
    const checks=knowledgeQAChecks(context.historical);
    return {status:'已回答',answer:checks.length?`历史校验记录有 ${checks.length} 项阻断或未知。`:'历史校验未记录阻断或未知。',
      scope:`${context.id} · ${context.historical.at}`,evidence:evidenceFor(checks)};
  }
  if(context.version&&sceneReleaseStore.get(context.sceneId)?.published!==context.version)
    return unavailable('业务场景已发布新版本，请重新打开当前单据。');
  const baseline=knowledgeQAWorkflowRun(context,context.authority);
  if(baseline.errors.length)return unavailable(baseline.errors.join('；'));
  const before=knowledgeQAChecks(baseline);
  if(operation==='recheck')return {status:baseline.passed?'检查通过':'待处理',answer:baseline.passed?'当前数据通过已执行规则。':`本次复查有 ${before.length} 项阻断或未知。`,
    scope:`${context.id} · ${baseline.at}`,evidence:evidenceFor(before)};
  const row=knowledgeQAMaterialRows(context).find(item=>item.id===input.target);
  if(!row)return unavailable('请先选择当前单据中的整机发布行。');
  const model=baseline.calls.find(c=>c.ok&&c.params?.materialCode===row.materialCode&&Array.isArray(c.normalized))
    ?.normalized.find(item=>item.properties?.materialCode===row.materialCode)?.properties?.modelCode;
  const source=model&&context.authority.products[model];
  if(!Array.isArray(source?.images))return unavailable('该发布行缺少可验证的型号或图片事实，无法预演。');
  const assumed=structuredClone(context.authority);
  if(!assumed.products[model].images.length)assumed.products[model].images=['预演：图片已补齐'];
  const simulated=knowledgeQAWorkflowRun(context,assumed);
  if(simulated.errors.length)return unavailable(simulated.errors.join('；'));
  const after=knowledgeQAChecks(simulated);
  const key=c=>JSON.stringify([c.name,c.target]);
  const removed=before.filter(c=>!after.some(item=>key(item)===key(c)));
  const added=after.filter(c=>!before.some(item=>key(item)===key(c)));
  const retained=after.filter(c=>before.some(item=>key(item)===key(c)));
  const evidence=[
    {source:'用户假设',location:`${row.id} · ${model}`,value:'该型号的发布图片已补齐'},
    ...evidenceFor(removed).map(e=>({...e,type:'解除'})),
    ...evidenceFor(retained).map(e=>({...e,type:e.type==='未知'?'证据不足':'保留'})),
    ...evidenceFor(added).map(e=>({...e,type:e.type==='未知'?'证据不足':'新增'}))
  ];
  return {status:'预演完成',answer:`假设补齐图片后，解除 ${removed.length} 项，保留 ${retained.length} 项，新增 ${added.length} 项。`,
    scope:`${context.id} · ${baseline.at}`,evidence};
}
function knowledgeQAWorkspace(){
  const d=state.drawer,p=d.profile,v=d.draft,active=p.config.capabilities,context=d.caseContext;
  const result=d.result;
  const canUseCase=active.some(id=>id!=='knowledge');
  const caseVisible=context&&knowledgeQAProjectAllowed(p.config,context.project,v.persona);
  const accessibleCases=[...knowledgeQALocalRuns].filter(([,c])=>knowledgeQAProjectAllowed(p.config,c.project,v.persona));
  return frame(d.embedded?'智能提单辅助问答':'智能问答',p.version?`使用已发布问答配置 v${p.version}`:'调试当前问答草稿',`
    ${inf('当前连接原型本地数据。验证身份用于检查项目过滤。')}
    <div class="form-grid section-gap">
      ${field('本地验证身份','persona',v.persona,'select',knowledgeQAIdentities)}
      ${d.embedded?`<div class="form-field"><label>当前单据</label><b>${caseVisible?esc(context.id):'当前身份无可访问单据'}</b></div>`:canUseCase?field('业务单据','order',v.order,'select',[['','请选择可访问单据'],...accessibleCases.map(([key,c])=>[key,c.id])]):''}
      ${field('关联对象','focus',v.focus,'select',[['','所选对象范围'],...p.objectIds.map(id=>[id,name(id)])])}
      ${active.includes('knowledge')?field('问题','question',v.question,'textarea',[],'例如：发布单需要准备哪些资料？',true):''}
      ${active.includes('simulation')&&caseVisible?field('预演假设：整机发布行已补齐图片','target',v.target,'select',[['','请选择整机发布行'],...knowledgeQAMaterialRows(context).map(r=>[r.id,`${r.id} · ${r.materialCode}`])],null,true):''}
    </div>
    <div class="row section-gap">${knowledgeQACapabilities.filter(([id])=>active.includes(id)).map(([id,label])=>btn(id==='knowledge'?'查询知识':label,'knowledge-qa-run',id==='knowledge'?'primary':'','chat',`data-operation="${id}"`)).join('')}</div>
    ${result?`<div class="section-gap" data-knowledge-qa-result aria-live="polite">
      <div class="between"><h3>${esc(result.status)}</h3>${pill(result.scope||'本地执行','blue')}</div>
      <p class="knowledge-qa-answer">${esc(result.answer)}</p>
      ${result.evidence.length?`<h3>引用与证据</h3>${result.evidence.map(e=>`<div class="execution-step">
        <b>${esc(e.source)}</b><small>${esc([e.type,e.library,e.version,e.location,e.origin].filter(Boolean).join(' · '))}</small>
        <p>${esc(e.value)}</p>
      </div>`).join('')}`:''}
    </div>`:''}
  `,d.previous?btn('返回当前单据','knowledge-qa-back','sm','arrow'):'',true);
}
function knowledgeQAOpen(s,{draft=false,previous=null}={}){
  const embedded=workflowScene(s).type==='draft';
  const mode=previous?.objectRunMode||(sceneReleaseStore.get(s.id)?.published?'published':'draft');
  const entry=embedded?knowledgeQAEntry(s,mode):null;
  if(embedded&&!entry)return toast('请先为提单绑定问答配置，并发布业务场景。');
  const profile=embedded?knowledgeQAPublished(entry.id,entry.version):draft?knowledgeQACompile(s):knowledgeQAPublished(s.id);
  if(!profile)return toast('请先检查并发布问答配置，或在编辑状态调试草稿。');
  const context=previous?knowledgeQACase(s,previous):null;
  if(embedded&&!context)return toast('当前单据缺少有效身份、项目或事实来源。');
  const persona='projectA';
  openDrawer('knowledgeQAWorkspace',{persona,question:'',order:context?.id||'',focus:embedded?s.root:'',target:''},{
    profile:knowledgeQACombined(profile,entry),entrySceneId:s.id,caseContext:context,embedded,previous
  });
}

Object.assign(extraDrawers,{
  knowledgeQASettings,knowledgeQAReferenceSettings,knowledgeQAWorkspace
});
const knowledgeQAPreviousStrategy=applicationStrategyView;
applicationStrategyView=function(s){return workflowScene(s).type==='qa'?knowledgeQAStrategy(s):knowledgeQAPreviousStrategy(s);};
const knowledgeQAPreviousActions=applicationActionsView;
applicationActionsView=function(s){
  if(workflowScene(s).type==='qa')return `<div class="panel-body">${inf('问答使用已发布配置，按对象和项目范围检索知识，并返回文档来源。')}${btn('打开智能问答','workflow-test','primary','chat')}</div>`;
  return knowledgeQAPreviousActions(s)+(workflowScene(s).type==='draft'?knowledgeQAEmbeddedPanel(s):'');
};
const knowledgeQAPreviousTabs=workflowTabs;
workflowTabs=function(s){
  const tabs=knowledgeQAPreviousTabs(s);
  return workflowScene(s).type==='qa'?tabs.filter(([id])=>id!=='design').map(([id,label])=>[id,id==='actions'?'智能问答':label]):tabs;
};
const knowledgeQAPreviousPage=pages.scenes;
pages.scenes=function(){
  const s=scene(),html=knowledgeQAPreviousPage();
  if(!s||workflowScene(s).type!=='qa')return html;
  return html.replace('体验当前 Demo','打开智能问答').replace(
    '所有 Demo 使用本地样例；智能问答是受控问题模板演示，未接真实模型。页面刷新重置配置与结果。',
    '问答按已发布范围检索本地知识和业务记录。页面刷新重置原型配置与结果。'
  );
};
const knowledgeQAPreviousSettings=actionsMap['workflow-settings'];
actionsMap['workflow-settings']=function(el){
  const s=scene();
  if(workflowScene(s).type!=='qa')return knowledgeQAPreviousSettings(el);
  if(!sceneReleaseCanEdit(s))return toast('请先点击场景的“编辑”。');
  openDrawer('knowledgeQASettings',knowledgeQAProfile(s),{sceneId:s.id});
};
const knowledgeQAPreviousOpen=actionsMap['workflow-test'];
actionsMap['workflow-test']=function(el){
  const s=scene();
  return workflowScene(s).type==='qa'?knowledgeQAOpen(s):knowledgeQAPreviousOpen(el);
};
const knowledgeQAPreviousTest=extraDrawers.workflowTest;
extraDrawers.workflowTest=function(){
  const s=scene(),d=state.drawer,mode=d.objectRunMode||(sceneReleaseStore.get(s.id)?.published?'published':'draft');
  const html=knowledgeQAPreviousTest();
  if(!knowledgeQAEntry(s,mode))return html;
  return html.replace('<div class="row section-gap">',`<div class="row section-gap">${btn('辅助问答','knowledge-qa-open-embedded','','chat')}`);
};
const knowledgeQAPreviousRun=actionsMap['workflow-run'];
actionsMap['workflow-run']=function(el){
  const s=scene(),result=knowledgeQAPreviousRun(el),context=knowledgeQACase(s,state.drawer);
  if(context?.historical&&context.version)knowledgeQALocalRuns.set(JSON.stringify([context.sceneId,context.project,context.id]),context);
  return result;
};
sceneReleaseMutations.add('knowledge-qa-reference');
runtimeOperations['knowledge-qa-run']='智能问答';
const knowledgeQAPreviousDeletionPlan=deletionPlan;
deletionPlan=function(kind,target,owner){
  const plan=knowledgeQAPreviousDeletionPlan(kind,target,owner);
  if(kind==='scene')for(const s of Object.values(appScenes)){
    const draft=workflowScene(s).knowledgeQAEntry,published=knowledgeQAEntry(s,'published');
    if(draft?.id===target.id||published?.id===target.id)plan.refs.push(`场景“${s.name}”仍引用此问答配置，请先取消引用并发布。`);
  }
  return plan;
};

Object.assign(actionsMap,{
  'knowledge-qa-save':()=>{
    const d=state.drawer,s=appScenes[d.sceneId];
    if(!s||!sceneReleaseCanEdit(s))return errorDrawer('请先进入该场景的编辑状态。');
    const issues=knowledgeQAConfigurationIssues(s,d.draft);
    if(issues.length)return errorDrawer(issues.join(' '));
    workflowScene(s).knowledgeQA=structuredClone(d.draft);
    knowledgeQAMarkSaved(s);closeOverlay(true);render();toast('问答配置已保存，检查并发布后生效');
  },
  'knowledge-qa-reference':()=>{
    const s=scene();
    if(!sceneReleaseCanEdit(s))return toast('请先点击场景的“编辑”。');
    const ref=workflowScene(s).knowledgeQAEntry;
    openDrawer('knowledgeQAReferenceSettings',{reference:ref?JSON.stringify([ref.id,ref.version]):''},{sceneId:s.id});
  },
  'knowledge-qa-save-reference':()=>{
    const d=state.drawer,s=appScenes[d.sceneId];
    if(!s||!sceneReleaseCanEdit(s))return errorDrawer('请先进入该场景的编辑状态。');
    if(d.draft.reference){
      const [id,version]=JSON.parse(d.draft.reference),p=knowledgeQAPublished(id,version);
      if(!p?.objectIds.includes(s.root))return errorDrawer('所选问答配置不可用，或未覆盖当前主对象。');
      workflowScene(s).knowledgeQAEntry={id,version};
    }else delete workflowScene(s).knowledgeQAEntry;
    knowledgeQAMarkSaved(s);closeOverlay(true);render();toast('辅助问答已保存，随当前场景发布');
  },
  'knowledge-qa-open-draft':()=>knowledgeQAOpen(scene(),{draft:true}),
  'knowledge-qa-open-embedded':()=>knowledgeQAOpen(scene(),{previous:structuredClone(state.drawer)}),
  'knowledge-qa-back':()=>{state.drawer=state.drawer.previous;drawOverlay();},
  'knowledge-qa-run':el=>{
    const d=state.drawer,operation=el.dataset.operation,profile=d.profile,s=appScenes[d.entrySceneId];
    if(!profile.config.capabilities.includes(operation))return errorDrawer('当前问答配置未启用此操作。');
    if(operation==='knowledge'){
      if(!d.draft.question.trim())return errorDrawer('请输入需要查询的问题。');
      if(d.embedded&&!knowledgeQAProjectAllowed(profile.config,d.caseContext?.project,d.draft.persona)){
        d.result={status:'无可访问记录',answer:'当前可访问范围内无匹配单据。',evidence:[]};
      }else d.result=knowledgeQASearch(profile,d.draft);
    }else d.result=knowledgeQARuleAnswer(profile,d.draft,operation,d.caseContext);
    if(operation==='recheck'&&d.caseContext&&d.result.status!=='无可访问记录'){
      // A recheck is a new answer, not a replacement for the original validation history.
      d.result.scope=d.result.scope||d.caseContext.id;
    }
    const safeInput={persona:d.draft.persona,question:operation==='knowledge'?d.draft.question:knowledgeQACapabilities.find(([id])=>id===operation)[1]};
    const record=runtimeRecordAdd('knowledge-qa-run',s,safeInput,d.result);
    if(!record.qaAnswer)sceneReleaseCaptureQA(record,s,safeInput.question,d.result,safeInput);
    if(record.qaAnswer){
      record.qaAnswer.configVersion=profile.version||0;
      record.qaAnswer.configState=profile.version?'已发布':'草稿调试';
    }
    d.error='';drawOverlay();render();
  }
});

document.addEventListener('change',e=>{
  const el=e.target,d=state.drawer,key=el.dataset.field;
  if(d?.type==='knowledgeQASettings'){
    const group=el.dataset.knowledgeQaList;
    if(group){
      d.draft[group]=(d.draft[group]||[]).filter(id=>id!==el.value);
      if(el.checked)d.draft[group].push(el.value);
      d.dirty=true;
    }
    if(group||['scope','project','documentMode'].includes(key)){
      if(group==='objectIds'||group==='domains'||key==='scope'){
        const ids=knowledgeQAObjects(d.draft).map(o=>o.id);
        d.draft.relationIds=(d.draft.relationIds||[]).filter(id=>relations.some(r=>knowledgeQARelationId(r)===id&&ids.includes(r.from)&&ids.includes(r.to)));
      }
      if(group!=='documentIds'){
        const compiled=knowledgeQACompile(appScenes[d.sceneId],{...d.draft,documentMode:'inherited'});
        d.draft.documentIds=d.draft.documentIds.filter(id=>compiled.sources.some(({doc})=>doc.id===id));
      }
      d.error='';
      const scroll=overlayRoot.querySelector('.drawer-body')?.scrollTop||0;
      drawOverlay();
      const body=overlayRoot.querySelector('.drawer-body');
      if(body)body.scrollTop=scroll;
    }
  }else if(d?.type==='knowledgeQAWorkspace'&&['persona','focus','order','target'].includes(key)){
    if(!d.embedded&&['persona','order'].includes(key)){
      if(key==='persona')d.draft.order='';
      const selected=knowledgeQALocalRuns.get(d.draft.order);
      d.caseContext=selected&&knowledgeQAProjectAllowed(d.profile.config,selected.project,d.draft.persona)?selected:null;
      d.draft.target='';
    }
    d.result=null;d.error='';drawOverlay();
  }
});
document.addEventListener('input',e=>{
  if(state.drawer?.type==='knowledgeQAWorkspace'&&e.target.dataset.field==='question'){
    state.drawer.result=null;
    overlayRoot.querySelector('[data-knowledge-qa-result]')?.remove();
  }
});

render();
