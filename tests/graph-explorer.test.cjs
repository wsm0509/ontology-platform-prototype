const {workspace} = require('./workspace.cjs');
let passed = 0;
function test(name,fn){fn(workspace());passed++;console.log('通过：'+name)}
test('所有本体对象都能作为中心，仅显示真实直接关联',run=>run(`
  for(const o of objects){const model=objectGraphModel(o.id);assert.equal(model.root,o);assert.equal(model.edges.length,relations.filter(r=>r.from===o.id||r.to===o.id).length);assert.equal(new Set(model.neighbors.map(n=>n.id)).size,model.neighbors.length);assert(!model.neighbors.includes(o));for(const n of model.neighbors)assert(model.edges.some(r=>r.from===n.id||r.to===n.id));}
  state.object='Software';const html=graphPage();assert(html.includes('aria-label="当前中心对象：软件物料"'));assert(html.includes('aria-label="查看模块发布单的图谱"'));assert(!html.includes('aria-label="查看产品范围项的图谱"'));
`));
test('选择对象与点击节点切换中心，保留本体对象图谱页签',run=>run(`
  state.route='objects';state.tab='graph';state.object='Material';actionsMap['select-object']({dataset:{id:'ReleaseOrder'}});assert.equal(state.object,'ReleaseOrder');assert.equal(state.route,'objects');assert.equal(state.tab,'graph');assert(graphPage().includes('当前中心对象：产品发布主单'));
  state.query='发布';actionsMap['graph-node']({dataset:{id:'Mapping'}});assert.equal(state.object,'Mapping');assert.equal(state.route,'objects');assert.equal(state.tab,'graph');assert.equal(state.query,'');assert(graphPage().includes('当前中心对象：整机—软件 Mapping'));
`));
test('对象定义与图谱共用对象列表，页签切换保留选择',run=>run(`
  state.route='objects';state.query='之前的搜索';actionsMap['select-object']({dataset:{id:'Certification'}});navigate('graph');assert.equal(state.query,'');assert.equal(state.object,'Certification');assert(graphPage().includes('当前中心对象：产品认证'));
  actionsMap['graph-open-definition']();assert.equal(state.route,'objects');assert.equal(state.object,'Certification');assert.equal(state.tab,'props');navigate('graph');assert.equal(state.object,'Certification');
`));
test('按中文或标识搜索，零结果不改变中心对象',run=>run(`
  state.query='软件';let html=objectItems();assert(html.includes('data-id="Software"'));assert(!html.includes('data-id="Material"'));state.query='software';assert(objectItems().includes('data-id="Software"'));state.query='no_such_object';assert(objectItems().includes('未找到对象'));assert.equal(state.object,'Material');
`));
test('无关系对象保留中心节点和添加入口，新建对象立即可选择',run=>run(`
  const o=sharedObject('NewObject','新对象','', [prop('编号','id','文本','','','NEW-1',{key:true})]);objects.push(o);state.object=o.id;let html=graphPage();assert(html.includes('当前中心对象：新对象'));assert(html.includes('尚未配置对象关系'));assert(html.includes('graph-add-relation'));assert(objectItems().includes('data-id="NewObject"'));actionsMap['graph-add-relation']();assert.equal(state.drawer.draft.from,'NewObject');assert.equal(state.drawer.index,-1);
`));
test('关系新增、编辑和删除后图谱刷新，不生成虚构归属路径',run=>run(`
  state.object='TrialOrder';assert.equal(objectGraphModel(state.object).edges.length,0);relations.push({name:'试制包含明细',from:'TrialOrder',to:'TrialItem',left:'trialOrderId',right:'trialItemId',method:'字段关联'});const r=relations.at(-1);assert(graphPage().includes('试制包含明细'));assert.equal(objectGraphModel(state.object).neighbors[0].id,'TrialItem');r.to='Material';r.name='改为引用物料';assert.equal(objectGraphModel(state.object).neighbors[0].id,'Material');requestDeletion('relation',r);confirmDeletion();assert.equal(objectGraphModel(state.object).edges.length,0);assert(!graphPage().includes('改为引用物料'));
`));
test('双向、多条及自身关系不重复生成对象，方向与数量准确',run=>run(`
  relations.push({name:'反向测试',from:'Material',to:'ReleaseItem'},{name:'第二条测试',from:'Material',to:'ReleaseItem'},{name:'自关联测试',from:'Material',to:'Material'});const m=objectGraphModel('Material');assert.equal(m.neighbors.filter(o=>o.id==='ReleaseItem').length,1);assert(!m.neighbors.some(o=>o.id==='Material'));assert.equal(m.incoming,m.edges.filter(r=>r.to==='Material').length);assert.equal(m.outgoing,m.edges.filter(r=>r.from==='Material').length);const html=graphDiagram(m);for(const text of ['反向测试','第二条测试','自关联测试','graph-arrow-start','graph-arrow-end'])assert(html.includes(text));assert.equal((html.match(/aria-label="当前中心对象：/g)||[]).length,1);
`));
test('业务域筛选和跨域节点切换有效，过期对象不会崩溃',run=>run(`
  state.domain='COMMON';state.object='ReleaseOrder';graphPage();assert.equal(obj().domain,'COMMON');state.route='objects';state.tab='graph';actionsMap['graph-node']({dataset:{id:'ReleaseOrder'}});assert.equal(state.domain,'ALL');assert.equal(state.object,'ReleaseOrder');state.object='DeletedObject';assert.doesNotThrow(()=>graphPage());assert(obj());const before=state.object;actionsMap['graph-node']({dataset:{id:'DeletedObject'}});assert.equal(state.object,before);
`));
test('多关联布局可扩展，新增对象不会被固定节点列表排除',run=>run(`
  for(let i=0;i<15;i++){objects.push(sharedObject('Related'+i,'关联对象'+i,'',[]));relations.push({name:'动态关联'+i,from:'Material',to:'Related'+i});}const m=objectGraphModel('Material'),html=graphDiagram(m);for(let i=0;i<15;i++)assert(html.includes('data-id="Related'+i+'"'));assert(!html.includes('NaN'));assert(!html.includes('undefined'));assert(m.neighbors.length>15);
`));
test('缩放上限下限和重置有效，不修改图谱数据',run=>run(`
  const before=JSON.stringify(relations);assert.equal(graphZoomPercent(),100);actionsMap['graph-zoom-in']();assert.equal(graphZoomPercent(),125);for(let i=0;i<20;i++)actionsMap['graph-zoom-in']();assert.equal(graphZoomPercent(),200);assert(graphViewControls().includes('aria-label="放大图谱" disabled'));for(let i=0;i<20;i++)actionsMap['graph-zoom-out']();assert.equal(graphZoomPercent(),50);assert(graphViewControls().includes('aria-label="缩小图谱" disabled'));actionsMap['graph-zoom-reset']();assert.equal(graphZoomPercent(),100);setGraphZoom(NaN);assert.equal(graphZoomPercent(),100);assert.equal(JSON.stringify(relations),before);
`));
test('全屏保留缩放和对象，切换节点及退出后状态正确',run=>run(`
  state.route='objects';state.tab='graph';state.object='Material';setGraphZoom(150);actionsMap['graph-fullscreen']();assert.equal(state.graphFullscreen,true);assert.equal(document.body.style.overflow,'hidden');assert(graphPage().includes('aria-modal="true"'));assert(graphViewControls().includes('退出全屏'));actionsMap['graph-node']({dataset:{id:'ReleaseItem'}});assert.equal(state.graphFullscreen,true);assert.equal(graphZoomPercent(),150);assert.equal(state.object,'ReleaseItem');actionsMap['graph-fullscreen']();assert.equal(state.graphFullscreen,false);assert.equal(document.body.style.overflow,'');assert.equal(graphZoomPercent(),150);setGraphFullscreen(true);navigate('objects');assert.equal(state.graphFullscreen,false);assert.equal(document.body.style.overflow,'');
`));
test('缩放生成真实滚动范围，以可见中心为锚点并能重置居中',run=>run(`
  const viewport=document.getElementById('graph-viewport'),content=document.getElementById('graph-zoom-content'),space=document.getElementById('graph-zoom-space');Object.assign(viewport,{clientWidth:600,clientHeight:420,scrollLeft:0,scrollTop:0});content.querySelector=()=>({dataset:{graphHeight:'390'}});setGraphZoom(200);assert.equal(content.style.transform,'scale(2)');assert.equal(space.style.width,'1200px');assert.equal(space.style.height,'780px');assert.equal(viewport.scrollLeft,300);assert.equal(viewport.scrollTop,180);setGraphZoom(50);assert.equal(space.style.width,'300px');assert.equal(space.style.height,'195px');assert.equal(viewport.scrollLeft,0);assert.equal(viewport.scrollTop,0);actionsMap['graph-zoom-reset']();assert.equal(content.style.transform,'scale(1)');assert.equal(space.style.width,'600px');assert.equal(viewport.scrollLeft,0);
`));
test('本体对象统一入口、关系范围和旧链接兼容',run=>run(`
  const entries=nav.flatMap(n=>n[1]);assert(entries.some(n=>n[0]==='objects'));assert(!entries.some(n=>['graph','relations'].includes(n[0])));
  for(const tab of ['props','relations','graph']){state.tab=tab;const html=objectsPage();assert(html.includes('data-tab="relations"'));assert(html.includes('data-tab="graph"'));assert.equal((html.match(/id="object-search"/g)||[]).length,1);assert(!html.includes('graph-object-picker'));}
  navigate('relations');assert.equal(state.route,'objects');assert.equal(state.tab,'relations');assert(objectsPage().includes('与 整机物料 直接关联的关系 · 5 条'));
  actionsMap['relation-scope']({dataset:{scope:'all'}});assert(objectsPage().includes('当前业务域内全部关系 · '+relations.length+' 条'));
  navigate('graph');assert.equal(state.route,'objects');assert.equal(state.tab,'graph');actionsMap['to-relations']();assert.equal(state.relationScope,'current');assert.equal(state.tab,'relations');
  actionsMap['graph-add-relation']();assert.equal(state.drawer.draft.from,state.object);
`));
console.log('共 '+passed+' 组图谱回归验证通过');
