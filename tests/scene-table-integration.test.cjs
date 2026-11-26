const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');
const root = path.join(__dirname, '..');
function fullWorkspace() {
  const run = workspace();
  const loaded = new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);
  for (const [,file] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/src="([^"?]+)\?/g)) {
    if (!loaded.has(file)) run(fs.readFileSync(path.join(root,file),'utf8'));
  }
  return run;
}
const setup=`
selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});
const sys=systemConnectionDraft(connector('pis'));sys.configs.database.tables.push({name:'CUSTOM_DOC',description:'自定义单据',columns:[{column:'ID',name:'编号',key:'id',type:'文本',primary:true},{column:'NOTE',name:'备注',key:'note',type:'文本'},{column:'MATERIAL_CODE',name:'业务编码',key:'materialCode',type:'文本'}]});Object.assign(connector('pis'),sys);
const s=scene();s.workflow.blocks.custom={id:'custom',label:'自定义单据',path:'custom',many:true,parent:'main',object:null,database:'pis',table:'CUSTOM_DOC',structureSource:'table',keyField:'id',fields:[{key:'id',label:'编号',type:'文本',sinkColumn:'ID',mappingMode:'system'},{key:'note',label:'备注',type:'文本',sinkColumn:'NOTE',mappingMode:'user'},{key:'materialCode',label:'业务编码',type:'文本',sinkColumn:'MATERIAL_CODE',mappingMode:'user'}]};s.names.custom='自定义单据';s.bindings.custom=[];s.selectedBlock='custom';
`;
test('非映射字段不会进入AI或人工本体映射，主列表显示输入来源', () => fullWorkspace()(setup+`
const html=pages.scenes();assert(html.includes('用户手动输入'));assert(html.includes('系统自动生成'));
assert.equal(sceneMappingFields(s,s.workflow.blocks.custom).length,0);
actionsMap['workflow-ai-map']();assert.equal(state.drawer.draft.rows.length,0);closeOverlay(true);
actionsMap['add-scene-binding']({dataset:{fieldkey:'note'}});assert.equal(state.drawer,null);
`));
test('新表不产生虚构对象依赖，普通同名物料列不触发本体查询', () => fullWorkspace()(setup+`
const deps=sceneReleaseDependencies(s);assert(!deps.objects.some(x=>!x.id));assert(deps.connectors.some(x=>x.id==='pis'));
const doc=workflowDemoDocument(s,'all-pass');doc.custom[0].materialCode='普通业务文本';
const result=executeWorkflow(s,doc,demoAuthority('all-pass'));assert(result.passed);
assert(!result.calls.some(c=>c.params?.materialCode==='普通业务文本'));
`));
test('新表数据库连接纳入发布变化与删除/删表保护', () => fullWorkspace()(setup+`
const before=sceneReleaseFingerprint(s);connector('pis').configs.database.schema='CHANGED';assert.notEqual(sceneReleaseFingerprint(s),before);
assert(deletionPlan('connector',connector('pis')).refs.some(r=>r.includes('业务表')));
const d={draft:systemConnectionDraft(connector('pis')),isNew:false,originalId:'pis'};d.draft.types=['api'];assert(systemConnectionCommonError(d).includes('业务单据结构')||systemConnectionCommonError(d).includes('取数能力'));
const changedSys=systemConnectionDraft(connector('pis'));changedSys.configs.database.host='demo';changedSys.configs.database.database='demo';changedSys.configs.database.auth='secret/demo';changedSys.configs.database.tables=changedSys.configs.database.tables.filter(t=>t.name!=='CUSTOM_DOC');assert(systemConnectionTypeError(changedSys,'database').includes('业务单据结构'));
`));
test('数据库映射清单不能新增未预览列，也不能把非参与字段重新选回来', () => fullWorkspace()(setup+`
actionsMap['workflow-ai-map']();state.drawer.draft.fieldsText='NEW_COLUMN | 新字段 | newColumn | 文本';actionsMap['workflow-ai-regenerate']();assert(state.drawer.error.includes('业务单据结构'));
state.drawer.draft.fieldsText='NOTE | 备注 | note | 文本';actionsMap['workflow-ai-regenerate']();assert(state.drawer.error.includes('不参与本体映射'));closeOverlay(true);
s.workflow.blocks.custom.fields.find(f=>f.key==='note').mappingMode='mapping';
const b={label:'备注',target:'custom[].note',ontology:'ReleaseOrder.releaseSubject',sinkTable:'OTHER_TABLE',sinkColumn:'NOTE',instanceMode:'input',sourceCapabilities:[]};assert(validSceneBinding(b,-1).includes('所选表字段'));
`));
test('旧表非参与列不能通过别名或其他映射绕过用途选择', () => fullWorkspace()(`
selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});scene().selectedBlock='main';actionsMap['workflow-edit-block']({dataset:{id:'main'}});actionsMap['workflow-save-block']();assert.equal(state.drawer,null);
actionsMap['workflow-ai-map']();state.drawer.draft.fieldsText='submitDepartment | 物料编码 | noteAlias | 文本';actionsMap['workflow-ai-regenerate']();assert(state.drawer.error.includes('不参与本体映射'));closeOverlay(true);
actionsMap['edit-scene-binding']({dataset:{index:'0'}});state.drawer.draft.instanceMode='input';state.drawer.draft.sinkColumn='submitDepartment';actionsMap['test-scene-binding']();assert(state.drawer.error.includes('不参与本体映射'));
`));
test('表名大小写调整仍能解析同一连接元数据，不使已保存表悬空', () => fullWorkspace()(setup+`
const b=s.workflow.blocks.custom;const before=sceneTableSchema(b);assert(!before.error);b.tableMeta={signature:before.signature};
connector('pis').configs.database.tables.find(t=>t.name==='CUSTOM_DOC').name='custom_doc';const after=sceneTableSchema(b);assert(!after.error);assert.equal(after.signature,before.signature);
`));
test('新表参与映射字段不要求预设块本体，非参与字段不能被确认窗口复选', () => fullWorkspace()(setup+`
s.workflow.blocks.custom.fields.find(f=>f.key==='note').mappingMode='mapping';
const rows=sceneMappingRows(s,s.workflow.blocks.custom,[{column:'NOTE',label:'备注',key:'note',type:'文本'},{column:'ID',label:'编号',key:'id',type:'文本'}]);assert.equal(rows.length,1);
s.workflow.blocks.custom.fields.find(f=>f.key==='id').mappingMode='mapping';
const b={label:'编号',target:'custom[].id',ontology:'ReleaseOrder.releaseOrderId',sinkTable:'CUSTOM_DOC',sinkColumn:'ID',instanceMode:'input',sourceCapabilities:[]};assert.equal(validSceneBinding(b,-1),'');
`));
