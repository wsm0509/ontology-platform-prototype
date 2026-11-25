/* 平台知识问答的本地语料与检索。 */
'use strict';

const projectKnowledgeSamples = [
  {id:'project-start', library:'项目管理知识库', title:'项目立项指南', version:'v1.0', section:'立项材料与评审', terms:['立项','项目启动','项目目标','立项评审'], text:'立项时先明确项目目标、交付范围、里程碑、负责人和资源需求。提交立项评审后，以获批版本建立项目基线。'},
  {id:'project-change', library:'项目管理知识库', title:'项目变更管理规范', version:'v1.0', section:'变更申请与影响评估', terms:['变更','调整计划','范围调整','延期'], text:'项目范围、计划或资源发生变化时，登记变更原因、影响和处理建议。审批通过后更新项目基线，并通知受影响的成员。'},
  {id:'project-risk', library:'项目管理知识库', title:'项目风险管理指南', version:'v1.0', section:'风险登记与跟踪', terms:['风险','风险登记','风险上报','风险跟踪'], text:'在项目风险台账登记风险描述、影响、责任人和应对措施。定期复查风险状态，达到升级条件时提交项目负责人处理。'},
  {id:'project-acceptance', library:'项目管理知识库', title:'项目验收与收尾指引', version:'v1.0', section:'验收材料与收尾', terms:['验收','交付验收','结项','收尾'], text:'验收前对照立项与获批变更核对交付清单，准备验收报告、测试证据及遗留问题清单。确认验收结论后归档交付物和决策记录。'},
  {id:'project-a-milestone', library:'项目管理知识库', title:'项目 A 里程碑纪要', version:'v1.0', section:'下一阶段计划', project:'PRJ-2026-A', terms:['里程碑','项目进展','下一阶段','进度'], text:'项目 A 的下一阶段里程碑为完成整机样件验证和资料评审。'},
  {id:'project-b-milestone', library:'项目管理知识库', title:'项目 B 里程碑纪要', version:'v1.0', section:'下一阶段计划', project:'PRJ-2026-B', terms:['里程碑','项目进展','下一阶段','进度'], text:'项目 B 的下一阶段里程碑为完成软件联调和试制验收。'}
];

// Register the project material through the same object and document catalogs as other knowledge.
objects.push(sharedObject('Project','项目','项目立项、风险、变更、验收与里程碑的知识入口。',[
  prop('项目编码','projectCode','文本','项目管理平台','Project.projectCode','PRJ-2026-A',{key:true}),
  prop('项目名称','projectName','文本','项目管理平台','Project.projectName','项目 A',{display:true})
]));
for(const sample of projectKnowledgeSamples){
  const doc={...sample,objects:[['Project','项目',['projectCode','projectName']]],relations:[]};
  knowledgeDocuments.push(doc);
  knowledgeLinks.push({scope:'object',documentId:doc.id,library:doc.library,title:doc.title,version:doc.version,objects:['Project'],purpose:'项目管理知识及项目记录依据'});
}

const platformKnowledgeExamples = [
  ['start','项目立项需要准备什么？'],
  ['risk','风险怎么登记和跟踪？'],
  ['cross','项目变更和验收分别有哪些要求？'],
  ['milestone','项目 A 下一阶段里程碑是什么？']
];

function platformKnowledgeCorpus(config) {
  return knowledgeDocuments.filter(doc =>
    (!config.qaLibrary || config.qaLibrary==='ALL' || doc.library===config.qaLibrary) &&
    (!doc.project || config.qaProject==='ALL' || doc.project===config.qaProject)
  );
}

function platformKnowledgeLibraries() {
  return [['ALL','全部知识库'], ...[...new Set(platformKnowledgeCorpus({qaProject:'ALL'}).map(doc=>doc.library))].map(library=>[library,library])];
}

function platformKnowledgeAnswer(config, input, documents) {
  const scope = '项目管理平台 · '+(config.qaLibrary==='ALL'||!config.qaLibrary?'全部知识库':config.qaLibrary);
  const question = String(input.question||'').trim();
  if (!question) return {status:'需要输入',answer:'请输入一个项目管理知识问题。',scope};
  const project = input.persona==='projectA'?'PRJ-2026-A':input.persona==='projectB'?'PRJ-2026-B':'';
  const requested = [...question.matchAll(/项目\s*([A-Z])(?![A-Za-z0-9])|PRJ-2026-([AB])(?![A-Za-z0-9-])/gi)]
    .map(match=>'PRJ-2026-'+(match[1]||match[2]).toUpperCase());
  if (!project || (config.qaProject!=='ALL'&&config.qaProject!==project) || requested.some(id=>id!==project)) {
    return {status:'范围外',answer:'当前问答范围与演示用户的项目权限不匹配。',scope};
  }
  const text = question.toLowerCase();
  const generic = new Set(['项目','管理','需要','什么','哪些','怎么','如何','要求','平台','流程','准备','请问','分别','知识']);
  const terms = [...new Set([...new Intl.Segmenter('zh',{granularity:'word'}).segment(text)]
    .filter(part=>part.isWordLike&&part.segment.length>1&&!generic.has(part.segment))
    .map(part=>part.segment))];
  const matches = documents
    .filter(doc=>!doc.project||doc.project===project)
    .map(doc=>{
      const title = doc.title.replace(/\.[^.]+$/,'');
      const topics = doc.terms || [...new Set([title,...(doc.objects||[]).map(([,name])=>name)])];
      const topicScore = topics.filter(term=>text.includes(term.toLowerCase())).length;
      const content = [title,doc.section,doc.text].join(' ').toLowerCase();
      const termScore = doc.terms?0:terms.filter(term=>content.includes(term)).length;
      const score = (text.includes(title.toLowerCase())?10:0) + 3*topicScore + (termScore>=2?termScore:0);
      return {doc,score};
    })
    .filter(hit=>hit.score>0)
    .sort((left,right)=>right.score-left.score)
    .slice(0,4);
  if (!matches.length) return {status:'无匹配证据',answer:'当前可访问的知识库中没有匹配内容。请提供更具体的业务主题或文档名称。',scope};
  const evidence = matches.map(({doc})=>({
    type:'规范段落', documentId:doc.id, source:doc.title, library:doc.library, version:doc.version,
    location:doc.section, value:doc.text
  }));
  return {status:'已回答',intent:'platform-knowledge',scope,answer:evidence.map(item=>item.value).join('\n'),evidence};
}

function platformKnowledgeDemo() {
  const d=state.drawer;
  return frame('项目管理平台知识问答','按当前用户权限检索所选知识库，可跨流程提问。',`
    <div class="form-grid">
      ${field('演示用户权限','persona',d.draft.persona,'select',[['projectA','仅可访问项目 A'],['projectB','仅可访问项目 B']])}
      ${field('问题','question',d.draft.question,'textarea',[],null,true)}
    </div>
    <div class="application-question-list section-gap">${platformKnowledgeExamples.map(([id,label])=>btn(esc(label),'app-qa-example','sm','',`data-id="${id}"`)).join('')}</div>
    <div class="row section-gap">${btn('查询并回答','app-run-qa','primary','chat')}</div>
    ${applicationResultHTML(d.result)}`,'',true);
}

const platformKnowledgeTemplate = {
  id:'platform_knowledge', kind:'knowledge', name:'项目管理平台 · 知识问答',
  app:'项目管理平台', version:'V1', description:'检索项目管理及已接入的知识库，覆盖立项、变更、风险、验收等主题。',
  names:{}, bindings:{}, context:{}, revision:1, lastResult:null,
  workflow:{
    type:'qa', blocks:{}, rules:[], instanceSource:'system',
    qa:{objects:[],fields:[],knowledge:'全部知识库'},
    application:{...appConfigDefaults('qa'),qaScope:'platform',qaProject:'ALL',qaLibrary:'ALL'}
  }
};
sceneTemplates.platform_knowledge=structuredClone(platformKnowledgeTemplate);
appScenes.platform_knowledge=structuredClone(platformKnowledgeTemplate);
