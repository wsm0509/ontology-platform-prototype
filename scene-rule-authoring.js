/* 自然语言规则配置：本地受控模板解析，不调用 AI，不执行规则，不自动保存或启用。 */
'use strict';
const workflowRuleAuthoringActions=['workflow-rule-authoring','workflow-rule-generate','workflow-rule-confirm'];
let workflowRuleAuthoringSequence=0;
function workflowRuleAuthoringContext(s,fn){return typeof objectReleaseWithScene==='function'?objectReleaseWithScene(s,fn):fn();}
function workflowRuleAuthoringObjects(s){
  const ids=new Set(Object.values(workflowScene(s).blocks).map(b=>b.object).filter(Boolean));
  for(const binding of Object.values(s.bindings).flat())ids.add(binding.ontology.split('.')[0]);
  return [...ids].map(id=>obj(id)).filter(o=>o?.props.length);
}
function workflowRuleAuthoringBlocks(s,id){
  return Object.values(workflowScene(s).blocks).filter(b=>b.object===id||(s.bindings[b.id]||[]).some(m=>m.ontology.startsWith(id+'.')));
}
function workflowRuleAuthoringFingerprint(s,input){
  return workflowRuleAuthoringContext(s,()=>JSON.stringify({
    input:{originalText:input.originalText,objectId:input.objectId,scope:input.scope},
    scene:typeof sceneReleaseFingerprint==='function'?sceneReleaseFingerprint(s):s,
    objects:objects.map(o=>({id:o.id,version:s.ontologyVersions?.[o.id],props:o.props})),
    queries:capabilities,connectors:systemConnectors
  }));
}
function workflowRuleAuthoringStructure(r){
  return JSON.stringify({scope:r.scope,trigger:r.trigger,conditions:r.conditions,assertions:r.assertions,params:r.params,level:r.level,message:r.message});
}
function workflowRuleAuthoringParse(text){
  const original=String(text||'').trim(),clarifications=[];
  if(/资料完整/.test(original))clarifications.push('“资料完整”需要明确检查哪些资料，以及采用非空、数量还是发布状态标准。');
  if(/正常/.test(original))clarifications.push('“正常”需要明确字段、运算和阈值或状态，不能推测通过。');
  if(/符合要求/.test(original))clarifications.push('“符合要求”需要列出可逐项验证的条件与断言。');
  if(clarifications.length)return {clarifications,error:'存在需澄清项；请补充明确标准后重新生成。'};
  if(!original)return {clarifications,error:'请先填写自然语言规则描述。'};
  const textNormalized=original.replace(/\s+/g,'').replace(/[。！!；;]$/,'');
  const safety=textNormalized.match(/^(?:当前项目|项目)?安全DI(?:必须|应|需要)?(?:(?:等于|为|=)(0)|(?:不大于|不得大于|不能大于|<=|≤)((?:0|[1-9]\d*)(?:\.\d+)?))$/i);
  if(safety){
    const value=safety[1]??safety[2],number=Number(value);
    if(!Number.isFinite(number)||number<0||number>Number.MAX_SAFE_INTEGER)return {clarifications,error:'安全 DI 阈值超出可安全表示的数字范围，不生成草稿。'};
    return {template:'safety-di',name:`项目安全 DI ${safety[1]!==undefined?'必须为':'不大于'} ${value}`,conditions:[],assertions:[{fact:'Project.safetyDI',op:safety[1]!==undefined?'eq':'lte',value}],params:{projectCode:'order.projectCode'},message:`安全 DI 未满足${safety[1]!==undefined?'等于':'不大于'} ${value} 的要求，请核对项目数据。`,clarifications};
  }
  const catalog=textNormalized.match(/^商品目录(?:的|产品的|商品的)?(.+?)(?:必须|应|需要)?(?:存在且非空|存在并非空|非空|不为空)$/);
  if(catalog){
    const names=catalog[1].split(/[、,，/和及与]+/).filter(Boolean),lookup={'图片':'images','产品图片':'images','资料':'documents','相关资料':'documents','规格':'specifications','规格参数':'specifications','功能':'features','功能特性':'features'};
    if(names.length&&names.every(n=>lookup[n])&&new Set(names.map(n=>lookup[n])).size===names.length)return {template:'catalog-documents',name:'商品目录资料非空检查',conditions:[{fact:'Material.inCatalog',op:'eq',value:'true'}],assertions:names.map(n=>({fact:`Product.${lookup[n]}`,op:'exists',value:''})),params:{modelCode:'material.modelCode'},message:`商品目录的${names.join('、')}缺失，请补齐后重新提交。`,clarifications};
  }
  if(/^后端业务部(?:提交(?:时)?)?[,，:：]?(?:软管)?最小系统(?:必须|应|需要)?(?:为)?已发布$/.test(textNormalized))return {template:'minimum-system',name:'后端业务部最小系统发布检查',conditions:[{fact:'Order.submitDepartment',op:'eq',value:'后端业务部'}],assertions:[{fact:'Minimum.status',op:'eq',value:'已发布'}],params:{projectCode:'order.projectCode',softwareCode:'row.softwareCode',version:'row.version'},message:'后端业务部提交时，当前项目、软件编码及版本的最小系统必须已发布。',clarifications};
  return {clarifications,error:'超出支持模板，不生成猜测。当前支持：安全 DI = 0 / 不大于非负数字；商品目录明确列出的图片、资料、规格、功能非空；后端业务部最小系统已发布。请拆分复合规则或使用人工添加。'};
}
// 所有引用由当前锁定对象版本中的 ruleFacts 和登记的查询映射确认。
// Context 是本次业务查询字段，不能伪装为已经存在的全局本体属性。
function workflowRuleAuthoringReferences(s,r,objectId){
  const w=workflowScene(s),block=w.blocks[r.scope],main=Object.values(w.blocks).find(b=>!b.parent),properties=[],objectIds=new Set([objectId,block.object].filter(Boolean));
  function formReference(source,fact){
    const [origin,key]=source.split('.');
    if(origin==='material')return ontologyReference('Material.'+key,fact,s.master);
    const b=origin==='row'?block:main,f=b?.fields.find(f=>f.key===key);
    if(!f)throw Error(`查询参数引用的字段 ${source} 不存在。`);
    const bindings=(s.bindings[b.id]||[]).filter(m=>m.target===scenePrefix(s,b.id)+key),paths=[...new Set(bindings.map(m=>m.ontology))];
    if(paths.length>1)throw Error(`字段 ${source} 对应多个本体属性，请先明确映射。`);
    if(paths.length)return ontologyReference(paths[0],fact);
    const direct=obj(b.object)?.props.find(p=>p.id===key);
    if(direct)return ontologyReference(b.object+'.'+key,fact);
    if(b.object)objectIds.add(b.object);
    return {fact,path:source,kind:'business-form',name:f.label,type:f.type,block:b.id};
  }
  function ontologyReference(path,fact,capability){
    const [oid,pid]=path.split('.'),o=obj(oid),p=o?.props.find(p=>p.id===pid);
    if(!p)throw Error(`锁定本体版本中的属性 ${path} 不可用，请升级引用或调整映射。`);
    objectIds.add(oid);
    if(capability){const c=ability(capability);if(!c?.maps.some(m=>m.target===path))throw Error(`查询 ${capability} 未提供本体属性 ${path}。`);}
    return {fact,path,kind:'ontology-property',name:p.name,type:p.type,object:oid,version:s.ontologyVersions?.[oid]||null,...(capability?{capability}:{})};
  }
  for(const clause of [...r.conditions,...r.assertions]){
    const f=ruleFact(s,r,clause.fact);if(!f)throw Error(`当前适用对象 / 区块没有可用属性 ${clause.fact}。`);
    if(f.capability){
      const c=ability(f.capability);
      if(!c||!connector(c.connector)?.enabled)throw Error(`查询 ${f.capability} 或系统连接不可用。`);
      let ref;
      if(c.object==='Context'){
        const path='Context.'+f.output;
        if(!c.maps.some(m=>m.target===path))throw Error(`查询 ${c.id} 未提供属性 ${path}。`);
        ref={fact:f.id,path,kind:'business-context',name:f.name,type:f.type,capability:c.id,queryRevision:c.revision};
      }else{
        ref=ontologyReference(f.id,f.id,c.id);
        if(ref.type!==f.type)throw Error(`本体属性 ${f.id} 类型与规则事实不一致。`);
      }
      properties.push(ref);
      for(const [key]of c.params||[]){
        const source=r.params[key]||(c.id===s.master&&key==='materialCode'?'row.materialCode':'');
        if(!source)throw Error(`请明确查询参数 ${key} 的取值来源。`);
        properties.push({...formReference(source,`parameter.${key}`),source,parameter:key});
      }
    }else if(f.source)properties.push(formReference(f.source,f.id));
    else throw Error(`属性 ${f.id} 未登记来源。`);
  }
  for(const id of objectIds){
    const o=obj(id);if(!o?.props.length)throw Error(`适用本体对象 ${id} 没有可用的锁定属性。`);
    if(typeof objectReleaseVersion==='function'&&!objectReleaseVersion(id,s.ontologyVersions?.[id]))throw Error(`本体对象 ${id} 未锁定已发布版本。`);
  }
  return {objects:[...objectIds].map(id=>({id,name:obj(id).name,version:s.ontologyVersions?.[id]||null})),properties:properties.filter((p,i,all)=>all.findIndex(x=>x.fact===p.fact&&x.path===p.path)===i)};
}
function workflowRuleAuthoringAllowed(d,type){
  const s=scene();
  if(!s||workflowScene(s).type!=='draft'||typeof sceneReleaseCanEdit!=='function'||!sceneReleaseCanEdit(s)){
    if(d)errorDrawer('仅智能提单编辑中的草稿 / 修订可以配置规则。');else toast('请先进入智能提单场景编辑。');return false;
  }
  if(d&&(d.type!==type||d.authoringSceneId!==s.id||d.releaseOwnerScene!==s.id)){
    errorDrawer('场景已切换或草稿不属于当前场景，请关闭后重新打开。');return false;
  }
  return true;
}
function workflowRuleAuthoringOpen(){
  if(!workflowRuleAuthoringAllowed(null))return;
  const s=scene();openDrawer('workflowRuleAuthoring',{originalText:'',objectId:'',scope:''},{authoringSceneId:s.id,releaseOwnerScene:s.id,generated:null,generatedFingerprint:null,clarifications:[]});
}
function workflowRuleAuthoringGenerate(){
  const d=state.drawer;if(!workflowRuleAuthoringAllowed(d,'workflowRuleAuthoring'))return;
  d.generated=null;d.generatedFingerprint=null;d.clarifications=[];d.error='';
  const s=scene(),v=d.draft,parsed=workflowRuleAuthoringParse(v.originalText);d.clarifications=parsed.clarifications;
  if(parsed.error)return errorDrawer(parsed.error);
  try{
    workflowRuleAuthoringContext(s,()=>{
      if(!workflowRuleAuthoringObjects(s).some(o=>o.id===v.objectId))throw Error('请选择确切的适用本体对象。');
      const blocks=workflowRuleAuthoringBlocks(s,v.objectId);
      if(!v.scope)throw Error(blocks.length>1?'存在多个适用区块，请明确选择执行区块；不会自动取第一个。':'请选择适用的执行区块。');
      if(!blocks.some(b=>b.id===v.scope))throw Error('所选区块不适用于当前本体对象。');
      const r={id:'',name:parsed.name,scope:v.scope,trigger:'submit',conditions:parsed.conditions,assertions:parsed.assertions,params:parsed.params,enabled:false,active:'停用',level:'阻断',message:parsed.message};
      const refs=workflowRuleAuthoringReferences(s,r,v.objectId),error=validateWorkflowRule(s,r);
      if(error)throw Error(error);
      do{r.id=`rule-nl-${++workflowRuleAuthoringSequence}`;}while(Object.values(appScenes).some(s=>s.workflow?.rules.some(x=>x.id===r.id)));
      r.naturalLanguage={engine:'local-controlled-parser',originalText:v.originalText,template:parsed.template,sceneId:s.id,scope:v.scope,selectedObject:v.objectId,...refs,reviewStatus:'generated-awaiting-human-review',correspondence:'template-draft',generatedStructure:workflowRuleAuthoringStructure(r)};
      d.generated=structuredClone(r);d.generatedFingerprint=workflowRuleAuthoringFingerprint(s,v);d.dirty=true;
    });
  }catch(e){d.generated=null;d.generatedFingerprint=null;d.error=e.message;}
  drawOverlay();
}
function workflowRuleAuthoringConfirm(){
  const d=state.drawer;if(!workflowRuleAuthoringAllowed(d,'workflowRuleAuthoring'))return;
  if(!d.generated||d.clarifications.length)return errorDrawer('请先生成无待澄清项的结构化草稿。');
  const s=scene();
  if(d.generatedFingerprint!==workflowRuleAuthoringFingerprint(s,d.draft)){d.generated=null;return errorDrawer('原文、场景、来源或本体快照已变化，请重新生成并核对。');}
  try{workflowRuleAuthoringContext(s,()=>{
    const r=structuredClone(d.generated);workflowRuleAuthoringReferences(s,r,d.draft.objectId);
    const error=validateWorkflowRule(s,r);if(error)throw Error(error);
    r.naturalLanguage.reviewStatus='human-confirmed-awaiting-save';
    openDrawer('workflowRule',r,{isNew:true,authoringSceneId:s.id,releaseOwnerScene:s.id,authoringInput:structuredClone(d.draft),authoringFingerprint:d.generatedFingerprint,authoringProvenance:structuredClone(r.naturalLanguage)});
  });}catch(e){errorDrawer(e.message);}
}
function workflowRuleAuthoringProvenanceHTML(meta){
  if(!meta)return '';
  return `<div class="inset-panel section-gap"><div class="between"><h3>自然语言来源</h3>${pill(meta.correspondence==='structured-edited'?'已人工调整':'需人工核对','blue')}</div><p class="section-gap">${esc(meta.originalText)}</p><p class="tiny muted section-gap">本地受控解析 · ${esc(meta.template)} · 原文仅作为来源记录。结构化编辑后以当前条件、断言和参数为准，不宣称仍完全对应原文。</p></div>`;
}
const workflowRuleAuthoringViewBefore=workflowRulesView;
workflowRulesView=function(s){
  const old=workflowRuleAuthoringViewBefore(s);if(workflowScene(s).type!=='draft')return old;
  let html=old.replace('<h3>校验规则</h3>','<h3>规则配置</h3>');
  html=html.replace(btn('添加规则','workflow-add-rule','sm','plus'),`<div class="row">${btn('自然语言生成规则','workflow-rule-authoring','sm primary','plus')}${btn('添加规则','workflow-add-rule','sm','plus')}</div>`);
  html=html.replace('<div class="section-gap">',`<div class="section-gap">${inf('自然语言描述 → 本体对象 / 属性匹配 → 结构化草稿 → 人工确认修改保存。本地受控解析，不是真实 AI；未确认不保存，保存不执行，生成规则默认停用。')}</div><div class="section-gap">`);
  for(const r of workflowScene(s).rules)if(r.naturalLanguage){const marker=`<h3>${esc(r.name)}</h3>`;html=html.replace(marker,marker+pill(r.naturalLanguage.correspondence==='structured-edited'?'已人工调整':'人工已确认','blue'));}
  if(typeof sceneReleaseGuardHTML==='function')html=sceneReleaseGuardHTML(html);
  return html;
};
function workflowRuleAuthoringDrawer(){
  const d=state.drawer,s=appScenes[d.authoringSceneId];if(!s)return frame('场景已不存在','','');
  return workflowRuleAuthoringContext(s,()=>{
    const v=d.draft,objectsAvailable=workflowRuleAuthoringObjects(s),blocks=workflowRuleAuthoringBlocks(s,v.objectId),r=d.generated;
    const fresh=!!r&&d.generatedFingerprint===workflowRuleAuthoringFingerprint(s,v)&&scene()?.id===s.id;
    const objectLabels=objectsAvailable.map(o=>[o.id,`${o.name} · ${o.id} · ${s.ontologyVersions?.[o.id]||'未锁定发布版本'}`]);
    const matches=r?r.naturalLanguage.properties:ruleFacts(s,{scope:v.scope}).map(f=>({fact:f.id,name:f.name,path:f.capability?`${f.capability} · ${f.output||f.id}`:f.source,kind:f.capability?'候选查询字段':'候选表单字段'}));
    let html=frame('自然语言生成规则',`${esc(s.name)} · 先生成预览，再人工确认；此步骤不保存配置。`,`${inf('本地受控解析（不是真实 AI）：仅识别明确模板，不猜测模糊要求，不执行或自动启用规则。')}<div class="form-grid section-gap">${field('自然语言描述 *','originalText',v.originalText,'textarea',[],'示例：安全 DI = 0；商品目录图片、资料、规格和功能必须存在且非空；后端业务部提交时，最小系统必须已发布。每次只配置一条规则。',true)}${field('适用本体对象 *','objectId',v.objectId,'select',[['','请选择适用对象'],...objectLabels])}${field('执行区块 / 范围 *','scope',v.scope,'select',[['','请选择确切区块'],...blocks.map(b=>[b.id,`${b.label} · ${b.many?'逐行独立判断':'单条记录'} · ${b.id}`])])}</div><div class="between section-gap"><h3>匹配本体</h3>${pill(r?'已核对引用':'候选属性预览','blue')}</div><div class="table-wrap section-gap"><table class="config-table"><thead><tr><th>本体属性 / 本次业务字段</th><th>引用路径与来源</th><th>匹配范围</th></tr></thead><tbody>${matches.map(p=>`<tr><td class="field-name">${esc(p.name)}<code class="field-path">${esc(p.fact)}</code></td><td><code>${esc(p.path)}</code><small class="field-path">${esc(p.kind==='ontology-property'?`本体属性 · ${p.version}`:p.kind==='business-context'?'本次业务查询字段（非全局本体属性）':p.kind==='business-form'?'当前表单字段（非本体属性）':p.kind)}</small></td><td>${esc(workflowScene(s).blocks[v.scope]?.label||'待选择')}${p.capability?`<small class="field-path">${esc(p.capability)}</small>`:''}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">选择本体对象与执行区块后预览可用属性。</td></tr>'}</tbody></table></div>${d.clarifications.length?`<div class="inset-panel section-gap"><h3>需澄清项 · 不可保存</h3><ul class="deletion-list">${d.clarifications.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}<div data-rule-authoring-preview class="inset-panel section-gap"><div class="between"><h3>结构化条件与断言</h3>${pill(!r?'待生成':fresh?'待人工确认':'已过期，需重新生成','amber')}</div>${r?`<dl class="kv section-gap"><dt>自然描述</dt><dd>${esc(r.naturalLanguage.originalText)}</dd><dt>匹配本体</dt><dd>${r.naturalLanguage.objects.map(o=>`${esc(o.name)} · ${esc(o.version)}`).join('、')}</dd><dt>执行范围</dt><dd>${esc(workflowScene(s).blocks[r.scope].label)} · 每条记录独立判断</dd><dt>当</dt><dd>${r.conditions.map(a=>esc(ruleText(s,r,a))).join(' 且 ')||'始终适用'}</dd><dt>必须满足</dt><dd>${r.assertions.map(a=>esc(ruleText(s,r,a))).join('；')}</dd><dt>查询参数</dt><dd>${Object.entries(r.params).map(([k,v])=>`${esc(k)} ← ${esc(v)}`).join('<br>')}</dd><dt>失败提示</dt><dd>${esc(r.message)}</dd><dt>待确认状态</dt><dd>未保存 · 默认停用 · 提交前终检 · 阻断</dd></dl>`:'<p class="tiny muted section-gap">尚无生成草稿。修改原文、对象或范围后须重新生成。</p>'}</div>`,btn(r?'重新生成草稿':'生成结构化草稿','workflow-rule-generate','','refresh')+btn('人工确认并编辑','workflow-rule-confirm','primary','check',fresh&&!d.clarifications.length?'':'disabled'),true);
    if(typeof sceneReleaseGuardHTML==='function')html=sceneReleaseGuardHTML(html);return html;
  });
}
Object.assign(extraDrawers,{workflowRuleAuthoring:workflowRuleAuthoringDrawer});
const workflowRuleAuthoringEditorBefore=extraDrawers.workflowRule;
extraDrawers.workflowRule=function(){
  const d=state.drawer;if(!d.draft.naturalLanguage||workflowScene(scene()).type!=='draft')return workflowRuleAuthoringEditorBefore();
  return workflowRuleAuthoringContext(scene(),()=>workflowRuleAuthoringEditorBefore().replace('<div class="drawer-body">','<div class="drawer-body">'+workflowRuleAuthoringProvenanceHTML(d.draft.naturalLanguage)));
};
Object.assign(actionsMap,{'workflow-rule-authoring':workflowRuleAuthoringOpen,'workflow-rule-generate':workflowRuleAuthoringGenerate,'workflow-rule-confirm':workflowRuleAuthoringConfirm});
// 注册发生在 scene-release / object-release 之前，后续模块会自动包装这些动作。
// 也兼容模块被延后载入；自身仍检查编辑权限、所有权与精确场景指纹。
if(typeof sceneReleaseMutations!=='undefined'){
  for(const action of workflowRuleAuthoringActions){
    sceneReleaseMutations.add(action);const before=actionsMap[action];
    actionsMap[action]=function(el){if(!sceneReleaseGuard(action,el))return;return workflowRuleAuthoringContext(scene(),()=>before(el));};
  }
}
const workflowRuleAuthoringSaveBefore=actionsMap['workflow-save-rule'];
actionsMap['workflow-save-rule']=function(el){
  const d=state.drawer;if(d?.type!=='workflowRule'||!d.draft.naturalLanguage)return workflowRuleAuthoringSaveBefore(el);
  // 历史来源规则在非智能提单类型下沿用原编辑 / 保存行为。
  if(workflowScene(scene()).type!=='draft'){
    if(d.authoringFingerprint)return errorDrawer('应用类型已变化，请重新生成规则。');
    return workflowRuleAuthoringSaveBefore(el);
  }
  if(!sceneReleaseCanEdit(scene())||d.releaseOwnerScene!==scene()?.id)return errorDrawer('场景已切换或不在编辑中，请重新打开规则。');
  if(d.isNew&&(!d.authoringFingerprint||d.authoringFingerprint!==workflowRuleAuthoringFingerprint(scene(),d.authoringInput||{})))return errorDrawer('场景、来源或本体快照已变化，请重新生成并人工确认。');
  const saved=workflowScene(scene()).rules.find(r=>r.id===d.draft.id),meta=d.authoringProvenance||saved?.naturalLanguage;
  if(!meta)return errorDrawer('自然语言草稿缺少可核对的来源记录，请重新生成。');
  const error=workflowRuleAuthoringContext(scene(),()=>validateWorkflowRule(scene(),d.draft));if(error)return errorDrawer(error);
  d.draft.naturalLanguage={...structuredClone(meta),reviewStatus:'saved-after-human-review',correspondence:meta.correspondence==='structured-edited'||workflowRuleAuthoringStructure(d.draft)!==meta.generatedStructure?'structured-edited':'human-reviewed-template'};
  return workflowRuleAuthoringSaveBefore(el);
};
function workflowRuleAuthoringChanged(e){
  const d=state.drawer,el=e.target;if(d?.type!=='workflowRuleAuthoring'||!['originalText','objectId','scope'].includes(el.dataset.field))return;
  d.draft[el.dataset.field]=el.value;
  if(el.dataset.field==='objectId')d.draft.scope='';
  d.generated=null;d.generatedFingerprint=null;d.clarifications=[];d.error='';d.dirty=true;
  if(e.type==='change'||el.dataset.field!=='originalText')drawOverlay();
  else{
    // 不重绘输入框，保留光标；立即移除旧预览并关闭确认入口。
    const body=overlayRoot.querySelector('[data-rule-authoring-preview]');if(body)body.innerHTML='<h3>结构化条件与断言</h3><p class="tiny muted section-gap">原文已修改，需重新生成；尚未保存。</p>';
    const confirm=overlayRoot.querySelector('[data-action="workflow-rule-confirm"]');if(confirm){confirm.disabled=true;confirm.setAttribute('aria-disabled','true');}
  }
}
document.addEventListener('input',e=>workflowRuleAuthoringChanged({...e,target:e.target,type:'input'}));
document.addEventListener('change',e=>workflowRuleAuthoringChanged({...e,target:e.target,type:'change'}));
