const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');

function full() {
  const run = workspace();
  const loaded = new Set(['app.js', 'scene-system.js', 'deletion.js', 'graph-explorer.js']);
  for (const [,file] of fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').matchAll(/src="([^"?]+)\?/g)) {
    if (!loaded.has(file)) {
      run(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
      loaded.add(file);
    }
  }
  return run;
}

// No browser or third-party DOM dependency: this fixture implements node identity,
// actual attributes/childNodes, and the insertion/removal semantics used by reconcile.
function makeDOM() {
  let document;
  class Node {
    constructor(type, name, text = '') {
      this.nodeType = type;
      this.nodeName = name;
      this.nodeValue = type === 3 ? text : null;
      this.ownerDocument = document;
      this.parentNode = null;
      this.childNodes = [];
    }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes.at(-1) || null; }
    get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null; }
    get previousSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) - 1] || null; }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get children() { return this.childNodes.filter(n => n.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; }
    get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(n => n.textContent).join(''); }
    set textContent(value) {
      if (this.nodeType === 3) { this.nodeValue = String(value); return; }
      this.replaceChildren();
      if (String(value)) this.appendChild(document.createTextNode(String(value)));
    }
    appendChild(node) { return this.insertBefore(node, null); }
    insertBefore(node, before) {
      if (before === node) return node;
      if (before !== null && before.parentNode !== this) throw Error('insertBefore reference is not a child');
      if (node.nodeType === 11) { for (const child of [...node.childNodes]) this.insertBefore(child, before); return node; }
      if (node.parentNode) node.parentNode.removeChild(node);
      const index = before === null ? this.childNodes.length : this.childNodes.indexOf(before);
      this.childNodes.splice(index, 0, node);
      node.parentNode = this;
      return node;
    }
    removeChild(node) {
      const index = this.childNodes.indexOf(node);
      if (index < 0) throw Error('removeChild target is not a child');
      this.childNodes.splice(index, 1);
      node.parentNode = null;
      return node;
    }
    replaceChild(next, current) { this.insertBefore(next, current); this.removeChild(current); return current; }
    replaceWith(next) { this.parentNode?.replaceChild(next, this); }
    remove() { this.parentNode?.removeChild(this); }
    replaceChildren(...nodes) { for (const n of [...this.childNodes]) this.removeChild(n); for (const n of nodes) this.appendChild(n); }
    contains(node) { return node === this || this.childNodes.some(n => n.contains(node)); }
    cloneNode(deep = false) {
      const copy = this.nodeType === 1 ? document.createElement(this.localName) : this.nodeType === 3 ? document.createTextNode(this.nodeValue) : document.createDocumentFragment();
      if (this.nodeType === 1) {
        for (const a of this.attributes) copy.setAttribute(a.name, a.value);
        if (this.localName === 'input' || this.localName === 'textarea') copy.value = this.value;
      }
      if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
      return copy;
    }
    querySelectorAll(selector) {
      const matches = [];
      const visit = n => { for (const c of n.childNodes) { if (c.nodeType === 1 && c.matches(selector)) matches.push(c); visit(c); } };
      visit(this);
      return matches;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  class Element extends Node {
    constructor(tag) {
      super(1, tag.toUpperCase());
      this.localName = tag.toLowerCase();
      this.tagName = this.nodeName;
      this._attributes = new Map();
      this._value = undefined;
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.style = {};
      this.classList = {add() {}, remove() {}};
    }
    get attributes() { return [...this._attributes].map(([name, value]) => ({name, value})); }
    get dataset() { return Object.fromEntries(this.attributes.filter(a => a.name.startsWith('data-')).map(a => [a.name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), a.value])); }
    getAttribute(name) { return this._attributes.get(name) ?? null; }
    hasAttribute(name) { return this._attributes.has(name); }
    getAttributeNames() { return [...this._attributes.keys()]; }
    setAttribute(name, value) { this._attributes.set(name, String(value)); }
    removeAttribute(name) { this._attributes.delete(name); }
    get id() { return this.getAttribute('id') || ''; }
    get className() { return this.getAttribute('class') || ''; }
    set className(value) { this.setAttribute('class', value); }
    get type() { return this.getAttribute('type') || (this.localName === 'input' ? 'text' : ''); }
    set type(value) { this.setAttribute('type', value); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(value) { value ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
    get checked() { return this.hasAttribute('checked'); }
    set checked(value) { value ? this.setAttribute('checked', '') : this.removeAttribute('checked'); }
    get selected() { return this.hasAttribute('selected'); }
    set selected(value) { value ? this.setAttribute('selected', '') : this.removeAttribute('selected'); }
    get open() { return this.hasAttribute('open'); }
    set open(value) { value ? this.setAttribute('open', '') : this.removeAttribute('open'); }
    get options() { return this.localName === 'select' ? this.querySelectorAll('option') : undefined; }
    get value() {
      if (this._value !== undefined) return this._value;
      if (this.localName === 'select') return (this.options.find(o => o.selected) || this.options[0])?.value || '';
      if (this.localName === 'textarea') return this.textContent;
      return this.getAttribute('value') ?? (this.localName === 'option' ? this.textContent : '');
    }
    set value(value) {
      this._value = String(value);
      if (this.localName === 'select') for (const o of this.options) o.selected = o.value === this._value;
    }
    focus() { document.activeElement = this; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        const tag = part.match(/^[a-z][a-z0-9-]*/i)?.[0];
        if (tag && this.localName !== tag.toLowerCase()) return false;
        const id = part.match(/#([\w-]+)/)?.[1];
        if (id && this.id !== id) return false;
        for (const [,name,value] of part.matchAll(/\[([^\]=\s]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
          if (!this.hasAttribute(name) || (value !== undefined && this.getAttribute(name) !== value)) return false;
        }
        const cls = part.match(/\.([\w-]+)/)?.[1];
        return !cls || this.className.split(/\s+/).includes(cls);
      });
    }
    closest(selector) { let n = this; while (n) { if (n.matches?.(selector)) return n; n = n.parentElement; } return null; }
  }
  function parseHTML(html) {
    const fragment = document.createDocumentFragment(), stack = [fragment];
    const decode = s => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[entity]);
    for (const [token] of String(html).matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)) {
      if (token.startsWith('<!--')) continue;
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1).appendChild(document.createTextNode(decode(token))); continue; }
      const tag = token.match(/^<([\w-]+)/)?.[1];
      if (!tag) continue;
      const node = document.createElement(tag);
      const attributes = token.slice(tag.length + 1).replace(/\/?\s*>$/, '');
      for (const [, name, quoted, single, bare] of attributes.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) node.setAttribute(name, decode(quoted ?? single ?? bare ?? ''));
      stack.at(-1).appendChild(node);
      if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag) && !token.endsWith('/>')) stack.push(node);
    }
    return fragment;
  }
  document = {
    activeElement: null,
    createElement(tag) {
      const element = new Element(tag);
      if (tag.toLowerCase() === 'template') {
        element.content = document.createDocumentFragment();
        Object.defineProperty(element, 'innerHTML', {set(html) { this.content = parseHTML(html); }});
      }
      return element;
    },
    createTextNode(text) { return new Node(3, '#text', String(text)); },
    createDocumentFragment() { return new Node(11, '#document-fragment'); }
  };
  function el(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    for (const child of children) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    return node;
  }
  return {document, el};
}

const open = `selectScene('release');actionsMap['scene-release-edit']({dataset:{id:'release'}});actionsMap['workflow-rule-authoring']();`;
const helpers = `
  const fixture = (${makeDOM.toString()})();
  function change(dataset, value, tag = 'select') {
    const attrs = Object.fromEntries(Object.entries(dataset).map(([key, v]) => ['data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), v]));
    const control = fixture.el(tag, attrs);
    control.value = value;
    dispatchTestEvent('change', control);
    return control;
  }
  function spyOverlay() { globalThis.overlayDraws = 0; drawOverlay = () => { overlayDraws++; }; }
  function installDOM() {
    document.createElement=fixture.document.createElement;
    Object.defineProperty(document,'activeElement',{get(){return fixture.document.activeElement;},set(node){fixture.document.activeElement=node;},configurable:true});
  }
  function mainHTML() {
    const template=fixture.document.createElement('template');template.innerHTML=workflowRuleAuthoringCardHTML(scene(),state.drawer.draft);
    return template.content.querySelector('[data-rule-card-basic]');
  }
  function mountDrawer() {
    installDOM();
    const {el}=fixture, template=document.createElement('template');
    template.innerHTML=workflowRuleAuthoringStepsHTML(state.drawer.draft.card)+workflowRuleAuthoringCardHTML(scene(),state.drawer.draft);
    const intent=el('div',{'data-rule-intent-preview':''},[template.content]);
    const original=el('textarea',{'data-field':'originalText'});original.value=state.drawer.draft.originalText;
    const preview=el('div',{'data-rule-authoring-preview':''},['上次生成的草稿']);
    const confirm=el('button',{'data-action':'workflow-rule-confirm'});
    const body=el('div',{class:'drawer-body body'},[original,intent,preview]);
    const domRoot=el('div',{},[el('section',{class:'drawer'},[body,confirm])]);
    overlayRoot.querySelector=selector=>domRoot.querySelector(selector);
    overlayRoot.querySelectorAll=selector=>domRoot.querySelectorAll(selector);
    function changeAt(selector,value) {
      const target=intent.querySelector(selector);assert(target,'fixture control must exist: '+selector);
      target.value=value;dispatchTestEvent('change',target);return target;
    }
    return {intent,original,preview,confirm,body,domRoot,changeAt};
  }
  function reference(kind, index) { const c = state.drawer.draft.card; return c.references.find(r => r.id === c[kind][index].reference); }
  function queryReference() { const c = state.drawer.draft.card; return c.references.findIndex(r => r.query === c.queries[0].id); }
  function direct() { change({cardValidationMode:''}, 'interface'); change({cardQuery:'0', key:'capability'}, 'demo.materialValidation'); }
`;
function scenario(name, code) { test(name, () => full()(helpers + open + code)); }

const eventCases = [
  ['合并属性 data-card-choice', '', `change({cardChoice:'assertions',index:'0'},'ReleaseOrder.releaseSubject');assert.equal(reference('assertions',0).path,'ReleaseOrder.releaseSubject');`],
  ['判断方式 data-card-clause', `change({cardChoice:'assertions',index:'0'},'ReleaseOrder.region');`, `change({cardClause:'assertions',index:'0',key:'op'},'eq');assert.equal(state.drawer.draft.card.assertions[0].op,'eq');`],
  ['执行范围 data-field=scope', `change({cardChoice:'assertions',index:'0'},'ReleaseOrder.region');`, `change({field:'scope'},'main');assert.equal(state.drawer.draft.scopeManual,true);assert.equal(state.drawer.draft.card.scope,'main');`],
  ['失败级别 data-card-setting=level', '', `change({cardSetting:'level'},'警告');assert.equal(state.drawer.draft.card.level,'警告');`],
  ['校验方式 data-card-validation-mode', '', `change({cardValidationMode:''},'interface');assert.equal(state.drawer.draft.card.validationMethod,'interface');assert.equal(state.drawer.draft.card.queries.length,1);`],
  ['已登记接口 data-card-query', `change({cardValidationMode:''},'interface');`, `change({cardQuery:'0',key:'capability'},'demo.materialValidation');assert.equal(state.drawer.draft.card.queries[0].resultMode,'decision');assert.equal(state.drawer.draft.card.queries[0].params[0].name,'materialCode');`],
  ['接口入参路径 data-card-param-path', `direct();`, `change({cardParamPath:'0',index:'0'},'Material.materialCode');const c=state.drawer.draft.card;assert.equal(c.references.find(r=>r.id===c.queries[0].params[0].reference).path,'Material.materialCode');`],
  ['高级接口入参 data-card-param', `direct();`, `const ref=state.drawer.draft.card.queries[0].params[0].reference;change({cardParam:'0',index:'0',key:'reference'},ref);assert.equal(state.drawer.draft.card.queries[0].params[0].reference,ref);`],
  ['登记接口地址 data-card-endpoint', `change({cardValidationMode:''},'interface');`, `change({cardEndpoint:'0'},'demo.materialValidation','input');assert.equal(state.drawer.draft.card.queries[0].capability,'demo.materialValidation');assert.equal(state.drawer.draft.card.queries[0].resultMode,'decision');`],
  ['失败提示 data-card-setting=message', '', `change({cardSetting:'message'},'请核对业务信息','input');assert.equal(state.drawer.draft.card.message,'请核对业务信息');`],
  ['接口返回方式 data-card-result-mode', `change({cardValidationMode:''},'interface');change({cardQuery:'0',key:'capability'},'demo.minimumByMaterial');`, `change({cardResultMode:'0'},'decision');assert.equal(state.drawer.draft.card.queries[0].resultMode,'decision');`],
  ['接口结论 data-card-decision', `direct();`, `change({cardDecision:'0',key:'passValue'},'false');assert.equal(state.drawer.draft.card.queries[0].passValue,false);assert.equal(state.drawer.draft.card.assertions[0].value,false);`],
  ['高级本体属性 data-card-ref', `change({cardChoice:'assertions',index:'0'},'ReleaseOrder.region');`, `change({cardRef:'0',key:'path'},'ReleaseOrder.releaseSubject');assert.equal(state.drawer.draft.card.references[0].path,'ReleaseOrder.releaseSubject');`],
  ['返回类型 data-card-ref', `change({cardValidationMode:''},'interface');change({cardQuery:'0',key:'capability'},'demo.minimumByMaterial');`, `change({cardRef:String(queryReference()),key:'type'},'布尔');assert.equal(state.drawer.draft.card.queries[0].type,'布尔');`]
];
for (const [label, setup, assertion] of eventCases) {
  scenario(`合法 change 不重绘抽屉：${label}（workspace 无 DOM）`, `
    ${setup}
    const root=overlayRoot, body=root.querySelector('.drawer .body');
    assert.equal(root.querySelector('[data-rule-intent-preview]'),null);
    state.drawer.generated={id:'previous-draft'};state.drawer.generatedFingerprint='previous';
    spyOverlay();
    ${assertion}
    assert.equal(overlayDraws,0,'ordinary legal change must not call drawOverlay');
    assert.equal(overlayRoot,root);assert.equal(root.querySelector('.drawer .body'),body);
    assert.equal(state.drawer.generated,null);assert.equal(state.drawer.generatedFingerprint,null);assert.equal(state.drawer.dirty,true);
  `);
}

scenario('无 intent DOM 时合法下拉 change 仅更新状态，不替换原文与抽屉 body', `
  const root=overlayRoot, text=fixture.el('textarea',{'data-field':'originalText'},['保留的原文']);
  const body=fixture.el('div',{'class':'body'},[text]), confirm=fixture.el('button',{'data-action':'workflow-rule-confirm'}), preview=fixture.el('div',{'data-rule-authoring-preview':''});
  body.scrollTop=271;text.focus();text.setSelectionRange(2,5);
  root.querySelector=selector=>selector.includes('rule-intent-preview')?null:selector.includes('rule-authoring-preview')?preview:selector.includes('workflow-rule-confirm')?confirm:selector.includes('originalText')?text:selector.includes('body')?body:null;
  root.querySelectorAll=()=>[];
  state.drawer.generated={id:'previous-draft'};spyOverlay();
  change({cardSetting:'level'},'警告');
  assert.equal(overlayDraws,0);assert.equal(overlayRoot,root);assert.equal(root.querySelector('.drawer .body'),body);
  assert.equal(root.querySelector('[data-field="originalText"]'),text);assert.equal(text.value,'保留的原文');assert.equal(body.scrollTop,271);
  assert.equal(fixture.document.activeElement,text);assert.equal(text.selectionStart,2);assert.equal(text.selectionEnd,5);
  assert.equal(state.drawer.generated,null);
`);

scenario('字段类型切换仍更新值输入形态、入参、返回判定与生成失效', `
  spyOverlay();
  change({cardChoice:'assertions',index:'0'},'ReleaseOrder.region');change({cardClause:'assertions',index:'0',key:'op'},'eq');
  assert(mainHTML().querySelector('input[data-card-clause="assertions"][data-key="value"]'));
  change({cardClause:'assertions',index:'0',key:'op'},'exists');assert.equal(mainHTML().querySelector('input[data-card-clause="assertions"][data-key="value"]'),null);
  direct();let main=mainHTML();assert(main.querySelector('[data-card-param-path="0"]'));assert(main.querySelector('[data-card-decision="0"]'));assert(main.textContent.includes('true → 通过'));
  change({cardQuery:'0',key:'capability'},'demo.minimumByMaterial');main=mainHTML();assert(main.textContent.includes('返回属性 / 路径'));assert.equal(main.querySelector('[data-card-decision="0"]'),null);
  change({cardRef:String(queryReference()),key:'type'},'布尔');assert(mainHTML().querySelector('select[data-card-clause="assertions"][data-key="value"]'));
  assert.equal(overlayDraws,0);assert.equal(state.drawer.generated,null);
`);

scenario('Refresh 真实 change 原位 reconcile，保持壳/控件/focus/details/滚动并禁用确认', `
  const root=overlayRoot,{intent,original,preview,confirm,body,changeAt}=mountDrawer();
  const level=intent.querySelector('[data-card-setting="level"]'),details=intent.querySelector('[data-rule-card-advanced]');
  details.open=true;details.scrollTop=81;body.scrollTop=240;body.scrollLeft=17;level.focus();
  const scrollOrigin=body.scrollTop;level.getBoundingClientRect=()=>({top:400-body.scrollTop});
  state.drawer.generated={id:'old'};state.drawer.generatedFingerprint='old';spyOverlay();
  changeAt('[data-card-setting="level"]','警告');
  assert.equal(overlayDraws,0);assert.equal(overlayRoot,root);assert.equal(root.querySelector('.drawer-body'),body);
  assert.equal(root.querySelector('[data-rule-intent-preview]'),intent);assert.equal(root.querySelector('[data-field="originalText"]'),original);
  assert.equal(intent.querySelector('[data-card-setting="level"]'),level);assert.equal(level.value,'警告');assert.equal(document.activeElement,level);
  assert.equal(intent.querySelector('[data-rule-card-advanced]'),details);assert.equal(details.open,true);assert.equal(details.scrollTop,81);
  assert.equal(body.scrollTop,scrollOrigin);assert.equal(body.scrollLeft,17);assert.equal(confirm.disabled,true);assert.equal(confirm.getAttribute('aria-disabled'),'true');
  assert(preview.textContent.includes('重新生成'));assert.equal(state.drawer.generated,null);
  const choice=changeAt('[data-card-choice="assertions"]','ReleaseOrder.region');
  assert.equal(intent.querySelector('[data-card-choice="assertions"]'),choice);
  const op=changeAt('[data-card-clause="assertions"][data-key="op"]','eq');
  const basic=intent.querySelector('[data-rule-card-basic]'),literal=basic.querySelector('input[data-card-clause="assertions"][data-key="value"]');assert(literal);
  literal.focus();literal.setSelectionRange(0,0);const before=literal;
  changeAt('[data-card-setting="level"]','阻断');
  assert.equal(intent.querySelector('[data-rule-card-basic]').querySelector('input[data-card-clause="assertions"][data-key="value"]'),before);assert.equal(document.activeElement,literal);
  changeAt('[data-card-clause="assertions"][data-key="op"]','exists');
  assert.equal(intent.querySelector('[data-card-clause="assertions"][data-key="op"]'),op);
  assert.equal(intent.querySelector('[data-rule-card-basic]').querySelector('input[data-card-clause="assertions"][data-key="value"]'),null);
  assert.equal(intent.querySelector('[data-rule-card-advanced]'),details);assert.equal(details.open,true);assert.equal(overlayDraws,0);
`);

scenario('Refresh 接口变化原位更新参数/返回方式/值形态，保留现有接口控件', `
  direct();const {intent,changeAt,body,confirm}=mountDrawer();spyOverlay();
  const query=intent.querySelector('[data-card-query="0"]'),params=intent.querySelector('[data-card-param-path="0"]'),result=intent.querySelector('[data-card-result-mode="0"]');
  const details=intent.querySelector('[data-rule-card-advanced]');details.open=true;body.scrollTop=192;query.focus();
  assert.equal(result.disabled,true);assert(intent.querySelector('[data-card-decision="0"]'));
  changeAt('[data-card-query="0"]','demo.minimumByMaterial');
  assert.equal(intent.querySelector('[data-card-query="0"]'),query);assert.equal(query.value,'demo.minimumByMaterial');assert.equal(document.activeElement,query);
  assert.equal(intent.querySelector('[data-card-param-path="0"]'),params);assert.equal(params.value,'Material.materialCode');
  assert.equal(intent.querySelector('[data-card-result-mode="0"]'),result);assert.equal(result.disabled,false);assert.equal(result.value,'data');assert.equal(intent.querySelector('[data-card-decision="0"]'),null);
  let output=intent.querySelector('[data-card-ref][data-key="output"]');assert(output);assert(output.options.length>1);
  const type=intent.querySelector('[data-card-ref][data-key="type"]');type.value='布尔';dispatchTestEvent('change',type);
  assert.equal(intent.querySelector('[data-card-ref][data-key="type"]'),type);
  assert(intent.querySelector('[data-rule-card-basic]').querySelector('select[data-card-clause="assertions"][data-key="value"]'));
  changeAt('[data-card-result-mode="0"]','decision');assert.equal(intent.querySelector('[data-card-result-mode="0"]'),result);
  assert(intent.querySelector('[data-card-decision="0"]'));assert.equal(intent.querySelector('[data-rule-card-advanced]'),details);assert.equal(details.open,true);assert.equal(body.scrollTop,192);
  assert.equal(confirm.disabled,true);assert.equal(overlayDraws,0);
`);

scenario('Refresh 删除第一条检查后保留后条控件，稳定 key 跨 data-index 移位', `
  change({cardChoice:'assertions',index:'0'},'ReleaseOrder.region');
  actionsMap['workflow-rule-card-add-clause']({dataset:{kind:'assertions'}});
  change({cardChoice:'assertions',index:'1'},'ReleaseOrder.releaseSubject');
  const {intent,body}=mountDrawer(),basic=intent.querySelector('[data-rule-card-basic]');
  const first=basic.querySelector('[data-card-choice="assertions"][data-index="0"]'),kept=basic.querySelector('[data-card-choice="assertions"][data-index="1"]');
  kept.focus();body.scrollTop=333;const details=intent.querySelector('[data-rule-card-advanced]');details.open=true;spyOverlay();
  actionsMap['workflow-rule-card-remove']({dataset:{kind:'assertions',index:'0'}});
  const after=intent.querySelector('[data-rule-card-basic]').querySelector('[data-card-choice="assertions"][data-index="0"]');
  assert.equal(after,kept);assert.notEqual(after,first);assert(!body.contains(first));assert.equal(after.value,'ReleaseOrder.releaseSubject');
  assert.equal(document.activeElement,kept);assert.equal(body.scrollTop,333);assert.equal(intent.querySelector('[data-rule-card-advanced]'),details);assert.equal(details.open,true);assert.equal(overlayDraws,0);
`);

function patchScenario(name, code) {
  scenario(name, `
    assert.equal(typeof workflowRuleAuthoringPatchNode,'function');
    assert.equal(typeof workflowRuleAuthoringPatchChildren,'function');
    assert.equal(typeof workflowRuleAuthoringNodeKey,'function');
    const {el,document:doc}=fixture;
    ${code}
  `);
}

patchScenario('PatchNode 保留 select 身份、焦点与滚动，同时刷新 options/value/disabled', `
  const current=el('select',{'data-card-query':'0','data-key':'capability','disabled':'','aria-label':'旧标签'},[
    el('option',{value:'old',selected:''},['旧接口']),el('option',{value:'same'},['旧标题'])
  ]), next=el('select',{'data-card-query':'0','data-key':'capability','aria-label':'新标签'},[
    el('option',{value:'same'},['新标题']),el('option',{value:'new',selected:''},['新接口'])
  ]), parent=el('div',{},[current]);
  current.scrollTop=77;current.focus();
  workflowRuleAuthoringPatchNode(current,next);
  assert.equal(parent.firstChild,current,'do not replace existing select');assert.equal(doc.activeElement,current);assert.equal(current.scrollTop,77);
  assert.equal(current.disabled,false);assert.equal(current.getAttribute('aria-label'),'新标签');assert.equal(current.value,'new');
  assert.deepEqual(current.options.map(o=>[o.value,o.textContent]),[['same','新标题'],['new','新接口']]);
  const disabled=el('select',{'data-card-query':'0','data-key':'capability','disabled':''},[el('option',{value:'same',selected:''},['同一接口'])]);
  workflowRuleAuthoringPatchNode(current,disabled);assert.equal(current.disabled,true);assert.equal(current.value,'same');
`);

patchScenario('PatchNode 保留 input 身份与选择区，并同步 type/value/placeholder/disabled', `
  const current=el('input',{'data-card-clause':'assertions','data-index':'0','data-key':'value',type:'text',value:'旧值',disabled:'',placeholder:'旧提示'}),parent=el('div',{},[current]);
  current.value='尚未提交的输入';current.focus();current.setSelectionRange(1,4);current.scrollLeft=38;
  const next=el('input',{'data-card-clause':'assertions','data-index':'0','data-key':'value',type:'date',value:'2026-11-27',placeholder:'新提示'});
  workflowRuleAuthoringPatchNode(current,next);
  assert.equal(parent.firstChild,current);assert.equal(doc.activeElement,current);assert.equal(current.selectionStart,1);assert.equal(current.selectionEnd,4);assert.equal(current.scrollLeft,38);
  assert.equal(current.type,'date');assert.equal(current.value,'2026-11-27');assert.equal(current.disabled,false);assert.equal(current.getAttribute('placeholder'),'新提示');
`);

patchScenario('PatchNode 保留 details.open 与嵌套控件、更新文本且不替换容器', `
  const input=el('input',{'data-card-setting':'message',value:'旧失败提示'}),current=el('details',{'data-rule-card-advanced':''},[el('summary',{},['旧核对']),input]),parent=el('div',{},[current]);
  current.open=true;current.scrollTop=186;input.focus();
  const next=el('details',{'data-rule-card-advanced':'',class:'plain-details'},[el('summary',{},['新核对']),el('input',{'data-card-setting':'message',value:'新失败提示'})]);
  workflowRuleAuthoringPatchNode(current,next);
  assert.equal(parent.firstChild,current);assert.equal(current.open,true,'rendered closed default must not collapse user-opened details');assert.equal(current.scrollTop,186);
  assert.equal(current.querySelector('[data-card-setting="message"]'),input);assert.equal(input.value,'新失败提示');assert.equal(doc.activeElement,input);assert.equal(current.firstChild.textContent,'新核对');
  current.open=false;next.open=true;workflowRuleAuthoringPatchNode(current,next);assert.equal(current.open,false,'user-collapsed details must also remain closed');
`);

patchScenario('PatchChildren 删除前置控件时按稳定 key 留存正确控件，不按位置误复用', `
  const removed=el('article',{'data-rule-key':'ref-first'},[el('select',{'data-card-ref':'0','data-key':'path'},[el('option',{value:'first',selected:''},['第一行'])])]);
  const keptSelect=el('select',{'data-card-ref':'2','data-key':'path'},[el('option',{value:'third',selected:''},['第三行'])]);
  const kept=el('article',{'data-rule-key':'ref-third'},[keptSelect]);
  const current=el('div',{},[removed,doc.createTextNode('旧间隔'),kept]);keptSelect.focus();keptSelect.scrollTop=43;
  const updated=el('article',{'data-rule-key':'ref-third'},[el('select',{'data-card-ref':'0','data-key':'path'},[el('option',{value:'updated',selected:''},['更新第三行'])])]);
  assert.equal(workflowRuleAuthoringNodeKey(kept),workflowRuleAuthoringNodeKey(updated));
  assert.notEqual(workflowRuleAuthoringNodeKey(removed),workflowRuleAuthoringNodeKey(kept));
  workflowRuleAuthoringPatchChildren(current,el('div',{},[updated]));
  assert.equal(current.childNodes.length,1);assert.equal(current.firstChild,kept);assert.equal(removed.parentNode,null);
  assert.equal(kept.firstChild,keptSelect,'row index changing after deletion must not replace the surviving control');
  assert.equal(doc.activeElement,keptSelect);assert.equal(keptSelect.scrollTop,43);assert.equal(keptSelect.getAttribute('data-card-ref'),'0');assert.equal(keptSelect.value,'updated');
`);

patchScenario('PatchChildren 不将不同类型、kind、data-key 的同位置控件混用', `
  const choice=el('select',{'data-card-choice':'assertions','data-index':'0'});
  const op=el('select',{'data-card-clause':'assertions','data-index':'0','data-key':'op'});
  const value=el('input',{'data-card-clause':'assertions','data-index':'0','data-key':'value',value:'旧值'});
  const current=el('div',{},[choice,op,value]);op.focus();
  const nodes=[choice,op,value,el('select',{'data-card-choice':'conditions','data-index':'0'}),el('select',{'data-card-setting':'level'})];
  const keys=nodes.map(workflowRuleAuthoringNodeKey);assert(keys.every(Boolean),'interactive controls need stable keys');assert.equal(new Set(keys).size,keys.length);
  workflowRuleAuthoringPatchChildren(current,el('div',{},[
    el('select',{'data-card-clause':'assertions','data-index':'0','data-key':'op'},[el('option',{value:'exists',selected:''},['不能为空'])]),
    el('select',{'data-card-choice':'assertions','data-index':'0'},[el('option',{value:'Material.materialCode',selected:''},['物料编码'])])
  ]));
  assert.equal(current.childNodes[0],op);assert.equal(current.childNodes[1],choice);assert.equal(value.parentNode,null);assert.equal(doc.activeElement,op);assert.equal(op.value,'exists');
`);

patchScenario('NodeKey 属性顺序不影响 key，裸控件索引不混用而稳定行内可移位', `
  const first=el('select',{'data-card-ref':'0','data-key':'path'}),second=el('select',{'data-key':'path','data-card-ref':'1'});
  const same=el('select',{'data-key':'path','data-card-ref':'0'});
  assert.equal(workflowRuleAuthoringNodeKey(first),workflowRuleAuthoringNodeKey(same));
  assert.notEqual(workflowRuleAuthoringNodeKey(first),workflowRuleAuthoringNodeKey(second),'without a keyed row, numeric indices distinguish sibling controls');
  const choice0=el('select',{'data-card-choice':'assertions','data-index':'0'}),choice1=el('select',{'data-card-choice':'assertions','data-index':'1'});
  assert.notEqual(workflowRuleAuthoringNodeKey(choice0),workflowRuleAuthoringNodeKey(choice1));
  const current=el('div',{},[el('article',{'data-rule-key':'keep-ref'},[second])]);
  const next=el('div',{},[el('article',{'data-rule-key':'keep-ref'},[same])]);
  assert.equal(workflowRuleAuthoringNodeKey(second),workflowRuleAuthoringNodeKey(same),'a stable keyed ancestor permits index movement after deletion');
  workflowRuleAuthoringPatchChildren(current,next);assert.equal(current.firstChild.firstChild,second);assert.equal(second.getAttribute('data-card-ref'),'0');
`);

patchScenario('PatchChildren 插入/移动节点而不破坏已有 key，键匹配仍不能复用错误标签', `
  const level=el('select',{'data-card-setting':'level'},[el('option',{value:'阻断',selected:''},['阻断'])]),message=el('input',{'data-card-setting':'message',value:'旧提示'}),current=el('div',{},[level,message]);
  const next=el('div',{},[el('p',{},['新增说明']),el('input',{'data-card-setting':'message',value:'新提示'}),el('select',{'data-card-setting':'level'},[el('option',{value:'警告',selected:''},['警告'])])]);
  workflowRuleAuthoringPatchChildren(current,next);
  assert.equal(current.childNodes[1],message);assert.equal(current.childNodes[2],level);assert.equal(current.firstChild.textContent,'新增说明');assert.equal(message.value,'新提示');assert.equal(level.value,'警告');
  const oldValue=el('input',{'data-card-clause':'assertions','data-index':'0','data-key':'value',value:'文本'}),container=el('div',{},[oldValue]);
  workflowRuleAuthoringPatchChildren(container,el('div',{},[el('select',{'data-card-clause':'assertions','data-index':'0','data-key':'value'},[el('option',{value:'true',selected:''},['是'])])]));
  assert.notEqual(container.firstChild,oldValue);assert.equal(container.firstChild.tagName,'SELECT');assert.equal(oldValue.parentNode,null);assert.equal(container.firstChild.value,'true');
`);
