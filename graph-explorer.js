/* 以当前本体对象为中心浏览真实配置关系，与对象详情共用所选对象。 */
'use strict';

paths.zoomIn = 'M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM10 7v6M7 10h6';
paths.zoomOut = 'M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM7 10h6';
paths.fullscreen = 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5';
paths.exitFullscreen = 'M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5';


function objectGraphModel(id) {
  const root = obj(id);
  if (!root) return {root:null,edges:[],neighbors:[],incoming:0,outgoing:0};
  const edges = relations.filter(r => (r.from === id || r.to === id) && obj(r.from) && obj(r.to));
  const ids = [...new Set(edges.flatMap(r => [r.from,r.to]))].filter(other => other !== id);
  return {root,edges,neighbors:ids.map(other => obj(other)),incoming:edges.filter(r => r.to === id).length,outgoing:edges.filter(r => r.from === id).length};
}

function graphDiagram(model) {
  const {root,edges,neighbors} = model;
  const left = neighbors.filter((o,i) => i % 2 === 0), right = neighbors.filter((o,i) => i % 2 === 1);
  const rows = Math.max(left.length,right.length,1), height = Math.max(360,(rows-1)*115+160);
  const centerY = height / 2;
  const positions = new Map([[root.id,{x:500,y:centerY}]]);
  for (const [list,x] of [[left,120],[right,880]]) {
    list.forEach((o,i) => positions.set(o.id,{x,y:list.length === 1 ? centerY : 80+i*(height-160)/(list.length-1)}));
  }
  const lines = [], labels = [];
  for (const other of neighbors) {
    const p = positions.get(other.id), isLeft = p.x < 500;
    const group = edges.filter(r => r.from === other.id || r.to === other.id);
    // 同一对对象的多条关系共用一条连线，箭头保留两个方向，名称逐项显示。
    const incoming = group.some(r => r.to === root.id), outgoing = group.some(r => r.from === root.id);
    const startX = isLeft ? 230 : 610, endX = isLeft ? 390 : 770;
    const startY = isLeft ? p.y : centerY, endY = isLeft ? centerY : p.y;
    const markerStart = isLeft ? outgoing : incoming, markerEnd = isLeft ? incoming : outgoing;
    lines.push(`<path d="M${startX} ${startY} C${(startX+endX)/2} ${startY},${(startX+endX)/2} ${endY},${endX} ${endY}" ${markerStart ? 'marker-start="url(#graph-arrow-start)"' : ''} ${markerEnd ? 'marker-end="url(#graph-arrow-end)"' : ''}/>`);
    labels.push(`<div class="object-graph-edge" style="left:${isLeft ? 31 : 69}%;top:${(p.y+centerY)/2}px" title="${esc(group.map(r => `${name(r.from)} → ${r.name} → ${name(r.to)}`).join('；'))}">${group.map(r => `<span>${esc(r.name)}${incoming && outgoing ? (r.from === root.id ? (isLeft ? ' ←' : ' →') : (isLeft ? ' →' : ' ←')) : ''}</span>`).join('')}</div>`);
  }
  const self = edges.filter(r => r.from === root.id && r.to === root.id);
  if (self.length) {
    lines.push(`<path d="M450 ${centerY-44} C370 ${centerY-150},630 ${centerY-150},550 ${centerY-44}" marker-end="url(#graph-arrow-end)"/>`);
    labels.push(`<div class="object-graph-edge self" style="left:50%;top:${centerY-110}px">${self.map(r => `<span>${esc(r.name)}</span>`).join('')}</div>`);
  }
  const cards = [root,...neighbors].map(o => {
    const p = positions.get(o.id), isRoot = o === root;
    return `<button ${isRoot ? 'id="graph-focus"' : ''} class="object-graph-node ${isRoot ? 'center' : ''}" style="left:${p.x/10}%;top:${p.y}px" data-action="graph-node" data-id="${esc(o.id)}" aria-label="${esc(isRoot ? `当前中心对象：${o.name}` : `查看${o.name}的图谱`)}" ${isRoot ? 'aria-current="true"' : ''}><span class="object-graph-role">${isRoot ? '当前中心' : o.domain === 'COMMON' ? '公共对象' : '本体对象'}</span><b>${esc(o.name)}</b><small title="${esc(o.id)}">${esc(o.id)}</small></button>`;
  }).join('');
  return `<div class="object-graph-stage" data-graph-height="${height}" style="height:${height}px" role="group" aria-label="${esc(root.name)}的对象关系图谱"><svg class="object-graph-lines" viewBox="0 0 1000 ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="graph-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1 L9 5 L1 9"/></marker><marker id="graph-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M9 1 L1 5 L9 9"/></marker></defs>${lines.join('')}</svg>${labels.join('')}${cards}</div>`;
}

function graphZoomPercent() {
  const zoom = state.route === 'relations' ? state.globalGraphZoom : state.graphZoom;
  return Number.isFinite(zoom) ? Math.min(200,Math.max(50,zoom)) : (state.route === 'relations' ? 75 : 100);
}

function graphViewControls() {
  const zoom = graphZoomPercent();
  return `<div class="graph-view-controls" role="toolbar" aria-label="图谱视图控制"><div class="graph-zoom-buttons">${btn('缩小','graph-zoom-out','sm','zoomOut',`id="graph-zoom-out" aria-label="缩小图谱" ${zoom <= 50 ? 'disabled' : ''}`)}<output id="graph-zoom-level" aria-live="polite" aria-label="当前缩放比例">${zoom}%</output>${btn('放大','graph-zoom-in','sm','zoomIn',`id="graph-zoom-in" aria-label="放大图谱" ${zoom >= 200 ? 'disabled' : ''}`)}${btn('重置','graph-zoom-reset','sm','refresh','id="graph-zoom-reset" aria-label="重置图谱缩放"')}</div>${btn(state.graphFullscreen ? '退出全屏' : '全屏查看','graph-fullscreen','sm',state.graphFullscreen ? 'exitFullscreen' : 'fullscreen',`id="graph-fullscreen-toggle" aria-pressed="${!!state.graphFullscreen}"`)}<span class="graph-zoom-hint">${state.graphFullscreen ? 'Esc 退出全屏 · ' : ''}放大后可滚动查看</span></div>`;
}

function graphViewport(model) {
  return `${graphViewControls()}<div class="graph-viewport" id="graph-viewport" tabindex="0" role="region" aria-label="可缩放图谱画布"><div class="graph-zoom-space" id="graph-zoom-space"><div class="graph-zoom-content" id="graph-zoom-content">${typeof model === 'string' ? model : graphDiagram(model)}</div></div></div>`;
}

function syncGraphViewport(center = false, oldZoom = graphZoomPercent()) {
  const viewport = document.getElementById('graph-viewport'), content = document.getElementById('graph-zoom-content');
  const space = document.getElementById('graph-zoom-space'), stage = content?.querySelector('.object-graph-stage');
  if (!viewport || !content || !space || !stage) return;
  const viewportWidth = viewport.clientWidth, width = Number(stage.dataset.graphWidth) || viewportWidth;
  const height = Number(stage.dataset.graphHeight), zoom = graphZoomPercent();
  if (!viewportWidth || !width || !height) return;
  // 以画布当前可见中心为锚点缩放；缩小时保留居中留白，放大后用滚动条查看。
  const oldScale = oldZoom / 100, scale = zoom / 100;
  const cx = (viewport.scrollLeft + viewportWidth/2 - Math.max(0,(viewportWidth-width*oldScale)/2)) / oldScale;
  const cy = (viewport.scrollTop + viewport.clientHeight/2 - Math.max(0,(viewport.clientHeight-height*oldScale)/2)) / oldScale;
  content.style.width = `${width}px`;
  content.style.height = `${height}px`;
  content.style.transform = `scale(${scale})`;
  space.style.width = `${width*scale}px`;
  space.style.height = `${height*scale}px`;
  viewport.scrollLeft = center ? (stage.dataset.graphWidth ? 0 : Math.max(0,(width*scale-viewportWidth)/2)) : Math.max(0,cx*scale-viewportWidth/2);
  viewport.scrollTop = center ? (stage.dataset.graphWidth ? 0 : Math.max(0,(height*scale-viewport.clientHeight)/2)) : Math.max(0,cy*scale-viewport.clientHeight/2);
  const level = document.getElementById('graph-zoom-level');
  if (level) level.textContent = `${zoom}%`;
  const zoomOut = document.getElementById('graph-zoom-out'), zoomIn = document.getElementById('graph-zoom-in');
  if (zoomOut) zoomOut.disabled = zoom <= 50;
  if (zoomIn) zoomIn.disabled = zoom >= 200;
}

function setGraphZoom(percent) {
  const previous = graphZoomPercent();
  if (!Number.isFinite(percent)) return;
  state[state.route === 'relations' ? 'globalGraphZoom' : 'graphZoom'] = Math.min(200,Math.max(50,percent));
  syncGraphViewport(false,previous);
}

function setGraphFullscreen(enabled) {
  if (!!state.graphFullscreen === enabled) return;
  if (enabled) state.graphReturnScroll = window.scrollY || 0;
  state.graphFullscreen = enabled;
  render();
  document.getElementById('graph-fullscreen-toggle')?.focus({preventScroll:true});
  if (!enabled) window.scrollTo(0,state.graphReturnScroll || 0);
}

graphPage = function() {
  if (!obj() || !visible(obj())) state.object = (objects.find(visible) || objects[0])?.id;
  const model = objectGraphModel(state.object), o = model.root;
  if (!o) return `<div class="empty">还没有本体对象</div>`;
  return `<div class="graph-object-detail ${state.graphFullscreen ? 'graph-fullscreen' : ''}" ${state.graphFullscreen ? 'role="dialog" aria-modal="true" aria-labelledby="graph-object-title"' : ''}><div class="panel-head graph-current-heading"><div><div class="row"><h3 id="graph-object-title">${esc(o.name)} · 关系图谱</h3>${pill('模型视图','blue')}</div><p>${o.props.length} 项属性<span>·</span>${model.neighbors.length} 个关联对象<span>·</span>${model.edges.length} 条关系</p></div><div class="row">${btn('查看属性定义','graph-open-definition','sm','cube')}${btn('管理关系','to-relations','sm','link')}</div></div><div class="graph-view-meta"><span class="graph-direction-count">指向当前对象 ${model.incoming} · 由当前对象指向 ${model.outgoing}</span><span>点击关联节点，切换当前对象</span></div>${graphViewport(model)}${!model.edges.length ? `<div class="graph-empty-state"><b>“${esc(o.name)}”尚未配置对象关系</b><p>添加关系后，这里会展示与它直接关联的对象。</p>${btn('添加对象关系','graph-add-relation','sm','plus')}</div>` : ''}<div class="graph-legend"><span><i class="legend-center"></i>当前中心对象</span><span><i class="legend-related"></i>直接关联对象</span><span>→ 按关系定义标注方向</span></div><details class="graph-relation-details"><summary>关系明细 <span>${model.edges.length} 条</span></summary>${relationTable(model.edges)}</details></div>`;
};

function selectGraphObject(id, fromNode = false) {
  const o = obj(id);
  if (!o) return toast('该对象已不存在，请重新选择');
  state.object = o.id;
  if (!visible(o)) state.domain = 'ALL';
  if (fromNode) state.query = '';
  render();
  document.getElementById('graph-focus')?.focus();
}
Object.assign(actionsMap,{
  'graph-zoom-in':() => setGraphZoom(graphZoomPercent()+25),
  'graph-zoom-out':() => setGraphZoom(graphZoomPercent()-25),
  'graph-zoom-reset':() => { setGraphZoom(100); syncGraphViewport(true); },
  'graph-fullscreen':() => setGraphFullscreen(!state.graphFullscreen),
  'graph-node':el => selectGraphObject(el.dataset.id,true),
  'graph-open-definition':() => { state.tab = 'props'; setGraphFullscreen(false); render(); },
  'select-object':el => selectGraphObject(el.dataset.id),
  'to-relations':() => { state.relationScope = 'current'; navigate('relations'); },
  'relation-scope':el => { state.relationScope = el.dataset.scope; render(); },
  'graph-add-relation':() => {
    const source = obj(), target = objects.find(o => o.id !== source.id) || source;
    openDrawer('relation',{name:'',from:source.id,to:target.id,card:'多对一（N:1）',method:'字段关联',left:source.props.find(p => p.key)?.id || source.props[0]?.id || '',right:target.props.find(p => p.key)?.id || target.props[0]?.id || ''},{index:-1});
  }
});
const navigateBeforeGraphExplorer = navigate;
navigate = function(route) {
  state.graphFullscreen = false;
  if (route === 'relations') { v2.navigate(route); return; }
  if (route === 'graph') state.query = '';
  navigateBeforeGraphExplorer(route);
};

// 原型会整体重绘页面：重绘后重新应用画布尺寸，保留对象、缩放和全屏状态。
const renderBeforeGraphViewport = render;
render = function() {
  if (!((state.route === 'objects' && state.tab === 'graph') || (state.route === 'relations' && state.relationView === 'graph'))) state.graphFullscreen = false;
  renderBeforeGraphViewport();
  if (!state.drawer && !state.wizard) document.body.style.overflow = state.graphFullscreen ? 'hidden' : '';
  if ((state.route === 'objects' && state.tab === 'graph') || (state.route === 'relations' && state.relationView === 'graph')) syncGraphViewport(true);
};
document.addEventListener('keydown',e => {
  if (!((state.route === 'objects' && state.tab === 'graph') || (state.route === 'relations' && state.relationView === 'graph')) || !state.graphFullscreen || state.drawer || state.wizard) return;
  if (e.key === 'Escape') { e.preventDefault(); setGraphFullscreen(false); return; }
  if (e.key !== 'Tab') return;
  const panel = document.querySelector('.graph-fullscreen');
  const focusable = [...(panel?.querySelectorAll('button:not(:disabled),input,select,summary,[tabindex="0"]') || [])].filter(el => el.getClientRects().length);
  const first = focusable[0], last = focusable.at(-1);
  if (!focusable.includes(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
});
const closeOverlayBeforeGraphViewport = closeOverlay;
closeOverlay = function(force = false) {
  closeOverlayBeforeGraphViewport(force);
  if (state.graphFullscreen && !state.drawer && !state.wizard) document.body.style.overflow = 'hidden';
};
window.addEventListener?.('hashchange',() => { const route = location.hash.slice(1); if (pages[route]) navigate(route); });
window.addEventListener?.('resize',() => { if ((state.route === 'objects' && state.tab === 'graph') || (state.route === 'relations' && state.relationView === 'graph')) syncGraphViewport(true); });

pages.graph = () => { state.tab = 'graph'; return objectsPage(); };
nav[0][1].splice(1,0,['relations','对象关系','link']);
pages.relations = globalRelationsPage;
if (location.hash.slice(1) === 'relations') state.route = 'relations';
render();

// The catalog and the overview graph read the same live relationship definitions.
function globalRelationScope() {
  const nodes = objects.filter(visible);
  const ids = new Set(nodes.map(o => o.id));
  return {nodes,edges:relations.filter(r => ids.has(r.from) && ids.has(r.to))};
}

function globalGraphModel() {
  const {nodes,edges} = globalRelationScope();
  const adjacency = new Map(nodes.map(o => [o.id,new Set()]));
  const outgoing = new Map(nodes.map(o => [o.id,0])), incoming = new Map(nodes.map(o => [o.id,0]));
  for (const r of edges) {
    adjacency.get(r.from).add(r.to);
    adjacency.get(r.to).add(r.from);
    outgoing.set(r.from,outgoing.get(r.from)+1);
    incoming.set(r.to,incoming.get(r.to)+1);
  }
  const rootScore = id => outgoing.get(id)*3-incoming.get(id)*2+adjacency.get(id).size;
  const unseen = new Set(adjacency.keys()), components = [];
  while (unseen.size) {
    const start = [...unseen].sort((a,b) => rootScore(b)-rootScore(a))[0];
    const queue = [start], component = [];
    unseen.delete(start);
    for (let i=0;i<queue.length;i++) {
      const id = queue[i];
      component.push(id);
      for (const next of adjacency.get(id)) if (unseen.delete(next)) queue.push(next);
    }
    components.push(component);
  }
  components.sort((a,b) => b.length-a.length);
  const plans = components.map(component => {
    const root = [...component].sort((a,b) => rootScore(b)-rootScore(a))[0];
    const seen = new Set([root]), levels = [[root]];
    for (let i=0;i<levels.length;i++) {
      const next = [];
      for (const id of levels[i]) for (const neighbor of adjacency.get(id)) {
        if (!seen.has(neighbor)) { seen.add(neighbor); next.push(neighbor); }
      }
      if (next.length) {
        const parents = new Map(levels[i].map((id,row) => [id,row]));
        next.sort((a,b) => {
          const barycenter = id => [...adjacency.get(id)].filter(n => parents.has(n)).reduce((sum,n) => sum+parents.get(n),0) /
            Math.max(1,[...adjacency.get(id)].filter(n => parents.has(n)).length);
          return barycenter(a)-barycenter(b) || adjacency.get(b).size-adjacency.get(a).size;
        });
        levels.push(next);
      }
    }
    return {levels,height:Math.max(210,Math.max(...levels.map(level => level.length))*158+88)};
  });
  const columnGap = 340;
  const width = Math.max(1260,300+(Math.max(1,...plans.map(plan => plan.levels.length))-1)*columnGap);
  const positions = new Map();
  let top = 28;
  for (const plan of plans) {
    const left = (width-(plan.levels.length-1)*columnGap)/2;
    plan.levels.forEach((level,column) => level.forEach((id,row) => {
      positions.set(id,{x:left+column*columnGap,y:top+(row+1)*plan.height/(level.length+1)});
    }));
    top += plan.height+32;
  }
  return {nodes,edges,positions,width,height:Math.max(520,top+28),components:components.length};
}

function globalGraphRoutes(model) {
  const {nodes,edges,positions,width,height} = model;
  const pairTotals = new Map(), pairSeen = new Map(), occupied = [];
  const nodeRects = nodes.map(o => {
    const p=positions.get(o.id);
    return {left:p.x-94,right:p.x+94,top:p.y-50,bottom:p.y+50};
  });
  const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const labelPosition = (r,x,y) => {
    const halfWidth=Math.min(78,Math.max(33,[...String(r.name)].length*6+12));
    const candidates=[];
    for (const shift of [0,-20,20,-40,40,-60,60,-80,80,-100,100,-120,120]) {
      candidates.push({x,y:y+shift});
    }
    for (const shift of [-36,36,-72,72]) candidates.push({x:x+shift,y});
    const box = p => ({left:p.x-halfWidth-5,right:p.x+halfWidth+5,top:p.y-18,bottom:p.y+18});
    const valid = p => p.x-halfWidth>8 && p.x+halfWidth<width-8 && p.y>20 && p.y<height-20 &&
      !nodeRects.some(rect => overlaps(box(p),rect)) && !occupied.some(rect => overlaps(box(p),rect));
    const chosen = candidates.find(valid) || candidates.find(p => !nodeRects.some(rect => overlaps(box(p),rect))) || {x,y};
    occupied.push(box(chosen));
    return chosen;
  };
  for (const r of edges) {
    const key = [r.from,r.to].sort().join('|');
    pairTotals.set(key,(pairTotals.get(key)||0)+1);
  }
  return edges.map(r => {
    const a=positions.get(r.from), b=positions.get(r.to);
    if (!a || !b) return null;
    const key=[r.from,r.to].sort().join('|'),seen=pairSeen.get(key)||0;
    pairSeen.set(key,seen+1);
    const offset=(seen-(pairTotals.get(key)-1)/2)*22;
    let path, label;
    if (r.from === r.to) {
      const upperY=a.y-112-offset;
      path=`M${a.x+55} ${a.y-44} C${a.x+95} ${upperY},${a.x-95} ${upperY},${a.x-55} ${a.y-44}`;
      label=labelPosition(r,a.x,upperY+12);
    } else {
      // BFS keeps each connected pair in one column or adjacent columns.
      // Keep every vertical segment in the clear gutter between cards.
      const direction=Math.sign(b.x-a.x);
      const startX=a.x+(direction || 1)*89, endX=b.x-(direction || -1)*89;
      const startY=a.y+offset, endY=b.y+offset;
      const laneX=direction ? (startX+endX)/2+offset : a.x+(a.x+210 < width ? 130 : -130)+offset;
      path=`M${startX} ${startY} H${laneX} V${endY} H${endX}`;
      label=labelPosition(r,laneX,(startY+endY)/2);
    }
    return {relation:r,path,labelX:label.x,labelY:label.y};
  }).filter(Boolean);
}

function globalGraphDiagram(model=globalGraphModel()) {
  const {nodes,positions,width,height} = model;
  const routes=globalGraphRoutes(model);
  const lines=routes.map(route => `<path d="${route.path}" marker-end="url(#global-graph-arrow)"/>`);
  const labels=routes.map(route => {
    const r=route.relation,index=relations.indexOf(r);
    return `<button class="global-graph-edge" style="left:${route.labelX}px;top:${route.labelY}px" data-action="edit-relation" data-index="${index}" title="${esc(`${name(r.from)} → ${r.name} → ${name(r.to)}`)}" aria-label="配置关系：${esc(r.name)}">${esc(r.name)}</button>`;
  });
  const cards = nodes.map(o => {
    const p=positions.get(o.id);
    return `<button class="object-graph-node global-graph-node ${o.domain==='COMMON'?'global-common':''}" style="left:${p.x}px;top:${p.y}px" data-action="global-graph-object" data-id="${esc(o.id)}" aria-label="查看对象：${esc(o.name)}"><span class="object-graph-role">${o.domain==='COMMON'?'公共对象':'本体对象'}</span><b>${esc(o.name)}</b><small>${esc(o.id)}</small></button>`;
  });
  return `<div class="object-graph-stage global-graph-stage" data-graph-width="${width}" data-graph-height="${height}" style="width:${width}px;height:${height}px" role="group" aria-label="全部对象关系图谱"><svg class="object-graph-lines" viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs><marker id="global-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1 L9 5 L1 9"/></marker></defs>${lines.join('')}</svg>${labels.join('')}${cards.join('')}</div>`;
}

function globalRelationsPage() {
  const {nodes,edges}=globalRelationScope(), view=state.relationView||'list';
  const query=String(state.relationQuery||'').trim().toLowerCase();
  const filtered=edges.filter(r => !query || [r.name,name(r.from),r.from,name(r.to),r.to,r.method,r.card].some(value => String(value||'').toLowerCase().includes(query)));
  const switcher=`<div class="global-relation-switch" role="tablist" aria-label="关系视图">${[['list','关系列表','link'],['graph','全量图谱','graph']].map(([id,label,ic]) => btn(label,'global-relation-view',view===id?'primary':'sm',ic,`role="tab" data-view="${id}" aria-selected="${view===id}"`)).join('')}</div>`;
  return header('对象关系','统一查看和维护对象之间的业务关系，也可以切换到全量图谱。',btn('添加关系','add-relation','primary','plus'),'关系总览')+journey(1)+
    `<section class="panel global-relations-page"><div class="panel-head global-relation-heading"><div><h2>对象关系总览</h2><p class="tiny muted">当前业务分类内 ${nodes.length} 个对象 · ${edges.length} 条关系</p></div>${switcher}</div>`+
    (view==='graph' ? `<div class="graph-object-detail ${state.graphFullscreen?'graph-fullscreen':''}" ${state.graphFullscreen?'role="dialog" aria-modal="true" aria-label="全量对象关系图谱"':''}><div class="graph-view-meta"><span>展示当前业务分类内全部对象与真实配置关系；箭头表示关系方向</span><span>点击关系名称编辑，点击对象查看详情</span></div>${graphViewport(globalGraphDiagram())}<div class="graph-legend"><span><i class="legend-center"></i>公共对象</span><span><i class="legend-related"></i>业务对象</span><span>独立对象也会显示</span></div></div>` : `<div class="filterbar global-relation-filter"><div class="search">${icon('search')}<input id="relation-search" data-input="relation-search" aria-label="搜索业务关系" placeholder="搜索关系名称、起点或目标对象" value="${esc(state.relationQuery||'')}"></div><span class="tiny muted">匹配 ${filtered.length} 条</span></div>${relationTable(filtered)}`)+
    `</section><p class="session-note">关系定义在模型层共享；对象详情中的关系页用于查看某个对象的局部关联。</p>`;
}

Object.assign(actionsMap,{
  'global-relation-view':el => { state.relationView=el.dataset.view; setGraphFullscreen(false); render(); },
  'global-graph-object':el => { state.object=el.dataset.id; state.domain='ALL'; state.tab='props'; navigate('objects'); }
});
document.addEventListener('input',e => {
  if (e.target.dataset.input !== 'relation-search') return;
  const caret=e.target.selectionStart;
  state.relationQuery=e.target.value;
  render();
  const input=document.getElementById('relation-search');
  input?.focus();
  input?.setSelectionRange(caret,caret);
});
