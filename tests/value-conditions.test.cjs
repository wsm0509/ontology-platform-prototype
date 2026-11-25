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
const nameBinding = `
const s=appScenes.release,w=workflowScene(s);
w.blocks.items.fields.push({key:'materialName',label:'物料名称',type:'文本'});
s.bindings.items.push({label:'物料名称',target:'releaseItems[].materialName',ontology:'Material.materialName',sourceCapabilities:[s.master],policy:'保留用户修改',sinkTable:'RELEASE_ITEM',sinkColumn:'MATERIAL_NAME'});
const doc=workflowDemoDocument(s,'all-pass'),q=ability(s.master);
q.maps.find(m=>m.target==='Material.materialName').conditionValue='未匹配的名称';
`;
const team = `
objects.push({id:'Team',name:'团队',props:[{id:'id',name:'编号',type:'文本',key:true,value:'T001'},{id:'dev',name:'开发代表',type:'文本',value:'DEV'},{id:'pdt',name:'PDT经理',type:'文本',value:'LPDT'}]});
const c={id:'pis.teamConditions',name:'团队角色查询',object:'Team',connector:'pis',method:'数据库查询',resource:'PIS_MATERIAL',connectionType:'database',tables:['PIS_MATERIAL'],params:[],revision:1,maps:[{source:'id',target:'Team.id'},{source:'category',target:'Team.dev',conditionValue:'DEV'},{source:'category',target:'Team.pdt',conditionValue:'LPDT'}]};capabilities.push(c);
`;
test('必需字段未匹配时保留旧值供用户处理，但生成建议与提交均不得通过', () => fullWorkspace()(nameBinding + `
const generated=workflowSuggestions(s,doc),suggestion=generated.suggestions.find(x=>x.ontology==='Material.materialName');
assert.equal(suggestion.blocking,true);assert.equal(generated.payload.releaseItems[0].materialName,doc.releaseItems[0].materialName);
const result=executeWorkflow(s,generated.payload,demoAuthority('all-pass'));
assert.equal(result.passed,false);assert(result.checks.some(c=>c.name.includes('字段取值条件')&&c.status==='阻断'));
`));
test('可选空值未匹配可继续，查询失败与已有不符值仍阻断', () => fullWorkspace()(nameBinding + `
obj('Material').props.find(p=>p.id==='materialName').required=false;delete doc.releaseItems[0].materialName;
const generated=workflowSuggestions(s,doc);assert.equal(generated.suggestions.find(x=>x.ontology==='Material.materialName').blocking,false);
assert.equal(executeWorkflow(s,doc,demoAuthority('all-pass')).passed,true);
doc.releaseItems[0].materialName='旧值';assert.equal(executeWorkflow(s,doc,demoAuthority('all-pass')).passed,false);
delete doc.releaseItems[0].materialName;const failed=executeWorkflow(s,doc,demoAuthority('all-pass'),'submit','超时');assert.equal(failed.passed,false);assert(failed.checks.some(c=>c.name.includes('字段取值条件')&&c.status==='未知'));
`));
test('满足条件的来源值与表单当前值不一致时，必须重新确认', () => fullWorkspace()(nameBinding + `
q.maps.find(m=>m.target==='Material.materialName').conditionValue='400 万智能网络摄像机';
doc.releaseItems[0].materialName='过期名称';const result=executeWorkflow(s,doc,demoAuthority('all-pass'));
assert.equal(result.passed,false);assert(result.checks.some(c=>c.detail.includes('不一致')));
doc.releaseItems[0].materialName='400 万智能网络摄像机';assert.equal(executeWorkflow(s,doc,demoAuthority('all-pass')).passed,true);
`));
test('BOM条件排除必需版本后，流程和旧调试入口均返回未知', () => fullWorkspace()(`
const s=appScenes.release;ability('plm.queryBom').maps[0].conditionValue='B999';
const result=executeWorkflow(s,workflowDemoDocument(s,'all-pass'),demoAuthority('all-pass'));
assert.equal(result.passed,false);assert.equal(result.checks.find(c=>c.name==='BOM 零部件发布状态').status,'未知');
assert.equal(evaluateScene(s).ok,false);assert.equal(resultFor(1).status,'未知');
`));
test('集合条件在保存及发布检查时被拒绝，无条件集合仍可取值', () => fullWorkspace()(`
const c=ability('cert.queryApplicable');assert.equal(capabilityConditionError(c),'');
c.maps[0].conditionValue='DEV';assert(capabilityConditionError(c).includes('集合'));assert.equal(sceneReleaseCheck(appScenes.release).ok,false);
delete c.maps[0].conditionValue;const docs=ability('demo.productDocuments');docs.maps[0].conditionValue='DEV';assert(capabilityConditionError(docs).includes('集合'));
delete docs.maps[0].conditionValue;const result=callCapability(c.id,{materialCode:'MAT-20260081',region:'欧洲',effectiveDate:'2026-11-03'});assert.equal(result.ok,true);assert(Array.isArray(result.normalized.certifications));
`));
test('同源角色自动样例生成多行，调用与清洗预览都保留两个分支', () => fullWorkspace()(team + `
const sample=capabilityPipelineSample(c);assert.equal(sample.items.length,2);
const expected={id:'T001',dev:'DEV',pdt:'LPDT'};
const result=callCapability(c.id);assert(result.ok,result.error);assert.deepEqual(result.normalized[0].properties,expected);
c.cleaning={enabled:true,dropEmpty:true,duplicates:'reject',invalid:'stop',validate:true};
const preview=capabilityPipelineProcess(c,sample);assert(preview.ok,preview.error);assert.deepEqual(JSON.parse(JSON.stringify(preview.normalized[0].properties)),expected);
`));
test('API向导实际创建能力后，保留同源多分支条件和字段处理配置', () => fullWorkspace()(`
const c={id:'irdms.conditionalSource',name:'条件接口',connector:'irdms',object:'ReleaseOrder',method:'GET',resource:'/demo',revision:1,params:[],maps:[{source:'id',target:'ReleaseOrder.releaseOrderId'},{source:'category',target:'ReleaseOrder.projectManager',conditionOperator:'eq',conditionValue:'DEV',processing:{enabled:true,convert:'text'}},{source:'category',target:'ReleaseOrder.status',conditionValue:'LPDT'}]};capabilities.push(c);
openWizard();Object.assign(state.wizard,{mode:'api',apiConnection:'irdms',apiAbility:c.id,apiRevision:1,objectName:'导入角色',objectId:'ImportedRoles',step:1});initWizardFields();
assert.equal(state.wizard.fields.length,3);wizardNext();wizardNext();assert.equal(state.wizard.step,3);saveWizard();assert.equal(state.wizard,null);
const created=capabilities.find(q=>q.object==='ImportedRoles');assert(created);assert.equal(created.maps.length,3);assert.equal(created.maps[1].conditionValue,'DEV');assert.equal(created.maps[2].conditionValue,'LPDT');assert.equal(created.maps[1].processing.convert,'text');
const result=callCapability(created.id);assert(result.ok,result.error);assert.equal(result.normalized[0].properties.projectManager,'DEV');assert.equal(result.normalized[0].properties.status,'LPDT');
`));
test('用户侧已发布调用锁定旧查询；修订测试使用最新查询并记录实际版本', () => fullWorkspace()(`
const s=appScenes.release,w=workflowScene(s);w.blocks.items.fields.push({key:'materialName',label:'物料名称',type:'文本'});s.bindings.items.push({label:'物料名称',target:'releaseItems[].materialName',ontology:'Material.materialName',sourceCapabilities:[s.master],sinkTable:'RELEASE_ITEM',sinkColumn:'MATERIAL_NAME'});
const doc=workflowDemoDocument(s,'all-pass'),m=sceneReleaseEnsure(s);m.check={...sceneReleaseCheck(s),fingerprint:sceneReleaseFingerprint(s)};sceneReleasePublish(s.id);assert.equal(m.published,1);
actionsMap['edit-capability']({dataset:{id:s.master}});state.drawer.draft.maps.find(m=>m.target==='Material.materialName').conditionValue='不匹配';actionsMap['save-capability']();assert.equal(ability(s.master).revision,2);
actionsMap['workflow-test']();state.drawer.draft.documentText=JSON.stringify(doc);state.drawer.objectRunMode='published';actionsMap['workflow-generate']();
assert.equal(state.drawer.result.suggestions.find(x=>x.ontology==='Material.materialName').suggested,'400 万智能网络摄像机');assert.equal(runtimeRecords[0].queryVersions[s.master],1);assert.equal(ability(s.master).revision,2);
state.drawer.objectRunMode='draft';actionsMap['workflow-generate']();assert.equal(state.drawer.result.suggestions.find(x=>x.ontology==='Material.materialName').blocking,true);assert.equal(runtimeRecords[0].queryVersions[s.master],2);
`));
test('放弃场景修订恢复发布查询引用，不回滚共享能力；再次发布才采用新配置', () => fullWorkspace()(`
const s=appScenes.release,m=sceneReleaseEnsure(s);m.check={...sceneReleaseCheck(s),fingerprint:sceneReleaseFingerprint(s)};sceneReleasePublish(s.id);
actionsMap['edit-capability']({dataset:{id:s.master}});state.drawer.draft.maps.find(m=>m.target==='Material.materialName').conditionValue='不匹配';actionsMap['save-capability']();
m.status='修订';sceneReleaseRestore(s.id);assert.equal(ability(s.master).revision,2);assert.equal(m.history[0].snapshot.queries.find(q=>q.id===s.master).value.revision,1);
m.status='修订';m.check={...sceneReleaseCheck(appScenes.release),fingerprint:sceneReleaseFingerprint(appScenes.release)};sceneReleasePublish(s.id);assert.equal(m.published,2);assert.equal(m.snapshot.queries.find(q=>q.id===s.master).value.revision,2);
`));
test('已发布的能力引用不能随场景草稿改动被删除', () => fullWorkspace()(`
const s=appScenes.release,m=sceneReleaseEnsure(s);m.check={...sceneReleaseCheck(s),fingerprint:sceneReleaseFingerprint(s)};sceneReleasePublish(s.id);
const query=ability(s.master);s.master='pis.searchMaterials';assert(deletionPlan('capability',query).refs.some(r=>r.includes('已发布场景')));assert(deletionPlan('connector',connector(query.connector)).refs.some(r=>r.includes('已发布场景')));
`));
test('同步清除本次映射未匹配的旧属性，保留无关属性并保存条件证据快照', () => fullWorkspace()(team + `
c.sync={mode:'manual',intervalMinutes:30,write:'upsert'};const store=capabilityPipelineStatus(c.id);store.records=[{identity:'Team:T001',properties:{id:'T001',dev:'DEV',unmanaged:'保留'}}];
actionsMap['edit-capability']({dataset:{id:c.id}});state.drawer.pipelineUseSample=true;state.drawer.pipelineSample=JSON.stringify({items:[{id:'T001',category:'MKT'}]});state.drawer.pipelineParamsText='{}';actionsMap['pipeline-sync-now']();
assert.equal(store.runs[0].status,'成功');assert.equal(store.records[0].properties.unmanaged,'保留');assert(!('dev' in store.records[0].properties));assert(store.runs[0].mappingEvidence.some(e=>e.target==='Team.dev'&&e.matched===0));
c.maps[1].conditionValue='OTHER';assert.equal(store.runs[0].config.maps[1].conditionValue,'DEV');
`));
