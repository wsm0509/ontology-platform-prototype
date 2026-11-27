/* 通用规则卡运行时。仅调用登记能力；规则卡不执行 URL、脚本或自然语言。
 * 在 scene-rule-chain 之后、authoring 之前加载；发布快照 API 在调用时解析。
 * 返回值/比较常量均严格类型，空值除存在性判断外为未知，未知始终阻断。
 */
'use strict';
const sceneRuleCardOperators=new Set(['eq','neq','gt','gte','lt','lte','exists','notExists','in','notIn','between','contains','notContains','startWith','endWith','startsWith','endsWith','matches','notMatches']);
// 离线原型采用保守子集，而非通用 JS 正则执行器；配置与直接比较共用同一门禁。
const sceneRuleCardRegexHelp='正则安全子集：原始 pattern（不加 / /），长度 1–256；支持字面量、字符组、转义、锚点及量词，最多一个可变重复，重复上限 1000；不支持分组、分支、前后查找、反向引用。flags 仅 i/m/u，默认空；待校验文本最多 2048 字符。空值、类型错误、无效或超限正则均按未知阻断。';
function sceneRuleCardRegexIssue(pattern,flags=''){
 if(typeof pattern!=='string'||!pattern.trim())return '正则 pattern 必须是非空原始字符串。';
 if(pattern.length>256)return '正则 pattern 长度不能超过 256 字符。';
 if(typeof flags!=='string'||!/^[imu]*$/.test(flags)||new Set(flags).size!==flags.length)return '正则 flags 仅支持不重复的 i/m/u，默认空字符串。';
 if(/^\/[\s\S]*\/[a-z]*$/i.test(pattern))return '正则请使用原始 pattern，不支持 /pattern/flags 字面量。';
 try{new RegExp(pattern,flags);}catch(error){return '正则表达式无效：'+error.message;}
 let variable=0,width=0,atom=false,inClass=false;
 const unsafe='正则超出安全子集：不支持分组、分支、前后查找、反向引用或多个可变重复。';
 for(let i=0;i<pattern.length;i++){
  const ch=pattern[i];
  if(ch==='\\'){
   const next=pattern[++i];
   if(!next||/[0-9]/.test(next))return unsafe;
   if(next==='x'||next==='u'){
    const length=next==='x'?2:4,hex=pattern.slice(i+1,i+1+length);
    if(hex.length!==length||!/^[\da-f]+$/i.test(hex))return '正则安全子集仅支持 \\xHH / \\uHHHH 转义，不支持 Unicode 属性或代码点转义。';
    i+=length;
   }else if(/[A-Za-z]/.test(next)&&!/[dDsSwWbBnrtfv]/.test(next))return '正则含未支持的转义；'+sceneRuleCardRegexHelp;
   if(!inClass){width++;atom=!['b','B'].includes(next);}continue;
  }
  if(inClass){if(ch===']')inClass=false;continue;}
  if(ch==='['){inClass=true;atom=true;width++;continue;}
  if('()|'.includes(ch))return unsafe;
  if(ch==='*'||ch==='+'||ch==='?'||ch==='{'){
   if(!atom)return '正则含嵌套、重复或无目标量词；'+unsafe;
   let min=ch==='+'?1:0,max=ch==='?'?1:Infinity;
   if(ch==='{'){
    const count=pattern.slice(i).match(/^\{(\d+)(?:,(\d*))?\}/);
    if(!count)return '正则含未支持或无效的重复量词。';
    min=Number(count[1]);max=count[2]===undefined?min:count[2]===''?Infinity:Number(count[2]);i+=count[0].length-1;
   }
   if(min>1000||max!==Infinity&&max>1000)return '正则重复量词上限不能超过 1000。';
   if(min!==max&&++variable>1)return unsafe;
   width+=Math.max(0,min-1);atom=false;continue;
  }
  if(']}'.includes(ch))return '正则含未支持的游离括号；请转义字面字符。';
  atom=!'^$'.includes(ch);if(atom)width++;
 }
 if(inClass)return '正则字符组未闭合。';
 if(width>2048)return '正则固定匹配长度超过 2048 字符安全上限。';
 return '';
}
function sceneRuleCardType(type){return ({string:'文本',text:'文本',枚举:'文本',引用:'文本',number:'数字',integer:'数字',boolean:'布尔',bool:'布尔',date:'日期',array:'集合'})[type]||type;}
function sceneRuleCardEmpty(value){return value===undefined||value===null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&value.length===0;}
function sceneRuleCardDate(value){
 if(typeof value!=='string')return NaN;
 const m=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/);if(!m)return NaN;
 const [year,month,day]=m.slice(1,4).map(Number),calendar=new Date(0);calendar.setUTCFullYear(year,month-1,day);calendar.setUTCHours(0,0,0,0);
 if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day)return NaN;
 if(m[4]&&(Number(m[4])>23||Number(m[5])>59||Number(m[6])>59))return NaN;
 if(m[8]&&m[8]!=='Z'&&(Number(m[8].slice(1,3))>23||Number(m[8].slice(4))>59))return NaN;
 return Date.parse(value);
}
function sceneRuleCardValueValid(value,type){
 switch(sceneRuleCardType(type)){case '数字':return typeof value==='number'&&Number.isFinite(value);case '布尔':return typeof value==='boolean';case '日期':return Number.isFinite(sceneRuleCardDate(value));case '文本':return typeof value==='string';case '集合':return Array.isArray(value);default:return false;}
}
function sceneRuleCardPath(path){return typeof path==='string'&&/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/.test(path)&&!path.split('.').some(k=>['__proto__','constructor','prototype'].includes(k));}
// 接口校验结论不是本体属性；直接结果合同与映射结果共用严格的二值决策门禁。
function sceneRuleCardDecisionValuesIssue(type,passValue,failValue){
 if(!['布尔','文本','数字'].includes(type)||sceneRuleCardEmpty(passValue)||sceneRuleCardEmpty(failValue)||!sceneRuleCardValueValid(passValue,type)||!sceneRuleCardValueValid(failValue,type)||passValue===failValue)return '校验结果必须声明标量类型及非空、严格同型、互不相等的通过/不通过值。';
 return '';
}
function sceneRuleCardValidationResultIssue(c){
 const contract=c.validationResult;
 if(c.object!=='Context'||!contract||typeof contract!=='object'||Array.isArray(contract)||!['source','type','passValue','failValue'].every(key=>Object.hasOwn(contract,key)))return 'validationResult 必须是完整的 Context 校验结果合同。';
 if(contract.source!=='$'&&!sceneRuleCardPath(contract.source))return '校验结果 source 必须为 $ 或安全的 JSON 字段路径。';
 return sceneRuleCardDecisionValuesIssue(contract.type,contract.passValue,contract.failValue);
}
function sceneRuleCardHasValidationResult(c){return Object.hasOwn(c,'validationResult')||c.validationResult!==undefined;}
function sceneRuleCardDecisionQueryIssue(q,c){
 const direct=sceneRuleCardHasValidationResult(c);
 if(direct){const issue=sceneRuleCardValidationResultIssue(c);if(issue)return issue;if(q.resultMode!=='decision')return '直接校验结果必须使用 decision 模式。';}
 if(q.resultMode!=='decision')return q.resultMode!==undefined&&!['data','field'].includes(q.resultMode)?'查询 resultMode 无效。':'';
 if(c.object!=='Context')return '校验结果必须来自 Context 接口，不能冒充本体属性。';
 const issue=sceneRuleCardDecisionValuesIssue(q.type,q.passValue,q.failValue);if(issue)return issue;
 if(!Object.hasOwn(q,'passValue')||!Object.hasOwn(q,'failValue'))return '查询必须明确声明通过/不通过值。';
 if(direct){const contract=c.validationResult;if(q.output!=='validationDecision'||q.type!==contract.type||q.passValue!==contract.passValue||q.failValue!==contract.failValue)return '查询输出、类型或通过/不通过值与 validationResult 合同不一致。';}
 else{if(!sceneRuleCardPath(q.output))return '校验结果查询必须声明实际映射输出。';const maps=(c.maps||[]).filter(m=>m.target==='Context.'+q.output);if(maps.length!==1||sceneRuleCardType(maps[0].sourceType||q.type)!==q.type)return '校验结果输出映射不存在、重复或类型不一致。';}
 return '';
}
function sceneRuleCardDecisionCompare(value,q){
 if(sceneRuleCardEmpty(value)||!sceneRuleCardValueValid(value,q.type))return {unknown:true,pass:false,detail:'接口校验结果为空或类型错误，按未知阻断。'};
 if(value===q.passValue)return {pass:true};
 if(value===q.failValue)return {pass:false};
 return {unknown:true,pass:false,detail:'接口校验结果未匹配明确的通过/不通过值，按未知阻断。'};
}
function sceneRuleCardDecisionRead(value,path){
 if(path==='$')return value;
 if(!sceneRuleCardPath(path))return undefined;
 for(const key of path.split('.')){if(value===null||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,key))return undefined;value=value[key];}return value;
}
function sceneRuleCardProperty(s,path){
 if(!sceneRuleCardPath(path))return null;
 const [id,key,...extra]=path.split('.');if(extra.length)return null;
 if(!Object.hasOwn(s.ontologyVersions||{},id)||typeof objectReleaseVersion!=='function'||!objectReleaseVersion(id,s.ontologyVersions[id]))return null;
 const o=typeof sceneMappingObjects==='function'?sceneMappingObjects(s).find(o=>o.id===id):null,p=o?.props.find(p=>p.id===key);return p?{o,p}:null;
}
// 当前场景已发布属性 + 实际字段映射是规则卡候选与自动取值的唯一真相源。
function sceneRuleCardMappedProperties(s){
 const mapped=new Map();for(const b of Object.values(workflowScene(s).blocks))for(const binding of s.bindings?.[b.id]||[]){
  const f=b.fields.find(f=>binding.target===scenePrefix(s,b.id)+f.key),property=sceneRuleCardProperty(s,binding.ontology);
  if(!f||f.mappingMode&&f.mappingMode!=='mapping'||!property||sceneRuleCardType(f.type)!==sceneRuleCardType(property.p.type)||(s.bindings[b.id]||[]).filter(x=>x.target===binding.target).length!==1)continue;
  const {o,p}=property,path=o.id+'.'+p.id;if(!mapped.has(path))mapped.set(path,{path,object:o.id,property:p.id,name:p.name,type:p.type,kind:'ontology-property',objectName:o.name,sources:[]});
  mapped.get(path).sources.push({source:(b.parent?'row.':'order.')+f.key,block:b.id,key:f.key,label:f.label});
 }return [...mapped.values()];
}
function sceneRuleCardMappedSource(s,scope,path){
 const p=sceneRuleCardMappedProperties(s).find(p=>p.path===path);if(!p)return {error:'本体属性尚未参与当前场景映射，请先在“对象与表单映射”配置：'+path};
 const row=p.sources.filter(x=>x.block===scope&&x.source.startsWith('row.')),available=row.length?row:p.sources.filter(x=>x.source.startsWith('order.'));if(available.length!==1)return {error:'当前执行范围的属性映射不唯一或不可用，请明确范围并在“对象与表单映射”调整：'+path};return {source:available[0].source};
}
function sceneRuleCardSource(s,scope,source){
 if(!/^(order|row)\.[A-Za-z_]\w*$/.test(String(source||'')))return null;
 const [origin,key]=source.split('.'),w=workflowScene(s),b=origin==='row'?w.blocks[scope]:Object.values(w.blocks).find(b=>!b.parent),f=b?.fields.find(f=>f.key===key);
 return f?{b,f,bindings:(s.bindings?.[b.id]||[]).filter(m=>m.target===scenePrefix(s,b.id)+key)}:null;
}
function sceneRuleCardParam(p){return Array.isArray(p)?{name:p[0],required:p[2]!=='否',target:p.target||p[3]?.target||(typeof p[3]==='string'?p[3]:'')}:{name:p?.name,required:p?.required!==false,target:p?.target};}
function sceneRuleCardIdentity(s,c){
 const object=typeof sceneMappingObjects==='function'?sceneMappingObjects(s).find(o=>o.id===c.object):null,keys=object?.props.filter(p=>p.key)||[];
 if(keys.length!==1)return null;const key=keys[0],path=c.object+'.'+key.id;
 if(!sceneRuleCardProperty(s,path)||c.keyProperty&&c.keyProperty!==path)return null;
 const params=(c.params||[]).map(sceneRuleCardParam),matches=params.filter(p=>(p.target||`${c.object}.${p.name}`)===path);
 return matches.length===1?{object,key,path,parameter:matches[0].name}:null;
}
function sceneRuleCardOutput(ref,q){return ref.output||q.output||(ref.kind==='ontology-property'?ref.property:ref.path?.replace(/^Context\./,''));}
function sceneRuleCardClauseIssue(clause,refs){
 if(!clause||!refs.has(clause.reference)||!sceneRuleCardOperators.has(clause.op))return '条件或断言引用/运算无效。';
 const ref=refs.get(clause.reference),type=sceneRuleCardType(ref.type),op=clause.op;
 if(['matches','notMatches'].includes(op)){
  if(type!=='文本')return '正则校验仅支持文本兼容字段。';
  if(clause.valueReference)return '正则校验不接受比较字段 valueReference，请填写原始 pattern。';
  return sceneRuleCardRegexIssue(clause.value,clause.flags);
 }
 if(['exists','notExists'].includes(op))return clause.valueReference?'存在性判断不接受比较字段。':'';
 if(['gt','gte','lt','lte','between'].includes(op)&&!['数字','日期'].includes(type))return '大小/范围比较需要数字或日期字段。';
 if(['startWith','endWith','startsWith','endsWith','notContains'].includes(op)&&type!=='文本'||op==='contains'&&!['文本','集合'].includes(type))return '文本/包含运算的字段类型不匹配。';
 if(clause.valueReference){const right=refs.get(clause.valueReference);if(!right)return '比较字段引用不存在。';const expectedType=sceneRuleCardType(right.type);if(['in','notIn','between'].includes(op)?expectedType!=='集合':op==='contains'&&type==='集合'?expectedType==='集合':expectedType!==type)return '比较字段类型不一致。';return '';}
 const value=clause.value;
 if(['in','notIn','between'].includes(op)){if(!Array.isArray(value)||!value.length||op==='between'&&value.length!==2||value.some(v=>sceneRuleCardEmpty(v)||!sceneRuleCardValueValid(v,type)))return '列表/范围比较值为空或类型不合法。';if(op==='between'){const [a,b]=type==='日期'?value.map(sceneRuleCardDate):value;if(a>b)return '范围下限不能大于上限。';}return '';}
 if(op==='contains'&&type==='集合')return sceneRuleCardEmpty(value)||!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)?'集合包含比较需要非空标量。':'';
 return sceneRuleCardEmpty(value)||!sceneRuleCardValueValid(value,type)?'比较值为空或类型不合法（数字、布尔、ISO日期必须严格类型）。':'';
}
function sceneRuleCardValidate(s,r){
 if(!r?.ruleCard)return '';
 const card=r.ruleCard,w=workflowScene(s);
 if(!w.blocks[r.scope])return '执行区块不存在。';
 if(typeof r.name!=='string'||!r.name.trim()||typeof r.message!=='string'||!r.message.trim())return '请填写规则名称和失败提示。';
 if(!['submit','save'].includes(r.trigger)||!['阻断','警告'].includes(r.level))return '规则触发时机或阻断级别无效。';
 if(card.logic!=='and'||card.unknown!=='block')return '通用规则仅支持 and，未知必须 block 阻断。';
 if(!['references','queries','conditions','assertions'].every(key=>Array.isArray(card[key]))||!card.assertions.length)return '请完整配置规则卡并至少提供一个断言。';
 const refs=new Map(),queries=new Map();
 for(const ref of card.references){if(!ref||typeof ref.id!=='string'||!ref.id.trim()||refs.has(ref.id))return '引用标识为空或重复。';refs.set(ref.id,ref);}
 for(const q of card.queries){if(!q||typeof q.id!=='string'||!q.id.trim()||queries.has(q.id)||!Array.isArray(q.params))return '查询标识为空、重复或参数列表无效。';queries.set(q.id,q);}
 for(const q of queries.values()){const c=typeof q.capability==='string'&&ability(q.capability);if(c){const issue=sceneRuleCardDecisionQueryIssue(q,c);if(issue)return issue;}}
 const decisionQuery=ref=>ref?.query&&queries.get(ref.query)?.resultMode==='decision';
 for(const q of queries.values())for(const p of q.params)if(p?.reference&&decisionQuery(refs.get(p.reference)))return '接口校验结论不可作为另一查询入参，避免未知结果被绕过。';
 for(const clause of card.conditions)if(decisionQuery(refs.get(clause?.reference))||decisionQuery(refs.get(clause?.valueReference)))return '接口校验结论不可作为适用条件，避免未知结果被跳过。';
 for(const clause of card.assertions){const ref=refs.get(clause?.reference),q=ref?.query&&queries.get(ref.query);if(decisionQuery(refs.get(clause?.valueReference)))return '接口校验结论不可作为比较字段。';if(q?.resultMode==='decision'&&(clause.op!=='eq'||Object.hasOwn(clause,'valueReference')||clause.value!==q.passValue))return '接口校验结果断言只能 eq 明确的通过值，不能使用 valueReference。';}
 for(const ref of refs.values()){
  if(!['ontology-property','business-form','business-context'].includes(ref.kind)||!sceneRuleCardPath(ref.path)||!['文本','数字','布尔','日期','集合'].includes(sceneRuleCardType(ref.type)))return '引用路径或类型/来源类别无效。';
  if(ref.query&&ref.source)return '引用不能同时读取表单与查询结果。';
  if(ref.kind==='ontology-property'){
   if(card.mappingScope==='scene-bindings'){const resolved=sceneRuleCardMappedSource(s,r.scope,ref.path);if(resolved.error)return resolved.error;if(ref.query||ref.source!==resolved.source)return '本体属性必须使用当前场景映射自动取值，请重新生成规则：'+ref.path;}
   const property=sceneRuleCardProperty(s,ref.path);if(!property)return '本体属性不存在或未锁定已发布版本：'+ref.path;
   if(ref.object!==property.o.id||ref.property!==property.p.id||sceneRuleCardType(ref.type)!==sceneRuleCardType(property.p.type))return '本体对象、属性或类型与已发布版本不一致：'+ref.path;
   if(ref.source){const source=sceneRuleCardSource(s,r.scope,ref.source);if(!source)return '表单来源字段不存在：'+ref.source;const paths=[...new Set(source.bindings.map(b=>b.ontology))];if(paths.length!==1||paths[0]!==ref.path)return '表单来源未唯一映射到本体属性：'+ref.source+' → '+ref.path;if(sceneRuleCardType(source.f.type)!==sceneRuleCardType(ref.type))return '表单来源与本体属性类型不一致。';}
   else if(!ref.query)return '本体引用必须明确表单来源或查询：'+ref.path;
  }else if(ref.kind==='business-form'){
   const source=sceneRuleCardSource(s,r.scope,ref.source);if(!source||ref.query||ref.path!==ref.source||ref.object&&ref.object!=='BusinessForm'||ref.property&&ref.property!==source.f.key)return '业务表单引用必须来自当前登记的表单字段。';if(sceneRuleCardType(source.f.type)!==sceneRuleCardType(ref.type))return '业务表单字段类型不一致。';
  }else if(!ref.query||ref.source||!ref.path.startsWith('Context.'))return '业务上下文字段必须来自登记的查询输出。';
  if(ref.query){const q=queries.get(ref.query),c=q&&ability(q.capability);if(!q||!c)return '引用查询不存在或能力未登记。';const output=sceneRuleCardOutput(ref,q);if(!sceneRuleCardPath(output))return '查询输出路径无效。';
   const direct=sceneRuleCardHasValidationResult(c);
   if(direct){if(ref.kind!=='business-context'||ref.object&&ref.object!=='Context'||ref.path!=='Context.validationDecision'||ref.property!=='validationDecision'||ref.output!=='validationDecision'||ref.type!==c.validationResult.type)return '直接校验结果引用必须保持 Context.validationDecision synthetic 路径、输出和合同类型，不能作为本体属性。';}
   else{const target=ref.kind==='ontology-property'?ref.path:'Context.'+output,maps=(c.maps||[]).filter(m=>m.target===target);
    if(maps.length!==1||ref.kind==='ontology-property'&&(c.object!==ref.object||output!==ref.property)||ref.kind==='business-context'&&(c.object!=='Context'||ref.path!==target))return '查询未登记该输出映射：'+ref.path;
    const declared=maps[0].sourceType||ref.type;if(!declared||sceneRuleCardType(declared)!==sceneRuleCardType(ref.type)||q.type&&q.output===output&&sceneRuleCardType(q.type)!==sceneRuleCardType(ref.type))return '查询输出类型与引用类型不一致。';
   }
   if(q.resultMode==='decision'&&(ref.kind!=='business-context'||output!==q.output||ref.path!=='Context.'+q.output||ref.property!==q.output||ref.output!==q.output||ref.type!==q.type))return '校验结果引用必须保持查询的实际输出和严格同型。';
  }
 }
 for(const q of queries.values()){
  const c=typeof q.capability==='string'&&ability(q.capability);if(!c||c.enabled===false||!connector(c.connector)?.enabled)return '查询能力未登记、停用或连接不可用：'+q.capability;
  if(q.output&&!sceneRuleCardHasValidationResult(c)){if(!sceneRuleCardPath(q.output))return '查询输出路径无效。';const target=c.object==='Context'?'Context.'+q.output:c.object+'.'+q.output,maps=(c.maps||[]).filter(m=>m.target===target);if(maps.length!==1)return '查询声明的输出映射不存在或重复：'+target;const property=c.object!=='Context'&&sceneRuleCardProperty(s,target),ref=card.references.find(ref=>ref.query===q.id&&sceneRuleCardOutput(ref,q)===q.output),type=property?.p?.type||maps[0].sourceType||ref?.type;if(!type||q.type&&sceneRuleCardType(q.type)!==sceneRuleCardType(type))return '查询声明的输出类型未确认或不一致。';}
  const definitions=(c.params||[]).map(sceneRuleCardParam),params=new Map();
  if(definitions.some(d=>!sceneRuleCardPath(d.name)||d.name.includes('.'))||new Set(definitions.map(d=>d.name)).size!==definitions.length)return '登记的查询参数标识无效或重复。';
  for(const p of q.params){if(!p||!sceneRuleCardPath(p.name)||p.name.includes('.')||params.has(p.name)||!definitions.some(d=>d.name===p.name))return '查询参数未登记或重复。';params.set(p.name,p);if(!p.source&&!p.reference)return '查询参数缺少来源：'+p.name;if(p.reference&&!refs.has(p.reference))return '参数引用不存在：'+p.name;if(p.source&&!sceneRuleCardSource(s,r.scope,p.source))return '参数来源字段不存在：'+p.source;if(p.reference&&p.source&&refs.get(p.reference).source!==p.source)return '参数表单来源与引用不一致：'+p.name;}
  for(const d of definitions)if(d.required&&!params.has(d.name))return '查询缺少参数：'+d.name;
  let identity;if(c.object!=='Context'){identity=sceneRuleCardIdentity(s,c);if(!identity||!(c.maps||[]).some(m=>m.target===identity.path)||!params.has(identity.parameter))return '对象查询缺少已发布唯一身份、唯一键映射或明确身份入参 target。';}
  for(const d of definitions){const p=params.get(d.name),target=d.target||(identity?.parameter===d.name?identity.path:'');if(!p||!target)continue;const property=sceneRuleCardProperty(s,target);if(!property)return '入参 target 不是已发布本体属性：'+target;
   if(p.reference){const ref=refs.get(p.reference);if(sceneRuleCardType(ref.type)!==sceneRuleCardType(property.p.type))return '入参引用与 target 类型不一致：'+d.name;if(ref.query){/* 已精确身份解析的跨对象查询输出可成为下一个对象的身份入参。 */}else if(ref.kind==='ontology-property'&&ref.path!==target)return '入参引用与 target 映射不一致：'+d.name;else if(ref.kind==='business-form'){const source=sceneRuleCardSource(s,r.scope,ref.source),paths=[...new Set(source.bindings.map(b=>b.ontology))];if(paths.length!==1||paths[0]!==target)return '身份/入参业务字段尚未唯一映射 target：'+ref.source+' → '+target;}}
   if(p.source){const source=sceneRuleCardSource(s,r.scope,p.source),paths=[...new Set(source.bindings.map(b=>b.ontology))];if(paths.length!==1||paths[0]!==target)return '身份/入参来源未唯一映射 target：'+p.source+' → '+target;if(sceneRuleCardType(source.f.type)!==sceneRuleCardType(property.p.type))return '入参来源与 target 类型不一致。';}
  }
 }
 // 查询参数可以引用另一查询的字段；完整依赖图有环即拒绝，不通过短路隐藏环。
 const visiting=new Set(),done=new Set();function visit(id){if(visiting.has(id))return true;if(done.has(id))return false;visiting.add(id);for(const p of queries.get(id).params){const next=p.reference&&refs.get(p.reference)?.query;if(next&&visit(next))return true;}visiting.delete(id);done.add(id);return false;}
 for(const id of queries.keys())if(visit(id))return '查询引用依赖存在循环/环，不能执行。';
 for(const clause of [...card.conditions,...card.assertions]){const issue=sceneRuleCardClauseIssue(clause,refs);if(issue)return issue;}
 return '';
}
function sceneRuleCardReferences(s,r){
 const objectsById=new Map(),properties=[],seen=new Set(),card=r?.ruleCard;if(!card)return {objects:[],properties:[]};
 function add(path,fact,extras={}){const property=sceneRuleCardProperty(s,path);if(!property)return;const {o,p}=property;if(!objectsById.has(o.id))objectsById.set(o.id,{id:o.id,name:o.name,version:s.ontologyVersions[o.id]});const key=fact+'|'+path;if(seen.has(key))return;seen.add(key);properties.push({fact,id:fact,path,object:o.id,property:p.id,name:p.name,type:p.type,kind:'ontology-property',version:s.ontologyVersions[o.id],...extras});}
 for(const ref of card.references||[]){const q=(card.queries||[]).find(q=>q.id===ref.query);if(ref.kind==='ontology-property')add(ref.path,ref.id,{...ref,...(q?{capability:q.capability}:{})});else properties.push({...ref,fact:ref.id,...(q?{capability:q.capability}:{})});}
 for(const q of card.queries||[]){const c=ability(q.capability);if(!c)continue;const identity=c.object!=='Context'&&sceneRuleCardIdentity(s,c);if(identity)add(identity.path,'parameter.'+q.id+'.'+identity.parameter,{capability:c.id});for(const p of q.params||[]){const definition=(c.params||[]).map(sceneRuleCardParam).find(d=>d.name===p.name);if(definition?.target)add(definition.target,'parameter.'+q.id+'.'+p.name,{capability:c.id,parameter:p.name});if(p.reference)continue;const source=p.source&&sceneRuleCardSource(s,r.scope,p.source);for(const b of source?.bindings||[])add(b.ontology,'parameter.'+q.id+'.'+p.name,{source:p.source,parameter:p.name});}}
 return {objects:[...objectsById.values()],properties};
}
function sceneRuleCardCompare(value,clause,expected,type){
 const op=clause.op,empty=sceneRuleCardEmpty(value);
 if(['matches','notMatches'].includes(op)){
  const detail=sceneRuleCardType(type)!=='文本'?'正则校验仅支持文本兼容字段。':clause.valueReference?'正则校验不接受比较字段 valueReference。':sceneRuleCardRegexIssue(expected,clause.flags);
  if(detail)return {unknown:true,pass:false,detail};
  if(empty||typeof value!=='string')return {unknown:true,pass:false,detail:'正则校验事实为空或类型错误。'};
  if(value.length>2048)return {unknown:true,pass:false,detail:'正则待校验文本长度不能超过 2048 字符，按未知阻断。'};
  const matched=new RegExp(expected,clause.flags===undefined?'':clause.flags).test(value);
  return {pass:op==='matches'?matched:!matched};
 }
 if(['exists','notExists'].includes(op)){if(!empty&&!sceneRuleCardValueValid(value,type))return {unknown:true,pass:false,detail:'事实类型错误。'};return {pass:op==='exists'?!empty:empty};}
 if(empty||!sceneRuleCardValueValid(value,type)||sceneRuleCardEmpty(expected))return {unknown:true,pass:false,detail:'比较事实为空或类型错误。'};
 type=sceneRuleCardType(type);
 if(['in','notIn','between'].includes(op)){if(!Array.isArray(expected)||!expected.length||expected.some(v=>!sceneRuleCardValueValid(v,type))||op==='between'&&expected.length!==2)return {unknown:true,pass:false,detail:'比较列表/范围类型错误。'};}
 else if(op==='contains'&&type==='集合'){if(!['string','number','boolean'].includes(typeof expected))return {unknown:true,pass:false,detail:'集合包含比较类型错误。'};}
 else if(!sceneRuleCardValueValid(expected,type))return {unknown:true,pass:false,detail:'比较字段类型错误。'};
 const v=type==='日期'?sceneRuleCardDate(value):value,e=type==='日期'?(Array.isArray(expected)?expected.map(sceneRuleCardDate):sceneRuleCardDate(expected)):expected;
 if(op==='between'&&e[0]>e[1])return {unknown:true,pass:false,detail:'比较范围下限超过上限。'};
 const passes={eq:()=>v===e,neq:()=>v!==e,gt:()=>v>e,gte:()=>v>=e,lt:()=>v<e,lte:()=>v<=e,in:()=>e.includes(v),notIn:()=>!e.includes(v),between:()=>v>=e[0]&&v<=e[1],contains:()=>v.includes(e),notContains:()=>!v.includes(e),startWith:()=>v.startsWith(e),startsWith:()=>v.startsWith(e),endWith:()=>v.endsWith(e),endsWith:()=>v.endsWith(e)};
 return {pass:passes[op]?.()===true};
}
const sceneRuleCardFactsBefore=ruleFacts;
ruleFacts=function(s,r){const facts=sceneRuleCardFactsBefore(s,r);if(!r?.ruleCard)return facts;const ids=new Set((r.ruleCard.references||[]).map(ref=>ref.id));return [...facts.filter(f=>!ids.has(f.id)),...(r.ruleCard.references||[]).map(ref=>{const q=(r.ruleCard.queries||[]).find(q=>q.id===ref.query);return {...ref,id:ref.id,...(q?{capability:q.capability,output:sceneRuleCardOutput(ref,q)}:{})};})];};
const sceneRuleCardValidateBefore=validateWorkflowRule;
validateWorkflowRule=function(s,r){return r?.ruleCard?sceneRuleCardValidate(s,r):sceneRuleCardValidateBefore(s,r);};
const sceneRuleCardExecuteBefore=executeWorkflow;
executeWorkflow=function(s,doc,authority,event='submit',failure='正常'){
 const rules=workflowScene(s).rules.filter(r=>r.ruleCard&&r.enabled&&(event==='submit'||r.trigger==='save')),copy=structuredClone(s);copy.workflow.rules=copy.workflow.rules.filter(r=>!r.ruleCard);
 const result=sceneRuleCardExecuteBefore(copy,doc,authority,event,failure);if(result.errors.length){
  // 表单结构 / 类型门禁先于卡片执行；正则不能因此缺少未知阻断结果，也不继续取值或查询。
  for(const r of rules)if([...(r.ruleCard.conditions||[]),...(r.ruleCard.assertions||[])].some(c=>['matches','notMatches'].includes(c.op)))result.checks.push({rule:r.id,name:r.name,target:r.scope,status:'未知',level:'阻断',detail:'正则校验数据未知，提交阻断：'+result.errors.join('；'),evidence:[]});
  return result;
 }
 const w=workflowScene(s),main=Object.values(w.blocks).find(b=>!b.parent),order=doc[main.path],calls=new Map();
 const cacheKey=(id,params)=>JSON.stringify([id,Object.entries(params).sort(([a],[b])=>a.localeCompare(b))]);
 for(const call of result.calls)if(call.capability&&call.params)calls.set(cacheKey(call.capability,call.params),call);
 const query=(id,params)=>{const key=cacheKey(id,params);if(!calls.has(key)){let response;try{response=callCapability(id,params,failure,authority);if(!response||typeof response!=='object'||typeof response.then==='function')response={capability:id,params,ok:false,error:'查询响应不是同步明确结果'};}catch(error){response={capability:id,params,ok:false,error:'查询失败：'+error.message};}calls.set(key,response);result.calls.push(response);}return calls.get(key);};
 for(const r of rules){const issue=sceneRuleCardValidate(s,r);if(issue){result.checks.push({rule:r.id,name:r.name,target:r.scope,status:'未知',level:'阻断',detail:issue,evidence:[]});continue;}
  const card=r.ruleCard,b=w.blocks[r.scope],refs=new Map(card.references.map(ref=>[ref.id,ref])),queries=new Map(card.queries.map(q=>[q.id,q]));
  for(const row of b.many?doc[b.path]:[doc[b.path]]){
   const evidence=[],refCache=new Map(),queryCache=new Map(),active=new Set(),input=source=>{const [origin,key]=source.split('.');return (origin==='row'?row:order)?.[key];},unknown=detail=>({unknown:true,detail});
   function getQuery(id){if(queryCache.has(id))return queryCache.get(id);if(active.has(id))return unknown('查询依赖环。');active.add(id);const q=queries.get(id),c=ability(q.capability),params={};let outcome;
    for(const p of q.params){const resolved=p.reference?getRef(p.reference):{value:input(p.source)};if(resolved.unknown||sceneRuleCardEmpty(resolved.value)){outcome=unknown('查询参数 '+p.name+' 缺失或未知：'+(resolved.detail||p.source||p.reference));break;}if(typeof resolved.value==='object'){outcome=unknown('查询参数 '+p.name+' 不是单一标量。');break;}const definition=(c.params||[]).map(sceneRuleCardParam).find(d=>d.name===p.name),identity=c.object!=='Context'&&sceneRuleCardIdentity(s,c),target=definition?.target||(identity?.parameter===p.name?identity.path:'');const property=target&&sceneRuleCardProperty(s,target),source=p.source&&sceneRuleCardSource(s,r.scope,p.source);if(property&&!sceneRuleCardValueValid(resolved.value,property.p.type)||source&&!sceneRuleCardValueValid(resolved.value,source.f.type)){outcome=unknown('查询参数 '+p.name+' 类型错误。');break;}params[p.name]=resolved.value;}
    if(!outcome){const response=query(q.capability,params);if(response.ok!==true||response.error)outcome=unknown(response.error||'查询失败、超时或状态未知。');else if(sceneRuleCardHasValidationResult(c)){if(!Object.hasOwn(response,'raw'))outcome=unknown('直接校验结果缺少 raw 原始返回。');else outcome={value:sceneRuleCardDecisionRead(response.raw,c.validationResult.source),params,response};}else if(c.object==='Context'){if(!response.normalized||typeof response.normalized!=='object'||Array.isArray(response.normalized))outcome=unknown('上下文返回为空或多结果。');else outcome={value:response.normalized,params,response};}
     else{const identity=sceneRuleCardIdentity(s,c),rows=response.normalized,key=params[identity.parameter];if(!Array.isArray(rows)||rows.length!==1)outcome=unknown('对象查询为空或多结果，不能确认精确身份。');else{const record=rows[0];if(!record||record.identity!==c.object+':'+key||record.properties?.[identity.key.id]!==key||!sceneRuleCardValueValid(key,identity.key.type))outcome=unknown('对象查询身份不一致或唯一键类型错误。');else outcome={value:record.properties,params,response};}}
    }active.delete(id);queryCache.set(id,outcome);return outcome;
   }
   function getRef(id){if(refCache.has(id))return refCache.get(id);const ref=refs.get(id);let outcome;if(ref.source)outcome={value:input(ref.source)};else{const q=queries.get(ref.query),queried=getQuery(q.id);outcome=queried.unknown?queried:{value:sceneRuleCardHasValidationResult(ability(q.capability))?queried.value:readPath(queried.value,sceneRuleCardOutput(ref,q)),params:queried.params,response:queried.response};}if(!outcome.unknown&&!sceneRuleCardEmpty(outcome.value)&&!sceneRuleCardValueValid(outcome.value,ref.type))outcome={...outcome,...unknown('字段 '+ref.path+' 返回类型错误。')};refCache.set(id,outcome);return outcome;}
   function judge(clause){const ref=refs.get(clause.reference),left=getRef(ref.id),right=clause.valueReference?getRef(clause.valueReference):{value:clause.value},judged=left.unknown||right.unknown?{unknown:true,pass:false,detail:left.detail||right.detail}:queries.get(ref.query)?.resultMode==='decision'?sceneRuleCardDecisionCompare(left.value,queries.get(ref.query)):sceneRuleCardCompare(left.value,clause,right.value,ref.type);evidence.push({field:ref.id,label:ref.name||ref.path,source:ref.source||queries.get(ref.query)?.capability,params:left.params||null,path:ref.path,output:ref.query?sceneRuleCardOutput(ref,queries.get(ref.query)):undefined,actual:left.value===undefined?'未知':left.value,operator:clause.op,...(['matches','notMatches'].includes(clause.op)?{flags:clause.flags===undefined?'':clause.flags}:{}),expected:clause.valueReference?right.value:clause.value,valueReference:clause.valueReference,status:judged.unknown?'未知':judged.pass?'通过':'不满足',detail:judged.detail});return judged;}
   let status='通过',detail='所有检查要求均满足。';
   for(const clause of card.conditions){const judged=judge(clause);if(judged.unknown){status='未知';detail='适用条件未知，不能跳过：'+judged.detail;break;}if(!judged.pass){status='跳过';detail='前置条件未命中，不调用后续查询。';break;}}
   if(status==='通过'){let failed=false;for(const clause of card.assertions){const judged=judge(clause);if(judged.unknown){status='未知';detail='事实不完整，提交阻断：'+judged.detail;break;}if(!judged.pass)failed=true;}if(status==='通过'&&failed){status='阻断';detail=r.message;}}
   result.checks.push({rule:r.id,name:r.name,target:`${b.path}[${row[b.keyField]}]`,status,level:status==='未知'?'阻断':r.level,detail,evidence});
  }
 }
 result.passed=result.checks.every(c=>c.status==='通过'||c.status==='跳过'||c.status==='阻断'&&c.level==='警告');return result;
};
const sceneRuleCardPropertyDeleteBefore=propertyDeleteReferences;
propertyDeleteReferences=function(o,p){const references=sceneRuleCardPropertyDeleteBefore(o,p),path=o.id+'.'+p.id;for(const s of Object.values(appScenes))for(const r of s.workflow?.rules||[]){if(!r.ruleCard)continue;const explicit=(r.ruleCard.references||[]).some(ref=>ref.kind==='ontology-property'&&ref.path===path),indirect=sceneRuleCardReferences(s,r).properties.some(ref=>ref.path===path);if(explicit||indirect)references.push(`场景“${s.name}”规则“${r.name}”引用本体属性 ${path}，请先调整或删除该规则。`);}return [...new Set(references)];};
