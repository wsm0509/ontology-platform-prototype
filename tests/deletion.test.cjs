// 无第三方依赖，执行真实原型脚本与真实交互处理器，验证删除后的依赖和场景隔离。
const {workspace} = require('./workspace.cjs');
let passed = 0;
function test(name,fn){fn(workspace());passed++;console.log('通过：'+name)}
test('初始配置、三种场景仍可运行',run=>run(`assert.equal(configErrors().length,0);for(const s of Object.values(appScenes)){assert.equal(evaluateScene(s).ok,true);}`));
test('新增属性可取消、可删除，旧校验失效且生成记录',run=>run(`
  actionsMap['add-prop']();Object.assign(state.drawer.draft,{name:'测试属性',id:'deleteTest'});actionsMap['save-semantic']();
  const p=obj().props.at(-1);assert.equal(p.id,'deleteTest');
  requestDeletion('prop',p,{object:obj().id});closeOverlay();assert(obj().props.includes(p));
  state.checked=true;state.submitted=true;state.released=true;appScenes.trial.lastResult={ok:true};
  requestDeletion('prop',p,{object:obj().id});confirmDeletion();assert(!obj().props.includes(p));
  assert.equal(state.checked,false);assert.equal(state.submitted,false);assert.equal(state.released,false);assert.equal(appScenes.trial.lastResult,null);assert.equal(state.logs[0].type,'配置删除');assert.equal(configErrors().length,0);
`));
test('身份、展示名、映射、关系及内置规则均阻止悬空删除',run=>run(`
  for(const id of ['materialCode','materialName','modelCode','inCatalog']){const p=obj('Material').props.find(p=>p.id===id);requestDeletion('prop',p,{object:'Material'});assert(deletionPlan('prop',p,{object:'Material'}).refs.length);confirmDeletion();assert(obj('Material').props.includes(p));closeOverlay(true);}
  requestDeletion('object',obj('Material'));confirmDeletion();assert(obj('Material'));
  assert(deletionPlan('object',obj('RangeItem')).refs.some(x=>x.includes('引用')));
`));
test('确认时重新检查新出现的引用',run=>run(`
  const p=obj().props.find(p=>p.id==='customType');requestDeletion('prop',p,{object:'Material'});assert.equal(deletionPlan('prop',p,{object:'Material'}).refs.length,0);
  appScenes.trial.bindings.items.push({label:'新增依赖',ontology:'Material.customType',target:'trialItems[].customType'});confirmDeletion();assert(obj().props.includes(p));assert(state.drawer);
`));
test('对象关系删除后图谱同步，空表仍可新增',run=>run(`
  const r=relations.find(r=>r.name==='范围物料引用');assert(graphPage().includes('范围物料引用'));requestDeletion('relation',r);confirmDeletion();assert(!relations.includes(r));assert(!graphPage().includes('范围物料引用'));assert(obj(r.from)&&obj(r.to));
  while(relations.length){requestDeletion('relation',relations[0]);confirmDeletion();}assert(relationTable(relations).includes('当前没有相关关系'));actionsMap['add-relation']();assert.equal(state.drawer.type,'relation');
`));
test('字段绑定删除只影响所属场景，删空后可重新新增',run=>run(`
  selectScene('trial','bindings');const before=JSON.stringify(appScenes.release),s=scene(),rev=s.revision;
  while(s.bindings.items.length){requestDeletion('binding',s.bindings.items[0],{scene:s.id,block:'items'});confirmDeletion();}
  assert.equal(JSON.stringify(appScenes.release),before);assert(s.revision>rev);assert(sceneBindingView(s).includes('当前区块尚无字段绑定'));actionsMap['add-scene-binding']();Object.assign(state.drawer.draft,{label:'重建编码',target:'trialItems[].materialCode'});actionsMap['test-scene-binding']();actionsMap['save-scene-binding']();assert.equal(s.bindings.items.length,1);assert.equal(configErrors().length,0);
`));
test('使用中的连接器和能力阻止删除，闲置能力删除不影响本体',run=>run(`
  const c=ability('pis.getMaterial'),sys=connector('pis');requestDeletion('capability',c);confirmDeletion();assert(ability(c.id));closeOverlay(true);requestDeletion('connector',sys);confirmDeletion();assert(connector(sys.id));closeOverlay(true);
  capabilities.push({...structuredClone(c),id:'pis.unused',name:'闲置能力'});const extra=ability('pis.unused'),props=JSON.stringify(obj('Material').props);requestDeletion('capability',extra);confirmDeletion();assert(!ability(extra.id));assert.equal(JSON.stringify(obj('Material').props),props);assert.equal(configErrors().length,0);
`));
test('删除当前连接器自动切换，能力映射及参数已有移除机制',run=>run(`
  actionsMap['add-connector']();Object.assign(state.drawer.draft,{id:'unused',name:'测试连接'});actionsMap['save-connector']();assert.equal(studio.connector,'unused');requestDeletion('connector',connector('unused'));confirmDeletion();assert(!connector('unused'));assert(connector());
  actionsMap['edit-capability']({dataset:{id:'pis.getMaterial'}});const n=state.drawer.draft.maps.length;actionsMap['cap-remove-map']({dataset:{index:'2'}});assert.equal(state.drawer.draft.maps.length,n-1);state.drawer.draft.paramText='';actionsMap['save-capability']();assert.equal(ability('pis.getMaterial').params.length,0);
`));
test('新建场景可删除，预置范围场景删除后仍能用模板创建',run=>run(`
  actionsMap['create-scene']();Object.assign(state.drawer.draft,{id:'temp',name:'测试场景',app:'测试'});actionsMap['save-new-scene']();assert.equal(studio.scene,'temp');const size=objects.length;requestDeletion('scene',scene());confirmDeletion();assert(!appScenes.temp);assert(scene());assert.equal(objects.length,size);
  requestDeletion('scene',appScenes.range);confirmDeletion();assert(!appScenes.range);actionsMap['create-scene']();Object.assign(state.drawer.draft,{id:'rangeAgain',name:'重建范围',app:'测试'});actionsMap['save-new-scene']();assert(appScenes.rangeAgain);assert.equal(configErrors().length,0);
  requestDeletion('scene',appScenes.release);confirmDeletion();assert(appScenes.release);
`));
test('删除无引用对象回退选择；模板依赖缺失时拒绝创建',run=>run(`
  selectScene('trial');requestDeletion('scene',scene());confirmDeletion();const o=obj('TrialOrder');assert.equal(deletionPlan('object',o).refs.length,0);state.object=o.id;studio.capObject=o.id;requestDeletion('object',o);confirmDeletion();assert(!obj('TrialOrder'));assert(obj());assert.equal(studio.capObject,'ALL');assert(!graphPage().includes('data-id="TrialOrder"'));
  actionsMap['create-scene']();Object.assign(state.drawer.draft,{id:'bad',name:'缺失依赖',app:'测试',template:'trial'});actionsMap['save-new-scene']();assert(!appScenes.bad);assert(state.drawer.error.includes('主对象 TrialOrder'));assert.equal(configErrors().length,0);
`));
test('重复确认不会误删其他记录',run=>run(`
  const r=relations[0],n=relations.length;requestDeletion('relation',r);relations.splice(0,1);confirmDeletion();assert.equal(relations.length,n-1);assert(state.drawer);assert(deletionPlan('relation',r).refs.length);
`));
test('配置发布校验补足关系、引用类型、上下文能力依赖',run=>run(`
  relations.push({name:'坏关系',from:'Missing',to:'Material',left:'x',right:'materialCode'});obj().props.push({id:'badRef',name:'坏引用',ref:'Missing'});capabilities.splice(capabilities.findIndex(c=>c.id==='plm.queryBom'),1);const errors=configErrors();assert(errors.some(x=>x.includes('坏关系')));assert(errors.some(x=>x.includes('坏引用')));assert(errors.some(x=>x.includes('plm.queryBom')));
`));
console.log('共 '+passed+' 组回归验证通过');
