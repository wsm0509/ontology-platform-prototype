/* 智能提单业务单据结构：真实连接选表、只读字段元数据与逐字段用途。无网络请求。 */
'use strict';
function sceneTableFieldMode(f){return f?.mappingMode??'mapping';}
function sceneTableIdentifier(value){
  const parts=String(value||'').split('.').at(-1).replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let id=parts.map((p,i)=>i?p[0].toUpperCase()+p.slice(1):p).join('');
  if(!/^[a-z]/i.test(id))id='table'+(id?id[0].toUpperCase()+id.slice(1):'Block');
  if(['constructor','prototype','__proto__'].includes(id))id='table'+id[0].toUpperCase()+id.slice(1);
  return id;
}
function sceneTableDatabases(){
  if(typeof systemConnectionDraft!=='function')return [];
  return systemConnectors.filter(c=>c.enabled===true).filter(c=>{const d=systemConnectionDraft(c);return d.types.includes('database')&&Array.isArray(d.configs.database.tables)&&d.configs.database.tables.some(t=>typeof t?.name==='string'&&t.name.trim());});
}
function sceneTableTables(database){const c=sceneTableDatabases().find(c=>c.id===database);return c?systemConnectionDraft(c).configs.database.tables.filter(t=>typeof t?.name==='string'&&t.name.trim()):[];}
function sceneTableType(type){
  const t=String(type||'文本').trim();if(['文本','数字','布尔','日期'].includes(t))return t;
  if(['枚举','引用'].includes(t)||/^(?:var)?char|^n?varchar|^text|^string|^clob|^uuid|^enum|^citext/i.test(t))return '文本';
  if(/^(?:tiny|small|big)?int|^number|^numeric|^decimal|^float|^double|^real|^money/i.test(t))return '数字';
  if(/^bool|^bit(?:\(|$)/i.test(t))return '布尔';
  if(/^date|^time/i.test(t))return '日期';return t;
}
function sceneTableFlag(value){return value===true||value===1||value==='true'||value==='是';}
function sceneTableNormalize(rows,sample=false){
  const explicit=rows.some(r=>{const m=Array.isArray(r)?r[5]:r;return m&&(Object.hasOwn(m,'primary')||Object.hasOwn(m,'primaryKey')||typeof m.key==='boolean');});
  const fields=rows.map((r,i)=>{
    const meta=Array.isArray(r)?r[5]||{}:r||{},column=Array.isArray(r)?r[0]:meta.column??meta.sinkColumn??meta.name??meta.id??(typeof meta.key==='string'?meta.key:'');
    const label=Array.isArray(r)?r[1]:meta.label??meta.comment??meta.displayName??(meta.column||meta.sinkColumn?meta.name:undefined)??meta.description??column;
    const primary=sceneTableFlag(meta.primary)||typeof meta.key==='boolean'&&meta.key||sceneTableFlag(meta.primaryKey)||(!explicit&&sample&&i===0&&Array.isArray(r));
    const proposedKey=Array.isArray(r)?r[2]||column:meta.fieldKey??(typeof meta.key==='string'?meta.key:undefined)??meta.path??column;
    const key=/^[A-Za-z]\w*$/.test(proposedKey)&&!String(proposedKey).includes('_')&&!/^[A-Z\d]+$/.test(proposedKey)?proposedKey:sceneTableIdentifier(proposedKey),rawType=Array.isArray(r)?r[4]:meta.type??meta.dataType;
    return {key,label:String(label||column||''),type:sceneTableType(rawType),sinkColumn:String(column||''),mappingMode:primary?'system':'mapping',required:primary||sceneTableFlag(meta.required)||meta.nullable===false,primary,sourceType:String(rawType||'文本'),...(Array.isArray(r)?{sample:r[3]}:{...(Object.hasOwn(meta,'sample')?{sample:meta.sample}:{})})};
  });
  return {fields,primarySource:explicit?'metadata':sample&&rows.some(Array.isArray)?'sample-first-column':'none'};
}
// 仅数据库自己的注册样例可用于新表。全局同名样例仅允许无数据库的旧区块编辑。
function sceneTableSchema(block,options={}){
  if(typeof block==='string')block={database:block,table:typeof options==='string'?options:''};
  const database=block?.database||'',table=block?.table||'',empty={database,table,fields:[],source:'',primarySource:'none',label:table,signature:''};
  let configured,raw,source='';
  if(database){
    const c=sceneTableDatabases().find(c=>c.id===database);if(!c)return {...empty,error:'所选数据库连接不存在、已停用或未配置数据库表，请重新选择数据库。'};
    configured=sceneTableTables(database).find(t=>t.name.trim().toLowerCase()===table.trim().toLowerCase());if(!configured)return {...empty,error:'所选表已不在数据库配置中，请重新选择表。'};
    if(Array.isArray(configured.columns)){raw={...configured,fields:configured.columns};source='config.columns';}
    else if(Array.isArray(configured.fields)){raw=configured;source='config.fields';}
    else{const owner=String(c.id).toUpperCase();raw=tableSchemas[owner]?.find(t=>t.table.trim().toLowerCase()===table.trim().toLowerCase());if(raw)source='tableSchemas:'+owner;}
  }else if(options?.legacyEdit&&block?.id){
    const matches=Object.entries(tableSchemas).flatMap(([owner,schemas])=>schemas.filter(t=>t.table===table).map(t=>({owner,t})));
    if(matches.length===1){raw=matches[0].t;source='legacy:tableSchemas:'+matches[0].owner;}
  }
  if(!raw||!Array.isArray(raw.fields)||!raw.fields.length)return {...empty,label:configured?.label||configured?.description||table,error:'缺少字段元数据，请先在数据库表配置中提供 columns / fields；不能保存空结构。'};
  const normalized=sceneTableNormalize(raw.fields,source.includes('tableSchemas:'));
  const label=configured?.label||configured?.description||configured?.comment||raw.label||raw.name||table;
  const signature=JSON.stringify({database,table:table.trim().toLowerCase(),source,configured:configured?{...configured,name:configured.name.trim().toLowerCase()}:null,raw:raw?{...raw,table:raw.table?.trim().toLowerCase(),name:raw.table?raw.name:raw.name?.trim().toLowerCase()}:null});
  return {...empty,...normalized,label,source,signature,fields:normalized.fields,columns:normalized.fields,error:''};
}
function sceneTableFingerprint(s){const config=structuredClone(s);delete config.lastResult;delete config.selectedBlock;delete config.revision;return JSON.stringify(config);}
function sceneTableFieldBinding(s,b,f){return (s.bindings?.[b.id]||[]).find(binding=>binding.target===scenePrefix(s,b.id)+f.key||f.sinkColumn&&binding.sinkTable===b.table&&binding.sinkColumn===f.sinkColumn);}
function sceneTableRuleReferences(s,b,key){
  const full=scenePrefix(s,b.id)+key;
  return (workflowScene(s).rules||[]).some(r=>{
    const values=[...(r.conditions||[]),...(r.assertions||[])].map(a=>a.fact).concat(Object.values(r.params||{}));
    return values.some(v=>v===full||v===b.path+'.'+key||r.scope===b.id&&(v==='Row.'+key||v==='row.'+key)||!b.parent&&(v==='Order.'+key||v==='order.'+key));
  });
}
function sceneTableLegacyFields(s,b){
  const schema=sceneTableSchema(b,{legacyEdit:true});
  return b.fields.map(f=>{
    const binding=sceneTableFieldBinding(s,b,f),known=schema.fields.find(c=>c.sinkColumn===(binding?.sinkColumn||f.sinkColumn)||c.key===f.key||c.primary&&f.key===b.keyField);
    return {...structuredClone(f),sinkColumn:f.sinkColumn||binding?.sinkColumn||known?.sinkColumn||f.key,mappingMode:f.mappingMode??(binding?'mapping':f.key===b.keyField?'system':'user'),required:f.required??false,primary:f.primary??known?.primary??false};
  });
}
function sceneTableOpen(b,isNew){
  const s=scene(),main=Object.values(workflowScene(s).blocks).find(x=>!x.parent);
  const draft=isNew?{id:'',path:'',label:'',table:'',database:'',object:null,parent:main?.id||'',many:!!main,keyField:'',fields:[],structureSource:'table'}:{...structuredClone(b),database:b.database||'',fields:b.database?structuredClone(b.fields):sceneTableLegacyFields(s,b)};
  if(!isNew&&draft.database){
    const scratch={draft,originalBlock:structuredClone(b),isNew:false};sceneTableBuildDraft(scratch);draft.label=b.label;
  }
  draft.cardinality=draft.many?'many':'one';draft.fieldsText=draft.fields.map(f=>`${f.key} | ${f.label} | ${f.type}`).join('\n');
  openDrawer('workflowBlock',draft,{tableMode:true,isNew,originalId:b?.id||'',sceneId:s.id,blockId:s.selectedBlock,fingerprint:sceneTableFingerprint(s),originalBlock:isNew?null:structuredClone(b),initialFieldsText:draft.fieldsText,origins:{}});
}
function sceneTableBuildDraft(d){
  const v=d.draft,s=scene(),old=d.originalBlock,schema=sceneTableSchema(v);d.schemaError=schema.error;
  v.fields=structuredClone(schema.fields);v.label=schema.label||'';v.schemaSource=schema.source;v.tableMeta={database:v.database,table:v.table,source:schema.source,signature:schema.signature,primarySource:schema.primarySource};v.structureSource='table';
  if(d.isNew){
    const base=sceneTableIdentifier(v.table),blocks=workflowScene(s).blocks;let id=base,i=2;
    while(Object.hasOwn(blocks,id)||Object.values(blocks).some(b=>b.path===id))id=base+i++;
    v.id=v.table?id:'';v.path=v.id;v.keyField=v.fields.find(f=>f.primary)?.key||'';
    if(v.fields.length&&!v.keyField){let key='rowIdentity',i=2;while(v.fields.some(f=>f.key===key))key='rowIdentity'+i++;v.keyField=key;v.fields.push({key,label:'本地行标识（非数据库列）',type:'文本',sinkColumn:'',mappingMode:'system',required:true,primary:false,technical:true});}
    v.object=null;
  }else{
    // 编辑字段时保留身份、路径与原字段代码；parent 是结构技术容器，不推断外键。
    v.fields=v.fields.map(f=>{const prior=old.fields.find(x=>x.sinkColumn===f.sinkColumn||x.key===f.key);return prior?{...structuredClone(prior),...f,key:prior.key,mappingMode:prior.mappingMode??(sceneTableFieldBinding(s,old,prior)?'mapping':prior.key===old.keyField?'system':'user')}:f;});
    const originalKey=old.fields.find(f=>f.key===old.keyField);
    if(!v.fields.some(f=>f.key===old.keyField)&&originalKey?.technical)v.fields.push(structuredClone(originalKey));
    else if(!v.fields.some(f=>f.key===old.keyField)&&originalKey){const matched=v.fields.find(f=>f.sinkColumn===originalKey.sinkColumn);if(matched)matched.key=old.keyField;}
    if(v.fields.length&&!v.fields.some(f=>f.key===old.keyField)&&!v.fields.some(f=>f.primary)&&!sceneTableFieldBinding(s,old,originalKey||{key:old.keyField})&&!sceneTableRuleReferences(s,old,old.keyField))v.fields.push({key:old.keyField,label:'本地行标识（非数据库列）',type:'文本',sinkColumn:'',mappingMode:'system',required:true,primary:false,technical:true});
  }
  v.tableMeta.localIdentity=!!v.fields.find(f=>f.key===v.keyField&&f.technical);
  v.fieldsText=v.fields.map(f=>`${f.key} | ${f.label} | ${f.type}`).join('\n');d.initialFieldsText=v.fieldsText;d.origins={};
}
function sceneTableInput(e){
  const d=state.drawer,el=e.target;if(d?.type!=='workflowBlock'||!d.tableMode||d.sceneId!==scene()?.id)return;
  const has=k=>Object.hasOwn(el.dataset||{},k);let changed=false,rebuild=false;
  if(has('tableDatabase')&&d.draft.database!==el.value){d.draft.database=el.value;d.draft.table='';changed=true;rebuild=true;}
  else if(has('tableSelect')&&d.draft.table!==el.value){d.draft.table=el.value;changed=true;rebuild=true;}
  else if(has('tableMapping')||has('tableOrigin')){
    const index=Number(has('tableMapping')?el.dataset.tableMapping:el.dataset.tableOrigin),f=d.draft.fields[index];if(!f||!Number.isInteger(index)||f.technical)return;
    if(has('tableMapping')){if(!el.checked){d.origins[index]??=f.primary||f.technical?'system':'user';f.mappingMode=d.origins[index];}else{if(sceneTableFieldMode(f)!=='mapping')d.origins[index]=sceneTableFieldMode(f);f.mappingMode='mapping';}}
    else if(['user','system'].includes(el.value)&&sceneTableFieldMode(f)!=='mapping'){f.mappingMode=el.value;d.origins[index]=el.value;}else return;
    const origin=document.getElementById('table-origin-'+index);if(origin){origin.disabled=sceneTableFieldMode(f)==='mapping';origin.value=d.origins[index]||'user';}changed=true;
  }else if(el.dataset?.field==='label')changed=true;
  if(!changed)return;d.dirty=true;d.error='';
  if(rebuild){sceneTableBuildDraft(d);drawOverlay();}
  // 字段用途及名称输入不重绘、不 focus，保留输入位置和光标。
}
document.addEventListener('input',sceneTableInput);
document.addEventListener('change',sceneTableInput);
function sceneTableBlockIssues(s,b){
  const issues=[],label=b.label||b.id,push=message=>issues.push(`${label}：${message}`),fields=b.fields||[];
  if(!fields.length)push('缺少字段元数据，不能保存空结构。');
  const keys=new Set(),columns=new Set();
  for(const f of fields){
    if(!/^[A-Za-z]\w*$/.test(f.key)||['constructor','prototype','__proto__'].includes(f.key)||!String(f.label||'').trim()||!['文本','数字','布尔','日期'].includes(f.type))push(`字段 ${f.key||'（空）'} 标识、名称或类型不合法。`);
    if(keys.has(f.key))push(`字段 ${f.key} 重复。`);keys.add(f.key);
    if(!['mapping','user','system'].includes(sceneTableFieldMode(f)))push(`字段 ${f.key} 用途不合法，只允许映射、手动输入或系统生成。`);
    if(sceneTableFieldMode(f)!=='mapping'&&sceneTableFieldBinding(s,b,f))push(`字段 ${f.key} 已有映射，请先删除或先解除对应关系再修改用途。`);
    if(f.technical&&(sceneTableFieldMode(f)!=='system'||f.sinkColumn||f.primary))push(`字段 ${f.key} 为技术行标识，必须由系统自动生成且不对应数据库列或真实主键。`);
    if(f.sinkColumn){const column=f.sinkColumn.toLowerCase();if(columns.has(column))push(`数据库字段 ${f.sinkColumn} 重复。`);columns.add(column);}
  }
  if(!fields.some(f=>f.key===b.keyField))push('字段结构必须包含记录行标识。');
  if(b.database){
    const schema=sceneTableSchema(b);if(schema.error)push(schema.error);
    else{
      if(!b.tableMeta?.signature||b.tableMeta.signature!==schema.signature)push('数据库字段元数据已变化，请重新打开区块编辑并确认。');
      for(const f of fields.filter(f=>!f.technical)){const source=schema.fields.find(c=>c.sinkColumn===f.sinkColumn);if(!source||source.type!==f.type||source.primary!==!!f.primary||source.required!==!!f.required)push(`数据库字段 ${f.sinkColumn||f.key} 元数据不一致或已移除。`);}
      for(const f of schema.fields)if(!fields.some(c=>c.sinkColumn===f.sinkColumn&&!c.technical))push(`数据库字段 ${f.sinkColumn} 缺少用途配置。`);
      if(!b.object&&(!schema.fields.some(f=>f.primary)||b.tableMeta?.localIdentity)&&!fields.some(f=>f.technical&&f.key===b.keyField&&f.mappingMode==='system'&&!f.sinkColumn))push('没有真实主键或仍使用本地行标识，必须保留系统生成的技术行标识。');
    }
  }else if(b.structureSource==='table')push('表结构未关联真实数据库，请选择已配置的数据库连接。');
  return issues;
}
function sceneTableConfigIssues(s){
  if(workflowScene(s).type!=='draft')return [];
  return Object.values(workflowScene(s).blocks).flatMap(b=>[...sceneTableBlockIssues(s,b),...(b.database?(b.fields||[]).filter(f=>f.mappingMode==='mapping'&&!sceneTableFieldBinding(s,b,f)).map(f=>`${b.label}：参与映射字段 ${f.label}（${f.sinkColumn||f.key}）尚未配置本体对应关系。`):[])]);
}
function sceneTableSave(){
  const d=state.drawer,s=scene();if(d?.type!=='workflowBlock'||!d.tableMode)return;
  if(s?.id!==d.sceneId||s.selectedBlock!==d.blockId)return errorDrawer('当前场景或区块已切换，请关闭后重新编辑。');
  if(typeof sceneReleaseCanEdit==='function'&&!sceneReleaseCanEdit(s))return errorDrawer('请先进入场景编辑。');
  if(d.fingerprint!==sceneTableFingerprint(s))return errorDrawer('场景配置已变化，请关闭后重新编辑。');
  const v=structuredClone(d.draft),w=workflowScene(s),old=d.originalBlock;
  if(!String(v.label||'').trim())return errorDrawer('请填写业务区块名称。');v.label=v.label.trim();
  if(!/^[A-Za-z]\w*$/.test(v.id)||!/^[A-Za-z]\w*$/.test(v.path)||['constructor','prototype','__proto__'].includes(v.id))return errorDrawer('表结构标识不合法，请重新选择表。');
  if(old&&['id','path','keyField','many','parent','object','table','database'].some(k=>(v[k]??'')!==(old[k]??''))){
    const referenced=(s.bindings[old.id]||[]).length||(w.rules||[]).some(r=>r.scope===old.id)||old.fields.some(f=>sceneTableRuleReferences(s,old,f.key));
    if(referenced)return errorDrawer('区块已有绑定或规则引用，不允许改变路径、唯一编号、结构或换表，请先解除引用。');
    // 既有 identity 不向用户开放；即使没有引用也必须保持技术契约稳定。
    if(['id','path','keyField','many','parent','object'].some(k=>v[k]!==old[k]))return errorDrawer('已有区块的标识、路径、唯一编号与记录结构必须保持不变。');
  }
  if(old&&v.cardinality!==(old.many?'many':'one'))return errorDrawer('已有区块的记录结构必须保持不变。');
  if(!v.database&&(!old||old.database||v.table!==old.table))return errorDrawer('请选择真实启用且已配置数据表的数据库；不能新建假连接或手工虚构表。');
  if(d.isNew&&Object.hasOwn(w.blocks,v.id)||Object.values(w.blocks).some(b=>b.id!==d.originalId&&b.path===v.path))return errorDrawer('区块标识或路径重复，请重新选择表。');
  // fieldsText 是原 workflowBlock 调用方的兼容接口，仅无数据库的既有区块可使用。
  if(old&&!v.database&&v.fieldsText!==d.initialFieldsText){
    v.fields=String(v.fieldsText||'').split('\n').filter(line=>line.trim()).map(line=>{const [key,label,type]=line.split('|').map(x=>x.trim());const prior=v.fields.find(f=>f.key===key)||old.fields.find(f=>f.key===key);return {...structuredClone(prior||{}),key,label,type:type||'文本',mappingMode:prior?.mappingMode??(key===old.keyField?'system':'user'),sinkColumn:prior?.sinkColumn||key,required:prior?.required??false,primary:prior?.primary??false};});
  }
  if(old)for(const f of old.fields.filter(f=>!v.fields.some(n=>n.key===f.key)))if(sceneTableFieldBinding(s,old,f)||sceneTableRuleReferences(s,old,f.key))return errorDrawer(`字段 ${f.key} 被对应关系或规则引用，请先解除引用。`);
  if(v.parent&&!w.blocks[v.parent]||!v.parent&&v.many||!v.parent&&Object.values(w.blocks).some(b=>!b.parent&&b.id!==v.id))return errorDrawer('主区块或记录结构已变化，请重新打开编辑。');
  const {cardinality,fieldsText,...block}=v;
  if(block.database){const schema=sceneTableSchema(block);if(schema.error)return errorDrawer(schema.error);if(block.tableMeta?.signature!==schema.signature)return errorDrawer('数据库表或字段元数据已变化，请关闭后重新编辑。');block.structureSource='table';}
  const next=structuredClone(s);next.workflow.blocks[block.id]=block;next.bindings[block.id]??=[];
  const issues=sceneTableBlockIssues(next,block);if(issues.length)return errorDrawer(issues.join('；'));
  w.blocks[block.id]=block;s.names[block.id]=block.label;s.bindings[block.id]??=[];s.selectedBlock=block.id;
  workflowInvalidate();closeOverlay(true);render();toast('表结构已保存，可为参与映射的字段配置对应关系');
}
function sceneTableEditor(){
  const d=state.drawer,v=d.draft,dbs=sceneTableDatabases(),tables=sceneTableTables(v.database),legacy=!d.isNew&&!d.originalBlock?.database&&!v.database;
  const dbOptions=[['','请选择数据库'],...dbs.map(c=>[c.id,`${c.name} · ${c.id}`])];if(v.database&&!dbs.some(c=>c.id===v.database))dbOptions.push([v.database,'原数据库已不可用，请重新选择']);
  const tableOptions=[['','请选择表'],...tables.map(t=>[t.name,`${t.name}${t.description?' · '+t.description:''}`])];if(v.table&&!tables.some(t=>t.name===v.table))tableOptions.push([v.table,legacy?`${v.table} · 原表（未配置数据库）`:`${v.table} · 已不可用`]);
  const schema=v.database?sceneTableSchema(v):null,error=d.schemaError||schema?.error;
  const fields=v.fields.map((f,i)=>{const mode=sceneTableFieldMode(f),locked=f.technical,origin=mode==='mapping'?d.origins[i]||'user':mode;return `<tr class="scene-table-field"><td><code>${esc(f.sinkColumn||'—')}</code><small class="field-path">${esc(f.key)}${f.technical?' · 技术字段':''}</small></td><td>${esc(f.label)}</td><td>${esc(f.type)}${f.required?' · 必填':''}</td><td>${f.primary?pill('主键','blue'):f.technical?pill('本地行标识','amber'):'—'}</td><td><label class="check-row"><input type="checkbox" data-table-mapping="${i}" aria-label="${esc(f.label)}参与映射" ${mode==='mapping'?'checked':''} ${locked?'disabled':''}>参与映射</label></td><td><select id="table-origin-${i}" data-table-origin="${i}" aria-label="${esc(f.label)}未参与映射来源" ${mode==='mapping'||locked?'disabled':''}>${options([['user','用户手动输入'],['system','系统自动生成']],origin)}</select></td></tr>`;}).join('');
  const noPK=v.fields.length&&!v.fields.some(f=>f.primary),hint=legacy?'原表未绑定数据库：可保留原表编辑既有字段，不会创建数据库连接。':'只列出已启用且已配置数据表的数据库连接；字段来自该库的表元数据。';
  return frame(d.isNew?'添加业务表结构':'编辑业务表结构','选择数据库和表，设置业务区块名称与字段用途；无需选择本体对象或所属区块。',`<div class="form-grid scene-table-config"><div class="form-field"><label for="scene-table-database">选择数据库 *</label><select id="scene-table-database" data-table-database>${options(dbOptions,v.database)}</select><small>${hint}</small></div><div class="form-field"><label for="scene-table-select">选择表 *</label><select id="scene-table-select" data-table-select>${options(tableOptions,v.table)}</select></div>${field('表名称 / 区块名称 *','label',v.label)}</div><div class="scene-table-summary sample section-gap">英文标识（自动）：<code>${esc(v.id||'选表后生成')}</code> · 路径：<code>${esc(v.path||'—')}${v.many?'[]':''}</code> · 行标识：<code>${esc(v.keyField||'—')}</code></div>${error?`<div class="section-gap">${inf(esc(error),'amber')}</div>`:''}${noPK?`<div class="section-gap">${inf('没有真实主键；新表使用系统生成的本地行标识，不对应数据库列。既有表保留原行标识。','amber')}</div>`:''}${v.tableMeta?.primarySource==='sample-first-column'?`<p class="tiny muted section-gap">主键依据：该连接已知样例的第一列约定（非实时数据库验证）。</p>`:''}<div class="between section-gap"><h3>自动字段预览</h3><span class="tiny muted">${v.fields.length} 个字段 · 取消勾选后选择手动输入或系统生成</span></div><div class="table-wrap section-gap"><table class="config-table scene-table-fields"><thead><tr><th>数据库英文字段 / 路径</th><th>中文名称</th><th>类型</th><th>主键</th><th>参与映射</th><th>未参与映射来源</th></tr></thead><tbody>${fields||'<tr><td colspan="6" class="empty">请先选择已配置字段元数据的数据库表。</td></tr>'}</tbody></table></div><p class="tiny muted section-gap">已有绑定须先删除后才能退出映射。规则引用字段可不参与映射，但不能删除。所属关系是区块技术容器，不代表数据库外键。</p>`,btn('保存表单结构','workflow-save-block','primary','check',(!v.fields.length||error)?'disabled':''),true);
}
const sceneTableDrawerBefore=extraDrawers.workflowBlock;
extraDrawers.workflowBlock=function(){return state.drawer?.tableMode&&workflowScene(scene()).type==='draft'?sceneTableEditor():sceneTableDrawerBefore();};
const sceneTableAddBefore=actionsMap['workflow-add-block'],sceneTableEditBefore=actionsMap['workflow-edit-block'],sceneTableSaveBefore=actionsMap['workflow-save-block'];
actionsMap['workflow-add-block']=function(el){return workflowScene(scene()).type==='draft'?sceneTableOpen(null,true):sceneTableAddBefore(el);};
actionsMap['workflow-edit-block']=function(el){if(workflowScene(scene()).type!=='draft')return sceneTableEditBefore(el);const b=workflowScene(scene()).blocks[el.dataset.id];if(!b)return toast('区块已不存在');return sceneTableOpen(b,false);};
actionsMap['workflow-save-block']=function(el){return state.drawer?.tableMode?sceneTableSave():sceneTableSaveBefore(el);};
const sceneTableStructureBefore=workflowStructureView;
workflowStructureView=function(s){
  if(workflowScene(s).type!=='draft')return sceneTableStructureBefore(s);
  return `<div class="panel-body scene-table-structure"><div class="between"><div><h3>业务单据结构</h3><p class="tiny muted section-gap">选择数据库表，预览字段并勾选需要映射的字段；其余字段由用户输入或系统生成。</p></div>${btn('添加表单区块','workflow-add-block','sm','plus')}</div><div class="table-wrap section-gap"><table class="config-table"><thead><tr><th>表名称 / 区块名称</th><th>数据库 / 表</th><th>行标识</th><th>字段用途</th><th>操作</th></tr></thead><tbody>${Object.values(workflowScene(s).blocks).map(b=>`<tr><td class="field-name">${esc(b.label)}<code class="field-path">${esc(b.path)}${b.many?'[]':''}</code></td><td>${esc(b.database?systemConnectors.find(c=>c.id===b.database)?.name||'原数据库已不可用':'原表（未配置数据库）')}<small class="field-path">${esc(b.database||'')} · ${esc(b.table)}</small></td><td><code>${esc(b.keyField)}</code>${b.fields.find(f=>f.key===b.keyField)?.technical?'<small class="field-path">本地行标识，非数据库主键</small>':''}</td><td>${b.fields.length} 项 · ${b.fields.filter(f=>sceneTableFieldMode(f)==='mapping').length} 参与映射</td><td><button class="link" data-action="workflow-edit-block" data-id="${esc(b.id)}">编辑</button> <button class="link danger-text" data-action="workflow-delete-block" data-id="${esc(b.id)}">删除</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">尚未添加业务表结构。</td></tr>'}</tbody></table></div></div>`;
};
