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
const edit = `selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});scene().selectedBlock='main';`;
test('字段优先列表展示英文与中文，并保留一键生成和人工入口', () => fullWorkspace()(`
  selectScene('release');scene().selectedBlock='main';
  const html=pages.scenes();
  assert(html.includes('数据库 / 表单字段'));
  assert(html.includes('data-action="workflow-ai-map"'));
  assert(html.includes('data-action="add-scene-binding"'));
  assert(html.includes('发布主题'));
  assert(html.includes('releaseSubject'));
  assert(html.includes('<code>releaseSubject</code>'));
  assert(html.includes('待映射'));
  assert(/data-action="workflow-ai-map"[^>]*disabled/.test(html));
`));
test('一键生成仅产生副本，数据库列中文匹配本体属性，确认后才保存', () => fullWorkspace()(edit + `
  const s=scene(),before=JSON.stringify(s.bindings),fields=JSON.stringify(s.workflow.blocks.main.fields);
  actionsMap['workflow-ai-map']();
  const d=state.drawer;assert.equal(d.type,'workflowMapping');
  const pm=d.draft.rows.find(r=>r.column==='PM_NAME');
  assert(pm);assert.equal(pm.label,'项目经理');assert.equal(pm.ontology,'ReleaseOrder.projectManager');
  assert.equal(pm.key,'projectManager');assert.equal(pm.include,true);
  assert.equal(JSON.stringify(s.bindings),before);assert.equal(JSON.stringify(s.workflow.blocks.main.fields),fields);
  assert(extraDrawers.workflowMapping().includes('本地模拟'));
  actionsMap['workflow-ai-apply']();assert.equal(state.drawer,null);
  const binding=s.bindings.main.find(b=>b.target==='mainOrder.projectManager');
  assert(binding);assert.equal(binding.sinkColumn,'PM_NAME');assert.equal(binding.ontology,'ReleaseOrder.projectManager');
  assert.equal(binding.instanceMode,'input');
  assert(s.workflow.blocks.main.fields.some(f=>f.key==='projectManager'&&f.sinkColumn==='PM_NAME'));
  assert(sceneReleaseEnsure(s).history.some(h=>h.action==='保存草稿'));
`));
test('再次生成保留所有已有映射，取消不改变配置', () => fullWorkspace()(edit + `
  const s=scene(),original=JSON.stringify(s.bindings.main);
  actionsMap['workflow-ai-map']();
  assert(state.drawer.draft.rows.filter(r=>r.existing).every(r=>!r.include));
  assert.equal(state.drawer.draft.rows.find(r=>r.key==='releaseSubject').column,'releaseSubject');
  state.drawer.draft.rows.filter(r=>!r.existing).forEach(r=>r.include=false);
  closeOverlay(true);assert.equal(JSON.stringify(s.bindings.main),original);
  actionsMap['workflow-ai-map']();actionsMap['workflow-ai-apply']();
  const saved=JSON.stringify(s.bindings.main);
  actionsMap['workflow-ai-map']();assert(state.drawer.draft.rows.find(r=>r.column==='PM_NAME').existing);
  closeOverlay(true);assert.equal(JSON.stringify(s.bindings.main),saved);
`));
test('不确定项不自动勾选，人工补充或改选后可保存；无效或重复字段整体拒绝', () => fullWorkspace()(edit + `
  actionsMap['workflow-ai-map']();
  state.drawer.draft.fieldsText='CUSTOM_NOTE | 附加备注 | customNote | 文本';
  actionsMap['workflow-ai-regenerate']();
  const row=state.drawer.draft.rows[0];assert.equal(row.ontology,'');assert.equal(row.include,false);
  row.ontology='ReleaseOrder.releaseSubject';row.include=true;
  actionsMap['workflow-ai-apply']();assert.equal(state.drawer,null);
  assert.equal(scene().bindings.main.find(b=>b.target==='mainOrder.customNote').ontology,'ReleaseOrder.releaseSubject');
  const before=JSON.stringify(scene().bindings);
  actionsMap['workflow-ai-map']();state.drawer.draft.fieldsText='X | 字段一 | same | 文本\\nY | 字段二 | same | 文本';
  actionsMap['workflow-ai-regenerate']();assert(state.drawer.error.includes('重复'));
  assert.equal(JSON.stringify(scene().bindings),before);
`));
test('保存时复核场景、结构、类型和引用；不允许过期草稿或映射行ID错误', () => fullWorkspace()(edit + `
  actionsMap['workflow-ai-map']();scene().workflow.blocks.main.fields.push({key:'later',label:'后来新增',type:'文本'});
  actionsMap['workflow-ai-apply']();assert(state.drawer.error.includes('变化'));
  closeOverlay(true);scene().selectedBlock='mapping';scene().bindings.mapping=scene().bindings.mapping.filter(b=>b.target!=='mapping[].releaseItemId');actionsMap['workflow-ai-map']();
  state.drawer.draft.fieldsText='RELEASE_ITEM_ID | 整机发布项引用 | releaseItemId | 文本';
  actionsMap['workflow-ai-regenerate']();
  const ref=state.drawer.draft.rows[0];ref.existing=false;ref.include=true;ref.ontology='Material.materialCode';
  actionsMap['workflow-ai-apply']();assert(state.drawer.error.includes('具体业务行引用'));
  closeOverlay(true);scene().selectedBlock='main';actionsMap['workflow-ai-map']();
  state.drawer.draft.fieldsText='COUNT | 数量 | count | 数字';actionsMap['workflow-ai-regenerate']();
  const r=state.drawer.draft.rows[0];r.ontology='ReleaseOrder.releaseSubject';r.include=true;
  actionsMap['workflow-ai-apply']();assert(state.drawer.error.includes('类型'));
  closeOverlay(true);actionsMap['workflow-ai-map']();selectScene('trial');
  actionsMap['workflow-ai-apply']();assert(state.drawer);assert(!scene().bindings.main.some(b=>b.target==='mainOrder.projectManager'));
`));
test('手动添加预填字段与数据库列，重新编辑区块保留列元数据', () => fullWorkspace()(edit + `
  actionsMap['workflow-ai-map']();actionsMap['workflow-ai-apply']();
  actionsMap['workflow-edit-block']({dataset:{id:'main'}});actionsMap['workflow-save-block']();
  assert.equal(scene().workflow.blocks.main.fields.find(f=>f.key==='projectManager').sinkColumn,'PM_NAME');
  actionsMap['add-scene-binding']({dataset:{fieldkey:'id'}});
  assert.equal(state.drawer.draft.target,'mainOrder.id');
  assert.equal(state.drawer.draft.sinkColumn,'ID');
  assert.equal(state.drawer.draft.instanceMode,'input');
`));
test('只填字段和中文即可生成，新发布对象可手动选择且锁定版本；未发布属性不推荐', () => fullWorkspace()(edit + `
  actionsMap['workflow-ai-map']();state.drawer.draft.fieldsText='PM_NAME | 项目经理';actionsMap['workflow-ai-regenerate']();
  assert.equal(state.drawer.draft.rows[0].key,'projectManager');assert.equal(state.drawer.draft.rows[0].ontology,'ReleaseOrder.projectManager');
  closeOverlay(true);
  obj('ReleaseOrder').props.push({id:'draftOnly',name:'未发布属性',type:'文本'});
  actionsMap['workflow-ai-map']();state.drawer.draft.fieldsText='DRAFT_ONLY | 未发布属性';actionsMap['workflow-ai-regenerate']();
  assert.equal(state.drawer.draft.rows[0].ontology,'');
  assert(!extraDrawers.workflowMapping().includes('value="ReleaseOrder.draftOnly"'));
  closeOverlay(true);actionsMap['workflow-ai-map']();state.drawer.draft.fieldsText='CUSTOM | 自定义文本';actionsMap['workflow-ai-regenerate']();
  sceneMappingChange({dataset:{mappingTarget:'0'},value:'ProductModel.modelName'});
  assert.equal(state.drawer.draft.rows[0].include,true);
  actionsMap['workflow-ai-apply']();assert.equal(state.drawer,null);
  assert.equal(scene().bindings.main.find(b=>b.target==='mainOrder.custom').ontology,'ProductModel.modelName');
  assert(scene().ontologyVersions.ProductModel);
`));
test('人工修改同样校验类型、重复列和唯一编号，发布检查复核一致', () => fullWorkspace()(edit + `
  actionsMap['workflow-ai-map']();actionsMap['workflow-ai-apply']();
  const index=scene().bindings.main.findIndex(b=>b.target==='mainOrder.projectManager');
  actionsMap['edit-scene-binding']({dataset:{index:String(index)}});state.drawer.draft.ontology='Material.inCatalog';state.drawer.draft.instanceMode='input';
  actionsMap['test-scene-binding']();assert(state.drawer.error.includes('类型'));closeOverlay(true);
  actionsMap['edit-scene-binding']({dataset:{index:String(index)}});state.drawer.draft.sinkColumn='releaseSubject';actionsMap['test-scene-binding']();assert(state.drawer.error.includes('已经有映射'));closeOverlay(true);
  const idIndex=scene().bindings.main.findIndex(b=>b.target==='mainOrder.id');actionsMap['edit-scene-binding']({dataset:{index:String(idIndex)}});state.drawer.draft.ontology='ReleaseOrder.releaseSubject';actionsMap['test-scene-binding']();assert(state.drawer.error.includes('唯一编号'));
  closeOverlay(true);scene().bindings.main[index].ontology='Material.inCatalog';
  const check=sceneReleaseCheck(scene());assert(check.groups.find(g=>g.label==='表单结构和字段对应').issues.some(x=>x.includes('类型')));
`));
test('发布属性在对象修订期间仍可映射，未发布属性不可选，保存显示人工中文名', () => fullWorkspace()(edit + `
  objectReleaseStart(obj('ProductModel'));obj('ProductModel').props.find(p=>p.id==='series').id='draftSeries';
  actionsMap['workflow-ai-map']();state.drawer.draft.fieldsText='SERIES | 产品系列 | series | 文本';actionsMap['workflow-ai-regenerate']();
  state.drawer.draft.rows[0].ontology='ProductModel.series';state.drawer.draft.rows[0].include=true;
  actionsMap['workflow-ai-apply']();assert.equal(state.drawer,null);
  const i=scene().bindings.main.findIndex(b=>b.target==='mainOrder.series');
  actionsMap['edit-scene-binding']({dataset:{index:String(i)}});state.drawer.draft.label='人工调整的系列';actionsMap['test-scene-binding']();actionsMap['save-scene-binding']();assert.equal(state.drawer,null);
  assert(pages.scenes().includes('人工调整的系列'));
  actionsMap['add-scene-binding']();assert(!extraDrawers.sceneBinding().includes('value="ProductModel.draftSeries"'));
`));
test('多对象批量建议使用同一固定候选版本集，无效第二行不会部分写入', () => fullWorkspace()(edit + `
  actionsMap['workflow-ai-map']();state.drawer.draft.fieldsText='EXTRA_NAME | 产品型号名称 | extraName | 文本\\nEXTRA_CODE | 产品型号编码 | extraCode | 文本';actionsMap['workflow-ai-regenerate']();
  const rows=state.drawer.draft.rows;rows[0].ontology='ProductModel.modelName';rows[0].include=true;rows[1].ontology='ProductModel.modelCode';rows[1].include=true;
  actionsMap['workflow-ai-apply']();assert.equal(state.drawer,null);
  assert.equal(scene().bindings.main.filter(b=>b.ontology.startsWith('ProductModel.')).length,2);
  const before=JSON.stringify(scene().bindings),fields=JSON.stringify(scene().workflow.blocks.main.fields);
  actionsMap['workflow-ai-map']();state.drawer.draft.fieldsText='A | 名称一 | nameOne | 文本\\nB | 名称二 | nameTwo | 数字';actionsMap['workflow-ai-regenerate']();
  state.drawer.draft.rows.forEach(r=>{r.include=true;r.ontology='ReleaseOrder.releaseSubject';});
  actionsMap['workflow-ai-apply']();assert(state.drawer.error.includes('类型'));assert.equal(JSON.stringify(scene().bindings),before);assert.equal(JSON.stringify(scene().workflow.blocks.main.fields),fields);
`));
