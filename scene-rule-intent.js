/* 本地规则意图解析。只读场景锁定已发布版本的有效表单映射与登记契约；不调用接口、不保存、不启用。
 * references[].id 是条件 / 断言 / 查询参数的外键。path 是真实属性，source 是 order.key / row.key。
 * path 为空时必须人工选 candidates；unsupported / blockingClarifications 禁止保存。
 * clarifications 是预填时的提示；来源、类型、范围可人工补齐，再交运行时复验。
 * 模板只是解析插件，generic 不依赖 Person、Material 或任何固定业务对象。
 */
'use strict';
function sceneRuleIntentAnalyze(s,text){
  const result={text:String(text??'').trim(),intent:'',objects:[],references:[],conditions:[],assertions:[],queries:[],scope:'',scopeCandidates:[],clarifications:[],unsupported:[],blockingClarifications:[],logic:'and',unknown:'block'};
  if(!result.text)return result;
  const completeChainExample='提交前逐条校验物料行：如果申请人为后端业务部人员，使用主单申请人编号 order.applicantCode（映射 Person.personCode），通过人员查询接口 demo.personDepartment 获取 Person.department，并判断 Person.department 等于后端业务部。使用当前物料行 row.materialCode 映射的 Material.materialCode，作为参数 materialCode 调用校验接口 demo.minimumByMaterial；返回路径 minimumSystem.status，返回类型为文本，判断 minimumSystem.status=已发布（eq），已发布才允许提交，未发布拦截提交。返回空值、接口超时、人员身份不一致或未知状态均按未知阻断；生成后默认停用，必须人工确认并保存。';
  const locked=typeof sceneMappingObjects==='function'?sceneMappingObjects(s):[];
  const blocks=Object.values(s?.workflow?.blocks||{}),main=blocks.find(b=>!b.parent);
  const caps=typeof capabilities!=='undefined'?capabilities:[];
  const norm=x=>String(x??'').replace(/\s+/g,'').toLowerCase();
  const clean=x=>String(x??'').trim().replace(/^(?:必须|应当|应该|需要|应)\s*/,'').trim();
  const issue=message=>{if(!result.clarifications.includes(message))result.clarifications.push(message);};
  const unsupported=clause=>{clause=originalClause(clause);if(!result.unsupported.includes(clause))result.unsupported.push(clause);issue('未完整支持条款：'+clause+'；请明确或人工配置，不能丢弃。');};
  // 不以全局 latest 或工作副本版本补足场景锁定。
  const version=o=>Object.hasOwn(s?.ontologyVersions||{},o.id)?s.ontologyVersions[o.id]:null;
  const available=c=>!!c&&c.enabled!==false&&(typeof connector!=='function'||!!connector(c.connector)?.enabled);
  const origin=b=>b.parent?'row':'order';
  const prefix=b=>typeof scenePrefix==='function'?scenePrefix(s,b.id):`${b.path}${b.many?'[]':''}.`;
  const properties=[],unmapped=[];
  for(const o of locked)for(const p of o.props||[]){
    const path=o.id+'.'+p.id,sources=[];
    const released=version(o)&&typeof objectReleaseVersion==='function'&&objectReleaseVersion(o.id,version(o));
    if(released)for(const b of blocks)for(const f of b.fields||[]){
      const bindings=(s.bindings?.[b.id]||[]).filter(m=>m.target===prefix(b)+f.key);
      if((!f.mappingMode||f.mappingMode==='mapping')&&normType(f.type)===normType(p.type)&&bindings.length===1&&bindings[0].ontology===path)sources.push({source:origin(b)+'.'+f.key,block:b.id,type:f.type});
    }
    // 对象名与属性名中文前后缀重叠时合并：整机物料 + 物料编码 → 整机物料编码。
    const join=(left,right)=>{
      for(let n=Math.min(left.length,right.length);n>0;n--)if(left.slice(-n)===right.slice(0,n))return left+right.slice(n);
      return left+right;
    };
    const qualified=[o.id,o.name].filter(Boolean).flatMap(oid=>[p.id,p.name].filter(Boolean).flatMap(pid=>[oid+'.'+pid,oid+pid,oid+'的'+pid,join(oid,pid)]));
    const property={path,name:p.name,object:o.id,property:p.id,type:p.type,kind:'ontology-property',version:version(o),sources,qualified,aliases:[path,p.id,p.name,...qualified]};
    // 未映射定义只用于“先映射”的提示，绝不进入候选、预填或能力推荐。
    (sources.length?properties:unmapped).push(property);
  }
  for(const b of blocks)for(const f of b.fields||[]){
    const source=origin(b)+'.'+f.key,bindings=(s.bindings?.[b.id]||[]).filter(m=>m.target===prefix(b)+f.key),mapped=properties.filter(p=>bindings.some(m=>m.ontology===p.path));
    // 表列别名可用于匹配，但只有真实 binding 可证明本体引用。
    const aliases=[f.key,f.label,f.sinkColumn,source,b.table&&f.sinkColumn?b.table+'.'+f.sinkColumn:'',b.label+f.label].filter(Boolean);
    if(mapped.length){for(const p of mapped)p.aliases.push(...aliases);}
    // 未映射或无效映射的表单字段仅保留识别别名，不得作为可保存引用回退。
    else unmapped.push({path:source,name:f.label,aliases,qualified:[]});
  }
  const contexts=[];
  for(const c of caps.filter(c=>c.object==='Context'))for(const m of c.maps||[]){
    if(!m.target?.startsWith('Context.'))continue;
    const names=[m.name,m.label,m.description,m.source,m.target,m.target.slice(8),m.target.split('.').at(-1)].filter(Boolean);
    contexts.push({path:m.target,name:m.name||m.label||m.description||m.target,object:'',property:m.target.slice(8),type:m.sourceType||m.type||'',kind:'business-context',capability:c.id,map:m,sources:[],aliases:names,qualified:[m.target,c.name+'.'+(m.label||m.description||m.source),c.id+'.'+m.source]});
  }
  const catalog=[...properties,...contexts];
  let explicitCapability='',lastOperand={condition:'',assertion:''};
  const candidate=p=>({path:p.path,name:p.name,object:p.object,property:p.property,type:p.type,kind:p.kind,...(p.version?{version:p.version}:{}),...(p.source?{source:p.source}:{}),...(p.capability?{capability:p.capability}:{}),sources:(p.sources||[]).map(x=>({...x}))});
  function matches(mention){
    const n=norm(clean(mention)),qualified=catalog.filter(p=>p.qualified?.some(a=>norm(a)===n));
    // 原文明确带对象名称时优先对象限定匹配，不让另一对象的同名属性抢占。
    const options=qualified.length?qualified:catalog.filter(p=>p.aliases.some(a=>norm(a)===n));
    const named=explicitCapability?options.filter(p=>p.capability===explicitCapability||p.kind!=='business-context'):options;
    const exact=named;
    return {exact:[...new Map(exact.map(p=>[p.path+'|'+(p.source||'')+'|'+(p.capability||''),p])).values()],near:catalog.filter(p=>n.length>=3&&p.aliases.some(a=>norm(a).length>=3&&(norm(a).includes(n)||n.includes(norm(a)))))};
  }
  function add(mention,role,forced){
    const m=forced?{exact:[forced],near:[]}:matches(mention),selected=m.exact.length===1?m.exact[0]:null;
    const ref={id:'ref-'+(result.references.length+1),mention:clean(mention),path:selected?.path||'',object:selected?.object||'',property:selected?.property||'',name:selected?.name||clean(mention),type:selected?.type||'',kind:selected?.kind||'ontology-property',role,candidates:(m.exact.length?m.exact:m.near).map(candidate),reason:selected?'精确匹配已发布属性 / 已登记业务字段':m.exact.length?'多个精确候选，需人工选择':'未匹配到明确的已发布属性，需人工确认',confirmed:false};
    if(selected?.version)ref.version=selected.version;
    if(selected?.sources?.length)ref.sources=selected.sources.map(x=>({...x}));
    if(selected?.source)ref.source=selected.source;
    if(selected?.capability)ref.capability=selected.capability;
    result.references.push(ref);
    if(selected?.kind==='business-context'){
      const c=caps.find(c=>c.id===selected.capability);
      if(!selected.type)issue(`接口 ${c.id} 的返回类型尚未登记，请人工确认。`);
      query(ref,c,selected.map);
    }
    if(!selected){
      issue(`“${ref.mention}”${m.exact.length?'有多个候选属性':'没有当前场景有效映射的已发布属性'}，请人工选择。`);
      if(!m.exact.length)issue(`“${ref.mention}”请先到对象与表单映射建立对应关系，并确认字段类型及场景锁定版本。`);
    }
    if(!selected&&m.exact.some(p=>p.kind==='business-context')){
      ref.kind='business-context';pendingQuery(ref,m.exact.map(p=>caps.find(c=>c.id===p.capability)).filter(Boolean));
    }
    if(selected?.object){const o=locked.find(o=>o.id===selected.object);if(o&&!result.objects.some(x=>x.id===o.id))result.objects.push({id:o.id,name:o.name,version:version(o)});}
    return ref;
  }
  function contextReference(path,name,type,role,c){
    const ref={id:'ref-'+(result.references.length+1),mention:name,path,object:'',property:path.replace(/^Context\./,''),name,type,kind:'business-context',role,capability:c.id,candidates:[{path,name,object:'',type,kind:'business-context',capability:c.id}],reason:'登记的业务接口返回字段（非全局本体）',confirmed:false};
    result.references.push(ref);return ref;
  }
  function paramProperty(c,key,definition){
    const target=Array.isArray(definition)?definition.target||definition[3]?.target||(typeof definition[3]==='string'?definition[3]:''):definition?.target;
    if(target)return properties.find(p=>p.path===target)||null;
    const property=Array.isArray(definition)?definition.property||definition[3]?.property:definition?.property;
    if(property){
      if(typeof property!=='string')return null;
      const matches=properties.filter(p=>property.includes('.')?p.path===property:norm(p.property)===norm(property));
      return matches.length===1?matches[0]:null;
    }
    const direct=properties.filter(p=>p.object===c.object&&norm(p.property)===norm(key));
    if(direct.length===1)return direct[0];
    const global=properties.filter(p=>norm(p.property)===norm(key)&&p.sources.length);
    if(global.length===1)return global[0];
    return null;
  }
  function query(ref,c,map,paramsOverride,decisionContract){
    ref.capability=c.id;
    if(!available(c))issue(`查询 ${c.id} 或系统连接不可调用。`);
    const params=(c.params||[]).map(p=>{
      const key=Array.isArray(p)?p[0]:p.name,explicit=paramsOverride?.[key];
      const prop=paramProperty(c,key,p);
      let paramRef;
      if(explicit){
        const fs=catalog.filter(p=>p.sources?.some(x=>x.source===explicit));
        if(fs.length===1)paramRef=add(explicit,'parameter',fs[0]);
        else if(explicit==='material.modelCode'){
          const model=properties.find(p=>p.path==='Material.modelCode');
          if(model&&model.sources.length===1)paramRef=add(model.path,'parameter',model);
          else issue(`查询参数 ${key} 的产品型号来源尚未唯一绑定。`);
        }else issue(`查询参数 ${key} 的来源 ${explicit} 未唯一登记。`);
      }else if(prop)paramRef=add(prop.path,'parameter',prop);
      const sources=paramRef?.sources||[];
      const source=explicit&&sources.some(x=>x.source===explicit)?explicit:sources.length===1?sources[0].source:'';
      if(source)paramRef.source=source;
      if(!source)issue(`请确认查询 ${c.id} 参数 ${key} 的唯一表单来源。`);
      return {name:key,source,...(paramRef?{reference:paramRef.id}:{} )};
    });
    const q={id:'query-'+(result.queries.length+1),capability:c.id,name:c.name,params,output:decisionContract?'validationDecision':ref.kind==='ontology-property'?ref.property:map.target.replace(/^Context\./,''),type:ref.type};
    if(decisionContract)Object.assign(q,{resultMode:'decision',passValue:decisionContract.passValue,failValue:decisionContract.failValue});
    ref.query=q.id;ref.output=q.output;
    result.queries.push(q);return q;
  }
  function pendingQuery(ref,choices){
    const q={id:'query-'+(result.queries.length+1),capability:'',name:'请选择已登记接口',params:[],output:ref.kind==='ontology-property'?ref.property:ref.path.replace(/^Context\./,''),type:ref.type,candidates:[...new Set(choices.map(c=>c.id))].map(id=>({id,name:caps.find(c=>c.id===id)?.name}))};
    ref.query=q.id;ref.output=q.output;result.queries.push(q);
  }
  function wire(){
    // 本体引用只读取有效 binding，不用全局能力覆盖或补足未映射属性。
    const rowSets=result.references.filter(r=>r.sources?.some(x=>blocks.find(b=>b.id===x.block)?.parent)).map(r=>new Set(r.sources.filter(x=>blocks.find(b=>b.id===x.block)?.parent).map(x=>x.block)));
    let choices=[];
    if(rowSets.length)choices=blocks.filter(b=>b.parent&&rowSets.every(set=>set.has(b.id)));
    else if(main)choices=[main];
    result.scopeCandidates=choices.map(b=>({id:b.id,label:b.label}));
    if(choices.length===1)result.scope=choices[0].id;
    else issue(choices.length?'多个可执行区块，请人工选择范围。':'无法确定共同执行区块，请人工确认范围。');
    for(const ref of result.references){
      if(!ref.sources?.length)continue;
      const valid=ref.sources.filter(x=>!blocks.find(b=>b.id===x.block)?.parent||x.block===result.scope);
      if(valid.length===1)ref.source=valid[0].source;
      else {
        delete ref.source;
        const duplicate=ref.sources.some(x=>ref.sources.filter(y=>y.block===x.block).length>1);
        issue(duplicate?`属性 ${ref.path} 在同一执行区块映射了多个字段，请先到对象与表单映射统一映射，不能任意选择来源。`:`属性 ${ref.path} 的表单来源不唯一，请确认执行范围。`);
      }
    }
    for(const q of result.queries)for(const p of q.params){const r=result.references.find(r=>r.id===p.reference);if(r)p.source=r.source||'';}
    return result;
  }
  function normType(t){return ({枚举:'文本',引用:'文本',string:'文本',text:'文本',number:'数字',integer:'数字',boolean:'布尔',bool:'布尔',date:'日期',array:'集合'})[t]||t;}
  // 先把明确正则 RHS 当成原始数据保护，再做条件句 / AND / OR / 模板解析。
  // 正则写为一个原始 token；含空格的字符组和反斜杠转义仍完整保留。
  // 语句边界在字符组、量词、分组外识别，非法或未支持语法也保留给统一门禁。
  const regexPatterns=new Map();
  function protectRegex(text){
    const marker=/(?:不匹配|匹配)\s*正则(?:表达式)?\s*/g;let match,start=0,protectedText='';
    while((match=marker.exec(text))){
      // 普通比较的引号值可能含“匹配正则”，不能改变旧文本常量。
      let quote='';for(let i=start;i<match.index;i++){const ch=text[i];if(ch==='\\'){i++;continue;}if(quote){if(ch===quote||quote==='“'&&ch==='”')quote='';}else if(['"',"'",'“'].includes(ch))quote=ch;}
      if(quote)continue;
      const from=marker.lastIndex;let end=from,inClass=false,brace=0,group=0;
      for(;end<text.length;end++){
        const ch=text[end];if(ch==='\\'){end++;continue;}
        if(inClass){if(ch===']')inClass=false;continue;}
        if(ch==='['){inClass=true;continue;}
        if(ch==='{'){brace++;continue;}if(ch==='}'&&brace){brace--;continue;}
        if(ch==='('){group++;continue;}if(ch===')'&&group){group--;continue;}
        if(brace||group)continue;
        const tail=text.slice(end);
        if(/^[\s，,；;。\n]/.test(tail)||/^(?:时|则|那么)[，,:：]/.test(tail))break;
        const conjunction=tail.match(/^(?:并且|而且|以及|并|且|和|或)/);
        if(conjunction&&/(?:匹配\s*正则|不能为空|等于|大于|小于|必须|不得|需要|非空|存在|允许|忽略)/.test(tail.slice(conjunction[0].length)))break;
      }
      const key='\uE000REGEX'+regexPatterns.size+'\uE001';regexPatterns.set(key,text.slice(from,end));
      protectedText+=text.slice(start,from)+key;start=end;marker.lastIndex=end;
    }
    return protectedText+text.slice(start);
  }
  const parsingText=protectRegex(result.text);
  const originalClause=text=>String(text).replace(/\uE000REGEX\d+\uE001/g,key=>regexPatterns.get(key)??key);
  function splitAnd(text){
    // 引号内的 AND / 或是文本值，不属于逻辑。存在且非空是一个操作。
    const chunks=[];let start=0,quote='',depth=0;
    const marker='\u0001',value=text.replace(/存在(?:且|并)非空/g,'存在'+marker+'非空');
    for(let i=0;i<value.length;i++){
      const ch=value[i];
      if(quote){if(ch===quote||quote==='“'&&ch==='”')quote='';continue;}
      if(['"',"'",'“'].includes(ch)){quote=ch;continue;}
      if(['[','【','('].includes(ch)){depth++;continue;}
      if([']','】',')'].includes(ch)){depth--;continue;}
      if(depth)continue;
      const m=value.slice(i).match(/^(?:并且|而且|并|且|以及|和|、|[，,；;。\n]|\bAND\b)/i);
      if(m){chunks.push(value.slice(start,i).replaceAll(marker,'且'));i+=m[0].length-1;start=i+1;}
    }
    chunks.push(value.slice(start).replaceAll(marker,'且'));
    if(quote||depth)unsupported(text+'（引号或集合括号未闭合）');
    return chunks.map(x=>x.trim()).filter(Boolean);
  }
  function typedLiteral(raw,ref,clauseText){
    const value=String(raw).trim().replace(/^(?:"|“|')|(?:"|”|')$/g,'');
    const type=normType(ref.type);
    if(type==='数字'&&(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)||!Number.isFinite(Number(value))||Math.abs(Number(value))>Number.MAX_SAFE_INTEGER))issue(`属性 ${ref.path} 的比较值不是安全数字：${clauseText}`);
    if(type==='日期'){
      const d=new Date(value+'T00:00:00Z');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)issue(`属性 ${ref.path} 需要有效 ISO 日期 YYYY-MM-DD：${clauseText}`);
    }
    if(type==='布尔'){
      const bool={true:'true',false:'false','是':'true','否':'false','真':'true','假':'false'}[value.toLowerCase()];
      if(bool===undefined)issue(`属性 ${ref.path} 需要明确布尔值：${clauseText}`);
      else return bool;
    }
    return value;
  }
  function clause(raw,role){
    let value=clean(raw).replace(/[。！!]$/,'').trim();
    if(/^(?:不能超过|不得超过|不超过|不能小于|不得小于|不小于|必须|大于|小于|等于)/.test(value)&&lastOperand[role])value=lastOperand[role]+value;
    if(/^(?:调用|通过|使用)/.test(value)){
      const hit=caps.filter(c=>[c.id,c.name].filter(Boolean).some(name=>norm(value).startsWith(norm('调用'+name))||norm(value).startsWith(norm('通过'+name))||norm(value).startsWith(norm('使用'+name))));
      if(hit.length!==1){unsupported(raw);return;}
      const c=hit[0],name=[c.id,c.name].filter(Boolean).find(name=>norm(value).includes(norm(name)));
      explicitCapability=c.id;
      value=value.slice(value.indexOf(name)+name.length).replace(/^\s*(?:接口)?\s*[，,]?\s*(?:检查|返回|获取|校验)?\s*/,'');
      if(!value)return; // 明确的查询声明，下一完整条款必须实际引用它。
    }else value=value.replace(/^(?:返回|检查|校验)\s*/,'');
    // 正则先于通用比较识别，RHS 不参与字段匹配、字面量转型或算术 / OR 检查。
    const regex=value.match(/^(.+?)\s*(?:必须|应当|应该|需要|应)?\s*(不匹配|匹配)\s*正则(?:表达式)?\s*([\s\S]*)$/);
    if(regex&&regexPatterns.has(regex[3])){
      const mention=regex[1].replace(/(?:必须|应当|应该|需要|应)$/,'').trim(),ref=add(mention,role),pattern=originalClause(regex[3]);
      const comparison={reference:ref.id,op:regex[2]==='不匹配'?'notMatches':'matches',value:pattern,flags:''};
      lastOperand[role]=mention;
      const error=typeof sceneRuleCardRegexIssue==='function'?sceneRuleCardRegexIssue(pattern):'正则安全校验运行时未加载，不可保存。';
      if(error){issue(error);unsupported(originalClause(raw));}
      if(ref.type&&normType(ref.type)!=='文本'){issue(`属性 ${ref.path} 不是文本兼容字段，不能使用正则校验。`);unsupported(originalClause(raw));}
      if(!ref.path&&!matches(mention).exact.length)unsupported(originalClause(raw));
      (role==='condition'?result.conditions:result.assertions).push(comparison);return;
    }
    // 先用动态完整属性别名定位左操作数，避免「是否可用」中的「是」被当成操作。
    const operatorSource='不能超过|不得超过|不超过|不能小于|大于等于|小于等于|不大于|不得大于|不小于|不得小于|至少为|至多为|不等于|不得等于|等于|大于|超过|小于|少于|>=|<=|!==|!=|===|==|>|<|=|≥|≤|≠|不属于|属于|不包含|包含|不存在|不能为空|不得为空|不允许为空|不为空|为空|存在且非空|存在并非空|非空|存在|notExists\\b|exists\\b|notIn\\b|in\\b|between\\b|contains\\b|starts?With\\b|ends?With\\b|在|以|为|是';
    const prefixes=[...catalog,...unmapped].flatMap(p=>p.aliases).filter(Boolean).sort((a,b)=>b.length-a.length);
    let match;
    for(const alias of prefixes){
      if(norm(value.slice(0,alias.length))!==norm(alias))continue;
      const tail=value.slice(alias.length).match(new RegExp('^\\s*(?:必须|应当|应该|需要|应)?\\s*('+operatorSource+')\\s*(.*?)$','i'));
      if(tail){match=[value,alias,tail[1],tail[2]];break;}
    }
    if(!match)match=value.match(new RegExp('^(.+?)\\s*(?:必须|应当|应该|需要|应)?\\s*('+operatorSource+')\\s*(.*?)$','i'));
    if(!match){unsupported(raw);return;}
    const mention=match[1].replace(/(?:必须|应当|应该|需要|应)$/,'').trim(),token=match[2],rhs=match[3].trim();
    lastOperand[role]=mention;
    const operators={'不能超过':'lte','不得超过':'lte','不超过':'lte','不能小于':'gte','大于等于':'gte','小于等于':'lte','不大于':'lte','不得大于':'lte','不小于':'gte','不得小于':'gte','至少为':'gte','至多为':'lte','不等于':'ne','不得等于':'ne','等于':'eq','大于':'gt','超过':'gt','小于':'lt','少于':'lt','>=':'gte','<=':'lte','!=':'ne','!==':'ne','===':'eq','==':'eq','>':'gt','<':'lt','=':'eq','≥':'gte','≤':'lte','≠':'ne','为':'eq','是':'eq'};
    let op=operators[token];
    if(op==='ne')op='neq';
    if(!op)op={'属于':'in','不属于':'notIn','在':'between','以':'stringBoundary','包含':'contains','不包含':'notContains','不存在':'notExists','为空':'notExists',notexists:'notExists',exists:'exists',notin:'notIn',in:'in',between:'between',contains:'contains',startswith:'startsWith',startwith:'startsWith',endswith:'endsWith',endwith:'endsWith'}[token.toLowerCase()]||'exists';
    let operand=rhs;
    if(op==='stringBoundary'){
      const boundary=rhs.match(/^(.+?)(开头|结尾)$/);
      if(!boundary){unsupported(raw);return;}
      op=boundary[2]==='开头'?'startsWith':'endsWith';operand=boundary[1];
    }
    const ref=add(mention,role),comparison={reference:ref.id,op,value:''};
    // 歧义可通过选path收敛；真正未知条款留在 unsupported 中防止丢弃。
    if(!ref.path&&!matches(mention).exact.length)unsupported(raw);
    if(['exists','notExists'].includes(op)){if(rhs){unsupported(raw);return;}}
    else if(['in','notIn','between'].includes(op)){
      let values;
      if(op==='between'){
        const range=rhs.match(/^(.+?)\s*(?:到|至|~|～)\s*(.+?)(?:之间)?$/);
        if(range)values=[range[1],range[2]];
        else if(rhs.startsWith('[')&&rhs.endsWith(']'))values=rhs.slice(1,-1).split(/[,，]/);
      }else if(['[','【','('].includes(rhs[0])&&[']','】',')'].includes(rhs.at(-1)))values=rhs.slice(1,-1).split(/[,，、]/);
      if(!values?.length||values.some(v=>!v.trim())||op==='between'&&values.length!==2){unsupported(raw);return;}
      comparison.value=values.map(v=>{
        const parsed=typedLiteral(v,ref,raw);
        if(normType(ref.type)==='数字'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(parsed)&&Math.abs(Number(parsed))<=Number.MAX_SAFE_INTEGER)return Number(parsed);
        if(normType(ref.type)==='布尔'&&['true','false'].includes(parsed))return parsed==='true';
        return parsed;
      });
      if(op==='between'){
        if(!['数字','日期'].includes(normType(ref.type)))issue(`属性 ${ref.path} 的范围比较要求数字或日期类型。`);
        if(comparison.value[0]>comparison.value[1]&&normType(ref.type)==='日期'||normType(ref.type)==='数字'&&Number(comparison.value[0])>Number(comparison.value[1]))issue(`范围下限不能大于上限：${raw}`);
      }
    }
    else {
      const quoted=/^(?:"[\s\S]*"|'[\s\S]*'|“[\s\S]*”)$/.test(operand),literal=quoted?operand.slice(1,-1):operand;
      const matched=quoted?[]:matches(operand).exact;
      const unmappedOperand=!quoted&&unmapped.some(p=>p.aliases.some(a=>norm(a)===norm(operand)));
      if(matched.length||unmappedOperand){
        const right=add(rhs,role);comparison.valueReference=right.id;
        if(unmappedOperand)unsupported(raw);
        if(ref.type&&right.type&&normType(ref.type)!==normType(right.type))issue(`比较属性 ${ref.path} 与 ${right.path} 类型不一致。`);
      }else {
        comparison.value=typedLiteral(operand,ref,raw);
        if(!literal||/正常|符合要求|资料完整/.test(literal)){issue(`“${raw}”需要明确比较值与标准。`);unsupported(raw);}
        if(normType(ref.type)==='数字'){
          if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(literal)||!Number.isFinite(Number(literal))||Math.abs(Number(literal))>Number.MAX_SAFE_INTEGER){issue(`属性 ${ref.path} 需要可安全表示的明确数字，不能使用算式或科学计数。`);unsupported(raw);}
        }else if(normType(ref.type)==='布尔'){
          const bool={true:'true',false:'false','是':'true','否':'false','真':'true','假':'false'}[literal.toLowerCase()];
          if(bool===undefined){issue(`属性 ${ref.path} 需要明确布尔值。`);unsupported(raw);}else comparison.value=bool;
        }else if(!quoted&&/[+*/]|\b(?:OR|AND)\b|或|另外|还需要|必须|不得|但|忽略|跳过|允许例外/.test(literal)){unsupported(raw);}
      }
      if(['gt','gte','lt','lte'].includes(op)&&ref.type&&!['数字','日期'].includes(normType(ref.type)))issue(`属性 ${ref.path} 不是数字或日期，不能使用大小比较。`);
      if(['contains','notContains','startsWith','endsWith'].includes(op)&&ref.type&&normType(ref.type)!=='文本')issue(`属性 ${ref.path} 不是文本，不能使用文本匹配。`);
    }
    (role==='condition'?result.conditions:result.assertions).push(comparison);
  }
  // 只有锚定整个输入的旧模板才能作为插件；前缀匹配不得吞掉额外条款。
  function legacyPlugin(){
    if(typeof workflowRuleAuthoringParse!=='function')return false;
    const parsed=workflowRuleAuthoringParse(result.text);
    if(!['safety-di','catalog-documents'].includes(parsed?.template))return false;
    result.template=parsed.template;result.intent=parsed.name;
    for(const c of parsed.clarifications||[])issue(c);
    if(parsed.template==='safety-di')for(const a of parsed.assertions||[]){
      if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(a.value))||!Number.isFinite(Number(a.value))||Number(a.value)>Number.MAX_SAFE_INTEGER)unsupported('安全 DI 阈值不是可安全表示的非负数字：'+a.value);
    }
    if(parsed.template==='catalog-documents'&&new Set((parsed.assertions||[]).map(a=>a.fact)).size!==parsed.assertions.length)unsupported('商品目录检查包含重复资料条款，请明确后重新解析。');
    const expected=parsed.template==='safety-di'?blocks.filter(b=>!b.parent):blocks.filter(b=>b.fields?.some(f=>f.key==='materialCode'));
    if(expected.length!==1)issue('模板存在多个或没有适用区块，请人工确认范围。');
    const b=expected.length===1?expected[0]:null;
    for(const [role,list] of [['condition',parsed.conditions||[]],['assertion',parsed.assertions||[]]])for(const a of list){
      const property=properties.find(p=>p.path===a.fact);
      let ref;
      if(property){
        ref=add(a.fact,role,property);
      }else {
        const fact=b&&typeof ruleFacts==='function'?ruleFacts(s,{scope:b.id}).find(f=>f.id===a.fact):null;
        const c=caps.find(c=>c.id===fact?.capability),map=c?.maps.find(m=>m.target==='Context.'+fact.output);
        if(c&&map){ref=contextReference(map.target,fact.name,fact.type,role,c);query(ref,c,map,parsed.params);}
        else {ref=add(a.fact,role);issue(`模板引用 ${a.fact} 的登记接口返回不可用。`);}
      }
      result[role==='condition'?'conditions':'assertions'].push({reference:ref.id,op:a.op,value:a.value});
    }
    wire();
    if(b){result.scope=b.id;result.scopeCandidates=expected.map(b=>({id:b.id,label:b.label}));}
    result.legacyInput={originalText:result.text,objectId:b?.object||'',scope:result.scope};
    return true;
  }
  function chainPlugin(){
    if(!/最小系统|demo\.minimumByMaterial/.test(result.text))return false;
    result.template='applicant-material-chain';result.intent='按申请人部门条件，使用业务物料代码查询最小系统发布状态；未发布或未知时拦截提交';
    const person=properties.find(p=>p.path==='Person.department'),material=properties.find(p=>p.path==='Material.materialCode');
    const people=caps.filter(c=>available(c)&&c.object==='Person'&&c.maps?.some(m=>m.target===person?.path)&&c.params?.length===1&&c.params[0][0]==='personCode');
    const validations=caps.filter(c=>available(c)&&c.params?.length===1&&c.params[0][0]==='materialCode'&&c.maps?.some(m=>m.target==='Context.minimumSystem.status'));
    const selected=choices=>{const explicit=choices.filter(c=>result.text.includes(c.id));return explicit.length===1?explicit[0]:choices.length===1?choices[0]:null;};
    const pcap=selected(people),vcap=selected(validations),department=add('申请人所属部门','condition',person),code=add('业务物料代码','parameter',material);
    result.conditions.push({reference:department.id,op:'eq',value:/后端业务部|后端/.test(result.text)?'后端业务部':''});
    // 条件属性必须已经映射到场景表单，不自动转为人员接口查询。
    if(!person)issue('Person.department 请先到对象与表单映射建立对应关系。');
    if(!material)issue('Material.materialCode 请先到对象与表单映射建立对应关系。');
    let status,map;
    if(vcap){map=vcap.maps.find(m=>m.target==='Context.minimumSystem.status');status=contextReference(map.target,'最小系统发布状态',map.sourceType||'','assertion',vcap);query(status,vcap,map);}
    else {issue('请确认按物料代码查询的已登记最小系统校验接口。');status=add('最小系统发布状态','assertion');}
    // “已发布 / 未发布” 必须来自此 map 的明确枚举语义，不能根据界面词语推测 true/1。
    const desc=String(map?.description||''),enumerated=/^\s*已发布\s*[/、,，|]\s*未发布\s*$/.test(desc)||/^\s*未发布\s*[/、,，|]\s*已发布\s*$/.test(desc);
    let published=enumerated?'已发布':'',unpublished=enumerated?'未发布':'';
    if(!enumerated)issue('请确认接口 map.description 明确枚举的已发布 / 未发布返回值与类型，不能猜测返回语义。');
    result.assertions.push({reference:status.id,op:'eq',value:published});
    wire();
    const personSource=properties.find(p=>p.path==='Person.personCode')?.sources;
    const personParam={source:personSource?.length===1?personSource[0].source:''};
    const materialParam=result.queries.find(q=>q.capability===vcap?.id)?.params.find(p=>p.name==='materialCode');
    result.legacyInput={originalText:result.text,objectId:material?.object||'',scope:result.scope,chainApplicantProperty:department.path,chainApplicantSource:personParam?.source||'',chainPersonCapability:pcap?.id||'',chainMaterialProperty:code.path,chainMaterialSource:materialParam?.source||code.source||'',chainValidationCapability:vcap?.id||'',chainReturnPath:map?.target.replace(/^Context\./,'')||'',chainReturnType:map?.sourceType||'',chainOperator:'eq',chainPublishedValue:published,chainUnpublishedValue:unpublished};
    // 短句允许预填，但完整的语义覆盖必须在确认后才能编译；不要把模板正则当全文解析。
    const required=[[/申请人/,'请确认条件针对发布单申请人，不是提交部门。'],[/Person\.department|人员.*部门|申请人.*所属部门/,'请确认人员所属部门属性。'],[/Material\.materialCode|物料(?:代码|编码)/,'请确认当前业务物料代码是查询入参。'],[/返回/,'请确认接口返回路径、类型和发布判定。'],[/未发布.*(?:拦截|阻断)|(?:没有发布|没发布).*(?:拦截|阻断)/,'请明确未发布拦截提交。'],[/未知.*阻断|阻断.*未知/,'请确认空值、超时、未知返回均阻断。']];
    const semanticShort=/^当申请人为后端业务部人员时[，,]检查整机物料的最小系统是否发布[，,]未发布拦截提交[。.]?$/.test(result.text);
    if(!semanticShort)for(const [pattern,message] of required)if(!pattern.test(result.text))issue(message);
    if(!result.conditions[0].value)issue('请明确申请人部门条件值。');
    if(!status.type)issue('请明确登记接口的返回类型。');
    // 只有已知完整示例通过全文插件。其他完整描述需逐条确认，未支持尾句保留。
    const exemplar=typeof workflowRuleAuthoringExample==='function'?workflowRuleAuthoringExample():typeof workflowRuleAuthoringExample!=='undefined'?workflowRuleAuthoringExample:'';
    if(result.text!==exemplar&&result.text!==completeChainExample){
      const shortPrefix='当申请人为后端业务部人员时，检查整机物料的最小系统是否发布，未发布拦截提交';
      if(result.text.startsWith(completeChainExample))unsupported(result.text.slice(completeChainExample.length));
      else if(exemplar&&result.text.startsWith(exemplar))unsupported(result.text.slice(exemplar.length));
      else if(!semanticShort&&result.text.startsWith(shortPrefix))unsupported(result.text.slice(shortPrefix.length));
      else if(!semanticShort){
        // 任意非锚定模板只做意图/来源建议，必须全文确认；不以关键词黑名单证明支持。
        const message='此链路仅部分解析，尚未逐条确认全部原文，不可直接保存。';
        issue(message);result.blockingClarifications.push(message);
      }
      if(required.every(([pattern])=>pattern.test(result.text))){
        const message='非完整示例的链路条款需人工确认全文，尚不可直接编译保存。';
        issue(message);result.blockingClarifications.push(message);
      }
    }
    if((result.text===exemplar&&!semanticShort||result.text===completeChainExample)&&typeof sceneRuleChainDraft==='function'){
      const draft=sceneRuleChainDraft(s,result.legacyInput);for(const c of draft.clarifications||[])issue(c);
    }
    return true;
  }
  // 直接判定是独立的受控句式：通过 / 不通过表示登记的 pass / fail 语义，
  // true / false（或数字对）必须与登记值完全一致；绝不把结果文字当本体对象。
  function decisionPlugin(){
    const unquoted=parsingText.replace(/"[^\"]*"|'[^']*'|“[^”]*”/g,'');
    if(!/调用[\s\S]*?接口\s*[，,]\s*(?:返回\s*(?:通过|不通过|true|false|-?\d+(?:\.\d+)?)\s*[\/／]|校验结果\s*为)/i.test(unquoted))return false;
    result.template='validation-decision';result.intent='调用已登记接口校验结果，命中通过值才允许提交；失败或未知阻断';result.trigger='submit';result.level='阻断';result.message='接口校验不通过，拦截提交';
    const block=message=>{issue(message);if(!result.blockingClarifications.includes(message))result.blockingClarifications.push(message);};
    let input=parsingText.replace(/^提交前\s*[，,:：]?\s*/,''),condition='';
    const conditional=input.match(/^(?:当|如果|若)\s*([\s\S]+?)(?:时[，,:：]?|则[，,:：]?|那么[，,:：])\s*([\s\S]+)$/)||input.match(/^if\s+([\s\S]+?)\s+then\s+([\s\S]+)$/i);
    if(conditional){condition=conditional[1];input=conditional[2];}
    // 锚定整个输入；未知尾句、额外断言、反向结果对一律不进入可保存的查询。
    const controlled=input.match(/^调用\s*(.+?)\s*接口\s*[，,]\s*(?:返回\s*(通过\s*\/\s*不通过|true\s*\/\s*false|-?(?:0|[1-9]\d*)(?:\.\d+)?\s*\/\s*-?(?:0|[1-9]\d*)(?:\.\d+)?)|校验结果为通过时允许提交\s*[，,]\s*不通过拦截提交)\s*[。.]?$/);
    if(!controlled){unsupported(result.text);return true;}
    const choices=caps.filter(c=>[c.id,c.name].filter(Boolean).some(name=>norm(name)===norm(controlled[1])));
    if(choices.length!==1){block('直接校验接口不存在或名称不唯一，请明确已登记接口。');return true;}
    const c=choices[0],contract=c.validationResult;
    if(!available(c)){block(`直接校验接口 ${c.id} 或系统连接不可调用。`);return true;}
    const valueValid=value=>contract?.type==='布尔'?typeof value==='boolean':contract?.type==='文本'?typeof value==='string'&&!!value.trim():contract?.type==='数字'?typeof value==='number'&&Number.isFinite(value):false;
    const pathValid=path=>typeof path==='string'&&(path==='$'||/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(path)&&!path.split('.').some(p=>['__proto__','constructor','prototype'].includes(p)));
    if(c.object!=='Context'||!contract||!pathValid(contract.source)||!valueValid(contract.passValue)||!valueValid(contract.failValue)||contract.passValue===contract.failValue){
      block(`接口 ${c.id} 未登记有效的 validationResult 返回路径、标量类型及不同的通过 / 不通过值，不能猜测结果语义。`);return true;
    }
    const pair=controlled[2]?.replace(/\s+/g,'');
    if(pair&&pair!=='通过/不通过'){
      const values=pair==='true/false'?[true,false]:pair.split('/').map(Number);
      if(values[0]!==contract.passValue||values[1]!==contract.failValue){unsupported(result.text);block('原文返回值与登记的通过 / 不通过值不一致，不能转换或猜测。');return true;}
    }
    if(!Array.isArray(c.params)||c.params.some(p=>!p||typeof (Array.isArray(p)?p[0]:p.name)!=='string'||!/^[A-Za-z_]\w*$/.test(Array.isArray(p)?p[0]:p.name))||new Set(c.params.map(p=>Array.isArray(p)?p[0]:p.name)).size!==c.params.length){
      block(`接口 ${c.id} 入参定义未登记、标识无效或重复，请明确后再解析。`);return true;
    }
    if(condition){
      const parts=splitAnd(condition);
      for(const part of parts)clause(part,'condition');
      if(!parts.length||result.conditions.length!==parts.length||result.references.some(r=>r.role==='condition'&&(r.kind!=='ontology-property'||!r.path)))block('前置条件必须唯一匹配当前场景有效映射的本体属性，不能猜测或忽略歧义。');
    }
    const ref=contextReference('Context.validationDecision','接口校验结果',contract.type,'assertion',c);
    query(ref,c,null,null,contract);
    result.assertions.push({reference:ref.id,op:'eq',value:contract.passValue});
    wire();
    if(result.clarifications.length||result.unsupported.length)block('直接校验的条件、入参或执行范围尚未完整且唯一确认，不可保存。');
    return true;
  }
  // OR 不能降级成 AND，所有插件也必须检查，不能仅凭模板前缀放行。
  const withoutQuotes=parsingText.replace(/"[^\"]*"|'[^']*'|“[^”]*”/g,'');
  const logicalText=withoutQuotes.replace('返回空值、接口超时、人员身份不一致或未知状态均按未知阻断','返回未知情况均阻断');
  if(/或|\bOR\b/i.test(logicalText))unsupported('OR / 或：'+result.text);
  if(decisionPlugin())return result;
  if(!regexPatterns.size&&chainPlugin())return result;
  if(!regexPatterns.size&&legacyPlugin())return result;
  result.template='generic';result.intent='逐项检查明确属性比较，全部条件命中后要求全部断言满足；未知数据阻断';
  let condition='',assertion=parsingText.replace(/^提交前[，,:：]?\s*/,'');
  result.trigger='submit';
  const failure=assertion.match(/[，,；;]\s*((?:不满足(?:要求)?|否则|不通过)(?:则|时)?\s*(?:拦截(?:提交)?|阻断(?:提交)?|不允许提交|提醒|警告))(?:[。！!])?$/);
  if(failure){result.message=failure[1];result.level=/提醒|警告/.test(failure[1])?'警告':'阻断';assertion=assertion.slice(0,failure.index);}
  const conditional=assertion.match(/^(?:当|如果|若)\s*([\s\S]+?)(?:时[，,:：]?|(?<!正)则[，,:：]?|那么[，,:：])\s*([\s\S]+)$/)||assertion.match(/^if\s+([\s\S]+?)\s+then\s+([\s\S]+)$/i);
  if(conditional){condition=conditional[1];assertion=conditional[2];}
  else if(/^(?:当|如果|若|if\b)/i.test(result.text))unsupported('条件句缺少明确的时 / 则 / then 边界：'+result.text);
  if(condition)for(const part of splitAnd(condition))clause(part,'condition');
  for(const part of splitAnd(assertion))clause(part,'assertion');
  if(!result.assertions.length)issue('尚无可完整生成的明确断言；请补充属性、运算与比较值。');
  return wire();
}
