/* 智能提单快捷映射：名称相似度为本地模拟，确认后才保存场景配置。 */
'use strict';
function sceneMappingType(type){return ['枚举','引用'].includes(type)?'文本':type;}
function sceneMappingCode(value){return String(value||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');}
function sceneMappingColumn(s,block,f){
  const binding=(s.bindings[block.id]||[]).find(b=>b.target===scenePrefix(s,block.id)+f.key);
  const schema=block.database?null:Object.values(tableSchemas).flat().find(t=>t.table===block.table);
  const match=schema?.fields.find(c=>c[0]===f.sinkColumn||sceneMappingCode(c[0])===sceneMappingCode(f.key)||c[2]===f.key||c[0]==='ID'&&f.key===block.keyField);
  return {column:binding?.sinkColumn||f.sinkColumn||match?.[0]||f.key,label:binding?.label||f.label,key:f.key,type:f.type};
}
function sceneMappingFields(s,block){
  if(block.database)return block.fields.filter(f=>(f.mappingMode||'mapping')==='mapping').map(f=>sceneMappingColumn(s,block,f));
  const schema=Object.values(tableSchemas).flat().find(t=>t.table===block.table),used=new Set();
  const rows=(schema?.fields||[]).map(([column,label,suggestedKey,,type])=>{
    const f=block.fields.find(f=>f.sinkColumn===column||sceneMappingCode(f.key)===sceneMappingCode(column)||f.key===suggestedKey||column==='ID'&&f.key===block.keyField);
    const binding=(s.bindings[block.id]||[]).find(b=>b.sinkTable===block.table&&sceneMappingCode(b.sinkColumn)===sceneMappingCode(column));
    const key=f?.key||binding?.target.split('.').at(-1)||suggestedKey;
    if(f)used.add(f.key);
    return {column,label,key,type:sceneMappingType(type)};
  });
  for(const f of block.fields)if(!used.has(f.key))rows.push(sceneMappingColumn(s,block,f));
  return rows;
}
function sceneMappingParse(text){
  const lines=String(text||'').split('\n').filter(line=>line.trim()),rows=[];
  if(!lines.length||lines.length>200)throw Error('请填写 1–200 个字段，每行：数据库字段 | 中文名称 | 表单字段 | 类型。');
  const columns=new Set(),keys=new Set();
  for(const line of lines){
    const parts=line.split('|').map(x=>x.trim()),[column,label]=parts;
    const block=workflowScene(scene()).blocks[scene().selectedBlock],schema=block?.database?null:Object.values(tableSchemas).flat().find(t=>t.table===block?.table),known=schema?.fields.find(f=>f[0]===column);
    const registered=block?.fields.find(f=>f.sinkColumn===column||sceneMappingCode(f.key)===sceneMappingCode(column)||column==='ID'&&f.key===block.keyField);
    const key=parts[2]||registered?.key||known?.[2]||String(column||'').toLowerCase().replace(/_([a-z0-9])/g,(_,c)=>c.toUpperCase()),type=parts[3]||registered?.type||known?.[4]||'文本';
    if(parts.length<2||parts.length>4||!/^[A-Za-z]\w*$/.test(column)||!/^[A-Za-z]\w*$/.test(key)||['constructor','prototype','__proto__'].includes(key)||!label||!['文本','枚举','引用','数字','布尔','日期'].includes(type))throw Error('字段需包含合法英文列名、中文名称、表单字段及类型（文本 / 数字 / 布尔 / 日期）。');
    if(columns.has(column.toLowerCase())||keys.has(key))throw Error('数据库列或表单字段重复，请逐项检查。');
    const protectedColumn=block?.fields.find(f=>f.mappingMode&&f.mappingMode!=='mapping'&&(f.sinkColumn||f.key).toLowerCase()===String(column).toLowerCase());
    if(protectedColumn)throw Error('该数据库字段不参与本体映射，请先在业务单据结构修改字段用途。');
    if(block?.database){const field=block.fields.find(f=>f.key===key&&f.sinkColumn===column);if(!field||field.mappingMode!=='mapping'||field.type!==sceneMappingType(type))throw Error('数据库表字段必须先在业务单据结构中选择参与映射；不能在此新增列或修改元数据。');}
    columns.add(column.toLowerCase());keys.add(key);rows.push({column,label,key,type:sceneMappingType(type)});
  }
  return rows;
}
function sceneMappingCandidates(s,block,row){
  const related=new Set(relations.filter(r=>r.from===block.object||r.to===block.object).flatMap(r=>[r.from,r.to]));
  const allowedRef=block.id==='mapping'&&({releaseItemId:'Mapping.releaseItemRef',moduleOrderId:'Mapping.moduleOrderRef'})[row.key];
  const result=[];
  for(const o of sceneMappingObjects(s))for(const p of o.props){
    const ontology=`${o.id}.${p.id}`;
    if(allowedRef&&ontology!==allowedRef||sceneMappingType(p.type)!==row.type)continue;
    let score=0,reason='';
    if(row.key===block.keyField&&block.object){if(o.id!==block.object||!p.key)continue;score=100;reason='当前区块的唯一编号';}
    else if(sceneMappingCode(p.id)===sceneMappingCode(row.key)||sceneMappingCode(p.id)===sceneMappingCode(row.column)){score=85;reason='英文字段同名';}
    if(sceneMappingCode(p.name)===sceneMappingCode(row.label)){score=Math.max(score,85);reason=reason?'英文与中文名称相符':'中文名称相符';}
    else if(row.label.length>=3&&p.name.length>=3&&(row.label.includes(p.name)||p.name.includes(row.label))){if(score<65){score=65;reason='中文名称相似';}}
    if(!score)continue;
    score+=o.id===block.object?12:related.has(o.id)?3:0;
    result.push({ontology,label:`${o.name} / ${p.name} · ${ontology}`,score,reason:reason+(o.id===block.object?'，属于当前区块对象':''),type:p.type});
  }
  return result.sort((a,b)=>b.score-a.score||a.ontology.localeCompare(b.ontology));
}
function sceneMappingRows(s,block,fields){
  return fields.filter(row=>{const f=block.fields.find(f=>f.key===row.key);return !f||!f.mappingMode||f.mappingMode==='mapping';}).map(row=>{
    const existing=(s.bindings[block.id]||[]).find(b=>b.target===scenePrefix(s,block.id)+row.key||b.sinkTable===block.table&&sceneMappingCode(b.sinkColumn)===sceneMappingCode(row.column));
    const candidates=sceneMappingCandidates(s,block,row),best=candidates[0],clear=best&&best.score>=75&&(!candidates[1]||best.score-candidates[1].score>=8);
    return {...row,column:existing?.sinkColumn||row.column,label:existing?.label||row.label,candidates,existing:!!existing,ontology:existing?.ontology||(clear?best.ontology:''),include:!existing&&!!clear,reason:existing?'已有映射，保留原配置':clear?best.reason:best?'存在相近候选，请人工选择':'未找到明确匹配，请人工选择'};
  });
}
function sceneMappingObjects(s){
  if(typeof objectReleaseVersion!=='function')return objects;
  return objects.map(o=>{const version=Object.hasOwn(s.ontologyVersions||{},o.id)?s.ontologyVersions[o.id]:objectReleaseStore.get(o.id)?.latest;return objectReleaseVersion(o.id,version)?.object;}).filter(Boolean);
}
function sceneMappingContext(s,fn){return typeof objectReleaseWithScene==='function'?objectReleaseWithScene(s,fn):fn();}
function sceneMappingFingerprint(s){return sceneReleaseFingerprint(s);}
function sceneMappingVersions(s){return Object.fromEntries(sceneMappingObjects(s).map(o=>[o.id,Object.hasOwn(s.ontologyVersions||{},o.id)?s.ontologyVersions[o.id]:objectReleaseStore.get(o.id)?.latest]));}
function sceneMappingRegenerate(){
  const d=state.drawer,s=scene();if(d?.type!=='workflowMapping'||d.sceneId!==s.id||d.blockId!==s.selectedBlock)return errorDrawer('当前场景或区块已切换，请重新打开生成窗口。');
  if(!sceneReleaseCanEdit(s))return errorDrawer('请先进入场景编辑。');
  if(d.fingerprint!==sceneMappingFingerprint(s))return errorDrawer('场景配置已变化，请关闭并重新生成。');
  try{const fields=sceneMappingParse(d.draft.fieldsText);d.draft.rows=sceneMappingContext(s,()=>sceneMappingRows(s,workflowScene(s).blocks[d.blockId],fields));d.generatedText=d.draft.fieldsText;d.candidateVersions=sceneMappingVersions(s);d.error='';d.dirty=true;}catch(e){d.error=e.message;d.generatedText=null;}
  drawOverlay();
}
function sceneMappingOpen(){
  const s=scene();if(workflowScene(s).type!=='draft')return;
  const block=workflowScene(s).blocks[s.selectedBlock];if(!block)return toast('请先登记一个表单区块。');
  const fields=sceneMappingFields(s,block),rows=sceneMappingContext(s,()=>sceneMappingRows(s,block,fields));
  const fieldsText=fields.map(r=>`${r.column} | ${r.label} | ${r.key} | ${r.type}`).join('\n');
  openDrawer('workflowMapping',{fieldsText,rows},{sceneId:s.id,blockId:block.id,fingerprint:sceneMappingFingerprint(s),generatedText:fieldsText,candidateVersions:sceneMappingVersions(s)});
}
function sceneMappingBinding(s,block,row){
  const [oid,pid]=row.ontology.split('.'),p=sceneMappingObjects(s).find(o=>o.id===oid)?.props.find(p=>p.id===pid),queryable=['Material','Software'].includes(oid);
  const sourceCapabilities=queryable?capabilities.filter(c=>c.object===oid&&connector(c.connector)?.enabled&&c.maps.some(m=>m.target===row.ontology)&&c.maps.some(m=>m.target===`${oid}.${obj(oid)?.props.find(p=>p.key)?.id}`)).map(c=>c.id):[];
  // 名称匹配不证明来源可用；无可用查询时显式使用当前表单输入。
  const preferred=sourceCapabilities.includes(oid==='Material'?s.master:'software.getPackage')?(oid==='Material'?s.master:'software.getPackage'):sourceCapabilities[0];
  return {label:row.label,target:scenePrefix(s,block.id)+row.key,ontology:row.ontology,sinkTable:block.table,sinkColumn:row.column,direction:p?.key?'只读':p?.type==='引用'?'引用绑定':'建议写入',policy:p?.key?'保持稳定引用':'差异确认',instanceMode:preferred?'scene':'input',sourceCapabilities:preferred?[preferred]:[],method:'AI 名称匹配建议（本地模拟，经人工确认）'};
}
function sceneMappingApply(){
  const d=state.drawer,s=scene();if(d?.type!=='workflowMapping')return;
  if(d.sceneId!==s.id||d.blockId!==s.selectedBlock)return errorDrawer('场景或区块已切换，请关闭后重新生成。');
  if(d.fingerprint!==sceneMappingFingerprint(s)||d.generatedText!==d.draft.fieldsText)return errorDrawer('配置或字段清单已变化，请重新生成建议。');
  const selected=d.draft.rows.filter(r=>r.include&&!r.existing);if(!selected.length)return errorDrawer('请至少选择一个尚未映射的字段；已有映射不会覆盖。');
  const next=structuredClone(s),block=workflowScene(next).blocks[d.blockId];let issue='';
  if(!block.table?.trim())return errorDrawer('请先在区块配置中填写业务系统保存的表名。');
  try{
    sceneMappingParse(d.generatedText);
    for(const row of selected){
      const oid=row.ontology.split('.')[0],version=d.candidateVersions[oid];
      if(!version||version!==sceneMappingVersions(s)[oid])throw Error('候选本体对象版本已变化或未发布，请重新生成建议。');
      next.ontologyVersions??={};if(!Object.hasOwn(next.ontologyVersions,oid))next.ontologyVersions[oid]=version;
    }
    appScenes[s.id]=next;
    sceneMappingContext(next,()=>{
      for(const row of selected){
        const [oid,pid]=row.ontology.split('.'),p=sceneMappingObjects(next).find(o=>o.id===oid)?.props.find(p=>p.id===pid);
        if(!p)throw Error(`${row.label} 尚未选择有效本体属性；新对象请先发布。`);
        if(d.candidateVersions[oid]!==sceneMappingVersions(s)[oid])throw Error('候选本体对象版本已变化，请重新生成建议。');
        if(!Object.hasOwn(next.ontologyVersions||{},oid)){next.ontologyVersions??={};next.ontologyVersions[oid]=objectReleaseStore.get(oid)?.latest;}
        if(row.key===block.keyField&&block.object&&(oid!==block.object||!p.key))throw Error('区块唯一编号必须对应当前区块对象的唯一编号属性。');
        if(sceneMappingType(p.type)!==row.type)throw Error(`${row.label} 与所选本体属性的类型不一致。`);
        const existingField=block.fields.find(f=>f.key===row.key);
        if(block.database&&(!existingField||existingField.sinkColumn!==row.column))throw Error('数据库字段已变化，请先在表结构中选择参与映射。');
        if(existingField?.mappingMode&&existingField.mappingMode!=='mapping')throw Error('该字段不参与本体映射，请先修改字段用途。');
        if(existingField&&existingField.type!==row.type)throw Error(`${row.label} 的类型与已登记字段不一致。`);
        if(!existingField)block.fields.push({key:row.key,label:row.label,type:row.type,sinkColumn:row.column});else {existingField.sinkColumn=row.column;existingField.label=row.label;}
        const binding=sceneMappingBinding(next,block,row),error=validSceneBinding(binding,-1);
        if(error)throw Error(error);
        if(next.bindings[block.id].some(b=>b.sinkTable===binding.sinkTable&&sceneMappingCode(b.sinkColumn)===sceneMappingCode(binding.sinkColumn)))throw Error(`${row.column} 已有数据库列映射，请修改已有映射。`);
        next.bindings[block.id].push(binding);
      }
    });
  }catch(e){issue=e.message;}finally{appScenes[s.id]=s;}
  if(issue)return errorDrawer(issue);
  s.ontologyVersions=next.ontologyVersions;s.workflow.blocks[d.blockId]=block;s.bindings[d.blockId]=next.bindings[d.blockId];workflowInvalidate();closeOverlay(true);render();toast(`已确认添加 ${selected.length} 条映射，已有配置保持不变`);
}
function sceneMappingEditor(){
  const d=state.drawer,s=appScenes[d.sceneId],block=s.workflow.blocks[d.blockId],rows=d.draft.rows,selected=rows.filter(r=>r.include&&!r.existing).length;
  return frame('AI 生成字段映射',`${esc(s.name)} / ${esc(block.label)} · ${esc(block.table||'尚未设置表名')}`,`${inf('本地模拟：按英文字段、中文名称、类型和区块对象生成建议，未调用真实 AI 或读取数据库。确认后仅添加勾选项，已有映射不覆盖。')}<details class="plain-details section-gap"><summary>补充 / 修改字段清单（字段 + 中文）</summary><div class="section-gap">${field('每行：数据库字段 | 中文名称（可追加表单字段 | 类型）','fieldsText',d.draft.fieldsText,'textarea',[],'仅填字段和中文即可；表单字段、类型自动补齐，也可手动调整。当前仅内置样例与手工输入。',true)}</div>${btn('重新生成建议','workflow-ai-regenerate','sm','refresh')}</details><div class="between section-gap"><h3>确认映射关系</h3>${pill(`已选择 ${selected} 项`,'blue')}</div><div class="table-wrap section-gap"><table class="config-table scene-mapping-review"><thead><tr><th>纳入</th><th>数据库字段 / 中文名称</th><th>匹配的本体对象属性</th><th>匹配说明</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td><input type="checkbox" aria-label="纳入 ${esc(r.label)}" data-mapping-include="${i}" ${r.include?'checked':''} ${r.existing?'disabled':''}></td><td class="field-name"><code>${esc(r.column)}</code><small>${esc(r.label)} · ${esc(r.type)}</small><small>表单：${esc(r.key)}</small></td><td>${r.existing?`${esc(semanticPath(r.ontology))}<code class="field-path">${esc(r.ontology)}</code>`:`<select aria-label="${esc(r.label)}对应的本体属性" data-mapping-target="${i}">${options([['','待选择本体对象属性'],...sceneMappingContext(s,()=>sceneMappingObjects(s).flatMap(o=>o.props.map(p=>[`${o.id}.${p.id}`,`${o.name} / ${p.name} · ${p.id} (${p.type})`])))],r.ontology)}</select>`}</td><td><span class="tiny muted">${esc(r.reason)}</span>${!r.existing&&r.candidates.length?`<small class="field-path">候选：${r.candidates.slice(0,2).map(c=>esc(c.label)).join('；')}</small>`:''}</td></tr>`).join('')}</tbody></table></div><p class="tiny muted section-gap">人工选择属性后仍会校验类型、重复字段和业务行引用。取数来源按已有能力选择；无可用来源时先使用当前表单输入，可在映射配置中修改。</p>`,btn(`确认添加 ${selected} 条映射`,'workflow-ai-apply','primary','check'),true);
}
const sceneMappingViewBefore=workflowBindingView;
workflowBindingView=function(s){
  if(workflowScene(s).type!=='draft')return sceneMappingViewBefore(s);
  const w=workflowScene(s),block=w.blocks[s.selectedBlock]||Object.values(w.blocks)[0];if(!block)return '<div class="empty">先添加表单区块，再生成映射。</div>';s.selectedBlock=block.id;
  const bindings=s.bindings[block.id]||[];
  return `<div class="binding-layout"><aside class="binding-tree"><div class="tree-label">数据库表 / 表单区块</div>${Object.values(w.blocks).map(b=>`<button class="tree-item ${b.id===block.id?'active':''}" data-action="scene-block" data-block="${esc(b.id)}">${icon('file')}<span>${esc(b.label)}</span><small>${(s.bindings[b.id]||[]).length}</small></button>`).join('')}</aside><div><div class="table-toolbar"><div><h3>${esc(block.label)}</h3><p class="tiny muted section-gap"><code>${esc(block.table||'未设置表名')}</code> · 字段与中文名称一起匹配</p></div><div class="row">${btn('AI 一键生成映射','workflow-ai-map','sm primary','bind')}${btn('人工添加映射','add-scene-binding','sm','plus')}</div></div><div class="table-wrap"><table class="config-table"><thead><tr><th>数据库 / 表单字段</th><th>本体对象 / 属性</th><th>映射状态 / 填入方式</th><th>操作</th></tr></thead><tbody>${block.fields.map(f=>{
    const i=bindings.findIndex(b=>b.target===scenePrefix(s,block.id)+f.key),b=bindings[i],meta=sceneMappingColumn(s,block,f),mode=f.mappingMode||'mapping';
    if(mode!=='mapping')return `<tr><td class="field-name"><code>${esc(meta.column)}</code><small>${esc(meta.label)}</small><small>${esc(scenePrefix(s,block.id)+f.key)}</small></td><td><span class="muted tiny">不参与本体映射</span></td><td>${pill(mode==='system'?'系统自动生成':'用户手动输入',mode==='system'?'blue':'')}<small class="field-path">${f.technical?'仅本地定位，不写数据库':mode==='system'?'由业务系统生成，原型不执行真实生成':'保留用户填写内容'}</small></td><td>${btn('修改字段用途','workflow-edit-block','sm','edit',`data-id="${esc(block.id)}"`)}</td></tr>`;
    return `<tr><td class="field-name"><code>${esc(meta.column)}</code><small>${esc(meta.label)}</small><small>${esc(scenePrefix(s,block.id)+f.key)}</small></td><td>${b?`${esc(semanticPath(b.ontology))}<code class="field-path">${esc(b.ontology)}</code><small class="field-path">${esc(workflowBindingSourceLabel(s,b))}</small>`:'<span class="muted tiny">待选择本体对象属性</span>'}</td><td>${b?pill('已映射','green')+`<small class="field-path">${esc(({'建议写入':'用户确认后填入','只读':'只用于查看','双向':'读取并回填','引用绑定':'关联对应记录'})[b.direction]||b.direction)}</small>`:pill('待映射','amber')}</td><td>${b?`<button class="link" data-action="edit-scene-binding" data-index="${i}">修改</button> <button class="link danger-text" data-action="delete-scene-binding" data-index="${i}">删除</button>`:btn('添加映射','add-scene-binding','sm','plus',`data-fieldkey="${esc(f.key)}"`)}</td></tr>`;
  }).join('')}</tbody></table></div><p class="tiny muted scene-mapping-note">一键生成当前表的建议，人工确认后添加；不明确的匹配不自动选中。数据库列与表单路径独立，保存由业务系统完成。</p></div></div>`;
};
const sceneMappingAddBefore=actionsMap['add-scene-binding'];
actionsMap['add-scene-binding']=function(el){
  if(workflowScene(scene()).type!=='draft')return sceneMappingAddBefore(el);
  const s=scene(),block=workflowScene(s).blocks[s.selectedBlock],f=block.fields.find(f=>f.key===el?.dataset?.fieldkey),meta=f&&sceneMappingColumn(s,block,f);
  if(f?.mappingMode&&f.mappingMode!=='mapping')return toast('该字段不参与本体映射，请先修改字段用途。');
  openDrawer('sceneBinding',{label:f?.label||'',target:f?scenePrefix(s,block.id)+f.key:'',ontology:'Material.materialCode',direction:'建议写入',policy:'差异确认',sinkTable:block.table,sinkColumn:meta?.column||'',instanceMode:'input',sourceCapabilities:[]},{index:-1});
};
function sceneMappingPublishedContext(s,fn){
  const saved=objects.slice();
  try{objects.splice(0,objects.length,...sceneMappingObjects(s));return fn();}finally{objects.splice(0,objects.length,...saved);}
}
function sceneMappingBindingIssue(s,block,b,index){
  if(workflowScene(s).type!=='draft')return '';
  const f=block?.fields.find(f=>scenePrefix(s,block.id)+f.key===b.target),[oid,pid]=b.ontology.split('.'),p=sceneMappingObjects(s).find(o=>o.id===oid)?.props.find(p=>p.id===pid);
  if(f?.mappingMode&&f.mappingMode!=='mapping')return '该字段不参与本体映射，请先将字段用途改为参与映射。';
  if(block?.fields.some(other=>other.mappingMode&&other.mappingMode!=='mapping'&&b.sinkTable===block.table&&String(other.sinkColumn||other.key).toLowerCase()===String(b.sinkColumn).toLowerCase()))return '该数据库字段不参与本体映射，请先修改字段用途。';
  if(block?.database&&f&&(b.sinkTable!==block.table||b.sinkColumn!==f.sinkColumn))return '数据库映射保存位置必须与所选表字段一致，请先修改业务表结构。';
  if(!p)return '引用的本体对象属性尚未发布或不在场景锁定版本中。';
  if(f&&sceneMappingType(f.type)!==sceneMappingType(p.type))return '表单字段与本体属性类型不一致。';
  if(f?.key===block.keyField&&block.object&&(oid!==block.object||!p.key))return '区块唯一编号必须对应当前区块对象的唯一编号属性。';
  if((s.bindings[block.id]||[]).some((other,i)=>i!==index&&other.sinkTable===b.sinkTable&&String(other.sinkColumn).toLowerCase()===String(b.sinkColumn).toLowerCase()))return '当前数据库列已经有映射，请修改已有映射。';
  return '';
}
const sceneMappingValidBefore=validSceneBinding;
validSceneBinding=function(b,index){const s=scene(),block=workflowScene(s).blocks[s.selectedBlock];return sceneMappingPublishedContext(s,()=>sceneMappingValidBefore(b,index)||sceneMappingBindingIssue(s,block,b,index));};
const sceneMappingBindingEditorBefore=extraDrawers.sceneBinding;
extraDrawers.sceneBinding=function(){return workflowScene(scene()).type==='draft'?sceneMappingPublishedContext(scene(),()=>sceneMappingBindingEditorBefore()):sceneMappingBindingEditorBefore();};
const sceneMappingSaveBefore=actionsMap['save-scene-binding'];
actionsMap['save-scene-binding']=function(el){
  const s=scene(),d=state.drawer;if(workflowScene(s).type!=='draft')return sceneMappingSaveBefore(el);
  const ontology=d?.draft.ontology,version=ontology&&sceneMappingVersions(s)[ontology.split('.')[0]];
  const result=sceneMappingPublishedContext(s,()=>sceneMappingSaveBefore(el));
  if(!state.drawer&&ontology&&version){s.ontologyVersions??={};s.ontologyVersions[ontology.split('.')[0]]=version;}
  return result;
};
Object.assign(actionsMap,{'workflow-ai-map':sceneMappingOpen,'workflow-ai-regenerate':sceneMappingRegenerate,'workflow-ai-apply':sceneMappingApply});
extraDrawers.workflowMapping=sceneMappingEditor;
function sceneMappingChange(el){
  const d=state.drawer;if(d?.type!=='workflowMapping')return;
  if(el.dataset.mappingInclude!==undefined){const r=d.draft.rows[Number(el.dataset.mappingInclude)];if(!r||r.existing)return;r.include=el.checked;}
  else if(el.dataset.mappingTarget!==undefined){const r=d.draft.rows[Number(el.dataset.mappingTarget)];if(!r||r.existing)return;r.ontology=el.value;r.include=!!el.value;r.reason='人工选择，保存时重新校验';}
  else return;
  d.dirty=true;d.error='';drawOverlay();
}
document.addEventListener('change',e=>sceneMappingChange(e.target));
