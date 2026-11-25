/* 用户侧功能调用记录。平台配置追踪仍在内部缓冲中，运行页和导出只读取这里的调用记录。 */
'use strict';
const runtimeRecords=[];
let runtimeRecordSequence=0,runtimeInvocationDepth=0;
const runtimeOperations={
  'app-run-qa':'智能问答',
  'workflow-run-qa':'智能问答',
  'workflow-generate':'生成填写建议',
  'workflow-run':'业务校验',
  'workflow-submit':'业务提交',
  'app-run-validation':'业务校验',
  'app-run-other':'运行应用功能',
  'app-execute-collaboration':'执行业务协同'
};
function runtimeRecordStatus(result){if(result.status)return result.status;if(result.errors?.length)return '失败';if(result.found===false)return '未找到结果';if(result.found===true)return '已回答';if(result.passed===false)return '阻断';if(result.passed===true)return '通过';if(result.ok===false)return '失败';return '成功';}
function runtimeRecordColor(status){if(/失败|错误|阻断|冲突/.test(status))return 'red';if(/成功|通过|完成|满足|已回答|无需处理/.test(status))return 'green';return 'amber';}
function runtimeRecordInput(action,draft){
  if(['workflow-generate','workflow-run','workflow-submit'].includes(action)){
    let document=draft.documentText;try{document=JSON.parse(document);}catch{}
    return {document,event:action==='workflow-generate'?'生成建议':action==='workflow-submit'?'submit':draft.event,preset:draft.preset};
  }
  return structuredClone(draft);
}
function runtimeRecordAdd(action,s,input,result){
  const meta=sceneReleaseEnsure(s),type=workflowScene(s).type,operation=action==='app-run-other'?({impact:'影响分析',recommendation:'方案推荐',collaboration:'生成协同处理计划'})[type]||runtimeOperations[action]:runtimeOperations[action];
  const at=sceneReleaseTime(),status=runtimeRecordStatus(result),record={id:`CALL-${++runtimeRecordSequence}`,kind:'user-invocation',time:at,title:s.name,sceneId:s.id,applicationType:type,applicationLabel:applicationTypes[type]?.title||type,operation,source:'用户侧功能调用（本地模拟）',caller:input.persona==='projectA'?'演示用户 · 项目 A':input.persona==='projectB'?'演示用户 · 项目 B':'演示用户',configState:meta.status,configVersion:meta.status==='已发布'?meta.published:meta.published+1,status,detail:operation,input:runtimeRecordInput(action,input),output:structuredClone(result)};
  if(type==='qa'&&typeof result.answer==='string'){
    sceneReleaseCaptureQA(record,s,input.question||'',result,input);
    record.qaAnswer.at=at;
  }
  runtimeRecords.unshift(record);return record;
}
// 在功能执行入口采集，一次用户调用生成一条记录；内部取数作为证据，不单独堆入列表。
for(const [action]of Object.entries(runtimeOperations)){
  const original=actionsMap[action];if(!original)continue;
  actionsMap[action]=function(el){
    const s=scene(),drawer=state.drawer,input=structuredClone(drawer?.draft||{}),previous=drawer?.result,outer=runtimeInvocationDepth===0;
    runtimeInvocationDepth++;
    try{
      const value=original(el),result=drawer?.result;
      if(outer&&s&&result&&result!==previous&&!drawer.error)runtimeRecordAdd(action,s,input,result);
      return value;
    }catch(error){
      if(outer&&s)runtimeRecordAdd(action,s,input,{status:'失败',answer:'本次功能执行失败',error:String(error?.message||error)});
      throw error;
    }finally{runtimeInvocationDepth--;}
  };
}
function runtimeRecordsPage(){
  return header('运行记录','记录用户侧调用本体平台能力完成业务功能时的输入、输出和执行结果。',btn('导出运行记录','export-logs','','download'),'用户侧功能调用')+`<section class="panel"><div class="filterbar"><h3 class="fill">用户侧调用</h3><span class="muted tiny">${runtimeRecords.length} 条记录 · 刷新后重置</span></div><div class="panel-body">${inf('这里记录问答、智能提单、校验、影响分析、方案推荐和业务协同等功能调用。配置编辑、检查、发布、修订和后台测试不进入此列表。')}</div>${runtimeRecords.length?`<div class="table-wrap"><table class="config-table runtime-record-table"><thead><tr><th>调用时间</th><th>应用场景</th><th>调用功能</th><th>结果</th><th>使用的配置</th><th>详情</th></tr></thead><tbody>${runtimeRecords.map((r,i)=>`<tr><td><span class="tiny">${esc(r.time)}</span><small class="field-path">${esc(r.id)}</small></td><td class="field-name">${esc(r.title)}<small>${esc(r.applicationLabel)}</small></td><td>${esc(r.operation)}</td><td>${pill(r.status,runtimeRecordColor(r.status))}</td><td><span class="tiny">v${r.configVersion} · ${esc(r.configState)}</span></td><td>${btn(r.qaAnswer?'查看 AI 回答':'查看执行结果',r.qaAnswer?'runtime-view-answer':'runtime-view-result','sm','eye',`data-index="${i}"`)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">${icon('clock')}<b>还没有用户侧调用记录</b>在应用场景中体验一次问答、校验或其他业务功能后，可在这里查看结果。<div class="section-gap">${btn('前往应用场景','runtime-go-scenes','','play')}</div></div>`}</section><p class="session-note">当前通过场景功能体验模拟用户侧调用，未采集真实用户日志。配置版本变化请在各场景的“版本记录”中查看。</p>`;
}
function runtimeResultDrawer(){
  const r=state.drawer.record,o=r.output;let result='';
  if(o.answer)result=applicationResultHTML(o).replace(/<button\b[^>]*>[\s\S]*?<\/button>/g,'');
  else if(o.checks)result=o.checks.map(c=>`<div class="result-card ${c.status==='通过'||c.status==='跳过'?'pass':'fail'}"><div class="between"><b>${esc(c.name)}</b>${pill(c.status,runtimeRecordColor(c.status))}</div><p>${esc(c.detail)}</p></div>`).join('');
  else if(o.suggestions)result=`<div class="table-wrap"><table><thead><tr><th>填入位置</th><th>原有内容</th><th>建议内容</th><th>处理结果</th></tr></thead><tbody>${o.suggestions.map(s=>`<tr><td><code>${esc(s.target)}</code></td><td>${esc(s.current)}</td><td>${esc(s.suggested)}</td><td>${esc(s.status)}</td></tr>`).join('')}</tbody></table></div>`;
  return frame('用户侧功能执行结果',`${esc(r.title)} · ${esc(r.operation)}`,`<dl class="kv"><dt>调用时间</dt><dd>${esc(r.time)}</dd><dt>调用来源</dt><dd>${esc(r.source)}</dd><dt>调用用户</dt><dd>${esc(r.caller)}</dd><dt>使用配置</dt><dd>v${r.configVersion} · ${esc(r.configState)}</dd><dt>执行结果</dt><dd>${pill(r.status,runtimeRecordColor(r.status))}</dd></dl>${o.error?`<div class="section-gap">${inf(esc(o.error),'red')}</div>`:''}${o.errors?.length?`<div class="section-gap">${inf(o.errors.map(esc).join('；'),'red')}</div>`:''}<div class="section-gap">${result}</div><details class="plain-details section-gap"><summary>查看本次调用的输入与返回数据</summary>${jsonView({input:r.input,output:r.output})}</details>`,'',true);
}
function runtimeRecordsExportData(){return {scope:'user-side-invocations',prototype:true,records:structuredClone(runtimeRecords)};}
extraDrawers.runtimeResult=runtimeResultDrawer;
Object.assign(actionsMap,{
  'runtime-view-answer':el=>{const record=runtimeRecords[Number(el.dataset.index)];if(record?.qaAnswer)openDrawer('sceneQAAnswer',{}, {record:structuredClone(record),readonly:true});},
  'runtime-view-result':el=>{const record=runtimeRecords[Number(el.dataset.index)];if(record)openDrawer('runtimeResult',{}, {record:structuredClone(record),readonly:true});},
  'runtime-go-scenes':()=>navigate('scenes'),
  'export-logs':()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(runtimeRecordsExportData(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='本体平台-用户侧功能调用记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出用户侧功能调用记录');}
});
pages.runs=runtimeRecordsPage;
render();
