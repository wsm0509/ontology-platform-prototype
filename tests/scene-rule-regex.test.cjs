// 测试生成方式：TDD
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {workspace}=require('./workspace.cjs'),root=path.join(__dirname,'..');
function full(){
 const run=workspace(),loaded=new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);
 for(const [,file] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/src="([^"?]+)(?:\?[^\"]*)?"/g))if(!loaded.has(file)){run(fs.readFileSync(path.join(root,file),'utf8'));loaded.add(file);}
 for(const file of ['scene-rule-runtime.js','scene-rule-intent.js'])if(!loaded.has(file))run(fs.readFileSync(path.join(root,file),'utf8'));
 return run;
}
const setup=`selectScene('release');const s=structuredClone(scene()),doc=workflowDemoDocument(s,'all-pass');
const ref={id:'subject',path:'ReleaseOrder.releaseSubject',object:'ReleaseOrder',property:'releaseSubject',name:'发布主题',type:'文本',kind:'ontology-property',source:'order.releaseSubject'};
const r={id:'regex-card',name:'正则校验',scope:'main',trigger:'submit',enabled:true,level:'阻断',message:'主题不符合规则',conditions:[],assertions:[],ruleCard:{mappingScope:'scene-bindings',references:[ref],queries:[],conditions:[],assertions:[{reference:ref.id,op:'matches',value:'^正式.{1,20}$'}],logic:'and',unknown:'block'}};s.workflow.rules=[r];
function out(){return executeWorkflow(s,doc,demoAuthority('all-pass'));}function check(){return out().checks.find(c=>c.rule===r.id);}
`;
function scenario(name,code){test(name,()=>full()(setup+code));}
scenario('明确自然语言保留原始量词并解析匹配与不匹配',`
 for(const [text,op,pattern] of [['发布主题匹配正则 ^正式.{1,20}$','matches','^正式.{1,20}$'],['发布主题不匹配正则 ^测试','notMatches','^测试']]){
  const a=sceneRuleIntentAnalyze(s,text);assert.equal(a.assertions.length,1);assert.equal(a.assertions[0].op,op);assert.equal(a.assertions[0].value,pattern);assert.equal(a.assertions[0].flags,'');assert.equal(a.references[0].path,'ReleaseOrder.releaseSubject');assert.equal(a.references[0].source,'order.releaseSubject');assert.equal(a.scope,'main');assert.equal(a.unsupported.length,0);assert.equal(a.clarifications.length,0,a.clarifications.join(';'));
 }
`);
scenario('前置条件与后续AND条款不破坏正则字符组量词或逻辑字符',`
 const a=sceneRuleIntentAnalyze(s,'当发布区域等于欧洲时，发布主题匹配正则 ^[OR或且,，()+*/]{1,20}$且发布主题不能为空');
 assert.equal(a.conditions.length,1);assert.equal(a.assertions.length,2);assert.equal(a.assertions[0].value,'^[OR或且,，()+*/]{1,20}$');assert.equal(a.assertions[1].op,'exists');assert.equal(a.unsupported.length,0);assert.equal(a.clarifications.length,0,a.clarifications.join(';'));
 const b=sceneRuleIntentAnalyze(s,'发布主题匹配正则 ^OR.*$，否则拦截提交');assert.equal(b.assertions[0].value,'^OR.*$');assert.equal(b.message,'否则拦截提交');assert.equal(b.unsupported.length,0);
`);
scenario('正则条件也保留未知阻断和明确条件边界',`
 const a=sceneRuleIntentAnalyze(s,'当发布主题匹配正则 ^正式.{1,20}$时，发布区域等于欧洲');assert.equal(a.conditions.length,1);assert.equal(a.conditions[0].op,'matches');assert.equal(a.conditions[0].value,'^正式.{1,20}$');assert.equal(a.assertions.length,1);assert.equal(a.unsupported.length,0);assert.equal(a.clarifications.length,0,a.clarifications.join(';'));
`);
scenario('正则支持新增动态映射属性而非固定发布主题',`
 const o={id:'RegexEntity',name:'验码对象',props:[{id:'code',name:'校验编码',type:'文本'}]};objects.push(o);objectReleaseStore.set(o.id,{latest:'v1.0.0',history:[{version:'v1.0.0',object:structuredClone(o)}]});s.ontologyVersions[o.id]='v1.0.0';s.workflow.blocks.main.fields.push({key:'validationCode',label:'动态编码',type:'文本'});s.bindings.main.push({target:scenePrefix(s,'main')+'validationCode',ontology:'RegexEntity.code'});
 const a=sceneRuleIntentAnalyze(s,'验码对象校验编码不匹配正则 ^[0-9]{3}$');assert.equal(a.references[0].path,'RegexEntity.code');assert.equal(a.references[0].source,'order.validationCode');assert.equal(a.assertions[0].op,'notMatches');assert.equal(a.unsupported.length,0);
 s.bindings.main=s.bindings.main.filter(b=>b.ontology!=='RegexEntity.code');const bad=sceneRuleIntentAnalyze(s,'验码对象校验编码匹配正则 ^A$');assert(bad.unsupported.length||bad.blockingClarifications.length);assert(!bad.references.some(x=>x.path==='RegexEntity.code'));
`);
scenario('普通引号比较含正则词语不改变旧op和文本值',`
 const a=sceneRuleIntentAnalyze(s,'发布主题等于“匹配正则 OR [a,b]”');assert.equal(a.assertions.length,1);assert.equal(a.assertions[0].op,'eq');assert.equal(a.assertions[0].value,'匹配正则 OR [a,b]');assert.equal(a.unsupported.length,0);
 const b=sceneRuleIntentAnalyze(s,'发布主题匹配正则 ^发布!$');assert.equal(b.assertions[0].value,'^发布!$');assert.equal(b.unsupported.length,0);
`);
scenario('原始反斜杠转义不被转为字段引用或算术表达式',`
 const pattern=String.raw\`^正式\\d{1,20}\\.$\`,a=sceneRuleIntentAnalyze(s,'发布主题匹配正则 '+pattern);assert.equal(a.assertions[0].value,pattern);assert(!a.assertions[0].valueReference);assert.equal(a.unsupported.length,0);doc.mainOrder.releaseSubject='正式12.';r.ruleCard.assertions=a.assertions.map(x=>({...x,reference:ref.id}));assert.equal(check().status,'通过');
`);
scenario('不支持与非法正则语法留在unsupported不能静默保存',`
 for(const pattern of ['[','(','(?=a)a','(a|aa)+$','^a|b$','a{2,1}','/abc/i','']){
  const a=sceneRuleIntentAnalyze(s,'发布主题匹配正则 '+pattern);assert(a.unsupported.length||a.blockingClarifications.length,pattern);assert(a.clarifications.length,pattern);
 }
 const logical=sceneRuleIntentAnalyze(s,'发布主题匹配正则 ^正式$ 或 发布区域等于欧洲');assert(logical.unsupported.length,'真正的OR必须阻断');
`);
scenario('匹配与不匹配使用RegExp.test语义且无状态污染',`
 doc.mainOrder.releaseSubject='正式发布';assert.equal(sceneRuleCardValidate(s,r),'');assert.equal(check().status,'通过');doc.mainOrder.releaseSubject='测试发布';assert.equal(check().status,'阻断');r.ruleCard.assertions[0]={reference:ref.id,op:'notMatches',value:'^测试'};assert.equal(check().status,'阻断');doc.mainOrder.releaseSubject='正式测试发布';assert.equal(check().status,'通过');for(let i=0;i<3;i++)assert.equal(check().status,'通过');
`);
scenario('可选flags严格校验并支持大小写多行Unicode',`
 r.ruleCard.assertions[0].value='^formal$';doc.mainOrder.releaseSubject='FORMAL';assert.equal(check().status,'阻断');r.ruleCard.assertions[0].flags='i';assert.equal(check().status,'通过');assert.equal(check().evidence[0].flags,'i');r.ruleCard.assertions[0].flags='m';doc.mainOrder.releaseSubject='标题\\nformal';assert.equal(check().status,'通过');r.ruleCard.assertions[0].flags='u';r.ruleCard.assertions[0].value='^.$';doc.mainOrder.releaseSubject='😀';assert.equal(check().status,'通过');
 for(const flags of ['g','y','ii','z',null,12]){r.ruleCard.assertions[0].flags=flags;assert.match(sceneRuleCardValidate(s,r),/flags|标志/);assert.equal(check().status,'未知');}
`);
scenario('空值与类型错误对两种正则状态一律未知阻断',`
 r.level='警告';for(const op of ['matches','notMatches'])for(const value of [null,undefined,'','  ',1,false,[],{},['正式发布']]){r.ruleCard.assertions[0].op=op;doc.mainOrder.releaseSubject=value;const result=out(),c=result.checks.find(c=>c.rule===r.id);assert.equal(c.status,'未知');assert.equal(c.level,'阻断');assert.equal(result.passed,false);}
`);
scenario('非法pattern和非字符串pattern验证错误执行未知',`
 doc.mainOrder.releaseSubject='正式发布';for(const pattern of ['[','a{3,2}','\\\\',null,12,{},'']){r.ruleCard.assertions[0].value=pattern;assert.match(sceneRuleCardValidate(s,r),/正则/);assert.equal(check().status,'未知');}
`);
scenario('仅文本兼容字段且禁止valueReference',`
 const refs=new Map([[ref.id,ref],['other',{...ref,id:'other'}]]);r.ruleCard.assertions[0].valueReference='other';assert.match(sceneRuleCardClauseIssue(r.ruleCard.assertions[0],refs),/比较字段|valueReference/);
 for(const type of ['数字','日期','布尔','集合'])assert.match(sceneRuleCardClauseIssue({reference:ref.id,op:'matches',value:'^a$'},new Map([[ref.id,{...ref,type}]])),/文本/);
 for(const type of ['文本','string','text','枚举','引用'])assert.equal(sceneRuleCardClauseIssue({reference:ref.id,op:'matches',value:'^a$'},new Map([[ref.id,{...ref,type}]])),'');
`);
scenario('显著危险pattern及超限输入在执行前拒绝',`
 doc.mainOrder.releaseSubject='a'.repeat(2000)+'!';for(const pattern of ['(a+)+$','(a|aa)+$','a*a*$','.*.*x','a{1000000}','a{1,1000000}','a'.repeat(257),String.raw\`(a)\\1\`]){r.ruleCard.assertions[0].value=pattern;assert.match(sceneRuleCardValidate(s,r),/正则|安全|长度|重复/);assert.equal(check().status,'未知');}
 r.ruleCard.assertions[0].value='^a+$';doc.mainOrder.releaseSubject='a'.repeat(2049);assert.equal(check().status,'未知');assert.match(check().detail,/长度|2048/);doc.mainOrder.releaseSubject='a'.repeat(2048);assert.equal(check().status,'通过');
`);
scenario('比较辅助函数不能绕过正则校验或隐式转换',`
 for(const [value,clause,type] of [['a',{op:'matches',value:'['},'文本'],['a',{op:'notMatches',value:'(a+)+$'},'文本'],[1,{op:'notMatches',value:'1'},'数字'],['a',{op:'matches',value:'a',valueReference:'other'},'文本']]){const c=sceneRuleCardCompare(value,clause,clause.value,type);assert.equal(c.unknown,true);assert.equal(c.pass,false);}
`);
scenario('pattern仅作为数据不执行JS且字符组中的危险字符不误杀',`
 globalThis.regexExecuted=false;doc.mainOrder.releaseSubject='globalThis.regexExecuted=true';r.ruleCard.assertions[0].value='globalThis.regexExecuted=true';assert.equal(check().status,'通过');assert.equal(globalThis.regexExecuted,false);
 r.ruleCard.assertions[0].value='^[()|+*]{1,10}$';doc.mainOrder.releaseSubject='()+*|';assert.equal(sceneRuleCardValidate(s,r),'');assert.equal(check().status,'通过');
`);
scenario('旧op与regex可共存，条件不满足跳过未知条件阻断',`
 r.ruleCard.conditions=[{reference:ref.id,op:'startsWith',value:'正式'}];r.ruleCard.assertions.push({reference:ref.id,op:'contains',value:'发布'});doc.mainOrder.releaseSubject='正式发布';assert.equal(check().status,'通过');doc.mainOrder.releaseSubject='测试发布';assert.equal(check().status,'跳过');doc.mainOrder.releaseSubject=null;assert.equal(check().status,'未知');r.ruleCard.conditions=[{reference:ref.id,op:'notMatches',value:'^测试'}];doc.mainOrder.releaseSubject='测试发布';assert.equal(check().status,'跳过');
`);
scenario('接口返回空值或类型错误仍为未知且不会把HTTP成功视为匹配',`
 const capability={id:'regex.context',name:'正则接口夹具',object:'Context',connector:'pis',params:[],maps:[{source:'raw',target:'Context.regexText',sourceType:'文本'}]};capabilities.push(capability);r.ruleCard.mappingScope=undefined;r.ruleCard.references=[{id:ref.id,path:'Context.regexText',property:'regexText',name:'返回文本',type:'文本',kind:'business-context',query:'regex-query',output:'regexText'}];r.ruleCard.queries=[{id:'regex-query',capability:capability.id,params:[],output:'regexText',type:'文本'}];const beforeCall=callCapability;let value;callCapability=(id,params,...rest)=>id===capability.id?{ok:true,normalized:{regexText:value}}:beforeCall(id,params,...rest);r.level='警告';
 for(const op of ['matches','notMatches'])for(const actual of [null,undefined,'',12,false,[],{}]){value=actual;r.ruleCard.assertions[0].op=op;const result=out(),c=result.checks.find(c=>c.rule===r.id);assert.equal(c.status,'未知');assert.equal(c.level,'阻断');assert.equal(result.passed,false);}value='测试发布';r.ruleCard.assertions[0].op='notMatches';r.ruleCard.assertions[0].value='^测试';assert.equal(check().status,'阻断');
`);
scenario('危险flags与未支持转义自然语言不能静默降级',`
 for(const pattern of [String.raw\`^\\p{L}+$\`,String.raw\`^\\u{1F600}$\`,String.raw\`^\\q$\`,'a++','a{1,2}?','^a{1000}b{1000}c{1000}$']){r.ruleCard.assertions[0].value=pattern;assert(sceneRuleCardValidate(s,r),pattern);const a=sceneRuleIntentAnalyze(s,'发布主题匹配正则 '+pattern);assert(a.unsupported.length||a.blockingClarifications.length,pattern);}
`);
scenario('保存后raw pattern flags及映射快照完整且运行时重新验证映射',`
 const a=sceneRuleIntentAnalyze(s,'发布主题匹配正则 ^正式.{1,20}$');a.assertions[0].flags='u';const compiled=workflowRuleAuthoringCompile(s,{originalText:a.text,scope:a.scope,card:a});const saved=JSON.parse(JSON.stringify(compiled));assert.equal(saved.ruleCard.assertions[0].value,'^正式.{1,20}$');assert.equal(saved.ruleCard.assertions[0].flags,'u');assert.equal(saved.ruleCard.references[0].path,'ReleaseOrder.releaseSubject');assert.equal(saved.ruleCard.references[0].source,'order.releaseSubject');assert.equal(saved.ruleCard.mappingScope,'scene-bindings');assert.equal(saved.enabled,false);assert.equal(saved.ruleCard.unknown,'block');assert.equal(sceneRuleCardValidate(s,saved),'');s.workflow.rules=[{...saved,id:r.id,enabled:true}];doc.mainOrder.releaseSubject='正式发布';assert.equal(check().status,'通过');s.bindings.main=s.bindings.main.filter(b=>b.ontology!=='ReleaseOrder.releaseSubject');assert.match(sceneRuleCardValidate(s,saved),/映射/);assert.equal(check().status,'未知');
`);
