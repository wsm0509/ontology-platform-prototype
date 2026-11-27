const test=require('node:test'),fs=require('node:fs'),path=require('node:path');const{workspace}=require('./workspace.cjs');
function full(){const run=workspace(),loaded=new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);for(const[,f]of fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').matchAll(/src="([^"?]+)\?/g))if(!loaded.has(f))run(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));return run;}
test('用户输入仅起点标识，不占阶段页签或编辑表格',()=>full()(`
 selectScene('release','actions');const html=sceneFlowView(scene());assert(html.includes('data-flow-start'));assert(html.includes('用户输入'));assert(!/data-action="scene-flow-stage"[^>]*data-stage="input"/.test(html));assert(!html.includes('data-flow-operation-table="input"'));assert.equal(sceneFlowUI.stage,'recognize');assert(html.includes('data-flow-operation-table="recognize"'));
`));
test('起点没有编辑按钮，阶段导航从识别开始但真实体验仍接受输入',()=>full()(`
 selectScene('release','actions');const html=sceneFlowStageHTML('input');const start=html.match(/<[^>]*data-flow-start[^>]*>[\\s\\S]*?<[/][a-z]+>/)?.[0];assert(start);assert(!start.includes('data-action='));assert(!start.includes('role="tab"'));const tabs=[...html.matchAll(/data-action="scene-flow-stage"[^>]*data-stage="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(tabs,['recognize','clarify','prepare','finish']);actionsMap['scene-flow-open']();assert.equal(state.drawer.flow.stage,'input');assert(extraDrawers.sceneFlow().includes('request'));
`));
test('删除本阶段详细配置重复展示，页面和体验仍保留阶段定义与行内编辑',()=>full()(`
 selectScene('release','actions');for(const[stage]of sceneFlowDisplayStages){const html=sceneFlowStageDetailHTML(scene(),stage);assert(!html.includes('本阶段详细配置与业务提示'));assert(!html.includes('问答证据'));assert(html.includes('data-flow-operation-table'));assert(html.includes('scene-flow-inline-edit'));}actionsMap['scene-flow-open']();for(const[stage]of sceneFlowDisplayStages)assert(!sceneFlowStageDetailHTML(scene(),stage,'drawer').includes('本阶段详细配置与业务提示'));
`));
// RED-first 契约：入口删除与固定卡片尚未完成时应失败；主代理完成实现后再运行。
test('所有可见阶段页面不再提供基础配置或输入引导按钮',()=>full()(`
 selectScene('release','actions');const s=scene();
 for(const editing of [false,true]){
  if(editing)actionsMap['scene-release-edit']({dataset:{id:s.id}});
  const before=sceneFlowFingerprint(s),workflow=JSON.stringify(s.workflow);
  for(const[stage]of sceneFlowStages){
   actionsMap['scene-flow-stage']({dataset:{stage}});
   for(const html of [sceneFlowView(s),applicationActionsView(s),scenesPage(),sceneFlowStageHTML(stage),sceneFlowStageDetailHTML(s,stage)]){
    assert(!html.includes('data-action="scene-flow-settings"'),stage+' 不应有基础配置入口');
    for(const button of html.match(/<button\\b[^>]*>[\\s\\S]*?<[/]button>/g)||[])assert(!/基础配置|输入引导/.test(button),stage+' 不应有输入引导按钮');
   }
  }
  assert.equal(sceneFlowFingerprint(s),before);assert.equal(JSON.stringify(s.workflow),workflow);
 }
`));
test('取消首页映射与规则快捷跳转但保留顶部配置页签',()=>full()(`
 selectScene('release','actions');const s=scene(),before=sceneFlowFingerprint(s);
 for(const[stage]of sceneFlowStages){
  actionsMap['scene-flow-stage']({dataset:{stage}});const html=sceneFlowView(s);
  for(const tab of ['strategy','rules'])assert(!new RegExp('<button[^>]*data-action="scene-tab"[^>]*data-tab="'+tab+'"').test(html),stage+' 不应有重复快捷跳转');
  assert(!html.includes('引用当前场景配置'));
 }
 const page=scenesPage();
 for(const tab of ['strategy','rules']){
  assert(new RegExp('<button[^>]*role="tab"[^>]*data-action="scene-tab"[^>]*data-tab="'+tab+'"').test(page),'顶部 '+tab+' 页签应保留');
  dispatchTestEvent('click',{dataset:{action:'scene-tab',tab},closest(){return this;}});assert.equal(studio.sceneTab,tab);assert.equal(scene().id,s.id);assert.equal(state.drawer,null);
 }
 assert.equal(sceneFlowFingerprint(s),before);
`));
test('输入默认自然语言且保留可选关键字段和已保存引导，不依赖首页配置入口',()=>full()(`
 selectScene('release','actions');const s=scene();assert.equal(sceneFlowStageConfig(s,'input').inputMode,'natural');
 const defaults=sceneFlowFingerprint(s),workflow=JSON.stringify(s.workflow);actionsMap['scene-flow-open']();
 assert.equal(state.drawer.flow.stage,'input');assert(state.drawer.flow.history.some(h=>h.text===sceneFlowStageConfig(s,'input').inputPrompt));
 const html=extraDrawers.sceneFlow();assert(html.includes('data-field="request"'));assert(html.includes('补充关键信息'));assert(!html.includes('<details open class="plain-details section-gap"><summary>补充关键信息'));
 assert.equal(sceneFlowFingerprint(s),defaults);assert.equal(JSON.stringify(s.workflow),workflow);closeOverlay(true);
 s.workflow.flow={stages:{input:{inputPrompt:'请填写当前流程单业务需求'}}};const saved=sceneFlowFingerprint(s);actionsMap['scene-flow-open']();
 assert(state.drawer.flow.history.some(h=>h.text==='请填写当前流程单业务需求'));assert.equal(sceneFlowStageConfig(s,'input').inputMode,'natural');assert.equal(sceneFlowFingerprint(s),saved);
`));
