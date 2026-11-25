/* 配置删除闭环：引用检查、确认、会话更新与审计。与 V3 的同一份状态交互。 */
'use strict';

// 内置规则直接读取的业务含义字段也属于依赖，不能仅检查表单对应关系。
const rulePropertyDependencies = [
  ['Material.inCatalog','商品目录资料完整性'],
  ['Material.modelCode','商品目录资料完整性'],
  ['Certification.materialCode','产品认证区域与有效期'],
  ['Certification.region','产品认证区域与有效期'],
  ['Certification.status','产品认证区域与有效期'],
  ['Certification.validUntil','产品认证区域与有效期'],
  ['Mapping.mainOrderId','Mapping 引用完整性'],
  ['Mapping.releaseItemRef','Mapping 引用完整性'],
  ['Mapping.moduleOrderRef','Mapping 引用完整性'],
  ['Mapping.softwareCode','Mapping 引用完整性']
];

function sceneTemplateErrors(s) {
  if(s.workflow?.type==='qa'&&s.workflow.application?.qaScope==='platform')return [];
  const errors = [];
  if (!obj(s.root)) errors.push(`主对象 ${s.root}`);
  for (const id of sceneAbilities(s)) if (!ability(id)) errors.push(`取数能力 ${id}`);
  for (const b of Object.values(s.bindings).flat()) {
    const [oid,pid] = b.ontology.split('.');
    if (!obj(oid)?.props.some(p => p.id === pid)) errors.push(`本体对象属性 ${b.ontology}`);
  }
  return [...new Set(errors)];
}

function propertyDeleteReferences(o, p) {
  const path = `${o.id}.${p.id}`, refs = [];
  if (p.key) refs.push('这是对象的记录的唯一编号，请先在“编辑定义”中将其他属性设为记录的唯一编号。');
  if (p.display) refs.push('这是列表显示名称，请先将其他属性设为列表显示名称。');
  for (const c of capabilities) {
    if (c.maps.some(m => m.target === path)) refs.push(`取数能力“${c.name}”对应关系到 ${path}，请先调整或移除该对应关系。`);
  }
  for (const s of Object.values(appScenes)) {
    for (const [block, bs] of Object.entries(s.bindings)) {
      for (const b of bs.filter(b => b.ontology === path)) refs.push(`场景“${s.name} / ${s.names[block]}”的“${b.label}”引用此属性，请先删除或修改该绑定。`);
    }
  }
  for (const r of relations) {
    if (relationUsesAttribute(r,o.id,p.id)) refs.push(`对象关系“${r.name}”使用此属性，请先调整或删除该关系。`);
  }
  for (const [dependency, rule] of rulePropertyDependencies) {
    if (dependency === path) refs.push(`内置规则“${rule}”读取此属性，当前原型固定模板暂不支持解除该依赖。`);
  }
  return refs;
}

function deletionPlan(kind, target, owner = {}) {
  const refs = [];
  let exists = false, label = '', detail = '';
  if (kind === 'prop') {
    const o = obj(owner.object);
    exists = !!o?.props.includes(target);
    label = `属性“${target.name}”`;
    detail = `${owner.object}.${target.id}；仅删除属性定义，不删除源系统字段。`;
    if (exists) refs.push(...propertyDeleteReferences(o, target));
  } else if (kind === 'knowledgeLink') {
    exists = knowledgeLinks.includes(target);
    label = `知识关联“${target.title}”`;
    detail = `关联对象：${target.objects.map(name).join('、')}。只移除此关联，保留文档和本体对象。`;
  } else if (kind === 'manualRecord') {
    exists = !!manualInstances[owner.object]?.includes(target);
    label = `手工记录“${target.identity}”`;
    detail = '仅删除当前会话中的这条手工记录，保留本体对象、属性定义及其他记录。';
  } else if (kind === 'object') {
    exists = objects.includes(target);
    label = `本体对象“${target.name}”`;
    detail = `${target.id}；同时移除本对象的 ${target.props.length} 个属性定义，不删除源系统数据。`;
    if (objects.length === 1) refs.push('工作区至少需要保留一个本体对象。');
    for (const k of knowledgeLinks.filter(k => k.objects.includes(target.id))) refs.push(`知识“${k.title}”关联了此对象，请先删除知识关联。`);
    for (const c of capabilities.filter(c => c.object === target.id || c.maps.some(m => m.target.startsWith(target.id + '.')))) refs.push(`取数能力“${c.name}”输出到此对象，请先调整或删除查询。`);
    for (const r of relations.filter(r => r.from === target.id || r.to === target.id)) refs.push(`对象关系“${r.name}”关联此对象，请先调整或删除关系。`);
    for (const o of objects.filter(o => o !== target)) {
      for (const p of o.props.filter(p => p.ref === target.id)) refs.push(`“${o.name}.${p.name}”的引用类型指向此对象，请先调整该属性。`);
    }
    for (const s of Object.values(appScenes)) {
      if (s.root === target.id) refs.push(`场景“${s.name}”以此对象为主对象，请先删除该场景。`);
      if (Object.values(s.bindings).flat().some(b => b.ontology.startsWith(target.id + '.'))) refs.push(`场景“${s.name}”绑定了此对象的属性，请先调整表单填入设置。`);
      if (target.id === 'Material') refs.push(`场景“${s.name}”的候选策略依赖共享整机物料身份。`);
    }
    for (const r of rules.filter(r => r.obj === target.name && r.level !== '未启用' && r.enabled !== false)) refs.push(`内置规则“${r.name}”使用此对象，当前原型固定模板暂不支持解除该依赖。`);
  } else if (kind === 'relation') {
    exists = relations.includes(target);
    label = `对象关系“${target.name}”`;
    detail = `${name(target.from)} → ${name(target.to)}；只移除关系定义，保留两端对象及属性。`;
  } else if (kind === 'binding') {
    const s = appScenes[owner.scene];
    exists = !!s?.bindings[owner.block]?.includes(target);
    label = `字段绑定“${target.label}”`;
    detail = `${s?.name || owner.scene} / ${s?.names[owner.block] || owner.block}：${target.ontology} → ${target.target}；仅影响该场景。`;
  } else if (kind === 'capability') {
    exists = capabilities.includes(target);
    label = `取数能力“${target.name}”`;
    detail = `${target.id}；同时移除参数和来源字段对应，保留系统连接、本体对象定义及源系统数据。`;
    for (const s of usedScenes(target.id)) refs.push(`场景“${s.name}”使用此查询，请先调整数据更新方式或删除场景。${[s.bom && 'plm.queryBom',s.cert && 'cert.queryApplicable',sceneKind(s) === 'release' && 'software.getPackage'].includes(target.id) ? '该查询由此场景的内置规则模板固定引用。' : ''}`);
  } else if (kind === 'connector') {
    exists = systemConnectors.includes(target);
    label = `系统连接“${target.name}”`;
    detail = `${target.id}；仅移除连接配置，不删除外部系统或源数据。`;
    for (const c of capabilities.filter(c => c.connector === target.id)) refs.push(`取数能力“${c.name}”使用此系统连接，请先调整或删除查询。`);
  } else if (kind === 'scene') {
    exists = appScenes[target.id] === target;
    label = `应用场景“${target.name}”`;
    detail = `同时删除此场景的 ${Object.values(target.bindings).flat().length} 项字段绑定、数据更新方式、上下文与规则配置；保留本体对象管理、系统连接和查询。`;
    if (target.id === 'release') refs.push('“产品发布”是智能提单与完整发布校验的内置演示场景，当前原型需保留。自行创建的场景可删除，包括基于产品发布模板创建的场景。');
  }
  if (!exists) refs.unshift(kind === 'manualRecord' ? '此手工记录已不存在，请关闭面板后刷新列表。' : '此配置已不存在，请关闭面板后刷新列表。');
  return {exists, label, detail, refs: [...new Set(refs)]};
}

function requestDeletion(kind, target, owner = {}) {
  if (!target) return toast('配置已不存在，请刷新列表');
  openDrawer('deleteConfig', {}, {deleteKind:kind, target, owner});
}

function deletionDrawer() {
  const d = state.drawer, plan = deletionPlan(d.deleteKind, d.target, d.owner), manual = d.deleteKind === 'manualRecord', knowledge = d.deleteKind === 'knowledgeLink';
  return frame(plan.refs.length ? '暂不能删除' : manual ? '确认删除手工记录' : knowledge ? '确认删除关联' : '确认删除配置', manual ? '确认后从当前会话移除此记录。' : '删除仅影响当前会话；刷新页面可恢复初始示例。',
    `<h3 class="deletion-summary">${esc(plan.label)}</h3><p class="tiny muted section-gap deletion-summary">${esc(plan.detail)}</p><div class="section-gap">${plan.refs.length ? inf('请先处理以下依赖，再重新尝试删除。','amber') + `<ul class="deletion-list">${plan.refs.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : inf('确认后立即从当前工作区移除；相关测试结果及提交校验会失效。','amber')}</div>`,
    plan.refs.length ? '' : btn('确认删除','confirm-delete-config','danger'));
}
extraDrawers.deleteConfig = deletionDrawer;

function confirmDeletion() {
  const d = state.drawer;
  if (d?.type !== 'deleteConfig') return;
  const {deleteKind:kind, target, owner} = d, plan = deletionPlan(kind, target, owner);
  // 确认时重新校验依赖，避免确认面板打开后数据变更导致悬空引用。
  if (plan.refs.length) { drawOverlay(); return; }
  const remove = list => list.splice(list.indexOf(target), 1);
  if (kind === 'prop') {
    const o = obj(owner.object); remove(o.props); o.status = '有变更';
  } else if (kind === 'object') {
    remove(objects);
    if (state.object === target.id) { state.object = objects[0].id; state.tab = 'props'; state.domain = 'ALL'; state.query = ''; }
    if (studio.capObject === target.id) studio.capObject = 'ALL';
  } else if (kind === 'knowledgeLink') remove(knowledgeLinks);
  else if (kind === 'manualRecord') {
    remove(manualInstances[owner.object]);
    for (const s of Object.values(appScenes)) if (s.workflow?.instanceSource === 'manual') s.revision++;
  } else if (kind === 'relation') remove(relations);
  else if (kind === 'binding') {
    const s = appScenes[owner.scene]; remove(s.bindings[owner.block]); s.revision++; s.lastResult = null;
  } else if (kind === 'capability') remove(capabilities);
  else if (kind === 'connector') {
    remove(systemConnectors);
    if (studio.connector === target.id) { studio.connector = systemConnectors[0]?.id || ''; studio.connectorTab = 'capabilities'; }
  } else if (kind === 'scene') {
    delete appScenes[target.id];
    if (studio.scene === target.id) selectScene(Object.keys(appScenes)[0]);
  }
  changed();
  if (!['binding','scene'].includes(kind)) Object.values(appScenes).forEach(s => { s.lastResult = null; });
  log(kind === 'manualRecord' ? '记录删除' : '配置删除',plan.label,'成功',plan.detail);
  closeOverlay(true); render(); toast(`${plan.label}已删除`);
}

Object.assign(actionsMap, {
  'delete-knowledge-link': el => requestDeletion('knowledgeLink',knowledgeLinks[Number(el.dataset.index)]),
  'delete-prop': el => requestDeletion('prop',obj().props[Number(el.dataset.index)],{object:obj().id}),
  'delete-object': el => requestDeletion('object',obj(el.dataset.id)),
  'delete-relation': el => requestDeletion('relation',relations[Number(el.dataset.index)]),
  'delete-scene-binding': el => requestDeletion('binding',scene().bindings[scene().selectedBlock][Number(el.dataset.index)],{scene:scene().id,block:scene().selectedBlock}),
  'delete-capability': el => requestDeletion('capability',ability(el.dataset.id)),
  'delete-connector': el => requestDeletion('connector',connector(el.dataset.id)),
  'delete-scene': el => requestDeletion('scene',appScenes[el.dataset.id]),
  'confirm-delete-config': confirmDeletion
});

// 系统连接被全部清理时仍然保留可恢复的新增入口。
const connectorsPageBeforeDeletion = connectorsPage;
connectorsPage = function() {
  if (!connector()) studio.connector = systemConnectors[0]?.id || '';
  if (!systemConnectors.length) return header('系统连接','统一管理系统访问方式及可复用的取数能力。',btn('新增系统连接','add-connector','primary','plus'),'数据接入') + '<section class="panel"><div class="empty">尚无系统连接，请点击“新增系统连接”建立连接。</div></section>';
  return connectorsPageBeforeDeletion();
};

const configErrorsBeforeDeletion = configErrors;
configErrors = function() {
  const errors = configErrorsBeforeDeletion();
  for (const r of relations) {
    const issue = relationAttributeIssue(r);
    if (issue) errors.push(`关系“${r.name}”：${issue}`);
  }
  for (const o of objects) for (const p of o.props) {
    if (p.ref && !obj(p.ref)) errors.push(`${o.name}.${p.name} 引用的对象不存在`);
  }
  for (const s of Object.values(appScenes)) {
    if (!(s.workflow?.type==='qa'&&s.workflow.application?.qaScope==='platform')&&!obj(s.root)) errors.push(`${s.name} 的主对象不存在`);
    for (const id of sceneAbilities(s)) if (!ability(id)) errors.push(`${s.name} 引用的取数能力不存在：${id}`);
  }
  return [...new Set(errors)];
};
Object.assign(pages,{connections:connectorsPage,graph:graphPage});
render();
