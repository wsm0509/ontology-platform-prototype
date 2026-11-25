/* 对象知识面向跨库关联；场景知识限定具体应用问答。均使用本地配置和正文样例。 */
'use strict';
const knowledgeContext={scope:'object',object:state.object,scene:appScenes.release_qa?'release_qa':Object.keys(appScenes)[0],query:''};
for(const link of knowledgeLinks){
  link.scope??='object';
  const doc=knowledgeDocuments.find(d=>d.id===link.documentId||d.title.replace(/\.[^.]+$/,'')===link.title);
  if(doc){link.documentId=doc.id;link.library=doc.library;}
}
// 两份样例正文均明确描述整机物料，展示同一对象连接多个知识库。
const contextReleaseDocument=knowledgeDocuments.find(d=>d.id==='release-guide');
if(contextReleaseDocument&&obj('Material'))knowledgeLinks.push({scope:'object',library:contextReleaseDocument.library,title:contextReleaseDocument.title,documentId:contextReleaseDocument.id,version:contextReleaseDocument.version,objects:['Material'],purpose:'串联物料、型号与发布资料要求'});
// 场景初始关联来自该场景已有的知识范围，不从对象知识库自动继承。
for(const s of Object.values(appScenes).filter(s=>workflowScene(s).type==='qa')){
  for(const part of String(appConfig(s).qaKnowledge||'').split(/[；;、\n]/).map(value=>value.trim()).filter(Boolean)){
    const doc=knowledgeDocuments.find(d=>part.includes(d.title.replace(/\.[^.]+$/,''))||(d.id==='material-guide'&&part.includes('商品目录资料维护指引')));
    if(doc&&knowledgeLinks.some(k=>k.scope==='object'&&k.documentId===doc.id&&k.objects.some(id=>workflowScene(s).qa.objects.includes(id))))continue;
    knowledgeLinks.push({scope:'scene',library:doc?.library||'场景专用知识库',title:doc?.title||part,documentId:doc?.id,version:doc?.version,objects:[],scenes:[s.id],purpose:'当前应用问答的规范与说明'});
  }
  s.knowledgeScopeConfigured=true;
}

function contextKnowledgeLinks(scope,id){return knowledgeLinks.filter(k=>(k.scope||'object')===scope&&(scope==='object'?k.objects:k.scenes||[]).includes(id));}
function contextKnowledgeDocument(link){return knowledgeDocuments.find(d=>d.id===link.documentId);}
function contextKnowledgeSceneConfig(id){
  const s=appScenes[id];if(!s)return;
  s.knowledgeScopeConfigured=true;s.revision++;s.lastResult=null;
  if(workflowScene(s).type==='qa'){
    const titles=contextKnowledgeLinks('scene',id).map(k=>k.title).join('；');
    appConfig(s).qaKnowledge=titles;workflowScene(s).qa.knowledge=titles;
  }
}
function contextKnowledgeGraph(links,id){
  const root=obj(id);if(!root)return '';
  const groups=new Map();for(const k of links){const doc=contextKnowledgeDocument(k),library=k.library||doc?.library||'未指定知识库';if(!groups.has(library))groups.set(library,[]);groups.get(library).push(k);}
  return `<div class="knowledge-map" role="group" aria-label="${esc(root.name)}的跨知识库检索图谱"><div class="knowledge-map-root"><div>${icon('cube')}<b>${esc(root.name)}</b><code>${esc(root.id)}</code><small>统一对象入口</small></div></div><div class="knowledge-map-branches">${[...groups].map(([library,items])=>`<div class="knowledge-map-group"><div class="knowledge-map-library">${icon('book')}<b>${esc(library)}</b><small>${items.length} 项知识</small></div><div class="knowledge-map-documents">${items.map(k=>{const doc=contextKnowledgeDocument(k),related=doc?doc.relations.filter(r=>r[0]===id||r[1]===id):[];return `<div class="knowledge-map-document"><button class="link" data-action="knowledge-evidence" data-index="${knowledgeLinks.indexOf(k)}">${icon('file')}${esc(k.title)}</button><small>${esc(doc?`${doc.version} · ${doc.section}`:'仅关联配置，尚无可检索正文')}</small>${doc?`<p>${esc(doc.text)}</p>${related.length?`<div class="knowledge-map-related">${related.map(r=>{const other=r[0]===id?r[1]:r[0];return `<span>${esc(r[2])} → <button class="link" data-action="knowledge-focus-object" data-id="${esc(other)}" ${obj(other)?'':'disabled'}>${esc(name(other))}</button></span>`}).join('')}</div>`:''}`:''}</div>`}).join('')}</div></div>`).join('')}</div></div>`;
}
function contextKnowledgeHistory(){return (knowledgeSync.batches.length?`<section class="panel section-gap"><div class="panel-head"><h3>知识库同步记录</h3></div><div class="panel-body">${knowledgeSync.batches.map(b=>`<div class="release-line"><div class="fill"><h4>${esc(b.id)} · ${esc(b.time)}</h4><p>${b.newObjects} 个新对象 · ${b.newRelations} 条关系 · ${b.newRules} 条规则草稿</p></div>${btn('查看详情','sync-view-batch','sm','eye',`data-id="${esc(b.id)}"`)}</div>`).join('')}</div></section>`:'')+syncRulesPanel(knowledgeSync.rules);}
function contextKnowledgePage(){
  const c=knowledgeContext,isObject=c.scope==='object',targets=isObject?objects:Object.values(appScenes),key=isObject?'object':'scene';
  if(!targets.some(t=>t.id===c[key]))c[key]=targets[0]?.id||'';
  const id=c[key],target=isObject?obj(id):appScenes[id],links=contextKnowledgeLinks(c.scope,id),query=c.query.trim().toLowerCase();
  const hits=links.filter(k=>`${k.title} ${k.library||''} ${contextKnowledgeDocument(k)?.text||''}`.toLowerCase().includes(query));
  return header('知识关联','按本体对象汇聚跨知识库依据，按应用场景限定问答知识范围。',btn('知识库同步','knowledge-sync','','book')+btn('关联知识','add-knowledge-link','primary','plus'),'知识配置')+
  `<div class="knowledge-dimensions" role="tablist" aria-label="知识库配置维度">${[['object','按本体对象配置','从一个对象检索多个知识库，以图谱串联相关依据。'],['scene','按应用场景配置','仅供选定应用场景问答使用，知识范围独立配置。']].map(([scope,title,desc])=>`<button role="tab" aria-selected="${c.scope===scope}" class="knowledge-dimension ${c.scope===scope?'active':''}" data-action="knowledge-dimension" data-scope="${scope}">${icon(scope==='object'?'graph':'chat')}<span><b>${title}</b><small>${desc}</small></span></button>`).join('')}</div>
  <section class="panel"><div class="filterbar knowledge-context-filter"><label for="knowledge-context-target">${isObject?'本体对象':'应用场景'}</label><select id="knowledge-context-target" class="select" data-knowledge-context="${key}">${options(targets.map(t=>[t.id,t.name]),id)}</select><span class="tiny muted">${links.length} 项知识配置</span></div><div class="panel-body">${inf(isObject?'对象是统一的知识检索入口。同一个对象可关联多个知识库，检索结果保留知识库、文档版本和原文依据，并沿对象关系串联。':'仅使用该应用场景明确配置的知识库。不自动扩大到其他场景或对象的全部知识库。')}</div><div class="table-wrap"><table class="config-table"><thead><tr><th>知识库 / 文档</th><th>${isObject?'关联本体对象':'适用应用场景'}</th><th>用途</th><th>操作</th></tr></thead><tbody>${links.map(k=>`<tr><td class="field-name">${esc(k.library||contextKnowledgeDocument(k)?.library||'未指定知识库')}<small>${esc(k.title)}</small></td><td>${(isObject?k.objects:k.scenes).map(value=>esc(isObject?name(value):appScenes[value]?.name||value)).join('、')}</td><td>${esc(k.purpose)}</td><td><button class="link danger-text" data-action="delete-knowledge-link" data-index="${knowledgeLinks.indexOf(k)}">删除关联</button></td></tr>`).join('')||`<tr><td colspan="4" class="empty">${isObject?'该对象尚未关联知识库':'该场景尚未配置专属知识库'}<div class="section-gap">${btn('关联知识','add-knowledge-link','sm','plus')}</div></td></tr>`}</tbody></table></div></section>
  <section class="panel section-gap"><div class="panel-head between"><div><h3>${isObject?'对象知识图谱与检索':'场景知识检索'}</h3><p class="tiny muted section-gap">${esc(target?.name||'请选择范围')} · ${isObject?'对象 → 知识库 → 文档与相关对象':'只检索当前场景配置的文档'}</p></div>${pill('内置正文演示','blue')}</div><div class="panel-body"><div class="knowledge-query"><div class="search">${icon('search')}<input aria-label="检索当前范围的知识" data-knowledge-query value="${esc(c.query)}" placeholder="输入关键词，例如：资料、软件版本"></div>${btn('检索知识','knowledge-search','primary','search')}</div><p class="tiny muted section-gap">${query?`命中 ${hits.length} 项知识`:`当前范围 ${hits.length} 项知识`} · 配置名称不会自动产生文档内容</p></div>${hits.length?(isObject?contextKnowledgeGraph(hits,id):`<div class="panel-body">${hits.map(k=>{const doc=contextKnowledgeDocument(k);return `<div class="knowledge-scene-evidence"><b>${esc(k.title)}</b><small>${esc(k.library||doc?.library||'未指定知识库')}</small><p>${esc(doc?.text||'尚无可检索正文，请先接入对应知识库。')}</p>${doc?`<small>${esc(doc.version)} · ${esc(doc.section)}</small>`:''}</div>`}).join('')}</div>`):'<div class="empty">当前范围没有匹配知识，请调整关键词或添加知识关联。</div>'}</section><p class="session-note">关联配置与内置文档仅用于当前会话演示；未连接真实知识库检索、图谱数据库或大模型。</p>`+contextKnowledgeHistory();
}

extraDrawers.knowledgeLink=function(){
  const d=state.drawer,v=d.draft,isObject=v.scope==='object';
  return frame('关联知识',isObject?'为本体对象配置跨知识库检索范围。':'为指定应用场景配置独立的问答知识范围。',`<div class="form-grid">${field('配置维度 *','scope',v.scope,'select',[['object','按本体对象配置'],['scene','按应用场景配置']],null,true)}${field('知识来源','documentId',v.documentId||'','select',[['','手工关联其他知识库'],...knowledgeDocuments.map(doc=>[doc.id,`${doc.library} / ${doc.title}`])],null,true)}${field('知识库名称 *','library',v.library||'','text',[],null,true)}${field('文档 / 知识范围名称 *','title',v.title||'','text',[],null,true)}<fieldset class="knowledge-object-options"><legend>${isObject?'关联本体对象':'适用应用场景'} *</legend>${(isObject?objects:Object.values(appScenes)).map(t=>`<label class="check-row"><input type="checkbox" ${isObject?'data-knowledge-object':'data-knowledge-scene'}="${esc(t.id)}" ${(isObject?v.objects:v.scenes).includes(t.id)?'checked':''}>${esc(t.name)}</label>`).join('')}</fieldset>${field('用途说明 *','purpose',v.purpose||'','textarea',[],isObject?'说明这些知识如何围绕对象进行检索和串联':'说明此知识在该应用问答中的适用内容',true)}</div>`,btn('保存关联','save-knowledge-link','primary','check'));
};
extraDrawers.knowledgeEvidence=function(){const k=state.drawer.target,doc=contextKnowledgeDocument(k);return frame('知识依据',esc(k.title),`<div class="panel-body"><h3>${esc(k.library||doc?.library||'未指定知识库')}</h3>${doc?`<p class="tiny muted section-gap">${esc(doc.version)} · ${esc(doc.section)}</p><p class="knowledge-evidence-text">${esc(doc.text)}</p>`:inf('此项仅保存关联配置，尚无可检索正文。')}</div>`,'',true)};
Object.assign(actionsMap,{
  'knowledge-dimension':el=>{knowledgeContext.scope=el.dataset.scope;knowledgeContext.query='';render();},
  'knowledge-focus-object':el=>{if(!obj(el.dataset.id))return;knowledgeContext.object=el.dataset.id;knowledgeContext.scope='object';knowledgeContext.query='';render();},
  'knowledge-search':()=>render(),
  'knowledge-evidence':el=>{const target=knowledgeLinks[Number(el.dataset.index)];if(target)openDrawer('knowledgeEvidence',{}, {target,readonly:true});},
  'knowledge-open-object':()=>{knowledgeContext.scope='object';knowledgeContext.object=state.object;knowledgeContext.query='';navigate('knowledge');},
  'knowledge-open-scene':el=>{knowledgeContext.scope='scene';knowledgeContext.scene=el.dataset.scene||scene().id;knowledgeContext.query='';navigate('knowledge');},
  'add-knowledge-link':()=>openDrawer('knowledgeLink',{scope:knowledgeContext.scope,documentId:'',library:'',title:'',purpose:'',objects:knowledgeContext.scope==='object'?[knowledgeContext.object]:[],scenes:knowledgeContext.scope==='scene'?[knowledgeContext.scene]:[]}),
  'save-knowledge-link':()=>{
    const d=state.drawer;if(d?.type!=='knowledgeLink')return;const v=d.draft,scope=v.scope,isObject=scope==='object',ids=[...new Set(isObject?v.objects:v.scenes)];
    if(!['object','scene'].includes(scope))return errorDrawer('请选择配置维度。');
    if(!v.library.trim()||!v.title.trim()||!v.purpose.trim())return errorDrawer('请填写知识库名称、文档名称和用途说明。');
    if(!ids.length||ids.some(id=>isObject?!obj(id):!appScenes[id]))return errorDrawer(isObject?'请至少选择一个有效的本体对象。':'请至少选择一个有效的应用场景。');
    const document=knowledgeDocuments.find(doc=>doc.id===v.documentId);
    if(v.documentId&&!document)return errorDrawer('所选文档已不存在，请重新选择。');
    if(document&&(v.title.trim()!==document.title||v.library.trim()!==document.library))return errorDrawer('文档名称或知识库已修改，请重新选择知识来源，或改为手工关联。');
    if(knowledgeLinks.some(k=>(k.scope||'object')===scope&&k.library===v.library.trim()&&k.title===v.title.trim()&&(isObject?k.objects:k.scenes||[]).some(id=>ids.includes(id))))return errorDrawer('该范围已配置相同知识，请勿重复关联。');
    knowledgeLinks.push({scope,library:v.library.trim(),title:v.title.trim(),purpose:v.purpose.trim(),objects:isObject?ids:[],scenes:isObject?[]:ids,...(document?{documentId:document.id,version:document.version}:{})});
    if(!isObject)ids.forEach(contextKnowledgeSceneConfig);knowledgeContext.scope=scope;knowledgeContext[isObject?'object':'scene']=ids[0];changed();log('知识关联',v.title,'成功',`${isObject?'本体对象':'应用场景'}：${ids.join('、')}`);closeOverlay(true);render();toast('知识配置已保存');
  }
});
document.addEventListener('input',e=>{if(e.target.hasAttribute('data-knowledge-query'))knowledgeContext.query=e.target.value;});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.hasAttribute('data-knowledge-query')){e.preventDefault();render();}});
document.addEventListener('change',e=>{
  const el=e.target,d=state.drawer;
  if(el.dataset.knowledgeContext){knowledgeContext[el.dataset.knowledgeContext]=el.value;knowledgeContext.query='';render();return;}
  if(d?.type!=='knowledgeLink')return;
  if(el.dataset.knowledgeScene){const id=el.dataset.knowledgeScene;d.draft.scenes=d.draft.scenes.filter(value=>value!==id);if(el.checked)d.draft.scenes.push(id);d.dirty=true;return;}
  if(el.dataset.field==='scope')drawOverlay();
  if(el.dataset.field==='documentId'){
    const doc=knowledgeDocuments.find(item=>item.id===el.value);if(doc){d.draft.library=doc.library;d.draft.title=doc.title;}else{d.draft.title='';d.draft.library='';}drawOverlay();
  }
  if(['title','library'].includes(el.dataset.field)&&d.draft.documentId){const doc=knowledgeDocuments.find(item=>item.id===d.draft.documentId);if(doc&&(d.draft.title!==doc.title||d.draft.library!==doc.library))d.draft.documentId='';}
});

const contextDeletionPlanBefore=deletionPlan;
deletionPlan=function(kind,target,owner={}){
  const plan=contextDeletionPlanBefore(kind,target,owner);
  if(kind==='knowledgeLink')plan.detail=`配置维度：${target.scope==='scene'?'应用场景':'本体对象'}；${target.scope==='scene'?(target.scenes||[]).map(id=>appScenes[id]?.name||id).join('、'):target.objects.map(name).join('、')}。只移除知识关联，保留知识库、文档及配置对象。`;
  if(kind==='scene')for(const k of contextKnowledgeLinks('scene',target.id))plan.refs.push(`知识“${k.title}”配置于此场景，请先删除关联。`);
  return plan;
};
const contextConfirmDeletionBefore=confirmDeletion;
confirmDeletion=function(){const d=state.drawer,targets=d?.deleteKind==='knowledgeLink'&&d.target.scope==='scene'?[...(d.target.scenes||[])]:[],target=d?.target,present=knowledgeLinks.includes(target);contextConfirmDeletionBefore();if(present&&!knowledgeLinks.includes(target))targets.forEach(contextKnowledgeSceneConfig);};
actionsMap['confirm-delete-config']=confirmDeletion;

// 手工维护场景知识后，现有问答 Demo 只使用该场景的显式知识范围。
const contextQAAnswerBefore=qaDemoAnswer;
qaDemoAnswer=function(config,v){
  const s=Object.values(appScenes).find(s=>s.workflow?.application===config);
  if(config.qaScope==='platform'){
    const published=typeof objectReleaseRunningPublished!=='undefined'&&objectReleaseRunningPublished&&s;
    const documents=published?sceneReleaseEnsure(s).snapshot?.platformDocuments:undefined;
    return platformKnowledgeAnswer(config,v,documents??platformKnowledgeCorpus(config));
  }
  if(!s?.knowledgeScopeConfigured)return contextQAAnswerBefore(config,v);
  const links=contextKnowledgeLinks('scene',s.id),titles=links.flatMap(k=>[k.title,...(k.documentId==='material-guide'?['商品目录资料维护指引']:[])]).join('；');
  return contextQAAnswerBefore({...config,qaKnowledge:titles},v);
};
// 场景已有的知识范围编辑入口与统一关联列表保持一致。
const contextSaveApplicationBefore=applicationSaveConfig;
applicationSaveConfig=function(s,v){
  contextSaveApplicationBefore(s,v);
  if(workflowScene(s).type!=='qa'||v.qaScope==='platform'||v.qaKnowledge===undefined)return;
  const previous=contextKnowledgeLinks('scene',s.id);
  for(const k of previous){k.scenes=k.scenes.filter(id=>id!==s.id);if(!k.scenes.length)knowledgeLinks.splice(knowledgeLinks.indexOf(k),1);}
  const seen=new Set();
  for(const part of String(v.qaKnowledge).split(/[；;、\n]/).map(value=>value.trim()).filter(Boolean)){
    const doc=knowledgeDocuments.find(d=>part.includes(d.title.replace(/\.[^.]+$/,''))||(d.id==='material-guide'&&part.includes('商品目录资料维护指引'))),title=doc?.title||part;
    if(seen.has(title))continue;seen.add(title);
    const old=previous.find(k=>k.title===title);
    knowledgeLinks.push({scope:'scene',library:doc?.library||old?.library||'场景专用知识库',title,documentId:doc?.id,version:doc?.version,objects:[],scenes:[s.id],purpose:old?.purpose||'当前应用问答的规范与说明'});
  }
  contextKnowledgeSceneConfig(s.id);
};
const contextObjectPageBefore=pages.objects;
pages.objects=function(){return contextObjectPageBefore()+`<section class="panel section-gap"><div class="panel-head between"><div><h3>对象知识库</h3><p class="tiny muted section-gap">以 ${esc(obj()?.name||'当前对象')} 为入口，检索跨知识库内容并查看关联图谱。</p></div>${btn('配置知识库与图谱','knowledge-open-object','sm','book')}</div></section>`;};
const contextScenePageBefore=pages.scenes;
pages.scenes=function(){const s=scene();if(workflowScene(s).type==='qa'&&appConfig(s).qaScope==='platform')return contextScenePageBefore();return contextScenePageBefore()+`<section class="panel section-gap"><div class="panel-head between"><div><h3>场景知识库</h3><p class="tiny muted section-gap">${esc(s.name)} 的问答知识单独配置，${contextKnowledgeLinks('scene',s.id).length} 项显式关联。</p></div>${btn('配置场景知识库','knowledge-open-scene','sm','book',`data-scene="${esc(s.id)}"`)}</div></section>`;};
pages.knowledge=contextKnowledgePage;
render();
