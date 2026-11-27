const test=require('node:test'),fs=require('node:fs'),path=require('node:path');const {workspace}=require('./workspace.cjs');
function full(){const run=workspace(),loaded=new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);for(const[,f]of fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').matchAll(/src="([^"?]+)\?/g))if(!loaded.has(f))run(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));return run;}
const editing=`selectScene('release','actions');actionsMap['scene-release-edit']({dataset:{id:'release'}});`;
const edit=(stage='input',branch)=>`actionsMap['scene-flow-inline-edit']({dataset:{stage:'${stage}'${branch?`,branch:'${branch}'`:''}}});`;
const change=(key,value)=>`dispatchTestEvent('input',{dataset:{flowInlineField:'${key}'},value:${JSON.stringify(value)}});`;
test('每阶段仅一个编辑入口，数据单元格不重复按钮；每分支行仅一个编辑',()=>full()(`
 selectScene('release','actions');const s=scene(),before=sceneFlowFingerprint(s);for(const[stage]of sceneFlowDisplayStages){const html=sceneFlowStageDetailHTML(s,stage);assert.equal((html.match(/data-action="scene-flow-inline-edit"/g)||[]).length,1);for(const cell of html.match(/<td[^>]*>[\\s\\S]*?<[/]td>/g)||[])assert(!cell.includes('data-action='));assert(!html.includes('data-focusfield'));assert(!html.includes('data-action="scene-flow-edit-stage"'));}
 assert(!sceneFlowBranchesHTML(s,'all').includes('data-flow-branch='));s.workflow.flow={branchSelections:Object.fromEntries(sceneFlowStages.map(([stage])=>[stage,sceneFlowBranchRows(s).filter(([id])=>sceneFlowBranchStage(id)===stage).map(([id])=>id)]))};const configured=sceneFlowFingerprint(s),html=sceneFlowBranchesHTML(s,'all');for(const[id]of sceneFlowBranchRows(s)){const row=html.split('<tr data-flow-branch="'+id+'">')[1].split('</tr>')[0];assert.equal((row.match(/data-action="scene-flow-inline-edit"/g)||[]).length,1,id);assert(!row.includes('data-action="scene-flow-edit-stage"'));}assert.equal(sceneFlowFingerprint(s),configured);
`));
test('阶段点击编辑直接表格输入不弹窗，输入不重绘，保存全部定义并记录版本',()=>full()(editing+edit('recognize')+`
 const s=scene(),before=sceneFlowFingerprint(s),e=sceneFlowUI.editor;assert(e);assert.equal(state.drawer,null);const html=sceneFlowStageDetailHTML(s,'recognize');for(const key of ['eventDescription','systemAction','noMatchPrompt','nextStep'])assert(html.includes('data-flow-inline-field="'+key+'"'));assert(html.includes('scene-flow-inline-save'));assert(html.includes('scene-flow-inline-cancel'));let renders=0;const oldRender=render;render=()=>renders++;
`+change('eventDescription','用户输入采购申请')+change('systemAction','解析采购物料和申请数量')+change('noMatchPrompt','请描述采购需求')+change('nextStep','信息完整后确认表单')+`
 assert.equal(renders,0);render=oldRender;assert(e.dirty);assert.equal(sceneFlowFingerprint(s),before);actionsMap['scene-flow-inline-save']();assert.equal(sceneFlowUI.editor,null);assert.equal(state.drawer,null);assert.equal(s.workflow.flow.stages.recognize.systemAction,'解析采购物料和申请数量');assert(sceneFlowStageDetailHTML(s,'recognize').includes('采购申请'));assert(sceneReleaseEnsure(s).history.some(h=>h.action==='保存草稿'));
`));
test('分支在同一行一次编辑五项，取消不保存，保存与重开一致',()=>full()(editing+edit('check','blocked')+`
 const s=scene(),before=sceneFlowFingerprint(s);assert.equal(state.drawer,null);const e=sceneFlowUI.editor;const html=sceneFlowBranchesHTML(s).split('<tr data-flow-branch="blocked">')[1].split('</tr>')[0];for(const key of ['triggerDescription','systemAction','question','guide','continueCondition']){assert(html.includes('data-flow-inline-field="'+key+'"'));dispatchTestEvent('input',{dataset:{flowInlineField:key},value:'业务 '+key});}actionsMap['scene-flow-inline-cancel']();assert.equal(sceneFlowUI.editor,null);assert.equal(sceneFlowFingerprint(s),before);
`+edit('check','blocked')+`
 for(const key of ['triggerDescription','systemAction','question','guide','continueCondition'])dispatchTestEvent('input',{dataset:{flowInlineField:key},value:'业务 '+key});actionsMap['scene-flow-inline-save']();assert.equal(state.drawer,null);assert.equal(s.workflow.flow.branches.blocked.guide,'业务 guide');
`+edit('check','blocked')+`
 assert.equal(sceneFlowUI.editor.draft.question,'业务 question');actionsMap['scene-flow-inline-cancel']();
`));
test('就地保存验证长度类型与字段白名单，错误留在当前行且取消仍可用',()=>full()(editing+`
 for(const[key,value]of [['nextStep',''],['systemAction',8],['eventDescription','x'.repeat(801)],['safety','off']]){actionsMap['scene-flow-inline-edit']({dataset:{stage:'input'}});const before=sceneFlowFingerprint(scene());sceneFlowUI.editor.draft[key]=value;actionsMap['scene-flow-inline-save']();assert(sceneFlowUI.editor.error,key);assert.equal(sceneFlowFingerprint(scene()),before);assert.equal(state.drawer,null);actionsMap['scene-flow-inline-cancel']();assert.equal(sceneFlowUI.editor,null);}
`));
test('就地编辑草稿有权限归属和指纹保护，不得保存到另一场景',()=>full()(editing+`
 const s=scene();for(const mutation of ['scene','block','permission','fingerprint','owner']){selectScene('release','actions');s.selectedBlock='main';sceneReleaseEnsure(s).editing=true;actionsMap['scene-flow-inline-edit']({dataset:{stage:'input'}});sceneFlowUI.editor.draft.nextStep='不得错写';if(mutation==='scene')selectScene('trial');if(mutation==='block')s.selectedBlock='items';if(mutation==='permission')sceneReleaseEnsure(s).editing=false;if(mutation==='fingerprint')s.workflow.action+='变更';if(mutation==='owner')sceneFlowUI.editor={...sceneFlowUI.editor};const before=JSON.stringify(s.workflow);sceneFlowInlineSave();assert.equal(JSON.stringify(s.workflow),before);assert(sceneFlowUI.editor.error);assert.equal(state.drawer,null);actionsMap['scene-flow-inline-cancel']();}
`));
test('未保存输入不因切换阶段或打开体验而丢失，先保存或取消',()=>full()(editing+edit()+change('systemAction','尚未保存的新处理')+`
 const e=sceneFlowUI.editor,stage=sceneFlowUI.stage;actionsMap['scene-flow-stage']({dataset:{stage:'review'}});assert.equal(sceneFlowUI.stage,stage);assert.equal(sceneFlowUI.editor,e);assert(e.error);actionsMap['scene-flow-open']();assert.equal(state.drawer,null);assert.equal(e.draft.systemAction,'尚未保存的新处理');actionsMap['scene-flow-inline-cancel']();actionsMap['scene-flow-stage']({dataset:{stage:'review'}});assert.equal(sceneFlowUI.stage,'finish');
`));
test('旧分支追问来源在整阶段就地编辑保持一致，不因其它列修改遮住',()=>full()(editing+`
 const s=scene();s.workflow.flow={branches:{blocked:{question:'旧分支追问',guide:'旧处理'}}};
`+edit('check')+`
 const e=sceneFlowUI.editor;assert.equal(e.draft.blockerPrompt,'旧分支追问');dispatchTestEvent('input',{dataset:{flowInlineField:'eventDescription'},value:'只改发生什么'});actionsMap['scene-flow-inline-save']();assert.equal(s.workflow.flow.branches.blocked.question,'旧分支追问');sceneFlowInlineEdit({dataset:{stage:'prepare'}});assert.equal(sceneFlowUI.editor.draft.blockerPrompt,'旧分支追问');assert(sceneFlowStageDetailHTML(s,'prepare').includes('旧分支追问'));sceneFlowInlineCancel();assert(sceneFlowBusinessExampleHTML(s).includes('旧分支追问'));
`+edit('check')+change('blockerPrompt','整阶段改后追问')+`
 actionsMap['scene-flow-inline-save']();assert.equal(sceneFlowStageConfig(s,'check').blockerPrompt,'整阶段改后追问');assert.equal(s.workflow.flow.branches.blocked.question,'整阶段改后追问');sceneFlowInlineEdit({dataset:{stage:'prepare'}});assert.equal(sceneFlowUI.editor.draft.blockerPrompt,'整阶段改后追问');assert(sceneFlowStageDetailHTML(s,'prepare').includes('整阶段改后追问'));sceneFlowInlineCancel();assert(sceneFlowBusinessExampleHTML(s).includes('整阶段改后追问'));actionsMap['scene-flow-open']();actionsMap['scene-flow-example']({dataset:{id:'missing-image'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();actionsMap['scene-flow-validate']();assert(state.drawer.flow.history.some(h=>h.text==='整阶段改后追问'));
`));
test('未保存行内草稿不能完成编辑、检查发布或跳版本记录导致丢失',()=>full()(editing+edit('review')+change('nextStep','必须保存的新定义')+`
 const s=scene(),m=sceneReleaseEnsure(s),e=sceneFlowUI.editor;for(const action of ['scene-release-edit','scene-release-check','scene-release-history','scene-release-open','scene-release-prepare','scene-release-publish','scene-release-rollback']){dispatchTestEvent('click',{dataset:{action,id:s.id},closest(){return this;}});assert.equal(studio.sceneTab,'actions',action);assert.equal(sceneFlowUI.editor,e);assert.equal(state.drawer,null);assert.equal(m.editing,true);assert.equal(m.published,0);assert(e.error,action);}actionsMap['scene-flow-inline-cancel']();actionsMap['scene-release-history']({dataset:{id:s.id}});assert.equal(studio.sceneTab,'versions');
`));
test('就地保存完整定义进入发布快照，修订隔离恢复；取消不影响发布版本',()=>full()(editing+edit('review')+change('nextStep','本次复核后终检')+`
 actionsMap['scene-flow-inline-save']();const s=scene(),m=sceneReleaseEnsure(s);actionsMap['scene-release-edit']({dataset:{id:s.id}});m.check=sceneReleaseCheck(s);assert(m.check.ok);sceneReleasePublish(s.id);assert.equal(m.status,'已发布');assert.equal(m.snapshot.scene.workflow.flow.stages.finish.nextStep,'本次复核后终检');actionsMap['scene-flow-inline-edit']({dataset:{stage:'review'}});assert(!sceneFlowUI.editor);actionsMap['scene-release-edit']({dataset:{id:s.id}});
`+edit('review')+change('nextStep','不保存的新修订')+`
 actionsMap['scene-flow-inline-cancel']();assert.equal(scene().workflow.flow.stages.finish.nextStep,'本次复核后终检');
`+edit('review')+change('nextStep','已保存的新修订')+`
 actionsMap['scene-flow-inline-save']();assert.equal(m.snapshot.scene.workflow.flow.stages.finish.nextStep,'本次复核后终检');sceneReleaseRestore(s.id);assert.equal(scene().workflow.flow.stages.finish.nextStep,'本次复核后终检');
`));
