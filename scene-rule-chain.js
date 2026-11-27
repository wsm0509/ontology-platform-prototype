/* 本体驱动的校验链：人员部门条件 → 物料入参 → 接口返回断言。全部接口是本地演示。 */
'use strict';
if(!obj('Person'))objects.push({id:'Person',name:'人员',desc:'发布单申请人及所属部门；本地演示定义，不是已接入的组织服务。',domain:'COMMON',count:2,version:'v1.0',status:'已发布',props:[prop('人员编号','personCode','文本','本地人员样例','person.personCode','EMP-001',{key:true,required:true}),prop('人员姓名','name','文本','本地人员样例','person.name','张三',{display:true}),prop('人员所属部门','department','文本','本地人员样例','person.department','后端业务部')]});
const sceneRuleChainDemoPeople={'EMP-001':{personCode:'EMP-001',name:'张三',department:'后端业务部'},'EMP-002':{personCode:'EMP-002',name:'李四',department:'前端业务部'}};
capabilities.push({id:'demo.personDepartment',name:'查询申请人所属部门（本地演示）',connector:'irdms',object:'Person',method:'本地演示',resource:'本地人员部门样例（待接组织服务）',params:[['personCode','申请人编号','是']],maps:[outputMap('person.personCode','Person.personCode'),outputMap('person.name','Person.name'),outputMap('person.department','Person.department')],revision:1,description:'仅按确切人员编号读取本地样例，不使用单据提交部门替代人员部门。'}, {id:'demo.minimumByMaterial',name:'按整机物料校验最小系统发布（本地演示）',connector:'software',object:'Context',method:'本地演示',resource:'本地物料最小系统状态样例（待接真实校验接口）',params:[['materialCode','发布单整机物料代码','是']],maps:[{...outputMap('result.status','Context.minimumSystem.status'),sourceType:'文本',description:'已发布 / 未发布'}],revision:1,description:'按物料代码返回明确发布状态；不代替软件编码 / 项目 / 版本查询。'});
// 校验接口只返回业务结论；入参引用本体，出参不登记为本体属性。
capabilities.push({id:'demo.materialValidation',name:'物料校验 · 直接返回通过 / 不通过（本地演示）',connector:'software',object:'Context',method:'本地演示',resource:'本地物料校验结论样例（待接真实校验接口）',params:[['materialCode','整机物料编码','是',{target:'Material.materialCode'}]],maps:[],validationResult:{source:'$',type:'布尔',passValue:true,failValue:false},revision:1,description:'本地演示：以物料编码为入参，响应体直接为 true / false；不是 HTTP 成功标识，不生成本体出参。'});
const chainRelease=appScenes.release,chainMain=Object.values(workflowScene(chainRelease).blocks).find(b=>!b.parent);
if(!chainMain.fields.some(f=>f.key==='applicantCode'))chainMain.fields.push({key:'applicantCode',label:'发布单申请人编号',type:'文本',required:true});
chainRelease.bindings[chainMain.id].push({label:'发布单申请人编号',target:scenePrefix(chainRelease,chainMain.id)+'applicantCode',ontology:'Person.personCode',direction:'只读',policy:'保持稳定引用',instanceMode:'input',sinkTable:chainMain.table,sinkColumn:'APPLICANT_CODE'});
const chainCallBefore=callCapability;
callCapability=function(id,params={},failure='正常',fixture,...rest){
 if(!['demo.personDepartment','demo.minimumByMaterial','demo.materialValidation'].includes(id))return chainCallBefore(id,params,failure,fixture,...rest);
 const c=ability(id),base={capability:id,connector:c?.connector,params:structuredClone(params),revision:c?.revision,at:now()};
 if(!c||!connector(c.connector)?.enabled)return {...base,ok:false,error:'演示查询或连接不可用'};
 if(failure==='超时')return {...base,ok:false,error:'模拟接口超时，状态未知'};
 let raw;
 if(id==='demo.materialValidation'){const supplied=fixture?.materialValidation;if(!catalog.some(m=>m.materialCode===params.materialCode))return {...base,ok:false,error:'未找到确切物料代码'};raw=supplied&&Object.hasOwn(supplied,params.materialCode)?structuredClone(supplied[params.materialCode]):true;return {...base,ok:true,raw};}
 if(id==='demo.personDepartment'){const record=fixture?.people?.[params.personCode]??sceneRuleChainDemoPeople[params.personCode];if(!record)return {...base,ok:false,error:'未找到确切申请人编号'};raw={person:structuredClone(record)};}
 else {const material=catalog.find(m=>m.materialCode===params.materialCode);if(!material)return {...base,ok:false,error:'未找到确切物料代码'};const data=fixture?.minimumByMaterial?.[params.materialCode];raw=data!==undefined?structuredClone(data):{result:{status:'已发布'},materialCode:params.materialCode};}
 return {...base,raw,...normalizeCapabilityOutput(c,raw)};
};
function sceneRuleChainTemplateMatch(text){return /最小系统/.test(String(text))&&(/申请人|人员|物料代码|物料编码|后端/.test(String(text)));}
function sceneRuleChainProperty(s,path){return typeof sceneMappingObjects==='function'?sceneMappingObjects(s).flatMap(o=>o.props.map(p=>({o,p}))).find(x=>x.o.id+'.'+x.p.id===path):null;}
function sceneRuleChainSource(s,scope,source,ontology){
 const [origin,key]=String(source||'').split('.'),b=origin==='row'?workflowScene(s).blocks[scope]:origin==='order'?Object.values(workflowScene(s).blocks).find(b=>!b.parent):null;
 if(!b?.fields.some(f=>f.key===key))return '表单来源字段不存在：'+source;
 if(!(s.bindings[b.id]||[]).some(m=>m.target===scenePrefix(s,b.id)+key&&m.ontology===ontology))return `${source} 尚未映射到 ${ontology}，请先配置表单对应关系。`;
 return '';
}
function sceneRuleChainDraft(s,v){
 const text=String(v.originalText||''),clarifications=[];
 const needed=[[/申请人/,'请明确是发布单申请人的所属部门，不是提交部门。'],[/人员.*(?:所属)?部门|Person\.department/,'请明确人员所属部门的本体属性。'],[/物料(?:代码|编码)|Material\.materialCode/,'请明确发布单物料代码作为接口入参。'],[/接口/,'请明确使用哪个校验接口。'],[/返回/,'请说明返回字段及什么值表示已发布、未发布。'],[/拦截|阻断/,'请明确未发布时拦截提交。']];
 for(const [pattern,message]of needed)if(!pattern.test(text))clarifications.push(message);
 for(const [key,label]of [['chainApplicantProperty','人员部门属性'],['chainApplicantSource','申请人表单来源'],['chainPersonCapability','人员查询'],['chainMaterialProperty','物料代码属性'],['chainMaterialSource','物料表单来源'],['chainValidationCapability','校验接口'],['chainReturnPath','返回字段'],['chainReturnType','返回类型'],['chainPublishedValue','已发布值'],['chainUnpublishedValue','未发布值']])if(!String(v[key]??'').trim())clarifications.push('请确认'+label+'。');
 if(!v.scope)clarifications.push('请选择需要逐行检查的发布单物料区块。');
 if(clarifications.length)return {clarifications};
 const rule={id:'',name:'后端业务部申请人：整机最小系统发布校验',scope:v.scope,trigger:'submit',enabled:false,active:'停用',level:'阻断',message:'申请人属于后端业务部，当前整机物料最小系统未发布，拦截提交。',conditions:[{fact:'Applicant.department',op:'eq',value:'后端业务部'}],assertions:[{fact:'Validation.published',op:'eq',value:String(v.chainPublishedValue)}],params:{},ontologyChain:{applicant:{property:v.chainApplicantProperty,source:v.chainApplicantSource,capability:v.chainPersonCapability,keyProperty:'Person.personCode',parameter:'personCode'},material:{property:v.chainMaterialProperty,source:v.chainMaterialSource,parameter:'materialCode'},validation:{capability:v.chainValidationCapability,output:v.chainReturnPath,type:v.chainReturnType,operator:v.chainOperator||'eq',published:String(v.chainPublishedValue),unpublished:String(v.chainUnpublishedValue)},unknown:'block'}};
 const error=sceneRuleChainValidate(s,rule);return error?{clarifications:[error]}:{rule,clarifications:[]};
}
function sceneRuleChainValidate(s,r){
 const c=r.ontologyChain;if(!c)return '';
 if(!workflowScene(s).blocks[r.scope])return '执行区块不存在。';
 if(!r.name?.trim()||!r.message?.trim()||r.trigger!=='submit'||r.level!=='阻断'||c.unknown!=='block')return '该链必须在提交前检查，未发布或未知时阻断。';
 const department=sceneRuleChainProperty(s,c.applicant?.property),identity=sceneRuleChainProperty(s,c.applicant?.keyProperty),material=sceneRuleChainProperty(s,c.material?.property);
 if(!department||!identity||!material)return '本体属性不存在或不在已发布对象版本中。';
 if(department.o.id!=='Person'||department.p.id!=='department'||identity.o.id!=='Person'||!identity.p.key||material.o.id!=='Material'||!material.p.key)return '必须使用人员所属部门、申请人唯一编号与整机物料唯一代码，不能替换为提交部门或软件编码。';
 for(const oid of ['Person','Material'])if(typeof objectReleaseVersion==='function'&&!objectReleaseVersion(oid,s.ontologyVersions?.[oid]))return `${oid} 未锁定已发布版本，请先完成对象引用。`;
 const sourceIssue=sceneRuleChainSource(s,r.scope,c.applicant.source,c.applicant.keyProperty)||sceneRuleChainSource(s,r.scope,c.material.source,c.material.property);if(sourceIssue)return sourceIssue;
 const people=ability(c.applicant.capability),validation=ability(c.validation.capability);
 if(!people||!connector(people.connector)?.enabled||people.object!=='Person'||!people.maps.some(m=>m.target===c.applicant.property)||!people.maps.some(m=>m.target===c.applicant.keyProperty)||people.params.length!==1||people.params[0][0]!==c.applicant.parameter)return '人员查询必须按申请人唯一编号返回人员身份与部门。';
 if(!validation||!connector(validation.connector)?.enabled||validation.object!=='Context'||validation.params.length!==1||validation.params[0][0]!==c.material.parameter)return '校验接口必须明确以整机物料代码作为入参；不能猜测额外参数。';
 const map=validation.maps.find(m=>m.target==='Context.'+c.validation.output);if(!map)return '校验接口没有登记该返回字段映射。';
 if(!['文本','布尔','数字'].includes(c.validation.type)||map.sourceType&&map.sourceType!==c.validation.type)return '接口返回字段类型与所选判断类型不一致。';
 if(c.validation.operator!=='eq'||!String(c.validation.published??'').trim()||!String(c.validation.unpublished??'').trim()||c.validation.published===c.validation.unpublished)return '请明确不同的已发布与未发布值，使用等于判断。';
 if(c.validation.type==='布尔'&&![c.validation.published,c.validation.unpublished].every(v=>['true','false'].includes(v)))return '布尔返回应明确 true / false 的发布含义。';
 if(c.validation.type==='数字'&&![c.validation.published,c.validation.unpublished].every(v=>Number.isFinite(Number(v))))return '数值返回应填写有效数字。';
 if(r.conditions.length!==1||r.conditions[0].fact!=='Applicant.department'||r.conditions[0].op!=='eq'||r.conditions[0].value!=='后端业务部'||r.assertions.length!==1||r.assertions[0].fact!=='Validation.published'||r.assertions[0].op!=='eq'||r.assertions[0].value!==c.validation.published)return '条件或断言已偏离确认链路，请从自然语言重新生成。';
 return '';
}
function sceneRuleChainReferences(s,r){
 const c=r.ontologyChain,props=[c.applicant.keyProperty,c.applicant.property,c.material.property].map(path=>{const {o,p}=sceneRuleChainProperty(s,path);return {fact:path,path,kind:'ontology-property',name:p.name,type:p.type,object:o.id,version:s.ontologyVersions?.[o.id]};});
 props.push({fact:'Validation.published',path:'Context.'+c.validation.output,kind:'business-context',name:'接口返回发布状态',type:c.validation.type,capability:c.validation.capability});
 return {objects:['Person','Material'].map(id=>({id,name:obj(id)?.name||id,version:s.ontologyVersions?.[id]})),properties:props};
}
const chainFactsBefore=ruleFacts;
ruleFacts=function(s,r){const facts=chainFactsBefore(s,r);if(!r.ontologyChain)return facts;const c=r.ontologyChain;return [...facts,{id:'Applicant.department',name:'申请人 · 人员所属部门',type:'文本',capability:c.applicant.capability,output:'department'},{id:'Validation.published',name:'校验接口返回 · '+c.validation.output,type:c.validation.type,capability:c.validation.capability,output:c.validation.output}];};
const chainValidateBefore=validateWorkflowRule;
validateWorkflowRule=function(s,r){return r.ontologyChain?sceneRuleChainValidate(s,r):chainValidateBefore(s,r);};
const chainExecuteBefore=executeWorkflow;
executeWorkflow=function(s,doc,authority,event='submit',failure='正常'){
 const chainRules=workflowScene(s).rules.filter(r=>r.ontologyChain&&r.enabled&&(event==='submit'||r.trigger==='save')),copy=structuredClone(s);copy.workflow.rules=copy.workflow.rules.filter(r=>!r.ontologyChain);
 const result=chainExecuteBefore(copy,doc,authority,event,failure);if(result.errors.length)return result;
 const main=Object.values(workflowScene(s).blocks).find(b=>!b.parent),order=doc[main.path],cache=new Map();
 const query=(id,params)=>{const key=JSON.stringify([id,params]);if(!cache.has(key)){const response=callCapability(id,params,failure,authority);cache.set(key,response);result.calls.push(response);}return cache.get(key);};
 for(const r of chainRules){const issue=sceneRuleChainValidate(s,r);if(issue){result.checks.push({rule:r.id,name:r.name,target:r.scope,status:'未知',level:'阻断',detail:issue,evidence:[]});continue;}const b=workflowScene(s).blocks[r.scope],c=r.ontologyChain;
 for(const row of b.many?doc[b.path]:[doc[b.path]]){const evidence=[],input=source=>{const [origin,key]=source.split('.');return (origin==='row'?row:order)?.[key];},personCode=input(c.applicant.source);let status='未知',detail='申请人身份或部门未知，不能跳过校验。';
 if(personCode){const p=query(c.applicant.capability,{[c.applicant.parameter]:personCode}),records=(p.normalized||[]).filter(x=>x.properties?.personCode===personCode&&x.identity==='Person:'+personCode),department=p.ok&&records.length===1?records[0].properties.department:undefined;
 evidence.push({field:'Applicant.department',label:'申请人所属部门',source:c.applicant.capability,params:{[c.applicant.parameter]:personCode},ontology:c.applicant.property,actual:department??'未知',operator:'eq',expected:'后端业务部',status:department===undefined?'未知':department==='后端业务部'?'通过':'不满足'});
 if(typeof department==='string'&&department.trim()){if(department!=='后端业务部'){status='跳过';detail='申请人不属于后端业务部，不调用最小系统校验接口。';}else{const code=input(c.material.source);if(!code)detail='发布单物料代码缺失，不能调用校验接口。';else{const response=query(c.validation.capability,{[c.material.parameter]:code}),value=response.ok?readPath(response.normalized,c.validation.output):undefined,typed=typeof value===(c.validation.type==='布尔'?'boolean':c.validation.type==='数字'?'number':'string'),expected=c.validation.type==='布尔'?c.validation.published==='true':c.validation.type==='数字'?Number(c.validation.published):c.validation.published,negative=c.validation.type==='布尔'?c.validation.unpublished==='true':c.validation.type==='数字'?Number(c.validation.unpublished):c.validation.unpublished;
 status=!typed||value!==expected&&value!==negative?'未知':value===expected?'通过':'阻断';detail=status==='通过'?'申请人部门条件命中，物料校验接口返回符合已发布判定。':status==='阻断'?r.message:'接口返回为空、未知状态、类型错误或查询失败，拦截提交。';
 evidence.push({field:'Validation.published',label:'最小系统发布状态',source:c.validation.capability,params:{[c.material.parameter]:code},ontology:c.material.property,output:c.validation.output,actual:value??'未知',operator:'eq',expected,status:status==='通过'?'通过':status==='阻断'?'不满足':'未知'});
 }}}
 }
 result.checks.push({rule:r.id,name:r.name,target:`${b.path}[${row[b.keyField]}]`,status,level:'阻断',detail,evidence});}}
 result.passed=result.checks.every(c=>c.status==='通过'||c.status==='跳过'||c.status==='阻断'&&c.level==='警告');return result;
};
