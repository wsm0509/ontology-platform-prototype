// 测试生成方式：TDD
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {workspace} = require('./workspace.cjs');
function fullWorkspace() {
  const run = workspace(), loaded = new Set(['app.js','scene-system.js','deletion.js','graph-explorer.js']);
  for (const [,file] of fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').matchAll(/src="([^"?]+)\?/g)) if (!loaded.has(file)) {run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));loaded.add(file);}
  run(`
    function semanticReady(review=false) {assert.equal(state.drawer?.type,'sceneFlow','有效提交模式必须可打开真实业务 workspace');actionsMap['scene-flow-example']({dataset:{id:'recognized'}});actionsMap['scene-flow-recognize']();sceneFlowConfirmAll();sceneFlowValidate();assert(state.drawer.flow.result.passed);if(review)sceneFlowReview();}
    function semanticSend(text) {sceneFlowSubmissionInput({dataset:{field:'submissionCommand'},value:text});actionsMap['scene-flow-send-message']();}
    function semanticNoReceipt() {assert(!state.drawer.flow.receipt);assert.equal(sceneFlowReceipts.size,0);}
    function semanticSelect(html) {const tags=html.match(/<select\\b[^>]*>[\\s\\S]*?<[/]select>/g)||[];const selected=tags.filter(t=>t.includes('data-flow-inline-field="submissionMode"'));assert.equal(selected.length,1);return selected[0];}
    function semanticButton(html,action) {return (html.match(/<button\\b[^>]*>[\\s\\S]*?<[/]button>/g)||[]).find(t=>t.includes('data-action="'+action+'"'))||'';}
    function semanticClick(action) {dispatchTestEvent('click',{dataset:{action},closest(){return this;}});}
    function semanticNoCompletion() {semanticNoReceipt();assert(!state.drawer.flow.handoff);assert(!sceneFlowAuthorizations.has(state.drawer));}
    function semanticFinalFailure(kind) {
      const original=callCapability;let calls=0;
      callCapability=function(id,...args) {
        if(id!=='demo.safetyDI')return original(id,...args);
        calls++;assert.equal(args[0].projectCode,'PRJ-2026-A','终检必须查询当前项目本地权威事实');
        if(kind==='throw')throw Error('本地安全 DI 终检来源故障');
        if(kind==='unknown')return {ok:false,error:'本地安全 DI 终检未知',capability:id,params:args[0]};
        const authority=structuredClone(state.drawer.flow.authority);authority.projects['PRJ-2026-A'].safetyDI=9;
        return original(id,args[0],args[1],authority);
      };
      return {restore(){callCapability=original;},calls(){return calls;}};
    }
  `);return run;
}
const selected=`selectScene('release','actions');`;
const editing=selected+`actionsMap['scene-release-edit']({dataset:{id:'release'}});`;
const open=selected+`actionsMap['scene-flow-open']();`;
const explicit=selected+`scene().workflow.sceneFlow={submissionMode:'authorized'};actionsMap['scene-flow-open']();`;
const manual=selected+`scene().workflow.sceneFlow={submissionMode:'manual',autoSubmit:false,allowAssistantSubmit:false};actionsMap['scene-flow-open']();`;
const automatic=selected+`scene().workflow.sceneFlow={submissionMode:'auto'};actionsMap['scene-flow-open']();`;

for(const setup of [open,explicit])test('authorized 非legacy 直接按钮 action 和默认 source 不授权：'+(setup===open?'默认':'显式'),()=>fullWorkspace()(setup+`
 semanticReady(true);const d=state.drawer,original=sceneFlowExecute;let checks=0;sceneFlowExecute=function(...a){checks++;return original(...a);};
 try{semanticClick('scene-flow-submit');semanticNoCompletion();sceneFlowAuthorizeAndSubmit();semanticNoCompletion();sceneFlowSubmit();semanticNoCompletion();assert.equal(checks,0,'被拒入口不得执行终检');}finally{sceneFlowExecute=original;}
 semanticSend('帮我提交');assert(d.flow.receipt,'拒绝按钮不能阻断后续明确消息授权');
`));

for(const [mode,setup,source] of [['authorized',explicit,'semantic'],['auto',automatic,'auto'],['manual',manual,'button']])test('三模式 '+mode+' 内部入口传匹配 source='+source,()=>fullWorkspace()(setup+`
 semanticReady();const d=state.drawer,original=sceneFlowAuthorizeAndSubmit,originalExecute=sceneFlowExecute;let sources=[],checks=0;
 sceneFlowAuthorizeAndSubmit=function(...a){sources.push(a[0]);return original(...a);};sceneFlowExecute=function(...a){checks++;return originalExecute(...a);};
 try{
   if('${mode}'==='authorized'){semanticClick('scene-flow-review');semanticNoCompletion();semanticSend('帮我提交');}
   if('${mode}'==='auto')semanticClick('scene-flow-review');
   if('${mode}'==='manual'){semanticClick('scene-flow-review');semanticNoCompletion();semanticClick('scene-flow-submit');}
 }finally{sceneFlowAuthorizeAndSubmit=original;sceneFlowExecute=originalExecute;}
 assert.equal(JSON.stringify(sources),JSON.stringify(['${source}']),'消息、自动复核、按钮必须显式传匹配 source');assert.equal(checks,1);assert(d.flow.receipt);assert(d.flow.finalResult.passed);assert.equal(d.flow.receipt.businessSubmitted,false);
`));

test('manual 授权函数默认 source=button，可受控提交但直接 sceneFlowSubmit 不得绕授权',()=>fullWorkspace()(manual+`
 semanticReady(true);const d=state.drawer;assert.equal(sceneFlowConfig(scene()).allowAssistantSubmit,false);sceneFlowSubmit();semanticNoCompletion();sceneFlowAuthorizeAndSubmit();assert(d.flow.receipt);assert.equal(d.flow.receipt.businessSubmitted,false);
`));

for(const [mode,setup,sources] of [['authorized',explicit,['auto','unknown',null]],['manual',manual,['semantic','auto','unknown',null]]])test(mode+' 拒绝不匹配或非法入口 source',()=>fullWorkspace()(setup+`
 semanticReady(true);const original=sceneFlowExecute;let checks=0;sceneFlowExecute=function(...a){checks++;return original(...a);};
 try{for(const source of ${JSON.stringify(sources)}){sceneFlowAuthorizeAndSubmit(source);semanticNoCompletion();}}finally{sceneFlowExecute=original;}
 assert.equal(checks,0,'非法 source 不应终检或发回执');
`));

for(const text of ['帮我提交','这张发布单我检查好了，帮我提交'])test('manual 语义消息不能提交或隐式 handoff：'+text,()=>fullWorkspace()(manual+`
 semanticReady(true);const d=state.drawer,original=sceneFlowExecute;let checks=0;sceneFlowExecute=function(...a){checks++;return original(...a);};
 try{semanticSend(${JSON.stringify(text)});semanticNoCompletion();assert.equal(checks,0);assert(d.flow.history.at(-1).text.includes('未提交'));}finally{sceneFlowExecute=original;}
 semanticClick('scene-flow-review');semanticClick('scene-flow-submit');assert(d.flow.receipt,'仅后续明确按钮允许受控提交');
`));

test('manual review-only 可记录复核，但不授权；复核后按钮才执行独立终检',()=>fullWorkspace()(manual+`
 semanticReady();const d=state.drawer,count=runtimeRecords.length;assert(sceneFlowConfirmed());assert(d.flow.result.passed);semanticNoCompletion();
 const before=semanticButton(extraDrawers.sceneFlow(),'scene-flow-submit');assert(before);assert(/\\bdisabled\\b/.test(before),'人工提交复核前按钮禁用');
 semanticSend('我检查好了');assert(d.flow.reviewStamp);semanticNoCompletion();const html=extraDrawers.sceneFlow();assert(!/\\bdisabled\\b/.test(semanticButton(html,'scene-flow-submit')));assert(semanticButton(html,'scene-flow-handoff'));
 sceneFlowSubmit();semanticNoCompletion();semanticClick('scene-flow-submit');assert(d.flow.receipt);assert(d.flow.finalResult.passed);assert.equal(d.flow.stage,'submitted');assert.equal(d.flow.receipt.businessSubmitted,false);assert.equal(runtimeRecords.length,count);assert(!d.flow.handoff);
`));

test('manual 可显式 handoff 返回真实生成表单，不是提交回执且不能再按钮提交',()=>fullWorkspace()(manual+`
 semanticReady(true);const d=state.drawer,payload=JSON.stringify(sceneFlowPayload(scene())),count=runtimeRecords.length;
 assert(semanticButton(extraDrawers.sceneFlow(),'scene-flow-handoff'));semanticClick('scene-flow-handoff');semanticNoReceipt();assert(d.flow.handoff);assert.equal(JSON.stringify(d.flow.handoff.payload),payload);assert.equal(d.flow.handoff.businessSubmitted,false);assert.equal(d.flow.handoff.submissionMode,'manual');assert.equal(runtimeRecords.length,count);
 semanticClick('scene-flow-submit');semanticNoReceipt();assert(d.flow.handoff);semanticSend('这张发布单我检查好了，帮我提交');semanticNoReceipt();assert(d.flow.handoff);
`));

test('auto 仅明确 review 触发：渲染、submit消息、按钮、直接submit不自动提交',()=>fullWorkspace()(automatic+`
 semanticReady();const d=state.drawer;extraDrawers.sceneFlow();assert(!semanticButton(extraDrawers.sceneFlow(),'scene-flow-submit'));assert(!semanticButton(extraDrawers.sceneFlow(),'scene-flow-handoff'));semanticNoCompletion();
 semanticSend('帮我提交');semanticNoCompletion();assert(!d.flow.reviewStamp);semanticClick('scene-flow-submit');semanticNoCompletion();sceneFlowSubmit();semanticNoCompletion();sceneFlowAuthorizeAndSubmit('auto');semanticNoCompletion();
 semanticSend('我检查好了');assert(d.flow.receipt);assert(d.flow.finalResult.passed);assert(!d.flow.handoff);
`));

for(const mutation of ['input','facts','config','mapping','confirmations','payload','owner','result'])test('manual 过期或伪造 '+mutation+' 不得按钮提交',()=>fullWorkspace()(manual+`
 semanticReady(true);const d=state.drawer;
 if('${mutation}'==='input')d.draft.request+=' changed';if('${mutation}'==='facts')d.flow.authority.projects['PRJ-2026-A'].safetyDI=9;
 if('${mutation}'==='config')scene().workflow.sceneFlow.allowAssistantSubmit=true;if('${mutation}'==='mapping')scene().bindings.main[0].target+=' changed';if('${mutation}'==='confirmations')delete d.flow.confirmations[0];
 if('${mutation}'==='payload')d.flow.generated.payload.mainOrder.subject='forged';if('${mutation}'==='owner')state.drawer={...d,flow:{...d.flow}};if('${mutation}'==='result')d.flow.result={...d.flow.result,passed:true};
 semanticClick('scene-flow-submit');semanticNoCompletion();assert(!state.drawer.flow.reviewStamp);assert(!state.drawer.flow.authorization);
`));

for(const failure of ['unknown','blocked','throw'])test('manual 权威 safetyDI 终检 '+failure+' 撤销复核授权并要求重校验',()=>fullWorkspace()(manual+`
 semanticReady(true);const d=state.drawer,source=semanticFinalFailure('${failure}');try{semanticClick('scene-flow-submit');}finally{source.restore();}
 assert(source.calls()>0);semanticNoCompletion();assert(!d.flow.reviewStamp);assert(!d.flow.authorization);assert.equal(d.flow.stage,'blocked');
 if('${failure}'==='throw')assert(d.error.includes('本地安全 DI 终检来源故障'));else assert(d.flow.finalResult.checks.some(c=>c.evidence?.some(e=>e.source==='demo.safetyDI')&&c.status==='${failure==='blocked'?'阻断':'未知'}'));
 semanticClick('scene-flow-review');semanticClick('scene-flow-submit');semanticNoCompletion();assert(!d.flow.reviewStamp);sceneFlowValidate();semanticClick('scene-flow-review');semanticClick('scene-flow-submit');assert(d.flow.receipt);
`));

test('manual 重复点击和跨会话相同 payload 幂等，不重复终检、回执或日志',()=>fullWorkspace()(manual+`
 semanticReady(true);semanticClick('scene-flow-submit');const d=state.drawer,id=d.flow.receipt.id,logs=state.logs.filter(l=>l.type==='场景流配置测试').length,count=runtimeRecords.length,original=sceneFlowExecute;let checks=0;
 sceneFlowExecute=function(...a){checks++;return original(...a);};try{semanticClick('scene-flow-submit');semanticClick('scene-flow-submit');}finally{sceneFlowExecute=original;}
 assert.equal(checks,0);assert.equal(d.flow.receipt.id,id);assert.equal(sceneFlowReceipts.size,1);assert.equal(state.logs.filter(l=>l.type==='场景流配置测试').length,logs);assert.equal(runtimeRecords.length,count);
 closeOverlay(true);sceneFlowOpen();semanticReady(true);semanticClick('scene-flow-submit');assert.equal(state.drawer.flow.receipt.id,id);assert.equal(sceneFlowReceipts.size,1);assert.equal(state.logs.filter(l=>l.type==='场景流配置测试').length,logs);assert.equal(runtimeRecords.length,count);
`));

test('legacy authorized 保留旧按钮兼容，复核前不能提交且复核后不自动提交',()=>fullWorkspace()(selected+`
 scene().workflow.sceneFlow={autoSubmit:false,allowAssistantSubmit:true};const before=JSON.stringify(scene().workflow.sceneFlow);sceneFlowOpen();semanticReady();const d=state.drawer;
 assert(semanticButton(extraDrawers.sceneFlow(),'scene-flow-submit'));semanticClick('scene-flow-submit');semanticNoReceipt();semanticClick('scene-flow-review');semanticNoReceipt();semanticClick('scene-flow-submit');assert(d.flow.receipt);assert.equal(d.flow.receipt.businessSubmitted,false);assert.equal(JSON.stringify(scene().workflow.sceneFlow),before);
`));

for(const [mode,auto,allowance] of [['authorized',false,true],['auto',true,true],['manual',false,false]])test('settings 真实保存 '+mode+' 改变指纹，旧受信任复核与授权不能复用',()=>fullWorkspace()(editing+`
 const s=scene();s.workflow.sceneFlow={submissionMode:'authorized'};sceneFlowOpen();semanticReady(true);const d=state.drawer,fp=sceneFlowFingerprint(s),original=sceneFlowSubmit;
 sceneFlowSubmit=function(){};try{sceneFlowAuthorizeAndSubmit('semantic');}finally{sceneFlowSubmit=original;}
 assert(sceneFlowAuthorizations.has(d),'先捕获生产 gate 生成的真实授权，而非伪造 flags');assert(sceneFlowTrustedReview(s));const authorization=sceneFlowAuthorizations.get(d);assert.equal(authorization.source,'semantic');
 closeOverlay(true);actionsMap['scene-flow-settings']();dispatchTestEvent('change',{dataset:{field:'submissionMode'},tagName:'SELECT',value:'${mode}'});actionsMap['scene-flow-save-settings']();assert(!state.drawer);
 assert.equal(s.workflow.sceneFlow.submissionMode,'${mode}');assert.equal(s.workflow.sceneFlow.autoSubmit,${auto});assert.equal(s.workflow.sceneFlow.allowAssistantSubmit,${allowance});assert.notEqual(sceneFlowFingerprint(s),fp);assert.equal(sceneFlowReceipts.size,0);
 state.drawer=d;sceneFlowSubmit();semanticNoCompletion();assert(!d.flow.reviewStamp);assert(!sceneFlowReviews.has(d));assert(!sceneFlowFormalChecks.has(d));assert(d.error.includes('配置已变化'));semanticSend('这张发布单我检查好了，帮我提交');semanticNoCompletion();semanticClick('scene-flow-submit');semanticNoCompletion();
`));

for(const [mode,setup] of [['authorized',explicit],['manual',manual]])for(const mutation of ['review','owner','result'])test('new '+mode+' handoff 拒绝伪造 '+mutation+'，不可绕过受信任复核与检查',()=>fullWorkspace()(setup+`
 semanticReady('${mutation}'!=='review');const d=state.drawer;
 if('${mutation}'==='review')d.flow.reviewStamp=d.flow.resultStamp;
 if('${mutation}'==='owner')state.drawer={...d,flow:{...d.flow}};
 if('${mutation}'==='result')d.flow.result={...d.flow.result,passed:true};
 semanticClick('scene-flow-handoff');semanticNoCompletion();assert(!state.drawer.flow.reviewStamp,'伪造结束请求应撤销旧复核');
`));

for(const [mode,setup] of [['authorized',explicit],['manual',manual]])test('new '+mode+' handoff 终检 passed 不能掩盖未知 check',()=>fullWorkspace()(setup+`
 semanticReady(true);const d=state.drawer,original=sceneFlowExecute;sceneFlowExecute=function(...a){const r=original(...a);r.passed=true;r.checks.push({name:'返回表单终检新增未知',target:'mainOrder',status:'未知',level:'阻断',detail:'来源未知',evidence:[]});return r;};
 try{semanticClick('scene-flow-handoff');}finally{sceneFlowExecute=original;}semanticNoCompletion();assert(!d.flow.reviewStamp);assert.equal(d.flow.stage,'blocked');
 semanticClick('scene-flow-review');assert(!d.flow.reviewStamp,'失败恢复后不能复用旧正式校验');semanticClick('scene-flow-handoff');semanticNoCompletion();
`));

for(const [mode,setup] of [['authorized',explicit],['manual',manual]])test('new '+mode+' handoff 权威 safetyDI 终检未知必须重新正式校验',()=>fullWorkspace()(setup+`
 semanticReady(true);const d=state.drawer,source=semanticFinalFailure('unknown');try{semanticClick('scene-flow-handoff');}finally{source.restore();}
 assert(source.calls()>0);semanticNoCompletion();assert(!d.flow.reviewStamp);assert.equal(d.flow.stage,'blocked');semanticClick('scene-flow-review');semanticClick('scene-flow-handoff');semanticNoCompletion();assert(!d.flow.reviewStamp);
 sceneFlowValidate();semanticClick('scene-flow-review');semanticClick('scene-flow-handoff');semanticNoReceipt();assert(d.flow.handoff);assert.equal(d.flow.handoff.businessSubmitted,false);
`));

test('mode default read only, single disabled select before four columns and supported submit-current capability',()=>fullWorkspace()(selected+`
 const s=scene(),before=JSON.stringify(s.workflow),fp=sceneFlowFingerprint(s);assert.equal(sceneFlowConfig(s).submissionMode,'authorized');assert.equal(sceneFlowEffectiveSubmissionMode(s),'authorized');
 const html=sceneFlowStageDetailHTML(s,'finish'),tag=semanticSelect(html);assert(tag.includes('disabled'));assert.equal(JSON.stringify([...tag.matchAll(/<option\\b[^>]*value="([^"]+)"[^>]*>([^<]*)<[/]option>/g)].map(([,value,label])=>[value,label])),JSON.stringify([['authorized','语义授权提交（默认）'],['auto','AI 自动提交'],['manual','人工提交']]));
 assert(html.indexOf('data-flow-inline-field="submissionMode"')<html.indexOf('data-flow-operation-table="finish"'));assert(!html.includes('data-flow-inline-field="autoSubmit"'));assert(!html.includes('data-flow-inline-field="allowAssistantSubmit"'));
 assert(sceneFlowBusinessPolicies(s).intents.includes('提交当前单据'));applicationActionsView(s);sceneFlowBusinessExampleHTML(s);sceneFlowOpen();extraDrawers.sceneFlow();assert.equal(JSON.stringify(s.workflow),before);assert.equal(sceneFlowFingerprint(s),fp);semanticNoReceipt();
`));
test('legacy effective modes keep raw settings without migration',()=>fullWorkspace()(selected+`
 const s=scene();for(const [raw,mode] of [[{},'authorized'],[{maxRetries:1},'authorized'],[{autoSubmit:true,allowAssistantSubmit:true},'auto'],[{autoSubmit:false,allowAssistantSubmit:false},'manual'],[{allowAssistantSubmit:false},'manual'],[{allowAssistantSubmit:true,autoSubmit:false},'authorized']]) {s.workflow.sceneFlow=raw;const before=JSON.stringify(raw);assert.equal(sceneFlowEffectiveSubmissionMode(s),mode);sceneFlowStageDetailHTML(s,'finish');assert.equal(JSON.stringify(s.workflow.sceneFlow),before);if(mode==='manual')assert(applicationActionsView(s).includes('旧配置已关闭代提交'));}
`));
test('mode edit/save/cancel uses enum value, normalizes only explicit selection, release version isolated',()=>fullWorkspace()(editing+`
 const s=scene(),before=JSON.stringify(s.workflow),fp=sceneFlowFingerprint(s);sceneFlowInlineEdit({dataset:{stage:'finish'}});assert(!semanticSelect(sceneFlowStageDetailHTML(s,'finish')).includes('disabled'));
 dispatchTestEvent('change',{dataset:{flowInlineField:'submissionMode'},value:'auto',checked:false});assert.equal(sceneFlowUI.editor.draft.submissionMode,'auto');assert.equal(sceneFlowUI.editor.draft.autoSubmit,true);assert.equal(sceneFlowUI.editor.draft.allowAssistantSubmit,true);assert.equal(JSON.stringify(s.workflow),before);sceneFlowInlineCancel();assert.equal(sceneFlowFingerprint(s),fp);
 sceneFlowInlineEdit({dataset:{stage:'finish'}});dispatchTestEvent('change',{dataset:{flowInlineField:'submissionMode'},value:'auto'});sceneFlowInlineSave();assert(!sceneFlowUI.editor);assert.equal(s.workflow.sceneFlow.submissionMode,'auto');assert.notEqual(sceneFlowFingerprint(s),fp);
 actionsMap['scene-release-edit']({dataset:{id:s.id}});const m=sceneReleaseEnsure(s);m.check=sceneReleaseCheck(s);assert(m.check.ok);sceneReleasePublish(s.id);assert.equal(m.snapshot.scene.workflow.sceneFlow.submissionMode,'auto');const snapshot=JSON.stringify(m.snapshot);
 actionsMap['scene-release-edit']({dataset:{id:s.id}});sceneFlowInlineEdit({dataset:{stage:'finish'}});dispatchTestEvent('change',{dataset:{flowInlineField:'submissionMode'},value:'authorized'});sceneFlowInlineSave();assert.equal(s.workflow.sceneFlow.allowAssistantSubmit,true);assert.equal(s.workflow.sceneFlow.autoSubmit,false);assert.equal(JSON.stringify(m.snapshot),snapshot);sceneReleaseRestore(s.id);assert.equal(sceneFlowEffectiveSubmissionMode(scene()),'auto');
`));
for(const value of ['true','',null,1]) test('strict mode enum rejects '+String(value),()=>fullWorkspace()(editing+`
 const s=scene(),before=JSON.stringify(s.workflow);sceneFlowInlineEdit({dataset:{stage:'finish'}});dispatchTestEvent('change',{dataset:{flowInlineField:'submissionMode'},value:${JSON.stringify(value)}});assert(sceneFlowUI.editor.error);sceneFlowInlineSave();assert(sceneFlowUI.editor);assert.equal(JSON.stringify(s.workflow),before);sceneFlowInlineCancel();s.workflow.sceneFlow={submissionMode:${JSON.stringify(value)}};sceneFlowOpen();assert(!state.drawer);
`));
for(const raw of [{submissionMode:'authorized',autoSubmit:true,allowAssistantSubmit:true},{submissionMode:'authorized',allowAssistantSubmit:false},{submissionMode:'auto',autoSubmit:false,allowAssistantSubmit:true},{submissionMode:'auto',autoSubmit:'true',allowAssistantSubmit:true},{autoSubmit:true,allowAssistantSubmit:false}]) test('illegal raw configuration never repaired by selecting mode '+JSON.stringify(raw),()=>fullWorkspace()(editing+`
 const s=scene();s.workflow.sceneFlow=${JSON.stringify(raw)};const before=JSON.stringify(s.workflow);assert(sceneFlowConfigError(sceneFlowConfig(s)));sceneFlowInlineEdit({dataset:{stage:'finish'}});dispatchTestEvent('change',{dataset:{flowInlineField:'submissionMode'},value:'authorized'});sceneFlowInlineSave();assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow),before);
`));
for(const mutation of ['permission','scene','block','owner','fingerprint'])test('mode editor protection '+mutation,()=>fullWorkspace()(editing+`
 const s=scene();sceneFlowInlineEdit({dataset:{stage:'finish'}});dispatchTestEvent('change',{dataset:{flowInlineField:'submissionMode'},value:'auto'});
 if('${mutation}'==='permission')sceneReleaseEnsure(s).editing=false;if('${mutation}'==='scene')selectScene('trial');if('${mutation}'==='block')s.selectedBlock=sceneFlowUI.editor.blockId==='items'?'main':'items';if('${mutation}'==='owner')sceneFlowUI.editor={...sceneFlowUI.editor};if('${mutation}'==='fingerprint')s.workflow.action+=' changed';const before=JSON.stringify(s.workflow);sceneFlowInlineSave();assert(sceneFlowUI.editor.error);assert.equal(JSON.stringify(s.workflow),before);
`));
test('new chat field does not edit request/draft and rendering never authorizes',()=>fullWorkspace()(open+`
 semanticReady();const d=state.drawer,stamp=d.flow.inputStamp,generated=d.flow.generated,request=d.draft.request;sceneFlowSubmissionInput({dataset:{field:'submissionCommand'},value:'这张发布单我检查好了，帮我提交'});assert.equal(d.draft.request,request);assert.equal(d.flow.inputStamp,stamp);assert.equal(d.flow.generated,generated);const html=extraDrawers.sceneFlow();assert(html.includes('data-field="submissionCommand"'));assert(html.includes('发送给助手'));assert(!html.includes('data-field="submissionCommand"')||!d.draft.submissionCommand);semanticNoReceipt();
`));
test('authorized review alone does not call submit; semantic submit after valid review uses independent final check, no real stats',()=>fullWorkspace()(explicit+`
 semanticReady();const original=sceneFlowExecute,originalSubmit=sceneFlowSubmit;let checks=0,submits=0;sceneFlowExecute=function(...a){checks++;return original(...a);};sceneFlowSubmit=function(...a){submits++;return originalSubmit(...a);};sceneFlowReview();assert.equal(submits,0);semanticNoReceipt();const count=runtimeRecords.length;semanticSend('帮我提交');assert.equal(checks,1);assert.equal(submits,1);assert(state.drawer.flow.receipt);assert.equal(state.drawer.flow.receipt.businessSubmitted,false);assert.equal(runtimeRecords.length,count);assert(state.drawer.flow.history.some(h=>/识别意图.*提交当前单据.*授权.*检查.*动作/.test(h.text)));
`));
test('combined current document review plus explicit submission authorizes; plain submit lacking review clarifies',()=>fullWorkspace()(open+`
 semanticReady();semanticSend('帮我提交');semanticNoReceipt();assert(!state.drawer.flow.reviewStamp);assert(state.drawer.flow.history.at(-1).text.includes('明确复核'));semanticSend('这张发布单我检查好了，帮我提交');assert(state.drawer.flow.receipt);
`));
test('review-only records review without authorization in authorized mode; auto review-only submits',()=>fullWorkspace()(open+`
 semanticReady();semanticSend('我检查好了');semanticNoReceipt();assert(state.drawer.flow.reviewStamp);sceneFlowSubmit();semanticNoReceipt();closeOverlay(true);scene().workflow.sceneFlow={submissionMode:'auto'};sceneFlowOpen();semanticReady();semanticSend('我检查好了');assert(state.drawer.flow.receipt);
`));
test('nonlegacy authorized hides submit button; forged flags, direct submit and button action cannot authorize',()=>fullWorkspace()(explicit+`
 semanticReady();const d=state.drawer;d.flow.reviewStamp=d.flow.resultStamp;d.flow.authorization={stamp:d.flow.resultStamp};sceneFlowSubmit();semanticNoReceipt();sceneFlowReview();sceneFlowSubmit();semanticNoReceipt();
 assert(!semanticButton(extraDrawers.sceneFlow(),'scene-flow-submit'),'语义授权模式不得渲染提交按钮');
 semanticClick('scene-flow-submit');semanticNoCompletion();sceneFlowAuthorizeAndSubmit();semanticNoCompletion();
 semanticSend('帮我提交');assert(d.flow.receipt,'明确当前单据消息才授权');
`));
for(const text of ['怎么提交','能提交吗','不要提交','先别提交','如果通过就提交','他说帮我提交','“帮我提交”','请解释帮我提交是什么意思','假设我说帮我提交','通过后帮我提交','帮我提交另一张发布单','帮我提交 MAT-20260082','帮我提交 MAT-20260081 和 MAT-20260082','帮我提交这几张','帮我提交未知单据','帮同事提交这张发布单'])test('semantic non authorization/target ambiguity '+text,()=>fullWorkspace()(open+`
 semanticReady(true);semanticSend(${JSON.stringify(text)});semanticNoReceipt();assert(!state.drawer.flow.authorization);assert(state.drawer.flow.history.at(-1).text.includes('未提交'));
`));
test('no draft, precheck or unconfirmed fields cannot authorize even combined statement',()=>fullWorkspace()(open+`
 semanticSend('这张发布单我检查好了，帮我提交');semanticNoReceipt();actionsMap['scene-flow-example']({dataset:{id:'recognized'}});sceneFlowRecognize();assert(state.drawer.flow.precheck.result.passed);semanticSend('这张发布单我检查好了，帮我提交');semanticNoReceipt();assert.equal(Object.keys(state.drawer.flow.confirmations).length,0);sceneFlowConfirmAll();semanticSend('这张发布单我检查好了，帮我提交');semanticNoReceipt();assert(!state.drawer.flow.reviewStamp);
`));
for(const mutation of ['input','facts','config','payload','owner','result'])test('stale snapshots or spoofed owner reject semantic submission '+mutation,()=>fullWorkspace()(explicit+`
 semanticReady(true);const d=state.drawer;if('${mutation}'==='input')d.draft.request+=' changed';if('${mutation}'==='facts')d.flow.authority.projects['PRJ-2026-A'].safetyDI=9;if('${mutation}'==='config')scene().workflow.sceneFlow.submissionMode='auto';if('${mutation}'==='payload')d.flow.generated.payload.mainOrder.subject='forged';if('${mutation}'==='owner')state.drawer={...d,flow:{...d.flow}};if('${mutation}'==='result')d.flow.result={...d.flow.result,passed:true};semanticSend('帮我提交');assert(!state.drawer.flow.receipt);assert(!state.drawer.flow.reviewStamp);assert.equal(sceneFlowReceipts.size,0);
`));
for(const failure of ['unknown','blocked','throw'])test('fresh terminal '+failure+' revokes review and authorization, recovery requires formal check',()=>fullWorkspace()(explicit+`
 semanticReady(true);const d=state.drawer,source=semanticFinalFailure('${failure}');try{semanticSend('帮我提交');}finally{source.restore();}
 assert(source.calls()>0,'必须真实执行 safetyDI 权威终检，而非改写 passed');semanticNoCompletion();assert(!d.flow.reviewStamp);assert(!d.flow.authorization);assert.equal(d.flow.stage,'blocked');
 if('${failure}'==='throw')assert(d.error.includes('本地安全 DI 终检来源故障'));else assert(d.flow.finalResult.checks.some(c=>c.evidence?.some(e=>e.source==='demo.safetyDI')&&c.status==='${failure==='blocked'?'阻断':'未知'}'),'终检证据必须包含权威来源失败');
 semanticSend('这张发布单我检查好了，帮我提交');semanticNoCompletion();assert(!d.flow.reviewStamp,'来源恢复仍必须重做正式校验');sceneFlowValidate();semanticSend('这张发布单我检查好了，帮我提交');assert(d.flow.receipt);
`));

test('terminal contradictory passed flag cannot hide a new blocking or unknown check',()=>fullWorkspace()(explicit+`
 semanticReady(true);const original=sceneFlowExecute;sceneFlowExecute=function(...a){const r=original(...a);r.passed=true;r.checks.push({name:'新终检失败',target:'mainOrder',status:'未知',level:'阻断',detail:'新失败',evidence:[]});return r;};
 try{semanticSend('帮我提交');}finally{sceneFlowExecute=original;}semanticNoCompletion();assert(!state.drawer.flow.reviewStamp);assert(!state.drawer.flow.authorization);
 semanticSend('这张发布单我检查好了，帮我提交');semanticNoCompletion();sceneFlowValidate();semanticSend('这张发布单我检查好了，帮我提交');assert(state.drawer.flow.receipt);
`));
test('duplicate semantic commands reuse receipt with no new final checks or logs; matching current ID works',()=>fullWorkspace()(explicit+`
 semanticReady(true);const ref=sceneFlowDraftReference(scene());assert(ref.id);semanticSend('帮我提交 '+ref.id);const d=state.drawer,id=d.flow.receipt.id,logs=state.logs.filter(l=>l.type==='场景流配置测试').length;const original=sceneFlowExecute;let calls=0;sceneFlowExecute=function(...a){calls++;return original(...a);};semanticSend('帮我提交');semanticSend('这张发布单我检查好了，帮我提交');sceneFlowExecute=original;assert.equal(calls,0);assert.equal(d.flow.receipt.id,id);assert.equal(sceneFlowReceipts.size,1);assert.equal(state.logs.filter(l=>l.type==='场景流配置测试').length,logs);
`));
