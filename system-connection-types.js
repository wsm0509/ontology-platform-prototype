/* 一个系统可同时配置数据库、API 与 MCP。验证仅为本地原型模拟。 */
'use strict';
const systemConnectionTypes=[['database','数据库','db'],['api','API','link'],['mcp','MCP','flow']];
function systemConnectionDraft(c={}){
  const types=c.types?[...c.types]:c.kind?[c.kind==='数据库'?'database':c.kind==='MCP'?'mcp':'api']:[];
  const databaseEndpoint=String(c.endpoint||'').match(/^([^:/]+)(?::(\d+))?(?:\/(.+))?$/);
  const tables=capabilities.filter(a=>a.connector===c.id&&a.method==='数据库查询').flatMap(a=>Array.isArray(a.tables)?a.tables:[a.resource.replace(/[（(].*$/,'').trim()]).filter(Boolean);
  return {...structuredClone(c),id:c.id||'',name:c.name||'',owner:c.owner||'',desc:c.desc||'',timeout:c.timeout??3000,retry:c.retry??1,enabled:c.enabled??true,active:c.enabled===false?'停用':'启用',types,configs:{
    database:{driver:'Oracle',host:c.kind==='数据库'?databaseEndpoint?.[1]||'':'',port:c.kind==='数据库'?databaseEndpoint?.[2]||1521:1521,database:c.kind==='数据库'?databaseEndpoint?.[3]||'':'',schema:'',username:'',auth:c.kind==='数据库'?c.auth||'':'',tables:[...new Set(tables)].map(name=>({name,description:''})),simulation:'success',...structuredClone(c.configs?.database||{})},
    api:{url:c.kind==='REST API'?c.endpoint||'':'',authentication:c.auth?'reference':'none',auth:c.kind==='REST API'?c.auth||'':'',healthPath:'/health',simulation:'success',...structuredClone(c.configs?.api||{})},
    mcp:{url:c.kind==='MCP'?c.endpoint||'':'',transport:'Streamable HTTP',authentication:c.auth?'reference':'none',auth:c.kind==='MCP'?c.auth||'':'',simulation:'success',...structuredClone(c.configs?.mcp||{})}
  }};
}
function systemConnectionField(label,type,key,value,kind='text',choices=[],help=''){
  const id=`connection-${type}-${key}`;return `<div class="form-field"><label for="${id}">${label}</label>${kind==='select'?`<select id="${id}" data-connection-type="${type}" data-connection-key="${key}">${options(choices,value)}</select>`:`<input id="${id}" type="${kind}" value="${esc(value??'')}" data-connection-type="${type}" data-connection-key="${key}" autocomplete="off">`}${help?`<small>${help}</small>`:''}</div>`;
}
function systemConnectionSignature(v,type){return JSON.stringify({id:v.id,timeout:Number(v.timeout),retry:Number(v.retry),config:v.configs[type]});}
function systemConnectionCommonError(d){
  const v=d.draft;if(!v.name.trim()||!/^[A-Za-z]\w*$/.test(v.id))return '请填写系统名称及合法英文代号。';
  if(!v.types.length||v.types.some(type=>!systemConnectionTypes.some(t=>t[0]===type)))return '请至少选择一种连接类型。';
  if(d.isNew&&connector(v.id))return '系统连接英文代号已存在。';
  if(!d.isNew&&(!connector(d.originalId)||v.id!==d.originalId))return '系统连接已不存在或英文代号已改变，请保留原代号。';
  if(!Number.isInteger(Number(v.timeout))||Number(v.timeout)<1||!Number.isInteger(Number(v.retry))||Number(v.retry)<0||Number(v.retry)>5)return '超时应为正整数，重试次数应为 0 至 5。';
  for(const ability of [...capabilities,...[...sceneReleaseStore.values()].filter(m=>!m.deleted&&m.published).flatMap(m=>(m.snapshot?.queries||m.dependencies?.queries||[]).flatMap(q=>q.value?[q.value]:[]))].filter(a=>a.connector===(d.originalId||v.id))){const type=ability.connectionType||(ability.method==='数据库查询'?'database':['GET','POST 查询'].includes(ability.method)?'api':ability.method==='MCP'?'mcp':'');if(type&&!v.types.includes(type))return `取数能力“${ability.name}”仍使用${systemConnectionTypes.find(t=>t[0]===type)?.[1]||type}，请先调整该能力。`;}
  return '';
}
function systemConnectionTypeError(v,type){
  const c=v.configs[type];
  if(!['success','failed',...(type==='database'?['table-denied']:[])].includes(c.simulation))return '请选择有效的模拟验证结果。';
  if(type==='database'){
    if(!['Oracle','MySQL','PostgreSQL','SQL Server'].includes(c.driver))return '请选择数据库类型。';
    if(!c.host.trim()||/\s|\//.test(c.host)||!c.database.trim()||!c.auth.trim())return '请填写数据库主机、库名及登录凭据引用。';
    if(!Number.isInteger(Number(c.port))||Number(c.port)<1||Number(c.port)>65535)return '数据库端口应为 1 至 65535。';
    if(!c.tables.length)return '请至少添加一张数据库表。';
    const names=c.tables.map(t=>t.name.trim().toLowerCase());
    if(c.tables.some(t=>!/^[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?$/.test(t.name.trim())))return '请填写有效表名，例如 MATERIAL 或 PUBLIC.MATERIAL。';
    if(new Set(names).size!==names.length)return '存在重复的数据库表，请保留一条。';
    const existing=[...capabilities,...[...sceneReleaseStore.values()].filter(m=>!m.deleted&&m.published).flatMap(m=>(m.snapshot?.queries||m.dependencies?.queries||[]).flatMap(q=>q.value?[q.value]:[]))].filter(a=>a.connector===v.id&&a.method==='数据库查询');
    for(const ability of existing)for(const table of Array.isArray(ability.tables)?ability.tables:[ability.resource.replace(/[（(].*$/,'').trim()]){if(!names.includes(table.toLowerCase()))return `表“${table}”仍被取数能力“${ability.name}”使用，请保留该表或先调整能力。`;}
  }else{
    let url;try{url=new URL(c.url);}catch{return `请填写有效的 ${type==='api'?'API':'MCP'} 服务地址。`;}
    if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)return '服务地址须为 HTTP(S) 地址，登录凭据请通过引用单独配置。';
    if(!['none','reference'].includes(c.authentication))return '请选择认证方式。';
    if(c.authentication==='reference'&&!c.auth.trim())return '请填写登录凭据引用。';
    if(type==='api'&&(!c.healthPath.trim().startsWith('/')||/\s/.test(c.healthPath)))return '连通性检查路径须以 / 开头且不包含空格。';
    if(type==='mcp'&&!['Streamable HTTP','SSE'].includes(c.transport))return '请选择有效的 MCP 传输方式。';
  }
  return '';
}
function systemConnectionReady(d){return !systemConnectionCommonError(d)&&d.draft.types.every(type=>!systemConnectionTypeError(d.draft,type)&&d.verifications?.[type]?.status==='passed'&&d.verifications[type].signature===systemConnectionSignature(d.draft,type));}
function systemConnectionInvalidate(d){
  d.verifications={};d.dirty=true;d.error='';
  const save=document.getElementById('save-system-connection');if(save)save.disabled=true;
  document.querySelectorAll?.('[data-connection-result]').forEach(el=>{el.textContent='未验证 · 配置修改后请重新验证';});
  document.querySelectorAll?.('[data-connection-table-result]').forEach(el=>{el.textContent='未验证';});
}
function systemConnectionVerify(type){
  const d=state.drawer;if(d?.type!=='connector')return;
  const common=systemConnectionCommonError(d);if(common)return errorDrawer(common);
  const selected=type?[type]:d.draft.types;
  if(selected.some(value=>!d.draft.types.includes(value)))return;
  d.verifications??={};
  for(const current of selected){
    const c=d.draft.configs[current],error=systemConnectionTypeError(d.draft,current),simulation=c.simulation||'success';
    const fail=error||(!['success','table-denied'].includes(simulation)?'模拟连接失败：请检查服务地址及认证配置。':current==='database'&&simulation==='table-denied'?'数据库模拟连通，但部分表不可访问，请检查表名及读取权限。':'');
    const tables=current==='database'?c.tables.map((table,i)=>({name:table.name,status:!error&&simulation==='success'||!error&&simulation==='table-denied'&&i<c.tables.length-1?'passed':'failed'})):[];
    d.verifications[current]={status:fail?'failed':'passed',signature:systemConnectionSignature(d.draft,current),message:fail||`模拟连通成功${current==='database'?`，${tables.length} 张表均可读取`:current==='mcp'?'，服务握手与工具发现通过':'，检查接口可访问'}`,tables,time:now()};
    log('连接验证',`${d.draft.name} · ${systemConnectionTypes.find(t=>t[0]===current)[1]}`,fail?'失败':'成功',d.verifications[current].message);
  }
  d.error='';drawOverlay();
}
extraDrawers.connector=function(){
  const d=state.drawer,v=d.draft;
  const section=type=>{const c=v.configs[type],label=systemConnectionTypes.find(t=>t[0]===type)[1],result=d.verifications?.[type];return `<section class="system-connection-section"><div class="between"><h3>${label} 配置</h3>${btn(`验证 ${label}`,'system-verify-type','sm','refresh',`data-type="${type}"`)}</div><div class="form-grid section-gap">${type==='database'?
    systemConnectionField('数据库类型 *',type,'driver',c.driver,'select',['Oracle','MySQL','PostgreSQL','SQL Server'])+systemConnectionField('主机地址 *',type,'host',c.host)+systemConnectionField('端口 *',type,'port',c.port,'number')+systemConnectionField('数据库 / 服务名 *',type,'database',c.database)+systemConnectionField('默认 Schema',type,'schema',c.schema)+systemConnectionField('登录用户名（可选）',type,'username',c.username)+systemConnectionField('登录凭据引用 *',type,'auth',c.auth,'text',[],'填写受管凭据名称，勿输入真实密码'):
    systemConnectionField(type==='api'?'API 基础地址 *':'MCP 服务地址 *',type,'url',c.url)+systemConnectionField(type==='api'?'连通性检查路径 *':'传输方式 *',type,type==='api'?'healthPath':'transport',type==='api'?c.healthPath:c.transport,type==='api'?'text':'select',type==='api'?[]:['Streamable HTTP','SSE'])+systemConnectionField('认证方式',type,'authentication',c.authentication,'select',[['none','无需认证'],['reference','使用登录凭据引用']])+(c.authentication==='reference'?systemConnectionField('登录凭据引用 *',type,'auth',c.auth):'')}
    </div>${type==='database'?`<div class="between section-gap"><div><h4>数据表</h4><p class="tiny muted section-gap">可添加多张表，验证时逐表检查读取权限。</p></div>${btn('添加数据表','system-add-table','sm','plus')}</div><div class="table-wrap section-gap"><table class="system-tables"><thead><tr><th>表名 *</th><th>用途说明</th><th>验证结果</th><th>操作</th></tr></thead><tbody>${c.tables.map((table,i)=>`<tr><td><input aria-label="数据表 ${i+1} 名称" data-connection-table="${i}" data-table-key="name" value="${esc(table.name)}" placeholder="例如 PIS_MATERIAL"></td><td><input aria-label="数据表 ${i+1} 用途" data-connection-table="${i}" data-table-key="description" value="${esc(table.description||'')}"></td><td><span data-connection-table-result>${result?.signature===systemConnectionSignature(v,type)?result.tables[i]?.status==='passed'?'模拟可读取':'模拟验证失败':'未验证'}</span></td><td><button class="link danger-text" data-action="system-remove-table" data-index="${i}">移除</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty">尚未添加数据表，请先添加至少一张表。</td></tr>'}</tbody></table></div>`:''}
    <div class="system-verification ${result?.status||''}" data-connection-result="${type}" role="status">${result?.signature===systemConnectionSignature(v,type)?`${esc(result.message)} · ${result.time}`:'未验证 · 配置完成后请验证'}</div><details class="section-gap"><summary class="tiny muted">验证演示设置</summary><div class="form-grid section-gap">${systemConnectionField('模拟验证结果',type,'simulation',c.simulation,'select',type==='database'?[['success','连接与全部表读取成功'],['failed','数据库连接失败'],['table-denied','数据库连通，最后一张表不可读取']]:[['success','连接成功'],['failed','连接失败']])}</div></details></section>`;};
  return frame(d.isNew?'新增系统连接':`编辑系统连接 · ${esc(v.name)}`,'一个系统可同时使用多种连接；全部配置验证通过后保存。',`<div class="form-grid">${field('系统名称 *','name',v.name)}${field('系统连接英文代号 *','id',v.id)}${field('负责人','owner',v.owner)}${field('是否启用','active',v.active,'select',['启用','停用'])}${field('超时（毫秒）','timeout',v.timeout,'number')}${field('重试次数','retry',v.retry,'number')}${field('系统用途','desc',v.desc,'textarea',[],null,true)}</div><div class="section-gap"><h3>连接类型（可多选） *</h3><div class="system-connection-types">${systemConnectionTypes.map(([type,label,ic])=>`<label class="system-connection-choice ${v.types.includes(type)?'active':''}"><input type="checkbox" data-system-connection-type="${type}" ${v.types.includes(type)?'checked':''}>${icon(ic)}<b>${label}</b></label>`).join('')}</div></div>${v.types.map(section).join('')}<div class="section-gap">${inf('当前为原型模拟验证，不连接真实数据库、API 或 MCP 服务。配置修改后须重新验证，全部通过后才能保存。')}</div>`,btn('验证全部连接（模拟）','system-verify-all','','refresh')+btn('保存系统连接','save-connector','primary','check',`id="save-system-connection" ${systemConnectionReady(d)?'':'disabled'}`),true);
};
Object.assign(actionsMap,{
  'add-connector':()=>openDrawer('connector',systemConnectionDraft(),{isNew:true,verifications:{}}),
  'edit-connector':el=>{const c=connector(el.dataset.id);if(!c)return toast('系统连接已不存在');openDrawer('connector',systemConnectionDraft(c),{isNew:false,originalId:c.id,verifications:{}});},
  'system-add-table':()=>{const d=state.drawer;d.draft.configs.database.tables.push({name:'',description:''});systemConnectionInvalidate(d);drawOverlay();},
  'system-remove-table':el=>{const d=state.drawer,index=Number(el.dataset.index);if(index<0||index>=d.draft.configs.database.tables.length)return;d.draft.configs.database.tables.splice(index,1);systemConnectionInvalidate(d);drawOverlay();},
  'system-verify-type':el=>systemConnectionVerify(el.dataset.type),
  'system-verify-all':()=>systemConnectionVerify(),
  'save-connector':()=>{
    const d=state.drawer;if(d?.type!=='connector')return;const error=systemConnectionCommonError(d);if(error)return errorDrawer(error);
    if(!systemConnectionReady(d))return errorDrawer('请先验证所有已选连接与数据表，全部通过后再保存。');
    const v=structuredClone(d.draft),primary=v.types.includes('api')?'api':v.types.includes('database')?'database':'mcp',c=v.configs[primary];
    v.kind=primary==='database'?'数据库':primary==='api'?'REST API':'MCP';v.endpoint=primary==='database'?`${c.host}:${c.port}/${c.database}`:c.url;v.auth=c.auth||'';v.enabled=v.active==='启用';v.timeout=Number(v.timeout);v.retry=Number(v.retry);v.configs=Object.fromEntries(v.types.map(type=>[type,v.configs[type]]));v.verifications=structuredClone(d.verifications);v.lastTest='全部已选连接模拟验证通过 · '+now();
    if(d.isNew)systemConnectors.push(v);else systemConnectors[systemConnectors.findIndex(c=>c.id===d.originalId)]=v;
    studio.connector=v.id;studio.connectorTab='connection';changed();Object.values(appScenes).forEach(s=>{s.lastResult=null;});log('系统连接配置',v.name,'成功',`${v.types.map(type=>systemConnectionTypes.find(t=>t[0]===type)[1]).join('、')}；全部模拟验证通过`);closeOverlay(true);render();toast('系统连接已保存');
  },
  'connector-test':el=>{actionsMap['edit-connector'](el);if(state.drawer?.type==='connector')systemConnectionVerify();}
});
function systemConnectionInput(e){
  const d=state.drawer,el=e.target;if(d?.type!=='connector')return;
  if(el.dataset.systemConnectionType){const type=el.dataset.systemConnectionType;d.draft.types=d.draft.types.filter(value=>value!==type);if(el.checked)d.draft.types.push(type);systemConnectionInvalidate(d);drawOverlay();return;}
  if(el.dataset.connectionType){const type=el.dataset.connectionType,key=el.dataset.connectionKey;d.draft.configs[type][key]=el.value;systemConnectionInvalidate(d);if(e.type==='change'&&key==='authentication')drawOverlay();return;}
  if(el.hasAttribute('data-connection-table')){const row=d.draft.configs.database.tables[Number(el.dataset.connectionTable)];if(row)row[el.dataset.tableKey]=el.value;systemConnectionInvalidate(d);return;}
  if(el.dataset.field)systemConnectionInvalidate(d);
}
document.addEventListener('input',systemConnectionInput);
document.addEventListener('change',systemConnectionInput);

const systemConnectionPageBefore=pages.connections;
pages.connections=function(){
  if(!systemConnectors.length)return systemConnectionPageBefore();
  if(!connector())studio.connector=systemConnectors[0].id;
  let html=systemConnectionPageBefore();
  for(const c of systemConnectors){const v=systemConnectionDraft(c),labels=v.types.map(type=>systemConnectionTypes.find(t=>t[0]===type)?.[1]).join(' + ');html=html.replace(`${esc(c.kind)} · ${capabilities.filter(a=>a.connector===c.id).length} 项查询`,`${esc(labels)} · ${capabilities.filter(a=>a.connector===c.id).length} 项查询`);}
  const current=connector(),currentTypes=systemConnectionDraft(current).types.map(type=>systemConnectionTypes.find(t=>t[0]===type)?.[1]).join(' + ');
  html=html.replace(`<span>${icon('db')}${esc(current.kind)}</span>`,`<span>${icon('link')}${esc(currentTypes)}</span>`);
  if(studio.connectorTab!=='connection')return html;
  const c=connector(),v=systemConnectionDraft(c),body=`<div class="panel-body system-connection-summary">${v.types.map(type=>{const config=v.configs[type],label=systemConnectionTypes.find(t=>t[0]===type)[1],result=c.verifications?.[type];return `<section class="system-connection-section"><div class="between"><h3>${label}</h3>${pill(result?.status==='passed'?'模拟验证通过':'待验证',result?.status==='passed'?'green':'amber')}</div><dl class="kv section-gap">${type==='database'?`<dt>数据库</dt><dd>${esc(config.driver)} · ${esc(config.host)}:${esc(config.port)}/${esc(config.database)}</dd><dt>数据表</dt><dd>${config.tables.length?config.tables.map(t=>esc(t.name)).join('、'):'尚未配置'}</dd>`:`<dt>服务地址</dt><dd><code>${esc(config.url)}</code></dd>${type==='mcp'?`<dt>传输方式</dt><dd>${esc(config.transport)}</dd>`:`<dt>检查路径</dt><dd>${esc(config.healthPath)}</dd>`}`}<dt>凭据引用</dt><dd>${esc(config.auth||'无需认证 / 未配置')}</dd></dl>${type==='database'&&result?.tables.length?`<div class="table-wrap section-gap"><table><thead><tr><th>数据表</th><th>验证结果</th></tr></thead><tbody>${result.tables.map(t=>`<tr><td>${esc(t.name)}</td><td>${pill(t.status==='passed'?'模拟可读取':'模拟验证失败',t.status==='passed'?'green':'red')}</td></tr>`).join('')}</tbody></table></div>`:''}</section>`}).join('')}<div class="row section-gap">${btn('编辑配置与验证','edit-connector','','edit',`data-id="${esc(c.id)}"`)}</div><p class="tiny muted section-gap">连通性为本地模拟结果，未发起真实网络请求。</p></div>`;
  const start=html.indexOf('<div class="panel-body"><dl class="kv"><dt>端点 / 服务</dt>');if(start<0)return html;
  return html.slice(0,start)+body+'</section></div>';
};
// 取数能力从所选系统中继续选择具体连接，以及该数据库配置的数据表。
function capabilityConnectionTypes(c){const sys=connector(c.connector);return sys?systemConnectionDraft(sys).types:[];}
function capabilityConnectionTables(c){const sys=connector(c.connector);return sys&&capabilityConnectionTypes(c).includes('database')?systemConnectionDraft(sys).configs.database.tables:[];}
function capabilityConnectionError(c){
  const sys=connector(c.connector);if(!sys)return '请选择有效的系统连接。';
  if(!sys.enabled)return '所选系统连接已停用，请选择启用的系统。';
  if(!systemConnectionTypes.some(t=>t[0]===c.connectionType)||!capabilityConnectionTypes(c).includes(c.connectionType))return '请选择该系统已配置的连接类型。';
  if(c.connectionType==='database'){
    if(c.method!=='数据库查询')return '数据库连接必须使用数据库查询。';
    if(!Array.isArray(c.tables)||!c.tables.length)return '请至少选择一张数据库表。';
    if(new Set(c.tables.map(t=>t.toLowerCase())).size!==c.tables.length)return '所选数据库表不能重复。';
    const available=capabilityConnectionTables(c).map(t=>t.name);
    if(c.tables.some(t=>!available.includes(t)))return '所选表已不在该系统的数据库配置中，请重新选择。';
    for(const map of c.maps){const table=[...available].sort((a,b)=>b.length-a.length).find(t=>(map.source||'').toLowerCase().startsWith(t.toLowerCase()+'.'));if(table&&!c.tables.includes(table))return `来源字段“${map.source}”使用了未选择的表“${table}”，请重新配置。`;}
  }else{
    if(c.connectionType==='api'&&!['GET','POST 查询'].includes(c.method))return 'API 连接请选择 GET 或 POST 查询方式。';
    if(c.connectionType==='mcp'&&c.method!=='MCP')return 'MCP 连接必须使用 MCP 工具调用。';
  }
  return '';
}
const capabilityConnectionEditorBefore=extraDrawers.capability;
extraDrawers.capability=function(){
  const d=state.drawer,c=d.draft;
  if(!Object.hasOwn(c,'connectionType')){
    c.connectionType=d.isNew?'':c.method==='数据库查询'?'database':c.method==='MCP'?'mcp':['GET','POST 查询'].includes(c.method)?'api':'';
    c.tables=d.isNew?[]:Array.isArray(c.tables)?c.tables:c.connectionType==='database'?[c.resource.replace(/[（(].*$/,'').trim()]:[];
    if(d.isNew)c.resource='';
  }
  const types=capabilityConnectionTypes(c),tables=capabilityConnectionTables(c),selected=c.tables||[];
  const typeOptions=systemConnectionTypes.filter(([id])=>types.includes(id)).map(([id,label])=>[id,label]);
  if(c.connectionType&&!types.includes(c.connectionType))typeOptions.push([c.connectionType,'原连接类型已不可用，请重新选择']);
  const selection=field('连接类型 *','connectionType',c.connectionType,'select',[['','请选择连接类型'],...typeOptions],types.length?'只显示该系统已配置的连接类型':'请先在系统连接中配置连接类型');
  const database=`<fieldset class="capability-table-picker wide"><legend>表名（可多选） *</legend><p class="tiny muted">从该系统的数据库配置中选择，已选 ${selected.length} 张表。</p><div class="capability-table-options">${tables.map(t=>`<label class="capability-table-choice"><input type="checkbox" data-capability-table="${esc(t.name)}" ${selected.includes(t.name)?'checked':''}><span><b>${esc(t.name)}</b>${t.description?`<small>${esc(t.description)}</small>`:''}</span></label>`).join('')}${selected.filter(name=>!tables.some(t=>t.name===name)).map(name=>`<label class="capability-table-choice unavailable"><input type="checkbox" data-capability-table="${esc(name)}" checked><span><b>${esc(name)}</b><small>此表已不可用，请取消选择</small></span></label>`).join('')}</div>${!tables.length?'<p class="tiny muted section-gap">该系统未配置数据表，请先在“系统连接”中添加并验证数据表。</p>':''}<p class="tiny muted section-gap">多表字段可填写“表名.字段名”以区分来源；多表查询及关联逻辑仍使用本地样例演示。</p></fieldset>`;
  let source='';
  if(c.connectionType==='database')source+=database;
  else if(c.connectionType==='api')source+=field('API 查询方式 *','method',c.method,'select',[['GET','读取接口（GET）'],['POST 查询','带条件查询接口（POST）']])+field('调用哪个接口 *','resource',c.resource,'text',[],'填写接口路径，例如 /materials/{materialCode}',true);
  else if(c.connectionType==='mcp')source+=field('调用哪个 MCP 工具 *','resource',c.resource,'text',[],'填写所选系统 MCP 服务提供的工具名称，例如 query_material',true);
  let html=capabilityConnectionEditorBefore();
  const method=field('怎样查询','method',c.method,'select',[['GET','读取接口（GET）'],['POST 查询','带条件查询接口（POST）'],['数据库查询','读取数据库表']]);
  const isDatabase=c.method==='数据库查询',resource=field(isDatabase?'从哪张表查询 *':'调用哪个接口 *','resource',c.resource,'text',[],isDatabase?'填写来源表名，例如 PIS_MATERIAL；原型使用样例数据':'填写接口地址，例如 /materials/{materialCode}；原型使用样例数据',true);
  html=html.replace(method+resource,source);
  html=html.replace(field('从哪个系统查询','connector',c.connector,'select',systemConnectors.map(s=>[s.id,s.name])),field('从哪个系统查询 *','connector',c.connector,'select',[['','请选择系统'],...systemConnectors.map(s=>[s.id,s.name+(s.enabled?'':'（已停用）')])])+selection);
  if(d.sourceChanged)html=html.replace('<hr class="divider">',`<div id="capability-source-change-note">${inf('系统或连接类型已切换，请重新填写来源字段及所需取值条件；本体对象属性选择已保留。','amber')}</div><hr class="divider">`);
  return html;
};
const capabilityConnectionValidateBefore=validateAbility;
validateAbility=function(c,isNew){
  const error=capabilityConnectionError(c);if(error)return error;
  if(c.connectionType==='database')c.resource=c.tables.join(', ');else c.tables=[];
  return capabilityConnectionValidateBefore(c,isNew);
};
document.addEventListener('input',e=>{const d=state.drawer,el=e.target;if(d?.type!=='capability'||!el.hasAttribute('data-cap-map')||el.dataset.key!=='source')return;if(d.draft.maps.every(map=>map.source.trim())){d.sourceChanged=false;const note=document.getElementById('capability-source-change-note');if(note)note.hidden=true;}});
document.addEventListener('change',e=>{
  const d=state.drawer,el=e.target;if(d?.type!=='capability')return;const c=d.draft;
  if(el.dataset.field==='connector'||el.dataset.field==='connectionType'){
    if(el.dataset.field==='connector')c.connectionType='';
    c.tables=[];c.resource='';c.method=c.connectionType==='database'?'数据库查询':c.connectionType==='mcp'?'MCP':'GET';
    c.maps.forEach(map=>{map.source='';delete map.conditionField;delete map.conditionValue;delete map.conditionOperator;});d.sourceChanged=true;d.dirty=true;d.tested=false;drawOverlay();return;
  }
  if(el.dataset.capabilityTable){const name=el.dataset.capabilityTable;c.tables=c.tables.filter(value=>value!==name);if(el.checked)c.tables.push(name);c.resource=c.tables.join(', ');d.dirty=true;d.tested=false;drawOverlay();}
});
const capabilityConnectionCallBefore=callCapability;
callCapability=function(id,params={},failure='正常',fixture,sampleResponse){
  const c=ability(id);if(c?.connectionType){const error=capabilityConnectionError(c);if(error)return {ok:false,capability:id,connector:c.connector,params:structuredClone(params),error,at:now()};}
  let result;
  if(sampleResponse!==undefined&&c){
    const base={capability:id,connector:c.connector,params:structuredClone(params),revision:c.revision,at:now(),sampleResponse:true};
    const required=c.params.find(([key,,req])=>req==='是'&&(params[key]===undefined||params[key]===null||String(params[key]).trim()===''));
    if(!connector(c.connector)?.enabled)result={...base,ok:false,error:'系统连接不存在或已停用，无法测试取数。'};
    else if(required)result={...base,ok:false,error:`缺少必需参数：${required[1]}（${required[0]}）`};
    else if(failure==='超时')result={...base,ok:false,error:'模拟接口超时，未能取得数据'};
    else{const raw=failure==='空结果'?{items:[]}:structuredClone(sampleResponse);result={...base,raw,...normalizeCapabilityOutput(c,raw)};}
  }else result=capabilityConnectionCallBefore(id,params,failure,fixture);
  return c?.connectionType?{...result,connectionType:c.connectionType,tables:c.connectionType==='database'?[...c.tables]:[]}:result;
};
render();
