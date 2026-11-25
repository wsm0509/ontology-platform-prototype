const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');
const root = path.join(__dirname, '..');
function fullWorkspace() {
  const run = workspace();
  const loaded = new Set(['app.js', 'scene-system.js', 'deletion.js', 'graph-explorer.js']);
  for (const [, file] of fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/src="([^"?]+)\?/g)) {
    if (!loaded.has(file)) run(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  return run;
}
test('智能提单仅有三类配置和一个版本记录页签', () => fullWorkspace()(`
  for (const s of Object.values(appScenes).filter(s=>workflowScene(s).type==='draft')) {
    assert.deepEqual(JSON.parse(JSON.stringify(workflowTabs(s))), [
      ['strategy','对象与表单映射'],['rules','校验规则'],['actions','场景流'],['versions','版本记录']
    ]);
  }
`));
test('旧结构与绑定入口归入映射页，区块和字段映射编辑锁仍有效', () => fullWorkspace()(`
  selectScene('release');
  for (const old of ['structure','bindings']) {
    studio.sceneTab=old;
    const html=pages.scenes();
    assert.equal(studio.sceneTab,'strategy');
    assert(html.includes('<h3>对象与表单映射</h3>'));
    assert(html.includes('管理表单区块与字段'));
    assert(html.includes('data-action="workflow-add-block"'));
    assert(html.includes('data-action="workflow-edit-block"'));
    assert(html.includes('data-action="add-scene-binding"'));
    assert(!html.includes('区块来自“表单结构”'));
    assert(/data-action="workflow-add-block"[^>]*disabled/.test(html));
    assert(/data-action="add-scene-binding"[^>]*disabled/.test(html));
  }
  actionsMap['scene-release-edit']({dataset:{id:'release'}});
  const html=pages.scenes();
  assert(!/data-action="workflow-add-block"[^>]*disabled/.test(html));
  assert(!/data-action="add-scene-binding"[^>]*disabled/.test(html));
  actionsMap['workflow-edit-block']({dataset:{id:'items'}});
  assert.equal(state.drawer.type,'workflowBlock');
`));
test('规则、场景流调试与版本快照入口均可达', () => fullWorkspace()(`
  selectScene('release','rules');
  assert(pages.scenes().includes('data-action="workflow-add-rule"'));
  studio.sceneTab='actions';
  const html=pages.scenes();
  assert(html.includes('<h3>场景流</h3>'));
  assert(html.includes('data-action="workflow-test"'));
  actionsMap['workflow-test']();
  assert.equal(state.drawer.type,'workflowTest');
  closeOverlay(true);
  studio.sceneTab='versions';
  const versions=pages.scenes();
  assert(versions.includes('data-action="scene-release-snapshot"'));
  assert(versions.includes('<h3>场景引用的对象版本</h3>'));
  studio.sceneTab='object-versions';
  assert(pages.scenes().includes('<h3>场景引用的对象版本</h3>'));
  assert.equal(studio.sceneTab,'versions');
  actionsMap['scene-release-snapshot']({dataset:{id:'release',index:'0'}});
  assert.equal(state.drawer.type,'sceneReleaseSnapshot');
  assert(state.drawer.record.snapshot.scene.workflow.blocks.items);
`));
test('其他应用类型保留原配置页签且版本记录不重复', () => fullWorkspace()(`
  for (const type of ['qa','validation','impact','recommendation','collaboration']) {
    const s=Object.values(appScenes).find(s=>workflowScene(s).type===type),tabs=workflowTabs(s);
    assert.equal(tabs.filter(t=>t[0]==='versions').length,1);
    assert.equal(tabs.filter(t=>t[0]==='object-versions').length,1);
    assert.equal(tabs[0][0],'strategy');
    assert(!tabs.some(t=>t[1]==='对象与表单映射'||t[1]==='场景流'));
    if(type==='validation')assert.equal(tabs.find(t=>t[0]==='rules')[1],'2 · 校验规则');
  }
`));
test('映射页重组不改变发布快照，修订恢复保留配置与版本记录', () => fullWorkspace()(`
  selectScene('release');
  const s=scene(),m=sceneReleaseEnsure(s),before=structuredClone({blocks:s.workflow.blocks,bindings:s.bindings,rules:s.workflow.rules});
  pages.scenes();
  m.check={...sceneReleaseCheck(s),fingerprint:sceneReleaseFingerprint(s)};
  sceneReleasePublish(s.id);
  assert.equal(m.published,1);
  actionsMap['scene-release-edit']({dataset:{id:s.id}});
  s.workflow.blocks.items.label='尚未发布的修改';
  sceneReleaseRestore(s.id);
  const restored=scene();
  assert.deepEqual(JSON.parse(JSON.stringify({blocks:restored.workflow.blocks,bindings:restored.bindings,rules:restored.workflow.rules})),JSON.parse(JSON.stringify(before)));
  assert.equal(m.status,'已发布');
  assert(m.history.some(h=>h.action==='发布配置'));
  assert(m.history.some(h=>h.action==='恢复上次发布配置'));
  assert.equal(workflowTabs(restored).filter(t=>t[0]==='versions').length,1);
`));
