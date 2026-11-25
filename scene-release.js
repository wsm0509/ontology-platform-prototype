/* 场景独立发布、修订和版本记录。仅操作当前会话中的配置与样例。 */
'use strict';
const sceneReleaseStore = new Map();
const sceneReleaseUI = {query:'', status:'ALL', type:'ALL'};
const sceneReleaseActor = '演示管理员';
function sceneReleaseTime(){return new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
function sceneReleaseConfiguration(s){
  const data=structuredClone(s);delete data.lastResult;delete data.selectedBlock;delete data.revision;
  const knowledgeQA=typeof knowledgeQACompile==='function'&&workflowScene(s).type==='qa'?knowledgeQACompile(s):null;
  const knowledgeQAEntrySnapshot=typeof knowledgeQAEntry==='function'&&workflowScene(s).type==='draft'?knowledgeQAEntry(s,'draft'):null;
  return {scene:data,...(knowledgeQA?{knowledgeQA}:{}),...(knowledgeQAEntrySnapshot?{knowledgeQAEntry:knowledgeQAEntrySnapshot}:{}),queries:sceneReleaseDependencies(s).queries,knowledge:contextKnowledgeLinks('scene',s.id).map(k=>({...structuredClone(k),scenes:[s.id]})),knowledgeRules:knowledgeSync.rules.filter(r=>r.sceneId===s.id).map(r=>structuredClone(r))};
}
function sceneReleaseEnsure(s){
  let m=sceneReleaseStore.get(s.id);if(m&&!m.deleted)return m;
  const at=sceneReleaseTime();m={status:'草稿',editing:false,published:0,snapshot:null,check:null,updatedAt:at,updatedBy:sceneReleaseActor,history:[]};sceneReleaseStore.set(s.id,m);
  m.history.push({version:1,at,by:sceneReleaseActor,action:'创建草稿',from:'—',to:'草稿',note:'当前场景尚未发布',snapshot:sceneReleaseConfiguration(s)});return m;
}
function sceneReleaseRecord(s,action,from,note){const m=sceneReleaseEnsure(s);m.updatedAt=sceneReleaseTime();m.updatedBy=sceneReleaseActor;const snapshot=sceneReleaseConfiguration(s);if(action==='恢复上次发布配置'&&m.snapshot?.queries)snapshot.queries=structuredClone(m.snapshot.queries);m.history.unshift({version:m.status==='已发布'?m.published:m.published+1,at:m.updatedAt,by:m.updatedBy,action,from,to:m.status,note,snapshot});m.trackedConfiguration=JSON.stringify(m.history[0].snapshot);}
function sceneReleaseDependencies(s){
  const w=workflowScene(s),type=w.type,platform=type==='qa'&&appConfig(s).qaScope==='platform',objectsUsed=new Set(platform?[]:[s.root]),queries=new Set();
  if(type==='qa'&&typeof knowledgeQACompile==='function'){
    const compiled=knowledgeQACompile(s);
    return {objects:compiled.objectIds.map(id=>({id,value:structuredClone(obj(id)||null)})),queries:[],connectors:[],relations:compiled.relations,knowledge:compiled.sources};
  }
  if(['draft','validation'].includes(type)){
    for(const b of Object.values(w.blocks))objectsUsed.add(b.object);
    for(const b of Object.values(s.bindings).flat()){objectsUsed.add(b.ontology.split('.')[0]);workflowBindingSourceIds(s,b).forEach(id=>queries.add(id));}
    if(w.instanceSource==='system'){queries.add(s.candidate);queries.add(s.master);}
    if(s.bom)queries.add('plm.queryBom');if(s.cert)queries.add('cert.queryApplicable');
    for(const r of w.rules.filter(r=>r.enabled))for(const a of [...r.conditions,...r.assertions]){const id=ruleFact(s,r,a.fact)?.capability;if(id)queries.add(id);}
  }else if(platform){
    return {objects:[],queries:[],connectors:[],relations:[],knowledge:structuredClone(platformKnowledgeCorpus(appConfig(s)))};
  }else if(type==='qa'){
    w.qa.objects.forEach(id=>objectsUsed.add(id));
    [s.candidate,s.master,'plm.queryBom','cert.queryApplicable','software.getPackage','demo.productDocuments','demo.safetyDI','demo.minimumSystem'].forEach(id=>queries.add(id));
  }else ['ReleaseOrder','ReleaseItem','ModuleOrder','Mapping','Material','Software'].forEach(id=>objectsUsed.add(id));
  const queryList=[...queries].filter(Boolean).map(id=>({id,value:structuredClone(ability(id)||null)}));
  queryList.forEach(({value})=>{if(value&&value.object!=='Context')objectsUsed.add(value.object)});
  const links=relations.filter(r=>objectsUsed.has(r.from)&&objectsUsed.has(r.to));
  return {objects:[...objectsUsed].sort().map(id=>({id,value:structuredClone(obj(id)||null)})),queries:queryList,connectors:[...new Set(queryList.map(c=>c.value?.connector).filter(Boolean))].sort().map(id=>({id,value:structuredClone(connector(id)||null)})),relations:structuredClone(links),knowledge:contextKnowledgeLinks('scene',s.id).map(k=>({id:k.documentId,title:k.title,document:structuredClone(contextKnowledgeDocument(k)||null)}))};
}
function sceneReleaseFingerprint(s){return JSON.stringify({configuration:sceneReleaseConfiguration(s),dependencies:sceneReleaseDependencies(s)});}
function sceneReleaseCheckCurrent(s){const m=sceneReleaseEnsure(s);return !!m.check&&m.check.fingerprint===sceneReleaseFingerprint(s);}
function sceneReleaseCanEdit(s){return !!s&&sceneReleaseEnsure(s).editing&&sceneReleaseEnsure(s).status!=='已发布';}
function sceneReleaseBadge(s){const m=sceneReleaseEnsure(s);return pill(m.status,m.status==='已发布'?'green':m.status==='修订'?'blue':'amber');}
function sceneReleaseControls(s){
  const m=sceneReleaseEnsure(s),id=`data-id="${esc(s.id)}"`,v=m.status==='已发布'?`已发布 v${m.published}`:`待发布 v${m.published+1}${m.published?` · 上次发布 v${m.published}`:''}`;
  return `<div class="scene-release-meta"><b>${esc(v)}</b><small>更新于 ${esc(m.updatedAt)}</small><small>${esc(m.updatedBy)}</small></div><div class="scene-release-button-stack">${btn('删除场景','delete-scene','sm danger','',id)}${btn(m.editing?'完成编辑':'编辑','scene-release-edit',m.editing?'sm primary':'sm','edit',id)}${m.status==='修订'?btn(`恢复到 v${m.published}`,'scene-release-rollback','sm','refresh',id):''}</div>`;
}
function sceneReleaseCheck(s){
  const w=workflowScene(s),deps=sceneReleaseDependencies(s),groups=[];
  const group=(label,issues)=>groups.push({label,issues:[...new Set(issues)],ok:issues.length===0});
  group('场景名称与应用类型',[!s.name?.trim()?'请填写场景名称':'',!s.app?.trim()?'请填写所属业务模块':'',!applicationTypes[w.type]?'应用类型不存在':'',w.type!=='qa'&&!obj(s.root)?'场景的主对象不存在':''].filter(Boolean));
  const objectIssues=[];for(const {id,value:o}of deps.objects){if(!o){objectIssues.push(`本体对象 ${id} 不存在`);continue;}if(o.props.filter(p=>p.key).length!==1)objectIssues.push(`${o.name} 必须有且仅有一个唯一编号属性`);if(new Set(o.props.map(p=>p.id)).size!==o.props.length)objectIssues.push(`${o.name} 存在重复属性`);for(const p of o.props)if(p.ref&&!obj(p.ref))objectIssues.push(`${o.name} / ${p.name} 引用的对象不存在`);}
  for(const r of deps.relations){const issue=relationAttributeIssue(r);if(issue)objectIssues.push(`关系“${r.name}”：${issue}`);}
  group('本体对象、属性和关联关系',objectIssues);
  const queryIssues=[];for(const {id,value:c}of deps.queries){if(!c){queryIssues.push(`查询 ${id} 不存在`);continue;}const sys=connector(c.connector);if(!sys)queryIssues.push(`${c.name} 所属的系统连接不存在`);else if(!sys.enabled)queryIssues.push(`${sys.name} 已停用，无法使用 ${c.name}`);if(!c.resource?.trim())queryIssues.push(`${c.name} 未填写查询地址或表名`);if(!c.maps?.length)queryIssues.push(`${c.name} 未设置查询字段`);const conditionIssue=capabilityConditionError(c);if(conditionIssue)queryIssues.push(`${c.name}：${conditionIssue}`);for(const map of c.maps||[]){if(!map.source?.trim()||!map.target?.trim())queryIssues.push(`${c.name} 有未完成的字段对应`);if(c.object==='Context'){if(!/^Context\.\w+(?:\.\w+)*$/.test(map.target))queryIssues.push(`${c.name} 的本次业务字段格式不正确`);}else{const [oid,pid]=map.target.split('.');if(oid!==c.object||!obj(oid)?.props.some(p=>p.id===pid))queryIssues.push(`${c.name} 的目标属性不存在或不属于所选对象`);}}if(new Set(c.maps.map(m=>m.target)).size!==c.maps.length)queryIssues.push(`${c.name} 的目标属性重复`);if(c.object!=='Context'){const key=obj(c.object)?.props.find(p=>p.key);if(!key||!c.maps.some(m=>m.target===`${c.object}.${key.id}`))queryIssues.push(`${c.name} 缺少唯一编号对应`);}if(new Set(c.params.map(p=>p[0])).size!==c.params.length)queryIssues.push(`${c.name} 的查询条件名称重复`);}
  group(deps.queries.length?'所用查询与系统连接':'查询与系统连接（本类型无需外部查询）',queryIssues);
  if(['draft','validation'].includes(w.type)){
    const issues=[],blocks=Object.values(w.blocks);if(!blocks.length||blocks.filter(b=>!b.parent).length!==1)issues.push('表单应有且仅有一个主单区块');
    if(new Set(blocks.map(b=>b.path)).size!==blocks.length)issues.push('表单区块的字段组名称重复');
    for(const b of blocks){if(!obj(b.object))issues.push(`${b.label} 对应的本体对象不存在`);if(!b.fields.some(f=>f.key===b.keyField))issues.push(`${b.label} 未设置记录的唯一编号字段`);if(new Set(b.fields.map(f=>f.key)).size!==b.fields.length)issues.push(`${b.label} 的字段名称重复`);if(b.parent&&!w.blocks[b.parent])issues.push(`${b.label} 的所属区块不存在`);let parent=b.parent,seen=new Set([b.id]);while(parent&&w.blocks[parent]){if(seen.has(parent)){issues.push(`${b.label} 的所属区块形成循环`);break;}seen.add(parent);parent=w.blocks[parent].parent;}
      const bindings=s.bindings[b.id]||[];if(new Set(bindings.map(m=>m.target)).size!==bindings.length)issues.push(`${b.label} 有重复的表单字段对应`);for(const m of bindings){const sourceError=workflowBindingSourcesError(s,m);if(sourceError)issues.push(`${b.label} / ${m.label}：${sourceError}`);const [oid,pid]=m.ontology.split('.');if(!obj(oid)?.props.some(p=>p.id===pid))issues.push(`${b.label} / ${m.label} 的本体对象属性不存在`);if(!b.fields.some(f=>scenePrefix(s,b.id)+f.key===m.target))issues.push(`${b.label} / ${m.label} 的表单字段未登记`);if(w.type==='draft'&&(!m.sinkTable?.trim()||!m.sinkColumn?.trim()))issues.push(`${b.label} / ${m.label} 未填写业务系统保存位置`);if(m.instanceMode==='manual'&&!(manualInstances[oid]||[]).some(row=>row.identity===m.instanceIdentity))issues.push(`${b.label} / ${m.label} 的手工记录不存在`);}}
    for(const id of Object.keys(s.bindings))if(!w.blocks[id])issues.push(`字段对应的区块 ${id} 不存在`);
    group('表单结构和字段对应',issues);
    group('已启用的校验规则',w.rules.filter(r=>r.enabled).map(r=>{try{const error=validateWorkflowRule(s,r);return error?`${r.name}：${error}`:'';}catch{return `${r.name} 的执行对象或字段不完整`;}}).filter(Boolean));
  }
  const newQA=w.type==='qa'&&typeof knowledgeQAConfigurationIssues==='function';
  const settings=newQA?'':applicationConfigError({...appConfig(s),sceneType:w.type},w.type);
  const settingsIssues=newQA?knowledgeQAConfigurationIssues(s,knowledgeQAProfile(s)):settings?[settings]:[];
  if(w.type==='draft'&&w.knowledgeQAEntry&&typeof knowledgeQAPublished==='function'){
    const {id,version}=w.knowledgeQAEntry;
    if(!knowledgeQAPublished(id,version)?.objectIds.includes(s.root))settingsIssues.push('辅助问答引用不可用，或未覆盖当前场景主对象。');
  }
  if(w.type==='recommendation'&&![1,2,3].includes(Number(appConfig(s).recommendationLimit)))settingsIssues.push('推荐结果数量应为 1 至 3 项');
  if(w.type==='qa'&&!newQA&&appConfig(s).qaScope!=='platform'){for(const path of w.qa.fields){const [oid,pid]=path.split('.');if(!w.qa.objects.includes(oid)||!obj(oid)?.props.some(p=>p.id===pid))settingsIssues.push(`问答检索属性 ${path} 不存在或超出所选对象范围`);}}
  group('本应用的专属配置',settingsIssues);
  group('场景专属知识库',contextKnowledgeLinks('scene',s.id).filter(k=>k.documentId&&!contextKnowledgeDocument(k)).map(k=>`知识文档“${k.title}”已不存在`));
  return {sceneId:s.id,sceneName:s.name,ok:groups.every(g=>g.ok),groups,at:sceneReleaseTime(),by:sceneReleaseActor,fingerprint:sceneReleaseFingerprint(s)};
}
function sceneReleaseCheckLabel(s){const m=sceneReleaseEnsure(s);if(!m.check)return '尚未检查';if(!sceneReleaseCheckCurrent(s))return '配置已变化，需重查';return m.check.ok?'检查通过':'检查未通过';}
function sceneReleaseListPage(){
  const list=Object.values(appScenes),filtered=list.filter(s=>(sceneReleaseUI.status==='ALL'||sceneReleaseEnsure(s).status===sceneReleaseUI.status)&&(sceneReleaseUI.type==='ALL'||workflowScene(s).type===sceneReleaseUI.type)&&(s.name+s.app+s.id).toLowerCase().includes(sceneReleaseUI.query.toLowerCase()));
  return header('场景配置发布','逐个场景检查并发布。一个场景的修改和发布，不改变其他场景。','','场景版本')+`<div class="release-scene-summary">${[['全部场景',list.length],['草稿',list.filter(s=>sceneReleaseEnsure(s).status==='草稿').length],['已发布',list.filter(s=>sceneReleaseEnsure(s).status==='已发布').length],['修订',list.filter(s=>sceneReleaseEnsure(s).status==='修订').length]].map(([label,count])=>`<div class="panel"><small>${label}</small><b>${count}</b></div>`).join('')}</div><section class="panel"><div class="filterbar release-scene-filters"><div class="search">${icon('search')}<input aria-label="搜索要发布的场景" data-release-filter="query" placeholder="搜索场景、模块或英文代号（回车查询）" value="${esc(sceneReleaseUI.query)}"></div><select class="select" aria-label="按发布状态筛选" data-release-filter="status">${options([['ALL','全部状态'],['草稿','草稿'],['已发布','已发布'],['修订','修订']],sceneReleaseUI.status)}</select><select class="select" aria-label="按场景类型筛选" data-release-filter="type">${options([['ALL','全部应用类型'],...Object.entries(applicationTypes).map(([id,t])=>[id,t.title])],sceneReleaseUI.type)}</select></div><div class="table-wrap"><table class="config-table scene-release-table"><thead><tr><th>应用场景</th><th>状态 / 配置版本</th><th>检查结果</th><th>更新时间 / 更新人</th><th>操作</th></tr></thead><tbody>${filtered.map(s=>{const m=sceneReleaseEnsure(s),id=`data-id="${esc(s.id)}"`,current=sceneReleaseCheckCurrent(s);return `<tr><td class="field-name">${esc(s.name)}<small>${esc(applicationTypes[workflowScene(s).type]?.title||'未知类型')} · ${esc(s.app)}</small></td><td>${sceneReleaseBadge(s)}<small class="field-path">${m.status==='已发布'?`v${m.published}`:`待发布 v${m.published+1}${m.published?` · 已发布 v${m.published}`:''}`}</small></td><td>${pill(sceneReleaseCheckLabel(s),current?(m.check.ok?'green':'red'):'amber')}${m.editing?'<small class="field-path">请在场景中完成编辑后发布</small>':''}</td><td><span class="tiny">${esc(m.updatedAt)}</span><small class="field-path">${esc(m.updatedBy)}</small></td><td><div class="row">${btn('检查配置','scene-release-check','sm','shield',id)}${btn('发布场景','scene-release-prepare','sm primary','upload',id+((m.status==='已发布'||m.editing||!current||!m.check.ok)?' disabled':''))}</div><div class="row section-gap">${btn('查看场景','scene-release-open','sm','',id)}${btn('版本记录','scene-release-history','sm','clock',id)}</div></td></tr>`;}).join('')||'<tr><td colspan="5" class="empty">没有符合条件的场景</td></tr>'}</tbody></table></div></section><p class="session-note">检查范围包含当前场景及所用的本体对象、查询、系统连接和知识配置。发布记录仅保留在本次会话，更新人为演示管理员。</p>`;
}
function sceneVersionHistory(s){const m=sceneReleaseEnsure(s);return `<div class="panel-body"><div class="between"><div><h3>版本记录</h3><p class="tiny muted section-gap">配置版本独立于表单版本 ${esc(s.version)}；记录草稿、发布、修订和恢复过程。</p></div>${btn('前往配置发布','to-release','sm','upload')}</div><div class="table-wrap section-gap"><table class="config-table scene-version-table"><thead><tr><th>配置版本 / 操作</th><th>更新时间</th><th>更新人</th><th>状态变更</th><th>说明</th><th>配置</th></tr></thead><tbody>${m.history.map((h,i)=>`<tr><td class="field-name">v${h.version}<small>${esc(h.action)}</small></td><td>${esc(h.at)}</td><td>${esc(h.by)}</td><td>${esc(h.from)} → ${esc(h.to)}</td><td>${esc(h.note)}</td><td>${btn('查看快照','scene-release-snapshot','sm','eye',`data-id="${esc(s.id)}" data-index="${i}"`)}</td></tr>`).join('')}</tbody></table></div></div>`;}
function sceneReleaseCheckDrawer(){const d=state.drawer,s=appScenes[d.sceneId];if(!s)return frame('场景已不存在','','');const m=sceneReleaseEnsure(s),c=m.check,current=sceneReleaseCheckCurrent(s);return frame(`检查配置 · ${esc(s.name)}`,'只检查当前场景及其使用的配置。',`${inf(!current?'配置已变化，请重新检查。':c.ok?'检查通过，可以发布当前场景。':'存在未完成配置，请先在场景中处理。',current&&c.ok?'green':'amber')}<p class="tiny muted section-gap">${esc(c.at)} · ${esc(c.by)}</p>${c.groups.map(g=>`<div class="release-check-group"><div class="between"><b>${esc(g.label)}</b>${pill(g.ok?'通过':'未通过',g.ok?'green':'red')}</div>${g.issues.length?`<ul class="deletion-list">${g.issues.map(issue=>`<li>${esc(issue)}</li>`).join('')}</ul>`:''}</div>`).join('')}`,btn('查看场景','scene-release-open','','',`data-id="${esc(s.id)}"`)+(current&&c.ok&&!m.editing&&m.status!=='已发布'?btn('发布当前场景','scene-release-prepare','primary','upload',`data-id="${esc(s.id)}"`):''),true);}
function sceneReleasePrepareDrawer(){const s=appScenes[state.drawer.sceneId],m=sceneReleaseEnsure(s),w=workflowScene(s);return frame(`发布场景 · ${esc(s.name)}`,'仅发布这一场景，其他场景保持原版本。',`${inf(`即将发布配置版本 v${m.published+1}。发布后场景切换为“已发布”，编辑和删除配置需先进入修订。`,'green')}<dl class="kv section-gap"><dt>场景</dt><dd>${esc(s.name)}</dd><dt>应用类型</dt><dd>${esc(applicationTypes[w.type].title)}</dd><dt>检查</dt><dd>${esc(sceneReleaseCheckLabel(s))}</dd><dt>字段对应</dt><dd>${Object.values(s.bindings).flat().length} 项</dd><dt>校验规则</dt><dd>${['draft','validation'].includes(w.type)?w.rules.filter(r=>r.enabled).length:0} 项已启用</dd><dt>场景知识</dt><dd>${contextKnowledgeLinks('scene',s.id).length} 项</dd><dt>发布人</dt><dd>${esc(sceneReleaseActor)}</dd></dl>`,btn(`确认发布 v${m.published+1}`,'scene-release-publish','primary','upload'),true);}
function sceneReleaseRollbackDrawer(){const s=appScenes[state.drawer.sceneId],m=sceneReleaseEnsure(s);return frame('放弃修订并恢复配置',esc(s.name),`${inf(`将丢弃当前尚未发布的修订，恢复到上次发布的 v${m.published}。本场景的表单、字段、规则、策略和专属知识配置会一并恢复。`,'amber')}<p class="tiny muted section-gap">版本记录会保留，其他场景和公共对象、查询、系统连接不会被覆盖。</p>`,btn(`确认恢复 v${m.published}`,'scene-release-confirm-rollback','primary','refresh'),true);}
function sceneReleaseSnapshotDrawer(){const h=state.drawer.record,c=h.snapshot,w=c.scene.workflow;return frame(`配置快照 · v${h.version}`,`${esc(c.scene.name)} · ${esc(h.action)}`,`<dl class="kv"><dt>更新时间</dt><dd>${esc(h.at)}</dd><dt>更新人</dt><dd>${esc(h.by)}</dd><dt>状态变更</dt><dd>${esc(h.from)} → ${esc(h.to)}</dd><dt>应用类型</dt><dd>${esc(applicationTypes[w.type]?.title||w.type)}</dd><dt>字段对应</dt><dd>${Object.values(c.scene.bindings).flat().length} 项</dd><dt>场景知识</dt><dd>${c.knowledge.length} 项</dd></dl><details class="plain-details section-gap"><summary>查看完整配置快照（供核对）</summary>${jsonView(c)}</details>`,'',true);}
function sceneReleasePublish(id){
  const s=appScenes[id];if(!s)return toast('场景已不存在');const m=sceneReleaseEnsure(s);if(m.status==='已发布')return toast('当前场景已经发布');if(m.editing)return toast('请先在场景中完成编辑');if(!sceneReleaseCheckCurrent(s)||!m.check.ok)return toast('请先重新检查当前场景，检查通过后才能发布');
  const from=m.status;m.published++;m.status='已发布';m.editing=false;m.snapshot=sceneReleaseConfiguration(s);m.dependencies=sceneReleaseDependencies(s);sceneReleaseRecord(s,'发布配置',from,`配置 v${m.published} 已发布`);log('场景配置发布',s.name,'成功',`${from} → 已发布 · v${m.published} · ${sceneReleaseActor}`);Object.assign(state.logs[0],{sceneId:s.id,applicationType:workflowScene(s).type,sceneConfigVersion:m.published,sceneConfigState:m.status,evidence:structuredClone(m.history[0])});closeOverlay(true);render();toast(`已发布“${s.name}”配置 v${m.published}`);
}
function sceneReleaseRestore(id){
  const s=appScenes[id],m=s&&sceneReleaseEnsure(s);if(!m||m.status!=='修订'||!m.snapshot)return toast('当前没有可恢复的已发布版本');const saved=structuredClone(m.snapshot),revision=s.revision+1;
  appScenes[id]={...saved.scene,revision,lastResult:null,selectedBlock:Object.keys(saved.scene.names)[0]};
  for(const k of [...contextKnowledgeLinks('scene',id)]){k.scenes=k.scenes.filter(value=>value!==id);if(!k.scenes.length)knowledgeLinks.splice(knowledgeLinks.indexOf(k),1);}
  knowledgeLinks.push(...saved.knowledge);for(let i=knowledgeSync.rules.length-1;i>=0;i--)if(knowledgeSync.rules[i].sceneId===id)knowledgeSync.rules.splice(i,1);knowledgeSync.rules.push(...saved.knowledgeRules);
  m.status='已发布';m.editing=false;m.check=null;sceneReleaseRecord(appScenes[id],'恢复上次发布配置','修订',`放弃修订，恢复到 v${m.published}`);changed();log('场景配置恢复',appScenes[id].name,'成功',`修订 → 已发布 · 恢复 v${m.published}`);Object.assign(state.logs[0],{sceneId:id,sceneConfigVersion:m.published,sceneConfigState:m.status,evidence:structuredClone(m.history[0])});closeOverlay(true);render();toast(`已恢复到上次发布的 v${m.published}`);
}
Object.assign(extraDrawers,{sceneReleaseCheck:sceneReleaseCheckDrawer,sceneReleasePrepare:sceneReleasePrepareDrawer,sceneReleaseRollback:sceneReleaseRollbackDrawer,sceneReleaseSnapshot:sceneReleaseSnapshotDrawer});
Object.assign(actionsMap,{
  'scene-release-check':el=>{const s=appScenes[el.dataset.id];if(!s)return;const m=sceneReleaseEnsure(s);m.check=sceneReleaseCheck(s);log('场景配置检查',s.name,m.check.ok?'通过':'未通过',`仅检查 ${s.name} 及所用配置`);Object.assign(state.logs[0],{sceneId:s.id,sceneConfigVersion:m.status==='已发布'?m.published:m.published+1,sceneConfigState:m.status,evidence:structuredClone(m.check)});openDrawer('sceneReleaseCheck',{}, {sceneId:s.id,readonly:true});render();},
  'scene-release-prepare':el=>{const s=appScenes[el.dataset.id];if(!s)return;const m=sceneReleaseEnsure(s);if(m.status==='已发布')return toast('当前场景已经发布');if(m.editing)return toast('请先在场景中完成编辑');if(!sceneReleaseCheckCurrent(s)||!m.check.ok)return toast('请先重新检查当前场景');openDrawer('sceneReleasePrepare',{}, {sceneId:s.id,readonly:true,checkedFingerprint:m.check.fingerprint,targetVersion:m.published+1});},
  'scene-release-publish':()=>{const d=state.drawer,s=appScenes[d?.sceneId],m=s&&sceneReleaseEnsure(s);if(!s||d.type!=='sceneReleasePrepare')return;if(d.checkedFingerprint!==sceneReleaseFingerprint(s)||d.targetVersion!==m.published+1)return errorDrawer('配置已变化，请关闭后重新检查并确认发布。');sceneReleasePublish(s.id);},
  'scene-release-open':el=>{const s=appScenes[el.dataset.id];if(s){selectScene(s.id,'strategy');navigate('scenes');}},
  'scene-release-history':el=>{if(appScenes[el.dataset.id]){selectScene(el.dataset.id,'versions');navigate('scenes');}},
  'scene-release-snapshot':el=>{const s=appScenes[el.dataset.id],h=s&&sceneReleaseEnsure(s).history[Number(el.dataset.index)];if(h)openDrawer('sceneReleaseSnapshot',{}, {record:structuredClone(h),readonly:true});},
  'scene-release-edit':el=>{const s=appScenes[el.dataset.id];if(!s)return;const m=sceneReleaseEnsure(s);if(m.editing){m.editing=false;sceneReleaseRecord(s,'完成编辑',m.status,'配置已保存，检查后可发布');}else{const from=m.status;m.editing=true;if(m.published)m.status='修订';m.check=null;sceneReleaseRecord(s,'开始编辑',from,m.published?`基于已发布 v${m.published} 修订`:'编辑当前草稿');}render();},
  'scene-release-rollback':el=>{const s=appScenes[el.dataset.id];if(s&&sceneReleaseEnsure(s).status==='修订')openDrawer('sceneReleaseRollback',{}, {sceneId:s.id,readonly:true});},
  'scene-release-confirm-rollback':()=>sceneReleaseRestore(state.drawer?.sceneId),
  'check-release':()=>actionsMap['scene-release-check']({dataset:{id:scene().id}}),
  publish:()=>actionsMap['scene-release-prepare']({dataset:{id:scene().id}})
});
const sceneReleaseTabsBefore=workflowTabs;workflowTabs=function(s){return [...sceneReleaseTabsBefore(s),['versions','版本记录']];};
const sceneReleaseMutations=new Set(['workflow-settings','workflow-save-settings','app-save-settings','edit-scene','save-scene','edit-scene-rules','save-scene-rules','workflow-add-block','workflow-edit-block','workflow-save-block','workflow-delete-block','workflow-confirm-delete-block','add-scene-binding','edit-scene-binding','save-scene-binding','delete-scene-binding','workflow-add-rule','workflow-edit-rule','workflow-save-rule','workflow-delete-rule','workflow-confirm-delete-rule','workflow-add-clause','workflow-remove-clause','delete-scene']);
function sceneReleaseActionTargets(action,el){
  if(sceneReleaseMutations.has(action))return [action==='delete-scene'?el?.dataset.id:scene()?.id].filter(Boolean);
  if(['sync-edit-rule','sync-save-rule'].includes(action)){const rule=knowledgeSync.rules.find(r=>r.id===(el?.dataset.id||state.drawer?.draft?.id));const ids=[rule?.sceneId,action==='sync-save-rule'?state.drawer?.draft?.sceneId:''].filter(Boolean);return ids.length?[...new Set(ids)]:state.route==='scenes'?[scene()?.id]:[];}
  if(action==='wizard-save'&&state.wizard?.mode==='knowledge'){const k=state.wizard.sync;return [...new Set((k?.result?.rules||[]).filter(r=>r.include).map(r=>k.sceneTargets[r.type]).filter(Boolean))];}
  if(action==='add-knowledge-link')return knowledgeContext.scope==='scene'?[knowledgeContext.scene]:[];
  if(action==='save-knowledge-link')return state.drawer?.draft.scope==='scene'?state.drawer.draft.scenes:[];
  if(action==='delete-knowledge-link'){const k=knowledgeLinks[Number(el?.dataset.index)];return k?.scope==='scene'?k.scenes:[];}
  if(action==='confirm-delete-config'){const d=state.drawer;if(d?.deleteKind==='scene')return [d.target.id];if(d?.deleteKind==='binding')return [d.owner.scene];if(d?.deleteKind==='knowledgeLink'&&d.target.scope==='scene')return d.target.scenes;}
  return [];
}
function sceneReleaseGuard(action,el){if(sceneReleaseMutations.has(action)&&action!=='delete-scene'&&state.drawer?.releaseOwnerScene&&state.drawer.releaseOwnerScene!==scene()?.id){toast('当前场景已切换，请关闭编辑窗口后重新打开');return false;}const locked=sceneReleaseActionTargets(action,el).map(id=>appScenes[id]).filter(s=>s&&!sceneReleaseCanEdit(s));if(locked.length){toast(`请先在“${locked[0].name}”中点击“编辑”，再修改或删除配置`);return false;}return true;}
function sceneReleaseGuardHTML(html){return html.replace(/<button\b([^>]*data-action="([^"]+)"[^>]*)>/g,(whole,attrs,action)=>{const id=attrs.match(/data-id="([^"]+)"/),index=attrs.match(/data-index="([^"]+)"/),el={dataset:{id:id?.[1],index:index?.[1]}};const locked=sceneReleaseActionTargets(action,el).some(sid=>appScenes[sid]&&!sceneReleaseCanEdit(appScenes[sid]));return locked&&!/\bdisabled\b/.test(attrs)?`<button${attrs} disabled aria-disabled="true" title="请先点击场景的编辑按钮">`:whole;});}
function sceneReleaseTrack(before){let updated=false;for(const [id,previous]of before){const s=appScenes[id],m=sceneReleaseStore.get(id);if(!s){if(m)m.deleted=true;continue;}if(JSON.stringify(sceneReleaseConfiguration(s))!==previous){const meta=sceneReleaseEnsure(s);if(meta.trackedConfiguration===JSON.stringify(sceneReleaseConfiguration(s)))continue;meta.check=null;sceneReleaseRecord(s,meta.status==='修订'?'保存修订':'保存草稿',meta.status,'保存场景配置修改');updated=true;}}if(updated)render();}
const sceneReleaseGuardedActions=[...sceneReleaseMutations,'sync-edit-rule','sync-save-rule','add-knowledge-link','save-knowledge-link','delete-knowledge-link','confirm-delete-config','wizard-save'];
for(const action of sceneReleaseGuardedActions){const original=actionsMap[action];if(!original)continue;actionsMap[action]=function(el){if(!sceneReleaseGuard(action,el))return;const before=new Map(Object.values(appScenes).map(s=>[s.id,JSON.stringify(sceneReleaseConfiguration(s))]));const previousDrawer=state.drawer,result=original(el);if(state.drawer&&state.drawer!==previousDrawer&&sceneReleaseMutations.has(action))state.drawer.releaseOwnerScene=scene()?.id;sceneReleaseTrack(before);return result;};}
const sceneReleaseDeleteBefore=confirmDeletion;confirmDeletion=function(){if(!sceneReleaseGuard('confirm-delete-config'))return;return sceneReleaseDeleteBefore();};
const sceneReleaseCreateBefore=actionsMap['save-new-scene'];actionsMap['save-new-scene']=function(){const result=sceneReleaseCreateBefore();if(!state.drawer&&scene()){sceneReleaseEnsure(scene());render();}return result;};
const sceneReleaseScenePageBefore=pages.scenes;pages.scenes=function(){
  const s=scene(),m=sceneReleaseEnsure(s),id=`data-id="${esc(s.id)}"`;
  const message=m.editing
    ?`正在编辑${m.status==='修订'?` v${m.published+1} 修订`:'草稿'}：修改完成后点击“完成编辑”，再检查并发布。${m.published?'当前发布版本继续生效，也可放弃修订并恢复。':''}`
    :m.status==='已发布'
      ?`当前生效版本为 v${m.published}。点击“编辑”进入修订后，可统一修改或删除场景内配置。`
      :m.status==='修订'
        ?`v${m.published+1} 修订已完成编辑，检查通过后可发布。当前发布生效版本仍为 v${m.published}；也可恢复到该版本。`
        :'当前为草稿。点击“编辑”后，可统一修改或删除场景内配置；完成编辑后检查并发布。';
  const controls=(!m.editing&&m.status!=='已发布'?btn('检查并发布','scene-release-check','sm primary','upload',id):'')+btn('版本记录','scene-release-history','sm','clock',id);
  const banner=studio.sceneTab==='versions'?'':`<div class="scene-release-notice ${m.editing?'editing':''}">${icon(m.editing?'edit':'shield')}<span class="scene-release-notice-text">${message}</span><div class="scene-release-notice-actions">${controls}</div></div>`;
  const effective=m.status==='修订'&&m.published>0?`<p class="scene-effective-version">${icon('shield')}<span>当前发布生效版本为 <strong>v${m.published}</strong></span></p>`:'';
  return sceneReleaseGuardHTML(sceneReleaseScenePageBefore().replace(`<p>${esc(s.description)}</p>`,`<p>${esc(s.description)}</p>${effective}`).replace('<section class="panel scene-workspace">',banner+'<section class="panel scene-workspace">'));
};
const sceneReleaseKnowledgePageBefore=pages.knowledge;pages.knowledge=function(){return sceneReleaseGuardHTML(sceneReleaseKnowledgePageBefore());};
pages.release=sceneReleaseListPage;
document.addEventListener('input',e=>{if(e.target.dataset.releaseFilter==='query')sceneReleaseUI.query=e.target.value;});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.releaseFilter==='query')render();});
document.addEventListener('change',e=>{const key=e.target.dataset.releaseFilter;if(key){sceneReleaseUI[key]=e.target.value;render();}});

// 回看问答使用当时的回答快照；不重新调用问答逻辑。
function sceneReleaseCaptureQA(l,s,question,result,input){l.qaAnswer={question,result:structuredClone(result),input:structuredClone(input),sceneId:s.id,sceneName:s.name,applicationType:'qa',configVersion:sceneReleaseEnsure(s).published,configState:sceneReleaseEnsure(s).status,at:sceneReleaseTime()};l.applicationType='qa';l.sceneId=s.id;l.evidence=structuredClone(result);}
for(const action of ['app-run-qa','workflow-run-qa']){const original=actionsMap[action];if(!original)continue;actionsMap[action]=function(el){const s=scene(),input=structuredClone(state.drawer?.draft||{}),previous=state.logs[0],result=original(el);if(workflowScene(s).type==='qa'&&state.drawer?.result){if(state.logs[0]===previous)log('智能问答',s.name,'已回答',input.question||'');sceneReleaseCaptureQA(state.logs[0],s,input.question||'',state.drawer.result,input);}return result;};}
function sceneQAAnswerDrawer(){
  const record=state.drawer.record,q=record.qaAnswer||{question:record.detail,result:record.evidence,at:record.time,sceneName:record.title},r=q.result||{},evidence=r.evidence||[];
  const rendered=applicationResultHTML(r).replace(/<button\b[^>]*>[\s\S]*?<\/button>/g,'');
  return frame('AI 回答与引用证据',`${esc(q.sceneName||record.title)} · ${esc(q.at)}`,`<div class="scene-qa-question"><h3>用户的问题</h3><p>${esc(q.question)}</p></div><div class="between section-gap"><h3>AI 当时的回答</h3>${pill('历史回答快照','blue')}</div>${rendered}<p class="tiny muted section-gap">运行时配置：${esc(q.configState||'历史记录')}${q.configVersion?` · 当时已发布 v${q.configVersion}`:''}。</p><p class="tiny muted section-gap">这是该次运行保存的回答。回看不会重新查询，也不会用当前配置覆盖历史结果。当前原型的回答来自本地样例。</p>${evidence.length?`<details class="plain-details section-gap"><summary>引用来源摘要（${evidence.length} 项）</summary>${evidence.map(e=>`<div class="execution-step"><b>${esc(e.source||e.title||'业务查询结果')}</b><small>${esc(e.location||e.version||e.identity||'')}</small>${e.value!==undefined?`<p class="scene-qa-answer">${esc(typeof e.value==='string'?e.value:JSON.stringify(e.value))}</p>`:''}</div>`).join('')}</details>`:''}`,'',true);
}
extraDrawers.sceneQAAnswer=sceneQAAnswerDrawer;
actionsMap['qa-log-answer']=el=>{const record=state.logs[Number(el.dataset.index)];if(record)openDrawer('sceneQAAnswer',{}, {record:structuredClone(record),readonly:true});};
const sceneReleaseLogDrawerBefore=logDrawer;
logDrawer=function(){const l=state.logs[state.drawer.index];if(l.sceneConfigVersion===undefined)return sceneReleaseLogDrawerBefore();return frame('场景配置执行详情',`${esc(l.time)} · ${esc(l.title)}`,`<dl class="kv"><dt>结果</dt><dd>${pill(l.result,l.result==='成功'||l.result==='通过'?'green':'amber')}</dd><dt>场景</dt><dd>${esc(l.title)}</dd><dt>配置版本</dt><dd>v${l.sceneConfigVersion} · ${esc(l.sceneConfigState||'历史记录')}</dd><dt>执行说明</dt><dd>${esc(l.detail)}</dd></dl><div class="section-gap">${l.evidence?jsonView(l.evidence):''}</div>`,'',true);};
const sceneReleaseLogDetailBefore=actionsMap['log-detail'];actionsMap['log-detail']=el=>{const record=state.logs[Number(el.dataset.index)];if(record?.qaAnswer||(/问答/.test(record?.type||'')&&record?.evidence?.answer))return actionsMap['qa-log-answer'](el);return sceneReleaseLogDetailBefore(el);};
Object.values(appScenes).forEach(s=>{appConfig(s);sceneReleaseEnsure(s);});
render();
