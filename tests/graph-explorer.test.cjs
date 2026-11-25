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
test('对象关系拥有独立列表入口，局部关系仍留在对象详情',run=>run(`
  const entries=nav.flatMap(n=>n[1]);assert(entries.some(n=>n[0]==='relations'));assert(!entries.some(n=>n[0]==='graph'));
  state.domain='ALL';state.relationQuery='';state.relationView='list';navigate('relations');
  assert.equal(state.route,'relations');assert(globalRelationsPage().includes('对象关系总览'));
  assert(globalRelationsPage().includes('关系列表'));assert(globalRelationsPage().includes('全量图谱'));
  assert.equal((globalRelationsPage().match(/data-action="edit-relation"/g)||[]).length,relations.length);
  state.route='objects';state.tab='relations';assert(objectsPage().includes('与 整机物料 直接关联的关系'));
  actionsMap['to-relations']();assert.equal(state.route,'relations');
`));
test('全量图谱展示全部对象和真实关系，独立对象不遗漏',run=>run(`
  state.domain='ALL';state.relationView='graph';const model=globalGraphModel(),html=globalRelationsPage();
  assert.equal(model.nodes.length,objects.length);assert.equal(model.edges.length,relations.length);
  assert.equal((html.match(/class="object-graph-node global-graph-node/g)||[]).length,objects.length);
  assert.equal((html.match(/class="global-graph-edge"/g)||[]).length,relations.length);
  assert(html.includes('data-id="Project"')===objects.some(o=>o.id==='Project'));
  assert(!html.includes('认证上下文为派生路径'));
  assert(!html.includes('NaN'));assert(!html.includes('undefined'));
`));
test('全量图谱连线走对象间通道，关系名称不压住对象或彼此',run=>run(`
  state.domain='ALL';const model=globalGraphModel(),routes=globalGraphRoutes(model);
  const rects=model.nodes.map(o=>{const p=model.positions.get(o.id);return {left:p.x-94,right:p.x+94,top:p.y-50,bottom:p.y+50}});
  const labels=routes.map(r=>{const half=Math.min(78,Math.max(33,[...r.relation.name].length*6+12));return {left:r.labelX-half-5,right:r.labelX+half+5,top:r.labelY-18,bottom:r.labelY+18}});
  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  for(let i=0;i<labels.length;i++){
    assert(!rects.some(rect=>overlap(labels[i],rect)),routes[i].relation.name+' 遮挡对象');
    assert(!labels.slice(0,i).some(rect=>overlap(labels[i],rect)),routes[i].relation.name+' 遮挡关系名称');
  }
  for(const route of routes){
    if(route.relation.from===route.relation.to)continue;
    assert.match(route.path,/^M[0-9.-]+ [0-9.-]+ H[0-9.-]+ V[0-9.-]+ H[0-9.-]+$/);
    const a=model.positions.get(route.relation.from),b=model.positions.get(route.relation.to);
    const lane=Number(route.path.match(/ H([0-9.-]+) V/)[1]);
    if(a.x!==b.x)assert(Math.abs(lane-a.x)>94&&Math.abs(lane-b.x)>94);
  }
`));
test('列表搜索与业务域过滤同步作用于图谱',run=>run(`
  state.domain='COMMON';state.relationView='list';state.relationQuery='认证';
  const scope=globalRelationScope(),html=globalRelationsPage();
  assert(scope.nodes.every(o=>visible(o)));
  assert(scope.edges.every(r=>visible(obj(r.from))&&visible(obj(r.to))));
  assert(html.includes('匹配 1 条'));assert(html.includes('适用认证'));
  assert.equal(globalGraphModel().edges.length,scope.edges.length);
`));
test('全量图谱使用独立的默认缩放，局部图谱比例不受影响',run=>run(`
  state.route='relations';state.relationView='graph';assert.equal(graphZoomPercent(),75);
  actionsMap['graph-zoom-in']();assert.equal(graphZoomPercent(),100);
  state.route='objects';state.tab='graph';assert.equal(graphZoomPercent(),100);
  state.route='relations';assert.equal(graphZoomPercent(),100);
`));
test('进入全量图谱时从起点展示，并可保留滚动缩放',run=>run(`
  state.route='relations';state.relationView='graph';
  const viewport=document.getElementById('graph-viewport'),content=document.getElementById('graph-zoom-content'),space=document.getElementById('graph-zoom-space');
  Object.assign(viewport,{clientWidth:900,clientHeight:640,scrollLeft:200,scrollTop:0});
  content.querySelector=()=>({dataset:{graphWidth:'1800',graphHeight:'1100'}});
  syncGraphViewport(true);assert.equal(viewport.scrollLeft,0);assert.equal(space.style.width,'1350px');
  viewport.scrollLeft=180;setGraphZoom(100);assert(viewport.scrollLeft>180);
`));
test('新增、删除与多条同端点关系即时更新全量视图',run=>run(`
  state.domain='ALL';state.relationView='graph';
  const before=globalGraphModel().edges.length;
  relations.push({name:'全局新增测试',from:'Material',to:'ReleaseOrder',card:'多对一（N:1）',method:'字段关联'},
    {name:'全局第二条',from:'Material',to:'ReleaseOrder',card:'多对一（N:1）',method:'字段关联'});
  let html=globalRelationsPage();assert.equal(globalGraphModel().edges.length,before+2);
  assert(html.includes('全局新增测试'));assert(html.includes('全局第二条'));
  const first=relations[relations.length-2];requestDeletion('relation',first);confirmDeletion();
  html=globalRelationsPage();assert.equal(globalGraphModel().edges.length,before+1);
  assert(!html.includes('全局新增测试'));assert(html.includes('全局第二条'));
`));
console.log('共 '+passed+' 组图谱回归验证通过');
