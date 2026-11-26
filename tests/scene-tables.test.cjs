const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');
const root = path.join(__dirname, '..');
function fullWorkspace() {
  const run = workspace(), loaded = new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);
  for (const [,file] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/src="([^"?]+)\?/g)) {
    if (!loaded.has(file)) { run(fs.readFileSync(path.join(root,file),'utf8')); loaded.add(file); }
    if (file === 'scene-mapping.js' && !loaded.has('scene-tables.js')) { run(fs.readFileSync(path.join(root,'scene-tables.js'),'utf8')); loaded.add('scene-tables.js'); }
  }
  return run;
}
const edit = `selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});`;
const database = `systemConnectors.push({id:'orders',name:'订单数据库',enabled:true,types:['database'],configs:{database:{tables:[{name:'SALES_ORDER',description:'销售订单',columns:[{name:'ORDER_ID',label:'订单编号',type:'VARCHAR',primary:true},{name:'ORDER_NAME',label:'订单名称',type:'VARCHAR',required:true},{name:'TOTAL',label:'金额',type:'DECIMAL'}]},{name:'ORDER_NOTE',description:'订单备注',fields:[{column:'NOTE_ID',label:'备注编号',type:'文本',key:true},{column:'NOTE',label:'备注',type:'文本'}]}]}}});`;
const select = `actionsMap['workflow-add-block']();sceneTableInput({type:'change',target:{dataset:{tableDatabase:''},value:'orders'}});sceneTableInput({type:'change',target:{dataset:{tableSelect:''},value:'SALES_ORDER'}});`;
function check(name,code) { test(name,()=>fullWorkspace()(edit + database + code)); }
check('数据库只列真实启用且已配置数据库表的连接，不伪造 IRDMS', `
  const ids=sceneTableDatabases().map(c=>c.id);assert(ids.includes('pis'));assert(ids.includes('orders'));assert(!ids.includes('irdms'));
  connector('orders').enabled=false;assert(!sceneTableDatabases().some(c=>c.id==='orders'));
  connector('orders').enabled=true;connector('orders').configs.database.tables=[];assert(!sceneTableDatabases().some(c=>c.id==='orders'));
`);
check('新建入口复用 workflowBlock，只有数据库、表和名称及自动字段预览', select + `
  const d=state.drawer,html=extraDrawers.workflowBlock();assert.equal(d.type,'workflowBlock');assert.equal(d.draft.label,'销售订单');
  assert(html.includes('data-table-database'));assert(html.includes('data-table-select'));assert(html.includes('ORDER_ID'));assert(html.includes('订单编号'));assert(html.includes('主键'));
  assert(!html.includes('data-field="object"'));assert(!html.includes('data-field="parent"'));assert(!html.includes('data-field="path"'));assert(!html.includes('data-field="id"'));
  assert.equal(d.draft.fields[0].mappingMode,'system');assert.equal(d.draft.fields[1].mappingMode,'mapping');assert.equal(d.draft.object,null);
`);
check('表与字段自动 camel 命名，系统主键无需本体；保存只在确认后发生', select + `
  const s=scene(),before=JSON.stringify(s.workflow.blocks);assert.equal(state.drawer.draft.id,'salesOrder');assert.equal(state.drawer.draft.path,'salesOrder');assert.equal(state.drawer.draft.keyField,'orderId');
  assert.equal(JSON.stringify(s.workflow.blocks),before);actionsMap['workflow-save-block']();assert.equal(state.drawer,null);
  const b=s.workflow.blocks.salesOrder;assert.equal(b.database,'orders');assert.equal(b.object,null);assert.equal(b.parent,'main');assert.equal(b.many,true);assert.equal(b.fields[0].sinkColumn,'ORDER_ID');assert(b.tableMeta.signature);assert(b.fields[1].required);
`);
check('没有主区块时自动新建单条记录，其余表自动挂到既有主区块', `
  const s=scene();s.workflow.blocks={};s.names={};s.bindings={};s.workflow.rules=[];` + select + `
  assert.equal(state.drawer.draft.parent,'');assert.equal(state.drawer.draft.many,false);actionsMap['workflow-save-block']();assert.equal(state.drawer,null);assert.equal(s.workflow.blocks.salesOrder.parent,'');
  actionsMap['workflow-add-block']();sceneTableInput({type:'change',target:{dataset:{tableDatabase:''},value:'orders'}});sceneTableInput({type:'change',target:{dataset:{tableSelect:''},value:'ORDER_NOTE'}});
  assert.equal(state.drawer.draft.parent,'salesOrder');assert.equal(state.drawer.draft.many,true);
`);
check('input/change 真正更新字段用途，切换不参与只选手动输入或系统生成且不重绘', select + `
  let draws=0;const beforeDraw=drawOverlay;drawOverlay=()=>{draws++};
  dispatchTestEvent('change',{dataset:{tableMapping:'1'},checked:false});assert.equal(state.drawer.draft.fields[1].mappingMode,'user');assert(state.drawer.dirty);
  dispatchTestEvent('input',{dataset:{tableOrigin:'1'},value:'system'});assert.equal(state.drawer.draft.fields[1].mappingMode,'system');assert.equal(draws,0);
  dispatchTestEvent('change',{dataset:{tableMapping:'1'},checked:true});assert.equal(state.drawer.draft.fields[1].mappingMode,'mapping');assert.equal(draws,0);drawOverlay=beforeDraw;
`);
check('数据库或表变化只重建草稿字段与中文名称，不污染已保存结构', select + `
  const saved=JSON.stringify(scene().workflow.blocks);sceneTableInput({type:'change',target:{dataset:{tableSelect:''},value:'ORDER_NOTE'}});
  assert.equal(state.drawer.draft.label,'订单备注');assert.equal(state.drawer.draft.fields[0].sinkColumn,'NOTE_ID');assert.equal(JSON.stringify(scene().workflow.blocks),saved);
  sceneTableInput({type:'change',target:{dataset:{tableDatabase:''},value:'pis'}});assert.equal(state.drawer.draft.fields.length,0);assert.equal(state.drawer.draft.table,'');assert.equal(JSON.stringify(scene().workflow.blocks),saved);
`);
check('同名表禁止跨库混用 schema，缺元数据提示且禁止保存空结构', `
  connector('orders').configs.database.tables=[{name:'PIS_MATERIAL',description:'另一个库的物料'}];actionsMap['workflow-add-block']();sceneTableInput({type:'change',target:{dataset:{tableDatabase:''},value:'orders'}});sceneTableInput({type:'change',target:{dataset:{tableSelect:''},value:'PIS_MATERIAL'}});
  assert.equal(state.drawer.draft.fields.length,0);assert(extraDrawers.workflowBlock().includes('缺少字段元数据'));const before=JSON.stringify(scene().workflow.blocks);actionsMap['workflow-save-block']();assert(state.drawer.error.includes('元数据'));assert.equal(JSON.stringify(scene().workflow.blocks),before);
`);
check('已知样例只从对应连接取结构，首 tuple 的主键约定明确标注', `
  const schema=sceneTableSchema({database:'pis',table:'PIS_MATERIAL'});assert.equal(schema.fields[0].sinkColumn,'MATERIAL_CODE');assert.equal(schema.fields[0].primary,true);assert.equal(schema.primarySource,'sample-first-column');assert.equal(schema.source,'tableSchemas:PIS');
`);
check('配置主键信息优先；无真实主键生成独立技术行标识不伪造数据库列', `
  connector('orders').configs.database.tables[0].columns=[{name:'DESCRIPTION',label:'说明',type:'文本'},{name:'ROW_ID',label:'行编号',type:'文本',primary:true}];` + select + `
  assert.equal(state.drawer.draft.keyField,'rowId');assert.equal(state.drawer.draft.fields[0].primary,false);assert.equal(state.drawer.draft.fields[0].mappingMode,'mapping');closeOverlay(true);
  connector('orders').configs.database.tables[0].columns.forEach(f=>delete f.primary);` + select + `
  assert.equal(state.drawer.draft.keyField,'rowIdentity');const identity=state.drawer.draft.fields.find(f=>f.key==='rowIdentity');assert(identity.technical);assert.equal(identity.primary,false);assert.equal(identity.sinkColumn,'');assert.equal(identity.mappingMode,'system');assert(extraDrawers.workflowBlock().includes('没有真实主键'));
`);
check('连接停用、删除或表移除在保存时复核并原子拒绝', `
  for(const mutate of [()=>connector('orders').enabled=false,()=>systemConnectors.splice(systemConnectors.findIndex(c=>c.id==='orders'),1),()=>connector('orders').configs.database.tables=[]]){
    const backup=structuredClone(connector('orders'));` + select + `
    const before=JSON.stringify(scene().workflow.blocks);mutate();actionsMap['workflow-save-block']();assert(state.drawer.error.includes('数据库')||state.drawer.error.includes('表'));assert.equal(JSON.stringify(scene().workflow.blocks),before);closeOverlay(true);
    const index=systemConnectors.findIndex(c=>c.id==='orders');if(index<0)systemConnectors.push(backup);else systemConnectors[index]=backup;
  }
`);
check('元数据在编辑期间改变必须重新打开，保存没有 partial 写入', select + `
  const before=JSON.stringify(scene());connector('orders').configs.database.tables[0].columns[1].type='数字';actionsMap['workflow-save-block']();assert(state.drawer.error.includes('元数据')||state.drawer.error.includes('变化'));assert.equal(JSON.stringify(scene()),before);
`);
check('切换场景与场景结构指纹变化拒绝旧草稿', select + `
  const before=JSON.stringify(scene().workflow.blocks);scene().workflow.rules.push({id:'later',scope:'main',conditions:[],assertions:[],params:{}});actionsMap['workflow-save-block']();assert(state.drawer.error.includes('变化'));assert.equal(JSON.stringify(scene().workflow.blocks),before);closeOverlay(true);
` + select + `
  selectScene('trial');const trial=JSON.stringify(scene().workflow.blocks);actionsMap['workflow-save-block']();assert(state.drawer);assert.equal(JSON.stringify(scene().workflow.blocks),trial);sceneTableSave();assert(state.drawer.error.includes('切换'));
`);
check('已有 legacy 表无需伪造数据库仍可编辑和兼容原 fieldsText', `
  const old=structuredClone(scene().workflow.blocks.main);actionsMap['workflow-edit-block']({dataset:{id:'main'}});assert.equal(state.drawer.type,'workflowBlock');assert.equal(state.drawer.draft.database,'');assert(extraDrawers.workflowBlock().includes('原表'));
  state.drawer.draft.fieldsText+='\\nextraNote | 附加说明 | 文本';state.drawer.draft.label='业务主单';actionsMap['workflow-save-block']();assert.equal(state.drawer,null);
  const b=scene().workflow.blocks.main;for(const k of ['id','path','keyField','many','parent','object','table'])assert.equal(b[k],old[k]);assert.equal(b.fields.find(f=>f.key==='extraNote').mappingMode,'user');assert.equal(b.fields.find(f=>f.key==='submitDepartment').mappingMode,'user');assert.equal(b.fields.find(f=>f.key===b.keyField).mappingMode,(scene().bindings.main.some(x=>x.target===scenePrefix(scene(),'main')+b.keyField)?'mapping':'system'));assert(!b.database);
`);
check('有绑定的字段不能转为 user/system，已引用字段不能移除', `
  actionsMap['workflow-edit-block']({dataset:{id:'main'}});const d=state.drawer,index=d.draft.fields.findIndex(f=>f.key==='releaseSubject');d.draft.fields[index].mappingMode='user';const before=JSON.stringify(scene().workflow.blocks);actionsMap['workflow-save-block']();assert(state.drawer.error.includes('先解除')||state.drawer.error.includes('先删除'));assert.equal(JSON.stringify(scene().workflow.blocks),before);closeOverlay(true);
  actionsMap['workflow-edit-block']({dataset:{id:'main'}});state.drawer.draft.fieldsText=state.drawer.draft.fieldsText.split('\\n').filter(line=>!line.startsWith('releaseSubject |')).join('\\n');actionsMap['workflow-save-block']();assert(state.drawer.error.includes('引用'));assert.equal(JSON.stringify(scene().workflow.blocks),before);
`);
check('规则字段可以不映射但不能删除，保存保留 identity 元数据', `
  const s=scene();s.workflow.rules.push({id:'custom',scope:'main',conditions:[{fact:'Order.submitDepartment'}],assertions:[],params:{}});actionsMap['workflow-edit-block']({dataset:{id:'main'}});state.drawer.draft.fields.find(f=>f.key==='submitDepartment').mappingMode='system';actionsMap['workflow-save-block']();assert.equal(state.drawer,null);
  actionsMap['workflow-edit-block']({dataset:{id:'main'}});state.drawer.draft.fieldsText=state.drawer.draft.fieldsText.split('\\n').filter(line=>!line.startsWith('submitDepartment |')).join('\\n');const before=JSON.stringify(s.workflow.blocks);actionsMap['workflow-save-block']();assert(state.drawer.error.includes('引用'));assert.equal(JSON.stringify(s.workflow.blocks),before);
`);
check('绑定/规则区块禁止换表、path、keyField 或 many，合法重命名允许', `
  for(const [key,value] of [['path','changed'],['keyField','releaseSubject'],['many',true],['table','OTHER']]){
    actionsMap['workflow-edit-block']({dataset:{id:'main'}});state.drawer.draft[key]=value;const before=JSON.stringify(scene().workflow.blocks);actionsMap['workflow-save-block']();assert(state.drawer.error);assert.equal(JSON.stringify(scene().workflow.blocks),before);closeOverlay(true);
  }
  actionsMap['workflow-edit-block']({dataset:{id:'main'}});state.drawer.draft.label='新业务名称';actionsMap['workflow-save-block']();assert.equal(state.drawer,null);assert.equal(scene().workflow.blocks.main.label,'新业务名称');
`);
check('非法字段模式、重复字段和空名称保存全部拒绝，发布检查复核', select + `
  const before=JSON.stringify(scene().workflow.blocks);state.drawer.draft.fields[1].mappingMode='robot';actionsMap['workflow-save-block']();assert(state.drawer.error.includes('用途'));assert.equal(JSON.stringify(scene().workflow.blocks),before);
  state.drawer.draft.fields[1].mappingMode='mapping';state.drawer.draft.fields[1].key='orderId';actionsMap['workflow-save-block']();assert(state.drawer.error.includes('重复')||state.drawer.error.includes('字段'));assert.equal(JSON.stringify(scene().workflow.blocks),before);
  state.drawer.draft.fields[1].key='orderName';state.drawer.draft.label=' ';actionsMap['workflow-save-block']();assert(state.drawer.error.includes('名称'));assert.equal(JSON.stringify(scene().workflow.blocks),before);
  state.drawer.draft.label='销售订单';actionsMap['workflow-save-block']();assert.equal(state.drawer,null);assert(sceneTableConfigIssues(scene()).some(i=>i.includes('尚未配置')));
  scene().workflow.blocks.salesOrder.fields.forEach(f=>f.mappingMode='system');assert.equal(sceneTableConfigIssues(scene()).length,0);
  scene().workflow.blocks.salesOrder.fields[0].mappingMode='mapping';assert(sceneTableConfigIssues(scene()).some(i=>i.includes('尚未配置')));
  scene().workflow.blocks.salesOrder.fields[0].mappingMode='system';connector('orders').enabled=false;assert(sceneTableConfigIssues(scene()).some(i=>i.includes('数据库')));
`);
check('结构列表智能提单移除对象/parent列，其他应用原编辑器保持不变', `
  const html=workflowStructureView(scene());assert(!html.includes('<th>本体对象</th>'));assert(!html.includes('所属区块'));assert(html.includes('数据库'));
  scene().workflow.type='validation';actionsMap['workflow-add-block']();assert(extraDrawers.workflowBlock().includes('关联本体对象'));assert.equal(state.drawer.draft.object,'Material');assert(workflowStructureView(scene()).includes('<th>本体对象</th>'));
`);
check('对象列元数据支持英文column、中文name与字符串key，字符串key不是主键', `
  connector('orders').configs.database.tables[0].columns=[{column:'NOTE',name:'备注',key:'extraNote',type:'text'},{column:'PK',name:'编号',key:'recordId',primary:true,type:'text'}];
` + select + `
  assert.equal(state.drawer.draft.fields[0].key,'extraNote');assert.equal(state.drawer.draft.fields[0].label,'备注');assert.equal(state.drawer.draft.fields[0].primary,false);assert.equal(state.drawer.draft.fields[1].primary,true);assert.equal(state.drawer.draft.keyField,'recordId');
`);
check('真实主键仅默认system可改参与映射或手动输入，技术字段固定系统来源', select + `
  sceneTableInput({type:'change',target:{dataset:{tableMapping:'0'},checked:true}});assert.equal(state.drawer.draft.fields[0].mappingMode,'mapping');actionsMap['workflow-save-block']();assert.equal(state.drawer,null);
  actionsMap['workflow-edit-block']({dataset:{id:'salesOrder'}});sceneTableInput({type:'change',target:{dataset:{tableMapping:'0'},checked:false}});sceneTableInput({type:'change',target:{dataset:{tableOrigin:'0'},value:'user'}});actionsMap['workflow-save-block']();assert.equal(state.drawer,null);assert.equal(scene().workflow.blocks.salesOrder.fields[0].mappingMode,'user');
`);
check('无主键表技术行标识可实际保存，不能在预览事件或save篡改其来源', `
  connector('orders').configs.database.tables[0].columns.forEach(f=>delete f.primary);
` + select + `
  const index=state.drawer.draft.fields.findIndex(f=>f.technical);sceneTableInput({type:'change',target:{dataset:{tableMapping:String(index)},checked:true}});assert.equal(state.drawer.draft.fields[index].mappingMode,'system');actionsMap['workflow-save-block']();assert.equal(state.drawer,null);
  actionsMap['workflow-edit-block']({dataset:{id:'salesOrder'}});state.drawer.draft.fields[index].mappingMode='user';const before=JSON.stringify(scene().workflow.blocks);actionsMap['workflow-save-block']();assert(state.drawer.error.includes('技术'));assert.equal(JSON.stringify(scene().workflow.blocks),before);
`);
check('重开数据库编辑更新规范元数据和新增列，但既有字段key与path保留', select + `
  actionsMap['workflow-save-block']();const s=scene(),b=s.workflow.blocks.salesOrder,identity=b.keyField;
  connector('orders').configs.database.tables[0].columns[1].type='数字';connector('orders').configs.database.tables[0].columns.push({name:'UPDATED_AT',label:'更新时间',type:'timestamp'});
  actionsMap['workflow-edit-block']({dataset:{id:'salesOrder'}});assert.equal(state.drawer.draft.fields.find(f=>f.key==='orderName').type,'数字');assert(state.drawer.draft.fields.some(f=>f.key==='updatedAt'));assert.equal(state.drawer.draft.keyField,identity);assert.equal(state.drawer.draft.label,'销售订单');actionsMap['workflow-save-block']();assert.equal(state.drawer,null);assert.equal(s.workflow.blocks.salesOrder.fields.find(f=>f.key==='orderName').type,'数字');
`);
check('元数据移除规则引用字段时编辑保存拒绝，不留悬空引用', select + `
  actionsMap['workflow-save-block']();const s=scene();s.workflow.rules.push({id:'local',scope:'salesOrder',conditions:[{fact:'Row.orderName'}],assertions:[],params:{}});
  connector('orders').configs.database.tables[0].columns.splice(1,1);actionsMap['workflow-edit-block']({dataset:{id:'salesOrder'}});const before=JSON.stringify(s.workflow.blocks);actionsMap['workflow-save-block']();assert(state.drawer.error.includes('引用'));assert.equal(JSON.stringify(s.workflow.blocks),before);
`);
check('legacy原表不借用多个数据库的同名结构，原字段可保留', `
  tableSchemas.OTHER=[structuredClone(tableSchemas.IRDMS.find(t=>t.table==='PRODUCT_RELEASE_ORDER'))];actionsMap['workflow-edit-block']({dataset:{id:'main'}});assert.equal(sceneTableSchema(state.drawer.draft,{legacyEdit:true}).fields.length,0);actionsMap['workflow-save-block']();assert.equal(state.drawer,null);
`);
check('缺省字段模式保持 legacy 映射解释；schema 变动发布检查可定位', select + `
  assert.equal(sceneTableFieldMode({key:'legacy'}),'mapping');assert.equal(sceneTableFieldMode({mappingMode:'user'}),'user');actionsMap['workflow-save-block']();assert.equal(state.drawer,null);
  connector('orders').configs.database.tables[0].columns.pop();assert(sceneTableConfigIssues(scene()).some(i=>i.includes('元数据')||i.includes('字段')));
`);
