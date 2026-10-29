/* 以当前业务对象为中心浏览真实配置关系，与对象详情共用所选对象。 */
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
    return `<button ${isRoot ? 'id="graph-focus"' : ''} class="object-graph-node ${isRoot ? 'center' : ''}" style="left:${p.x/10}%;top:${p.y}px" data-action="graph-node" data-id="${esc(o.id)}" aria-label="${esc(isRoot ? `当前中心对象：${o.name}` : `查看${o.name}的图谱`)}" ${isRoot ? 'aria-current="true"' : ''}><span class="object-graph-role">${isRoot ? '当前中心' : o.domain === 'COMMON' ? '公共对象' : '业务对象'}</span><b>${esc(o.name)}</b><small title="${esc(o.id)}">${esc(o.id)}</small></button>`;
  }).join('');
  return `<div class="object-graph-stage" data-graph-height="${height}" style="height:${height}px" role="group" aria-label="${esc(root.name)}的对象关系图谱"><svg class="object-graph-lines" viewBox="0 0 1000 ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="graph-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1 L9 5 L1 9"/></marker><marker id="graph-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M9 1 L1 5 L9 9"/></marker></defs>${lines.join('')}</svg>${labels.join('')}${cards}</div>`;
}

function graphZoomPercent() {
  return Number.isFinite(state.graphZoom) ? Math.min(200,Math.max(50,state.graphZoom)) : 100;
}

function graphViewControls() {
  const zoom = graphZoomPercent();
  return `<div class="graph-view-controls" role="toolbar" aria-label="图谱视图控制"><div class="graph-zoom-buttons">${btn('缩小','graph-zoom-out','sm','zoomOut',`id="graph-zoom-out" aria-label="缩小图谱" ${zoom <= 50 ? 'disabled' : ''}`)}<output id="graph-zoom-level" aria-live="polite" aria-label="当前缩放比例">${zoom}%</output>${btn('放大','graph-zoom-in','sm','zoomIn',`id="graph-zoom-in" aria-label="放大图谱" ${zoom >= 200 ? 'disabled' : ''}`)}${btn('重置','graph-zoom-reset','sm','refresh','id="graph-zoom-reset" aria-label="重置图谱缩放"')}</div>${btn(state.graphFullscreen ? '退出全屏' : '全屏查看','graph-fullscreen','sm',state.graphFullscreen ? 'exitFullscreen' : 'fullscreen',`id="graph-fullscreen-toggle" aria-pressed="${!!state.graphFullscreen}"`)}<span class="graph-zoom-hint">${state.graphFullscreen ? 'Esc 退出全屏 · ' : ''}放大后可滚动查看</span></div>`;
}

function graphViewport(model) {
  return `${graphViewControls()}<div class="graph-viewport" id="graph-viewport" tabindex="0" role="region" aria-label="可缩放图谱画布"><div class="graph-zoom-space" id="graph-zoom-space"><div class="graph-zoom-content" id="graph-zoom-content">${graphDiagram(model)}</div></div></div>`;
}

function syncGraphViewport(center = false, oldZoom = graphZoomPercent()) {
  const viewport = document.getElementById('graph-viewport'), content = document.getElementById('graph-zoom-content');
  const space = document.getElementById('graph-zoom-space'), stage = content?.querySelector('.object-graph-stage');
  if (!viewport || !content || !space || !stage) return;
  const width = viewport.clientWidth, height = Number(stage.dataset.graphHeight), zoom = graphZoomPercent();
  if (!width || !height) return;
  // 以画布当前可见中心为锚点缩放；缩小时保留居中留白，放大后用滚动条查看。
  const oldScale = oldZoom / 100, scale = zoom / 100;
  const cx = (viewport.scrollLeft + width/2 - Math.max(0,(width-width*oldScale)/2)) / oldScale;
  const cy = (viewport.scrollTop + viewport.clientHeight/2 - Math.max(0,(viewport.clientHeight-height*oldScale)/2)) / oldScale;
  content.style.width = `${width}px`;
  content.style.height = `${height}px`;
  content.style.transform = `scale(${scale})`;
  space.style.width = `${width*scale}px`;
  space.style.height = `${height*scale}px`;
  viewport.scrollLeft = center ? Math.max(0,(width*scale-width)/2) : Math.max(0,cx*scale-width/2);
  viewport.scrollTop = center ? Math.max(0,(height*scale-viewport.clientHeight)/2) : Math.max(0,cy*scale-viewport.clientHeight/2);
  const level = document.getElementById('graph-zoom-level');
  if (level) level.textContent = `${zoom}%`;
  const zoomOut = document.getElementById('graph-zoom-out'), zoomIn = document.getElementById('graph-zoom-in');
  if (zoomOut) zoomOut.disabled = zoom <= 50;
  if (zoomIn) zoomIn.disabled = zoom >= 200;
}

function setGraphZoom(percent) {
  const previous = graphZoomPercent();
  if (!Number.isFinite(percent)) return;
  state.graphZoom = Math.min(200,Math.max(50,percent));
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
  if (!o) return `<div class="empty">还没有业务对象</div>`;
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
  if (route === 'graph') state.query = '';
  navigateBeforeGraphExplorer(route);
};

// 原型会整体重绘页面：重绘后重新应用画布尺寸，保留对象、缩放和全屏状态。
const renderBeforeGraphViewport = render;
render = function() {
  if (state.route !== 'objects' || state.tab !== 'graph') state.graphFullscreen = false;
  renderBeforeGraphViewport();
  if (!state.drawer && !state.wizard) document.body.style.overflow = state.graphFullscreen ? 'hidden' : '';
  if (state.route === 'objects' && state.tab === 'graph') syncGraphViewport(true);
};
document.addEventListener('keydown',e => {
  if (state.route !== 'objects' || state.tab !== 'graph' || !state.graphFullscreen || state.drawer || state.wizard) return;
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
window.addEventListener?.('resize',() => { if (state.route === 'objects' && state.tab === 'graph') syncGraphViewport(true); });

pages.graph = () => { state.tab = 'graph'; return objectsPage(); };
pages.relations = () => { state.tab = 'relations'; return objectsPage(); };
render();
