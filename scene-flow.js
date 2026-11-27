/* 智能提单场景流：本地确定性语义样例 + 真实本地规则引擎。无模型、网络或业务写入。 */
'use strict';
const sceneFlowIntents=[['draft','创建 / 补充提单'],['explain','解释提交阻断']];
const sceneFlowStages=[['input','用户输入'],['recognize','语义 / 意图识别'],['clarify','追问 / 澄清'],['mapping','字段建议确认'],['check','校验与处理'],['review','复核'],['submitted','模拟提交']];
// 展示层业务名称，不改 runtime 阶段 ID、顺序或提交门禁。
const sceneFlowBusinessStages={input:'输入',recognize:'语义识别',clarify:'按需澄清',mapping:'表单确认',check:'规则校验',review:'复核',submitted:'提交',prepare:'生成单据与校验反馈',finish:'复核提交'};
const sceneFlowDisplayStages=[['recognize','语义识别'],['clarify','按需澄清'],['prepare','生成单据与校验反馈'],['finish','复核提交']];
const sceneFlowDisplayRuntimeStages={input:['input'],recognize:['recognize'],clarify:['clarify'],prepare:['mapping','check'],finish:['review','submitted']};
function sceneFlowDisplayGroup(stage){const runtime=['ready-check','blocked'].includes(stage)?'check':stage==='answer'?'recognize':stage;return Object.keys(sceneFlowDisplayRuntimeStages).find(id=>sceneFlowDisplayRuntimeStages[id].includes(runtime))||(Object.hasOwn(sceneFlowDisplayRuntimeStages,runtime)?runtime:'input');}
function sceneFlowDisplayHasStage(group,runtime){return typeof runtime==='string'&&sceneFlowDisplayRuntimeStages[group]?.includes(sceneFlowStageId(runtime))===true;}
function sceneFlowEditableStage(stage){return Object.hasOwn(sceneFlowStageFields,stage);}
// 纯浏览状态不进入场景配置 / 发布指纹；体验抽屉用独立 viewStage，stage 仍是真实执行门禁。
const sceneFlowUI={stage:'recognize',editor:null,inlineError:'',branchChoice:null};
const sceneFlowReceipts=new Map();
let sceneFlowSequence=0;
function sceneFlowDefaults(){return {intents:['draft','explain'],unknown:'clarify',clarification:'candidates',maxRetries:2,confirmation:'per-field',autoSubmit:false,allowAssistantSubmit:false,safety:'mandatory'};}
const sceneFlowSubmissionModes=[['authorized','语义授权提交（默认）'],['auto','AI 自动提交'],['manual','人工提交']];
function sceneFlowLegacySubmission(s){const raw=workflowScene(s).sceneFlow||{};return !Object.hasOwn(raw,'submissionMode')&&['autoSubmit','allowAssistantSubmit'].some(key=>Object.hasOwn(raw,key));}
function sceneFlowEffectiveSubmissionMode(s){const raw=workflowScene(s).sceneFlow||{};if(Object.hasOwn(raw,'submissionMode'))return raw.submissionMode;if(!sceneFlowLegacySubmission(s))return 'authorized';return raw.autoSubmit===true&&raw.allowAssistantSubmit===true?'auto':raw.allowAssistantSubmit===true?'authorized':'manual';}
function sceneFlowConfig(s){
 const raw=structuredClone(workflowScene(s).sceneFlow||{}),c={...sceneFlowDefaults(),...raw,clarification:'candidates',safety:'mandatory'},mode=sceneFlowEffectiveSubmissionMode(s);
 // 派生兼容值仅供读取，旧配置不在读取 / 无关策略保存时迁移成新模式。
 if(sceneFlowLegacySubmission(s))Object.defineProperty(c,'submissionMode',{value:mode==='manual'?undefined:mode,enumerable:false,writable:true,configurable:true});
 else{c.submissionMode=mode;if(!Object.hasOwn(raw,'allowAssistantSubmit'))c.allowAssistantSubmit=mode!=='manual';if(!Object.hasOwn(raw,'autoSubmit'))c.autoSubmit=mode==='auto';}
 return c;
}
function sceneFlowAssistantSubmitAllowed(s){const c=sceneFlowConfig(s);return c.allowAssistantSubmit===true&&!sceneFlowConfigError(c);}
function sceneFlowAutoSubmitAllowed(s){const c=sceneFlowConfig(s);return sceneFlowEffectiveSubmissionMode(s)==='auto'&&c.autoSubmit===true&&c.allowAssistantSubmit===true&&!sceneFlowConfigError(c);}
function sceneFlowButtonSubmitAllowed(s){return !sceneFlowConfigError(sceneFlowConfig(s))&&(sceneFlowLegacySubmission(s)?sceneFlowAssistantSubmitAllowed(s)&&!sceneFlowAutoSubmitAllowed(s):sceneFlowEffectiveSubmissionMode(s)==='manual');}
function sceneFlowSubmissionSourceAllowed(s,source){if(sceneFlowConfigError(sceneFlowConfig(s)))return false;if(sceneFlowLegacySubmission(s))return source==='auto'?sceneFlowAutoSubmitAllowed(s):['button','semantic'].includes(source)&&sceneFlowAssistantSubmitAllowed(s)&&!sceneFlowAutoSubmitAllowed(s);return ({authorized:'semantic',auto:'auto',manual:'button'})[sceneFlowEffectiveSubmissionMode(s)]===source;}
function sceneFlowSubmitModeLabel(s){if(sceneFlowLegacySubmission(s)&&sceneFlowEffectiveSubmissionMode(s)==='manual')return '旧配置已关闭代提交 · 用户自行提交';return sceneFlowSubmissionModes.find(([id])=>id===sceneFlowEffectiveSubmissionMode(s))?.[1]||'提交方式无效';}
function sceneFlowSubmissionModeDescription(s){if(sceneFlowLegacySubmission(s))return sceneFlowAutoSubmitAllowed(s)?'复核后系统自动提交：用户明确完成复核后独立终检并自动提交（模拟），无需再次点击提交。':sceneFlowAssistantSubmitAllowed(s)?'旧配置允许代提交：复核后可选代理提交或返回表单自行提交。':'旧配置已关闭代提交：复核后完成并返回表单，由用户自行提交。';return ({authorized:'语义授权提交：复核后说“帮我提交”，独立终检通过即提交（模拟），无需再点击提交按钮；复核本身不授权。',auto:'AI 自动提交：用户明确完成复核后自动终检并提交（模拟），无需再次点击提交；不会自动代替用户复核。',manual:'人工提交：用户复核后点击确认提交（模拟），提交消息不能代替点击；也可返回表单自行提交。'})[sceneFlowEffectiveSubmissionMode(s)]||'请配置有效提交方式。';}
function sceneFlowSubmissionModeSelect(value,inline=false,disabled=false,legacyManual=false){return `<div class="inset-panel section-gap" data-flow-submission-mode-policy><label class="form-field">提交方式<select ${inline?'data-flow-inline-field':'data-field'}="submissionMode" aria-label="提交方式"${disabled?' disabled aria-disabled="true"':''}>${options(sceneFlowSubmissionModes,value||'authorized')}</select></label><p class="tiny muted section-gap">语义授权提交：检查当前发布单后说“这张发布单我检查好了，帮我提交”，无需再点击提交按钮；复核本身不授权。AI 自动提交：明确复核后自动终检并模拟提交。人工提交：复核后点击确认提交，语义消息不授权。</p>${legacyManual?'<p class="tiny muted section-gap">旧配置已关闭代提交：保留用户自行提交；只有明确选择提交方式并保存才启用新模式。</p>':''}<p class="tiny muted section-gap">三种方式均须字段确认、当前正式校验通过、明确复核和独立终检；预检、浏览和保存不授权。输入、事实或配置变化撤销复核与授权。仅本地模拟，不调用真实业务接口。${disabled?' 点击“编辑本阶段”后修改，保存生效；取消不保存。':''}</p></div>`;}
function sceneFlowChooseSubmissionMode(draft,value){draft.submissionMode=value;if(!sceneFlowSubmissionModes.some(([id])=>id===value))return false;draft.autoSubmit=value==='auto';draft.allowAssistantSubmit=value!=='manual';return true;}
function sceneFlowAutoSubmitSwitch(value,inline=false,disabled=false){return `<div class="inset-panel section-gap" data-flow-auto-submit-policy><label class="check-row"><input type="checkbox" role="switch" ${inline?'data-flow-inline-field':'data-field'}="autoSubmit" aria-label="系统自动提交"${value===true?' checked':''}${disabled?' disabled aria-disabled="true"':''}>系统自动提交</label><p class="tiny muted section-gap">关闭：用户自行确认提交；开启：用户明确完成复核后系统自动提交（模拟），无需再次点击提交。</p><p class="tiny muted section-gap">仍须字段确认、当前正式校验通过、人工复核与独立终检。保存、打开、浏览和预检不会触发提交；不调用真实业务接口。${disabled?' 点击“编辑本阶段”才可修改，保存生效；取消不保存。':''}</p></div>`;}
function sceneFlowSetSubmitSwitch(draft,key,checked){draft[key]=checked;if(key==='autoSubmit'&&typeof checked==='boolean')draft.allowAssistantSubmit=checked;}
function sceneFlowSubmissionSwitch(value,inline=false){return `<div class="inset-panel section-gap" data-flow-submission-policy><label class="check-row"><input type="checkbox" role="switch" ${inline?'data-flow-inline-field':'data-field'}="allowAssistantSubmit" aria-label="允许代用户提交"${value===true?' checked':''}>允许代用户提交</label><p class="tiny muted section-gap">关闭：复核后返回已填写、已校验的表单，由用户到业务系统自行提交。开启：用户明确确认后才允许代提交，仍可选择自行提交；不会自动触发。</p><p class="tiny muted section-gap">当前原型仅模拟代提交，不调用真实业务接口。</p></div>`;}
function sceneFlowConfigError(c){
 const explicitMode=Object.prototype.propertyIsEnumerable.call(c,'submissionMode');
 if(explicitMode&&!sceneFlowSubmissionModes.some(([id])=>id===c.submissionMode))return '提交方式必须为 authorized、auto 或 manual 的有效选项。';
 if(typeof c.autoSubmit!=='boolean')return '系统自动提交必须为明确的布尔开关。';
 if(typeof c.allowAssistantSubmit!=='boolean')return '允许代用户提交必须为明确的布尔开关。';
 if(c.autoSubmit===true&&c.allowAssistantSubmit!==true)return '系统自动提交开启时必须同时允许代用户提交；请重新切换开关并保存。';
 if(explicitMode&&(c.allowAssistantSubmit!==(c.submissionMode!=='manual')||c.autoSubmit!==(c.submissionMode==='auto')))return '提交方式与旧布尔策略不一致；不能自动修复已保存的非法配置。';
 if(!Array.isArray(c.intents)||!c.intents.length||c.intents.some(i=>!sceneFlowIntents.some(([id])=>id===i)))return '请至少启用一项有效意图。';
 if(!['clarify','manual'].includes(c.unknown)||!['candidates','fields'].includes(c.clarification)||!['per-field','summary'].includes(c.confirmation)||![0,1,2,3].includes(Number(c.maxRetries)))return '请选择有效策略；失败重试最多 0–3 次。';
 return '';
}
// 业务流程定义与受控策略可编辑；定义文字不作为脚本、跳转或门禁执行条件。
const sceneFlowStageFields={
 input:{config:[],fields:{inputMode:['输入方式','select',[['natural','自然语言 + 可选关键字段'],['structured','优先填写关键字段']],'natural'],inputPrompt:['输入引导语','textarea',[],'请描述业务任务、项目、整机、软件版本、部门和主题。']}},
 recognize:{config:['intents','unknown'],fields:{noMatchPrompt:['无匹配提示','textarea',[],'请明确业务任务与对象编号；无法识别不会生成或提交。']}},
 clarify:{config:['maxRetries'],fields:{clarifyPrompt:['澄清提示','textarea',[],'请确认候选并补充缺失或冲突的关键字段。']}},
 mapping:{config:['confirmation'],fields:{mappingPrompt:['字段确认提示','textarea',[],'请核对字段现值、建议值与来源，明确确认后再校验。']}},
 check:{config:['maxRetries'],fields:{recoveryMode:['阻塞恢复方式','select',[['simulate','来源系统处理 + 显式本地事实模拟'],['manual','仅回来源系统处理后重检']],'simulate'],blockerPrompt:['阻塞解决提示','textarea',[],'请按失败证据联系负责人处理，重新校验；建议不能替代事实。'],imagesGuide:['图片处理提示','textarea',[],'由商品资料维护人在对应产品型号补齐图片，再查询确认。'],diGuide:['安全 DI 处理提示','textarea',[],'请项目安全负责人处理安全 DI，待权威系统实际归零后重新取数。'],minimumGuide:['最小系统处理提示','textarea',[],'请负责人完成失败证据对应对象 / 入参的最小系统发布，再重新查询确认。']}},
 review:{config:[],fields:{reviewPrompt:['复核提示','textarea',[],'请人工核对单据内容、字段来源、具体业务行与当前校验证据。']}},
 submitted:{config:['allowAssistantSubmit'],fields:{receiptPrompt:['模拟提交回执提示','textarea',[],'本地模拟提交完成；未提交真实单据，未写业务数据库。']}}
};
// 三列定义默认取同一业务操作行，不在 schema 里重复硬编码文案。
const sceneFlowStageDefinitionFields={eventDescription:['发生什么','textarea',[]],systemAction:['系统动作','textarea',[]],nextStep:['下一步','textarea',[]]};
for(const schema of Object.values(sceneFlowStageFields))schema.fields={...sceneFlowStageDefinitionFields,...schema.fields};
// 合并显示层只保存统一四列；提示与策略仍写回原 runtime 所属阶段，不迁移或删除旧定义。
sceneFlowStageFields.prepare={config:['confirmation','maxRetries'],fields:{...sceneFlowStageDefinitionFields,interactionPrompt:['用户交互','textarea',[],'草稿和当前校验反馈一起展示；请核对字段、查看失败原因与处理建议。'],...Object.fromEntries(Object.entries(sceneFlowStageFields.mapping.fields).filter(([key])=>!Object.hasOwn(sceneFlowStageDefinitionFields,key))),...Object.fromEntries(Object.entries(sceneFlowStageFields.check.fields).filter(([key])=>!Object.hasOwn(sceneFlowStageDefinitionFields,key)))}};
sceneFlowStageFields.finish={config:['submissionMode','autoSubmit','allowAssistantSubmit'],fields:{...sceneFlowStageDefinitionFields,interactionPrompt:['用户交互','textarea',[],'请核对当前单据与正式校验证据并明确复核。按提交方式执行：语义授权提交（默认）说“这张发布单我检查好了，帮我提交”，无需再点击；AI 自动提交在明确复核后自动终检；人工提交由用户复核后点击确认提交。仅复核不代表语义授权；旧配置关闭代提交时仍返回表单自行提交。'],reviewPrompt:sceneFlowStageFields.review.fields.reviewPrompt,receiptPrompt:sceneFlowStageFields.submitted.fields.receiptPrompt}};
const sceneFlowMergedPromptOwners={prepare:{mappingPrompt:'mapping',recoveryMode:'check',blockerPrompt:'check',imagesGuide:'check',diGuide:'check',minimumGuide:'check'},finish:{reviewPrompt:'review',receiptPrompt:'submitted'}};
function sceneFlowStageInteractionField(stage){return sceneFlowMergedPromptOwners[stage]?'interactionPrompt':Object.keys(sceneFlowStageFields[stage].fields).find(key=>/Prompt$/.test(key));}
const sceneFlowStageBranches={recognize:'unknown',clarify:'ambiguous',mapping:'recognized',check:'blocked',review:'passed-review'};
const sceneFlowDefinitionNote='业务流程定义可编辑；校验、人工确认、未知阻断、终检由运行时强制保障，文本修改不等于接口/任意跳转实际执行';
const sceneFlowBranchStages={recognized:'recognize',ambiguous:'recognize',unknown:'recognize','vague-question':'recognize',blocked:'check',timeout:'check','passed-review':'review','input-empty':'input','input-missing':'input','clarify-missing':'clarify','clarify-conflict':'clarify','mapping-conflict':'mapping','mapping-missing':'mapping','review-stale':'review','submit-failed':'submitted',duplicate:'submitted'};
const sceneFlowBranchFields={config:[],fields:{triggerDescription:['何时发生','textarea',[]],systemAction:['系统如何处理','textarea',[]],question:['问用户什么','textarea',[]],guide:['用户可做什么','textarea',[]],continueCondition:['满足何条件继续','textarea',[]]}};
function sceneFlowBranchStage(id){return Object.hasOwn(sceneFlowBranchStages,id)?sceneFlowBranchStages[id]:null;}
// 每阶段独立选择；显式空列表覆盖旧 branches，尚未迁移的阶段兼容旧已保存项。
function sceneFlowSelectedBranchIds(s,stage=sceneFlowUI.stage){
 if(stage==='all')return sceneFlowBranchRows(s).filter(([id])=>sceneFlowBranchSelected(s,id)).map(([id])=>id);
 if(sceneFlowMergedPromptOwners[stage])return sceneFlowDisplayRuntimeStages[stage].flatMap(runtime=>sceneFlowSelectedBranchIds(s,runtime));
 if(!Object.hasOwn(sceneFlowBusinessStages,stage))return [];
 const flow=workflowScene(s).flow||{},selections=flow.branchSelections,ids=selections&&Object.hasOwn(selections,stage)?(Array.isArray(selections[stage])?selections[stage]:[]):Object.keys(flow.branches||{});
 return [...new Set(ids.filter(id=>sceneFlowBranchStage(id)===stage))];
}
function sceneFlowBranchSelected(s,id){const stage=sceneFlowBranchStage(id);return !!stage&&sceneFlowSelectedBranchIds(s,stage).includes(id);}
function sceneFlowBranchConfig(s,id){const row=sceneFlowBranchRows(s).find(([key])=>key===id);if(!row)return null;const saved=sceneFlowBranchSelected(s,id)?workflowScene(s).flow?.branches?.[id]:null;return Object.fromEntries(Object.keys(sceneFlowBranchFields.fields).map((key,i)=>[key,typeof saved?.[key]==='string'?saved[key]:row[i+2]]));}
function sceneFlowBranchSaveDefinition(s,stage,id,definition){
 const w=workflowScene(s),ids=sceneFlowSelectedBranchIds(s,stage);if(!ids.includes(id))ids.push(id);
 w.flow={...(w.flow||{}),branchSelections:{...(w.flow?.branchSelections||{}),[stage]:ids},branches:{...(w.flow?.branches||{}),[id]:definition}};
}
// 未选入的旧隐藏处理不能覆盖运行提示；安全门禁和默认处理仍由引擎保障。
function sceneFlowBranchText(s,id,key,fallback){const value=sceneFlowBranchSelected(s,id)?workflowScene(s).flow?.branches?.[id]?.[key]:undefined;return typeof value==='string'?value:fallback;}
function sceneFlowBranchHistory(s,id){
 const c=sceneFlowBranchConfig(s,id);if(!c)return;const label=sceneFlowBranchRows(s).find(([key])=>key===id)[1];
 if(sceneFlowBranchSelected(s,id)){const branchDefinition={id,stage:sceneFlowBranchStage(id),definition:structuredClone(c),fingerprint:state.drawer.fingerprint};sceneFlowHistory('configuration',`分支配置要求 · ${label}：何时发生：${c.triggerDescription}；系统如何处理：${c.systemAction}；满足何条件继续：${c.continueCondition}（不是已执行结果）`,{branchDefinition});}
 else sceneFlowHistory('system',`默认处理 · ${label}（未配置处理分支）；安全阻断、人工确认和独立重检仍由运行时保障。`);
 sceneFlowHistory('assistant',c.question);sceneFlowHistory('assistant',c.guide);
}
const sceneFlowStageOwners=new WeakMap();
function sceneFlowStagePromptConfig(s,stage){const saved=workflowScene(s).flow?.stages?.[stage]||{},owners=sceneFlowMergedPromptOwners[stage];return Object.fromEntries(Object.entries(sceneFlowStageFields[stage].fields).filter(([key])=>!Object.hasOwn(sceneFlowStageDefinitionFields,key)).map(([key,spec])=>{const runtime=owners?.[key];return [key,runtime?sceneFlowStageDisplay(s,runtime).business[key]:saved[key]??spec[3]];}));}
function sceneFlowLegacyDefinitionsHTML(s,group){
 if(!sceneFlowMergedPromptOwners[group]||!sceneFlowInlineActive(s,group))return '';
 const stages=workflowScene(s).flow?.stages||{},runtimeStages=sceneFlowDisplayRuntimeStages[group].filter(runtime=>Object.keys(stages[runtime]||{}).length);
 if(!runtimeStages.length)return '';
 return `<details class="plain-details section-gap" data-flow-legacy-definitions><summary>核对旧配置（仅保留已保存信息）</summary>${runtimeStages.map(runtime=>`<h4>${esc(sceneFlowStageLabel(runtime))} · ${runtime}</h4>${jsonView({saved:stages[runtime],effective:sceneFlowStageDisplay(s,runtime).business})}`).join('')}</details>`;
}
function sceneFlowSaveMergedDefinition(s,stage,definition,config){
 const w=workflowScene(s),flow=structuredClone(w.flow||{}),stages={...(flow.stages||{})},owners=sceneFlowMergedPromptOwners[stage];
 stages[stage]={...(stages[stage]||{}),...Object.fromEntries(['eventDescription','systemAction','interactionPrompt','nextStep'].map(key=>[key,definition[key]]))};
 for(const runtime of sceneFlowDisplayRuntimeStages[stage]){const effective=sceneFlowStageDisplay(s,runtime).business,prompts=Object.fromEntries(Object.entries(owners).filter(([key,id])=>id===runtime&&definition[key]!==effective[key].trim()).map(([key])=>[key,definition[key]]));stages[runtime]={...(stages[runtime]||{}),...prompts};const branch=sceneFlowStageBranches[runtime],prompt=sceneFlowStageInteractionField(runtime);if(branch&&sceneFlowBranchSelected(s,branch)&&Object.hasOwn(flow.branches?.[branch]||{},'question')&&definition[prompt]!==sceneFlowStageDisplay(s,runtime).business[prompt].trim())flow.branches={...(flow.branches||{}),[branch]:{...flow.branches[branch],question:definition[prompt]}};}
 flow.stages=stages;const policy={...(w.sceneFlow||{}),...Object.fromEntries(sceneFlowStageFields[stage].config.filter(key=>key!=='submissionMode'||config[key]!==undefined).map(key=>[key,key==='maxRetries'?Number(config[key]):structuredClone(config[key])])),safety:'mandatory'};
 // 全部验证和候选配置构建结束后再一次替换，不在验证过程中写半份配置。
 Object.assign(w,{flow,sceneFlow:policy});
}
function sceneFlowStageConfig(s,stage){const saved=workflowScene(s).flow?.stages?.[stage]||{},row=sceneFlowStageDetails(s,stage).row;return {...sceneFlowStagePromptConfig(s,stage),...Object.fromEntries(Object.keys(sceneFlowStageDefinitionFields).map((key,i)=>[key,saved[key]??row[[0,1,3][i]]]))};}
// 运行仅携带定义快照作为配置要求 / plan；真实本地引擎仍独立执行固定门禁。
function sceneFlowDefinitionSnapshot(s,stage,fingerprint){const id=sceneFlowStageId(stage),definition=sceneFlowStageConfig(s,id),branch=sceneFlowStageBranches[id],key=sceneFlowStageInteractionField(id);if(branch)definition[key]=sceneFlowBranchText(s,branch,'question',definition[key]);return {stage:id,definition:structuredClone(definition),fingerprint};}
function sceneFlowRecordStageDefinition(s,stage){const stageDefinition=sceneFlowDefinitionSnapshot(s,stage,state.drawer.fingerprint),{stage:id,definition}=stageDefinition;state.drawer.flow.stageDefinition=stageDefinition;sceneFlowHistory('configuration',`本阶段配置 · ${sceneFlowStageLabel(id)}：发生什么：${definition.eventDescription}；系统动作（配置要求 / plan）：${definition.systemAction}；下一步（流转要求）：${definition.nextStep}（不是已执行结果）`,{stageDefinition:structuredClone(stageDefinition)});}
function sceneFlowEditAllowed(s){return !!s&&workflowScene(s).type==='draft'&&typeof sceneReleaseCanEdit==='function'&&sceneReleaseCanEdit(s)&&['草稿','修订'].includes(sceneReleaseEnsure(s).status);}
function sceneFlowStageAllowed(){
 const d=state.drawer;if(d?.type!=='sceneFlowStageSettings')return null;
 const owner=sceneFlowStageOwners.get(d);if(!owner||d.mode!==owner.mode||d.branch!==owner.branch||d.stage!==owner.stage||d.sceneId!==owner.sceneId||d.blockId!==owner.blockId||d.fingerprint!==owner.fingerprint){errorDrawer('阶段所有权已变化，请重新打开本阶段。');return null;}
 const s=sceneFlowGuard('sceneFlowStageSettings');if(!s)return null;if(!sceneFlowEditAllowed(s)){errorDrawer('请先进入草稿 / 修订编辑；已发布配置不可修改。');return null;}return s;
}
function sceneFlowOpenStageSettings(el){
 if(!sceneFlowInlineLeave())return;
 const stage=el?.dataset?.stage,branch=el?.dataset?.branch,mode=branch!==undefined?'branch':'stage';if(!sceneFlowStages.some(([id])=>id===stage)||mode==='branch'&&sceneFlowBranchStage(branch)!==stage)return;
 const s=scene();if(!sceneFlowEditAllowed(s))return toast('请先点击场景的“编辑”；发布配置需先进入修订。');if(state.drawer)return toast('请先关闭当前抽屉，再编辑本阶段；未保存输入不会自动保存。');
 if(typeof objectReleasePins==='function')objectReleasePins(s);const c=sceneFlowConfig(s),schema=mode==='branch'?sceneFlowBranchFields:sceneFlowStageFields[stage],focusField=Object.hasOwn(schema.fields,el?.dataset?.focusfield)?el.dataset.focusfield:undefined;
 openDrawer('sceneFlowStageSettings',mode==='branch'?sceneFlowBranchConfig(s,branch):{...Object.fromEntries(schema.config.map(key=>[key,key==='submissionMode'&&sceneFlowLegacySubmission(s)?undefined:c[key]])),...sceneFlowStageConfig(s,stage)},{sceneId:s.id,blockId:s.selectedBlock,stage,mode,branch,focusField,fingerprint:sceneFlowFingerprint(s)});
 const d=state.drawer;sceneFlowStageOwners.set(d,{sceneId:d.sceneId,blockId:d.blockId,stage,mode,branch,fingerprint:d.fingerprint});
 if(focusField)overlayRoot.querySelector(`[data-field="${focusField}"]`)?.focus();
}
function sceneFlowSaveStage(){
 const s=sceneFlowStageAllowed();if(!s)return;const d=state.drawer,schema=d.mode==='branch'?sceneFlowBranchFields:sceneFlowStageFields[d.stage],v=d.draft,keys=[...schema.config,...Object.keys(schema.fields)];
 if(!v||typeof v!=='object'||Array.isArray(v))return errorDrawer('配置必须是受控字段对象。');
 if(Object.keys(v).some(key=>!keys.includes(key)))return errorDrawer('本阶段包含不可编辑字段；安全校验与阶段顺序不可修改。');
 for(const [key,[label,kind,list]]of Object.entries(schema.fields)){if(kind==='select'?!list.some(([id])=>id===v[key]):typeof v[key]!=='string'||!v[key].trim()||v[key].trim().length>800)return errorDrawer(`${label} 需为有效选项或 1–800 字的非空提示。`);}
 if(d.mode==='branch'){sceneFlowBranchSaveDefinition(s,d.stage,d.branch,Object.fromEntries(Object.keys(schema.fields).map(key=>[key,v[key].trim()])));workflowInvalidate();closeOverlay(true);render();toast('分支五项处理定义已保存；旧生成、校验与复核需重新执行。');return;}
 const originalIssue=sceneFlowConfigError(sceneFlowConfig(s));if(originalIssue)return errorDrawer(originalIssue);
 const c={...sceneFlowConfig(s),...Object.fromEntries(schema.config.filter(key=>key!=='submissionMode'||v[key]!==undefined).map(key=>[key,v[key]]))},issue=sceneFlowConfigError(c);if(issue)return errorDrawer(issue);
 const w=workflowScene(s);if(schema.config.length)w.sceneFlow={...(w.sceneFlow||{}),...Object.fromEntries(schema.config.filter(key=>key!=='submissionMode'||v[key]!==undefined).map(key=>[key,key==='maxRetries'?Number(v[key]):structuredClone(v[key])])),safety:'mandatory'};
 w.flow={...(w.flow||{}),stages:{...(w.flow?.stages||{}),[d.stage]:{...sceneFlowStageConfig(s,d.stage),...Object.fromEntries(Object.keys(schema.fields).map(key=>[key,typeof v[key]==='string'?v[key].trim():v[key]]))}}};
 workflowInvalidate();closeOverlay(true);render();toast('本阶段配置已保存；旧生成、校验与复核需重新执行。');
}
function sceneFlowStageSettingsDrawer(){
 const d=state.drawer,c=d.draft,schema=d.mode==='branch'?sceneFlowBranchFields:sceneFlowStageFields[d.stage],focusLabel=d.focusField?(d.mode==='stage'&&d.focusField===sceneFlowStageInteractionField(d.stage)?'用户交互':schema.fields[d.focusField][0]):'',subtitle=focusLabel?`当前编辑列：${focusLabel}；其他字段已预填，仅修改本列即可保存。`:'配置当前阶段的处理定义和流转要求；其他字段已预填，取消不保存。';
 const definitionFields=Object.entries(schema.fields).map(([key,[label,kind,list]])=>field(d.mode==='stage'&&key===sceneFlowStageInteractionField(d.stage)?'用户交互':label,key,c[key],kind,list,'',kind==='textarea')).join('');
 if(d.mode==='branch')return frame('编辑分支 · '+sceneFlowBranchRows(appScenes[d.sceneId]).find(([id])=>id===d.branch)?.[1],subtitle,`<div class="form-grid section-gap">${definitionFields}</div><p class="tiny muted section-gap">${sceneFlowDefinitionNote}</p>`,btn('保存分支处理定义','scene-flow-save-stage','primary','check'),true);
 const configFields={unknown:['无法识别时','select',[['clarify','追问关键信息'],['manual','提供人工本体选择入口']]],maxRetries:['失败最多重试','select',[[0,'不重试'],[1,'1 次'],[2,'2 次'],[3,'3 次']]],confirmation:['字段确认模式','select',[['per-field','逐字段确认（可保留用户值）'],['summary','整单复核后确认（差异保留现值）']]]};
 return frame('编辑本阶段 · '+sceneFlowStageLabel(d.stage),subtitle,`${schema.config.includes('intents')?`<fieldset class="inset-panel"><legend>支持的用户意图</legend>${sceneFlowIntents.map(([id,label])=>`<label class="check-row"><input type="checkbox" data-scene-flow-intent="${id}" ${c.intents.includes(id)?'checked':''}>${label}</label>`).join('')}</fieldset>`:''}<div class="form-grid section-gap">${schema.config.filter(key=>key!=='intents'&&!(d.stage==='finish'&&['autoSubmit','allowAssistantSubmit'].includes(key))).map(key=>{if(key==='submissionMode')return sceneFlowSubmissionModeSelect(c[key]);if(key==='autoSubmit')return sceneFlowAutoSubmitSwitch(c[key]);if(key==='allowAssistantSubmit')return sceneFlowSubmissionSwitch(c[key]);const [label,kind,list]=configFields[key];return field(label,key,c[key],kind,list);}).join('')}${definitionFields}</div><p class="tiny muted section-gap">${sceneFlowDefinitionNote}</p>`,btn('保存本阶段配置','scene-flow-save-stage','primary','check'),true);
}
function sceneFlowStageSettingsInput(el){const d=state.drawer;if(d?.type!=='sceneFlowStageSettings'||!sceneFlowStageAllowed())return;const schema=d.mode==='branch'?sceneFlowBranchFields:sceneFlowStageFields[d.stage],key=el?.dataset?.field;if(key==='clarification'){delete d.draft.clarification;return;}if(key&&[...schema.config,...Object.keys(schema.fields)].includes(key)){if(key==='submissionMode')sceneFlowChooseSubmissionMode(d.draft,el.value);else if(['autoSubmit','allowAssistantSubmit'].includes(key))sceneFlowSetSubmitSwitch(d.draft,key,el.checked);else d.draft[key]=el.value;d.dirty=true;}}
// 行内草稿只属于浏览 UI；受信任 owner / 初始值放 WeakMap，不能随 UI 元数据一起篡改。
const sceneFlowInlineOwners=new WeakMap();
const sceneFlowInlineConfigFields={unknown:['无法识别时','select',[['clarify','追问关键信息'],['manual','提供人工本体选择入口']]],maxRetries:['失败最多重试','select',[[0,'不重试'],[1,'1 次'],[2,'2 次'],[3,'3 次']]],confirmation:['字段确认模式','select',[['per-field','逐字段确认（可保留用户值）'],['summary','整单复核后确认（差异保留现值）']]]};
function sceneFlowInlineError(message){
 const e=sceneFlowUI.editor;if(e)e.error=message;else sceneFlowUI.inlineError=message;
 const node=document.getElementById(e?'scene-flow-inline-error':'scene-flow-inline-notice');if(node)node.textContent=message;return null;
}
function sceneFlowInlineDirty(){const e=sceneFlowUI.editor,owner=e&&sceneFlowInlineOwners.get(e);return !!e&&(e.pendingNew||owner?.pendingNew||e.dirty||!owner||JSON.stringify(e.draft)!==owner.initial);}
function sceneFlowInlineLeave(){
 if(sceneFlowInlineDirty()){sceneFlowInlineError('请先保存或取消当前行内编辑，再切换阶段、分支或打开其他配置。');return false;}
 sceneFlowUI.editor=null;sceneFlowUI.inlineError='';return true;
}
function sceneFlowInlineAllowed(){
 const e=sceneFlowUI.editor;if(!e)return null;const owner=sceneFlowInlineOwners.get(e);
 if(!owner||['sceneId','blockId','stage','displayStage','mode','branch','fingerprint','pendingNew'].some(key=>e[key]!==owner[key])||owner.pendingNew&&(sceneFlowUI.stage!==owner.displayStage||owner.mode!=='branch'||sceneFlowBranchStage(owner.branch)!==owner.stage||!sceneFlowDisplayHasStage(owner.displayStage,owner.stage)))return sceneFlowInlineError('编辑所有权已变化，请取消后重新编辑。');
 const s=scene();if(!s||s.id!==owner.sceneId)return sceneFlowInlineError('当前场景已切换，请取消后重新编辑。');
 if(s.selectedBlock!==owner.blockId)return sceneFlowInlineError('当前区块已切换，请取消后重新编辑。');
 if(state.drawer)return sceneFlowInlineError('请先关闭当前抽屉，再保存行内编辑。');
 if(!sceneFlowEditAllowed(s))return sceneFlowInlineError('请先进入草稿 / 修订编辑；已发布配置不可修改。');
 if(sceneFlowFingerprint(s)!==owner.fingerprint)return sceneFlowInlineError('场景配置已变化，请取消后重新编辑，避免覆盖新定义。');return s;
}
function sceneFlowInlineActive(s,stage,mode='stage',branch){const e=sceneFlowUI.editor;return e&&e.sceneId===s.id&&e.blockId===s.selectedBlock&&(e.stage===stage||mode==='branch'&&e.displayStage===stage)&&e.mode===mode&&e.branch===branch?e:null;}
function sceneFlowStageDisplay(s,stage){
 const business=sceneFlowStageConfig(s,stage),detail=sceneFlowStageDetails(s,stage),interaction=sceneFlowStageInteractionField(stage),branch=sceneFlowStageBranches[stage],question=branch?sceneFlowBranchText(s,branch,'question',undefined):undefined,sourceBranch=typeof question==='string'?branch:undefined;
 detail.row[0]=business.eventDescription;detail.row[1]=business.systemAction;detail.row[3]=business.nextStep;
 if(sourceBranch){business[interaction]=question;detail.row[2]=question;}else if(typeof workflowScene(s).flow?.stages?.[stage]?.[interaction]==='string')detail.row[2]=business[interaction];
 return {business,detail,interaction,sourceBranch};
}
function sceneFlowInlineEdit(el){
 const requested=el?.dataset?.stage,branch=el?.dataset?.branch,mode=branch!==undefined?'branch':'stage',stage=mode==='branch'?sceneFlowBranchStage(branch):requested,displayStage=sceneFlowDisplayGroup(requested);if(!sceneFlowEditableStage(requested)||!stage||mode==='branch'&&!sceneFlowDisplayHasStage(displayStage,stage))return;
 if(state.drawer)return sceneFlowInlineError('请先关闭当前抽屉，再开始行内编辑。');const s=scene();if(!sceneFlowEditAllowed(s))return sceneFlowInlineError('请先点击场景的“编辑”；已发布配置需先进入修订。');
 if(sceneFlowInlineActive(s,stage,mode,branch))return;if(!sceneFlowInlineLeave())return;
 if(typeof objectReleasePins==='function')objectReleasePins(s);
 const schema=mode==='branch'?sceneFlowBranchFields:sceneFlowStageFields[stage],c=sceneFlowConfig(s),display=mode==='stage'?sceneFlowStageDisplay(s,stage):null;
 const draft=mode==='branch'?sceneFlowBranchConfig(s,branch):{...Object.fromEntries(schema.config.map(key=>[key,key==='submissionMode'&&sceneFlowLegacySubmission(s)?undefined:c[key]])),...display.business,[display.interaction]:display.detail.row[2]};
 const e={draft:structuredClone(draft),sceneId:s.id,blockId:s.selectedBlock,stage,displayStage,mode,branch,pendingNew:mode==='branch'&&!sceneFlowBranchSelected(s,branch),fingerprint:sceneFlowFingerprint(s),error:'',dirty:false};
 sceneFlowInlineOwners.set(e,{sceneId:e.sceneId,blockId:e.blockId,stage,displayStage,mode,branch,pendingNew:e.pendingNew,fingerprint:e.fingerprint,initial:JSON.stringify(e.draft),sourceBranch:display?.sourceBranch,sourcePrompt:display?.detail.row[2]});sceneFlowUI.editor=e;sceneFlowUI.stage=displayStage;render();
}
function sceneFlowInlineInput(el){
 const e=sceneFlowUI.editor,key=el?.dataset?.flowInlineField;if(!e||key===undefined)return;if(!sceneFlowInlineAllowed())return;
 const schema=e.mode==='branch'?sceneFlowBranchFields:sceneFlowStageFields[e.stage],keys=[...schema.config,...Object.keys(schema.fields)];
 if(!keys.includes(key))return sceneFlowInlineError('包含不可编辑字段；安全校验与阶段顺序不可修改。');
 if(key==='intents'){
  const intent=el.dataset.flowInlineIntent;if(!sceneFlowIntents.some(([id])=>id===intent)||!Array.isArray(e.draft.intents))return sceneFlowInlineError('请选择有效用户意图。');
  e.draft.intents=e.draft.intents.filter(id=>id!==intent);if(el.checked)e.draft.intents.push(intent);
 }else if(key==='submissionMode'){if(!sceneFlowChooseSubmissionMode(e.draft,el.value))return sceneFlowInlineError('提交方式必须为 authorized、auto 或 manual 的有效选项。');}else if(['autoSubmit','allowAssistantSubmit'].includes(key))sceneFlowSetSubmitSwitch(e.draft,key,el.checked);else e.draft[key]=el.value;
 e.dirty=JSON.stringify(e.draft)!==sceneFlowInlineOwners.get(e).initial;sceneFlowInlineError('');
 // 不 render、不 focus：textarea / select / checkbox 均保留当前输入与光标。
}
function sceneFlowInlineSave(){
 const s=sceneFlowInlineAllowed();if(!s)return;const e=sceneFlowUI.editor,owner=sceneFlowInlineOwners.get(e),schema=e.mode==='branch'?sceneFlowBranchFields:sceneFlowStageFields[e.stage],v=e.draft,keys=[...schema.config,...Object.keys(schema.fields)];
 if(!v||typeof v!=='object'||Array.isArray(v))return sceneFlowInlineError('配置必须是受控字段对象。');
 if(Object.keys(v).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(v,key)))return sceneFlowInlineError('本阶段包含缺失或不可编辑字段；安全校验与阶段顺序不可修改。');
 for(const [key,[label,kind,list]]of Object.entries(schema.fields)){if(kind==='select'?!list.some(([id])=>id===v[key]):typeof v[key]!=='string'||!v[key].trim()||v[key].trim().length>800)return sceneFlowInlineError(`${label} 需为有效选项或 1–800 字的非空提示。`);}
 if(schema.config.includes('maxRetries')&&(!['number','string'].includes(typeof v.maxRetries)||!['0','1','2','3'].includes(String(v.maxRetries))))return sceneFlowInlineError('失败重试最多 0–3 次，请选择有效策略。');
 const originalIssue=e.mode==='stage'?sceneFlowConfigError(sceneFlowConfig(s)):'';if(originalIssue)return sceneFlowInlineError(originalIssue);
 const c={...sceneFlowConfig(s),...Object.fromEntries(schema.config.filter(key=>key!=='submissionMode'||v[key]!==undefined).map(key=>[key,v[key]]))},issue=e.mode==='stage'?sceneFlowConfigError(c):'';if(issue)return sceneFlowInlineError(issue);
 const w=workflowScene(s),definition=Object.fromEntries(Object.keys(schema.fields).map(key=>[key,typeof v[key]==='string'?v[key].trim():v[key]]));
 if(e.mode==='branch')sceneFlowBranchSaveDefinition(s,e.stage,e.branch,definition);
 else if(sceneFlowMergedPromptOwners[e.stage])sceneFlowSaveMergedDefinition(s,e.stage,definition,v);
 else{
  if(schema.config.length)w.sceneFlow={...(w.sceneFlow||{}),...Object.fromEntries(schema.config.filter(key=>key!=='submissionMode'||v[key]!==undefined).map(key=>[key,key==='maxRetries'?Number(v[key]):structuredClone(v[key])])),safety:'mandatory'};
  w.flow={...(w.flow||{}),stages:{...(w.flow?.stages||{}),[e.stage]:{...sceneFlowStageConfig(s,e.stage),...definition}}};
  // 旧 branch.question 是用户交互的实际显示 / 运行来源：只改其他列不覆盖它，改追问则同步来源。
  const prompt=sceneFlowStageInteractionField(e.stage);if(owner.sourceBranch&&definition[prompt]!==owner.sourcePrompt.trim())w.flow.branches={...(w.flow.branches||{}),[owner.sourceBranch]:{...(w.flow.branches?.[owner.sourceBranch]||{}),question:definition[prompt]}};
 }
 workflowInvalidate();sceneFlowUI.editor=null;sceneFlowUI.inlineError='';render();
}
function sceneFlowInlineCancel(){sceneFlowUI.editor=null;sceneFlowUI.inlineError='';render();}
// 候选仅为 UI 浏览值；可信归属与当时配置指纹不随 UI 对象一起被篡改。
const sceneFlowBranchChoiceOwners=new WeakMap();
const sceneFlowBranchViewOwners=new Map();
function sceneFlowBranchOptionChange(el){
 const requested=el?.dataset?.flowBranchOption;if(requested===undefined)return;const stage=sceneFlowDisplayGroup(requested);
 const s=scene();if(!s||stage!==sceneFlowUI.stage||!Object.hasOwn(sceneFlowBusinessStages,stage)||el.dataset.stage!==undefined&&sceneFlowDisplayGroup(el.dataset.stage)!==stage||el.dataset.sceneId!==undefined&&el.dataset.sceneId!==s.id||el.dataset.blockId!==undefined&&el.dataset.blockId!==s.selectedBlock)return;
 if(state.drawer||!sceneFlowEditAllowed(s))return sceneFlowInlineError('请先进入草稿 / 修订编辑，再选择处理分支。');
 const id=el.value;sceneFlowUI.branchChoice=null;if(!id)return;
 if(!sceneFlowDisplayHasStage(stage,sceneFlowBranchStage(id))||sceneFlowBranchSelected(s,id))return sceneFlowInlineError('请选择本阶段尚未配置的可发生情况。');
 const choice={sceneId:s.id,blockId:s.selectedBlock,stage,id,fingerprint:sceneFlowFingerprint(s)};sceneFlowBranchChoiceOwners.set(choice,{...choice});sceneFlowUI.branchChoice=choice;
}
function sceneFlowBranchActionAllowed(el){
 const s=scene(),stage=sceneFlowDisplayGroup(el?.dataset?.stage);
 if(!s||!Object.hasOwn(sceneFlowBusinessStages,el?.dataset?.stage)||stage!==sceneFlowUI.stage)return sceneFlowInlineError('请在处理分支所属阶段操作。');
 if(el.dataset.sceneId!==undefined&&el.dataset.sceneId!==s.id||el.dataset.blockId!==undefined&&el.dataset.blockId!==s.selectedBlock)return sceneFlowInlineError('当前场景 / 区块已切换，请重新选择。');
 if(state.drawer)return sceneFlowInlineError('请先关闭当前抽屉，再配置处理分支。');
 if(!sceneFlowEditAllowed(s))return sceneFlowInlineError('请先进入草稿 / 修订编辑；已发布配置不可修改。');
 if(!workflowScene(s).blocks?.[s.selectedBlock])return sceneFlowInlineError('当前区块已变化，请重新打开。');return s;
}
function sceneFlowAddBranch(el){
 const s=sceneFlowBranchActionAllowed(el);if(!s)return;
 const choice=sceneFlowUI.branchChoice,owner=choice&&sceneFlowBranchChoiceOwners.get(choice),stage=sceneFlowDisplayGroup(el.dataset.stage);
 if(!owner||['sceneId','blockId','stage','id','fingerprint'].some(key=>choice[key]!==owner[key])||owner.sceneId!==s.id||owner.blockId!==s.selectedBlock||owner.stage!==stage||owner.fingerprint!==sceneFlowFingerprint(s)||!sceneFlowDisplayHasStage(stage,sceneFlowBranchStage(owner.id))||sceneFlowBranchSelected(s,owner.id))return sceneFlowInlineError('请重新选择本阶段尚未配置的可发生情况。');
 // 兼容旧直接调用编辑入口；未选入的行使用同样受信任的 pending 草稿，取消无持久化。
 sceneFlowInlineEdit({dataset:{stage,branch:owner.id}});
}
function sceneFlowRemoveBranch(el){
 const s=sceneFlowBranchActionAllowed(el);if(!s)return;const stage=sceneFlowDisplayGroup(el.dataset.stage),id=el.dataset.branch;
 if(!sceneFlowDisplayHasStage(stage,sceneFlowBranchStage(id))||!sceneFlowBranchSelected(s,id))return sceneFlowInlineError('只能移除本阶段已选入的处理分支。');
 const owner=sceneFlowBranchViewOwners.get(s.id+':'+stage);
 if(!owner||owner.blockId!==s.selectedBlock||owner.fingerprint!==sceneFlowFingerprint(s))return sceneFlowInlineError('场景配置已变化，请重新打开当前阶段，避免删除新配置。');
 if(!sceneFlowInlineLeave())return;
 const w=workflowScene(s),branches={...(w.flow?.branches||{})};delete branches[id];
 w.flow={...(w.flow||{}),branchSelections:{...(w.flow?.branchSelections||{}),[sceneFlowBranchStage(id)]:sceneFlowSelectedBranchIds(s,sceneFlowBranchStage(id)).filter(key=>key!==id)},branches};
 workflowInvalidate();sceneFlowBranchViewOwners.set(s.id+':'+stage,{blockId:s.selectedBlock,fingerprint:sceneFlowFingerprint(s)});sceneFlowUI.branchChoice=null;render();
}
function sceneFlowInlineField(key,value,label,kind='textarea',list=[]){const id='scene-flow-inline-'+key;return kind==='select'?`<div class="form-field"><label for="${id}">${esc(label)}</label><select id="${id}" data-flow-inline-field="${key}">${options(list,value)}</select></div>`:`<textarea class="scene-flow-inline-textarea" id="${id}" data-flow-inline-field="${key}" aria-label="${esc(label)}" rows="5" maxlength="800">${esc(value)}</textarea>`;}
function sceneFlowInlineControls(s){return `<div class="scene-flow-editor-actions" role="group" aria-label="行内编辑操作">${btn('保存','scene-flow-inline-save','sm primary','check',sceneFlowEditAllowed(s)?'':'disabled aria-disabled="true"')}${btn('取消','scene-flow-inline-cancel','sm')}</div>`;}
function sceneFlowInlineErrorHTML(e){return `<p id="scene-flow-inline-error" class="tiny danger-text section-gap" data-flow-inline-error role="status" aria-live="polite">${esc(e.error)}</p>`;}
function sceneFlowInlinePolicyHTML(e){
 const schema=sceneFlowStageFields[e.stage],primary=['eventDescription','systemAction',sceneFlowStageInteractionField(e.stage),'nextStep'],fields=Object.entries(schema.fields).filter(([key])=>!primary.includes(key));
 return `<div class="section-gap" data-flow-inline-policy><h4>阶段策略</h4>${schema.config.includes('intents')?`<fieldset class="inset-panel section-gap"><legend>支持的用户意图</legend>${sceneFlowIntents.map(([id,label])=>`<label class="check-row"><input type="checkbox" data-flow-inline-field="intents" data-flow-inline-intent="${id}" ${Array.isArray(e.draft.intents)&&e.draft.intents.includes(id)?'checked':''}>${esc(label)}</label>`).join('')}</fieldset>`:''}<div class="form-grid section-gap">${schema.config.filter(key=>key!=='intents'&&!(e.stage==='finish'&&['submissionMode','autoSubmit','allowAssistantSubmit'].includes(key))).map(key=>{if(key==='allowAssistantSubmit')return sceneFlowSubmissionSwitch(e.draft[key],true);const [label,kind,list]=sceneFlowInlineConfigFields[key];return sceneFlowInlineField(key,e.draft[key],label,kind,list);}).join('')}${fields.map(([key,[label,kind,list]])=>kind==='select'?sceneFlowInlineField(key,e.draft[key],label,kind,list):`<div class="form-field wide"><label for="scene-flow-inline-${key}">${esc(label)}</label>${sceneFlowInlineField(key,e.draft[key],label)}</div>`).join('')}${!schema.config.length&&!fields.length?'<p class="tiny muted">本阶段没有额外策略；四列定义将一次保存。</p>':''}</div></div>`;
}
function sceneFlowContext(s,fn){return typeof objectReleaseWithScene==='function'?objectReleaseWithScene(s,fn):fn();}
function sceneFlowFingerprint(s){return typeof sceneReleaseFingerprint==='function'?sceneReleaseFingerprint(s):JSON.stringify({id:s.id,workflow:s.workflow,bindings:s.bindings,context:s.context,revision:s.revision});}
function sceneFlowGuard(type='sceneFlow'){
 const d=state.drawer,s=scene();if(!d||d.type!==type)return null;
 let message='';if(!s||s.id!==d.sceneId||workflowScene(s).type!=='draft')message='当前场景已切换，请关闭后重新打开。';
 else if(s.selectedBlock!==d.blockId)message='当前区块已切换，请重新打开场景流。';
 else if(d.fingerprint!==sceneFlowFingerprint(s))message='场景配置已变化，请关闭后重新打开。';
 if(message){if(d.flow){sceneFlowRevoke(d,true);d.flow.precheck=null;d.flow.result=null;d.flow.reviewStamp=null;d.flow.pendingExternal=null;d.flow.handoff=null;}errorDrawer(message);return null;}return s;
}
function sceneFlowRequest(value){return String(value||'').trim();}
function sceneFlowHistory(role,text,extra={}){const f=state.drawer.flow;f.history.push({role,text,at:now(),...extra});if(f.history.length>60)f.history.shift();}
// 受信任会话、正式检查、复核、授权和回执都不由可编辑 flow flags 决定。
const sceneFlowRuntimeOwners=new WeakMap(),sceneFlowFormalChecks=new WeakMap(),sceneFlowReviews=new WeakMap(),sceneFlowAuthorizations=new WeakMap(),sceneFlowCompleted=new WeakMap();
function sceneFlowRevoke(d,formal=false){if(!d?.flow)return;sceneFlowAuthorizations.delete(d);sceneFlowReviews.delete(d);d.flow.reviewStamp=null;delete d.flow.authorization;if(formal)sceneFlowFormalChecks.delete(d);}
function sceneFlowRuntimeOwned(s){const d=state.drawer,o=sceneFlowRuntimeOwners.get(d);return !!o&&o.flow===d.flow&&o.sceneId===d.sceneId&&o.blockId===d.blockId&&o.fingerprint===d.fingerprint&&d.sceneId===s.id&&d.blockId===s.selectedBlock&&d.fingerprint===sceneFlowFingerprint(s);}
function sceneFlowPassed(result){return result?.passed===true&&Array.isArray(result.errors)&&result.errors.length===0&&Array.isArray(result.checks)&&result.checks.length>0&&result.checks.every(c=>c.status==='通过'||c.status==='跳过'||c.status==='阻断'&&c.level==='警告');}
function sceneFlowTrustedCheck(s){const d=state.drawer,seal=sceneFlowFormalChecks.get(d);return sceneFlowRuntimeOwned(s)&&sceneFlowResultCurrent(s)&&sceneFlowPassed(d.flow.result)&&!!seal&&seal.result===d.flow.result&&seal.seal===JSON.stringify(d.flow.result)&&seal.stamp===sceneFlowExecutionStamp(s,sceneFlowPayload(s))&&JSON.stringify(d.flow.payload)===JSON.stringify(sceneFlowPayload(s));}
function sceneFlowTrustedReview(s){const d=state.drawer,r=sceneFlowReviews.get(d);return sceneFlowTrustedCheck(s)&&!!r&&r.stamp===sceneFlowExecutionStamp(s,sceneFlowPayload(s))&&d.flow.reviewStamp===r.stamp;}
function sceneFlowDraftReference(s){const f=state.drawer.flow,b=Object.values(workflowScene(s).blocks).find(b=>!b.parent);return {id:String(f.generated?.payload?.[b?.path]?.[b?.keyField]||''),materialCode:state.drawer.draft.materialCode||'',sceneId:s.id,blockId:state.drawer.blockId};}
function sceneFlowSubmissionInput(el){const d=state.drawer;if(d?.type!=='sceneFlow'||el?.dataset?.field!=='submissionCommand')return;if(el.value!==undefined)d.flow.submissionCommand=String(el.value);}
// Fail-closed whitelist grammar, not AI. Quoted/conditional/third-party text is never an executable command.
function sceneFlowSubmissionIntent(text){
 const q=sceneFlowRequest(text),reject=reason=>({intent:'unconfirmed',review:false,submit:false,reason});
 if(!q)return reject('请明确要复核还是提交当前单据。');
 if(/[?？]|怎么|如何|能.*吗|可以.*吗|是否|为什么|解释|意思|不要|别|暂不|不提交|如果|假如|假设|通过后|通过就|等.*再|之后|条件|他说|她说|他们|同事|别人|第三方|[“”"「」『』‘’']/.test(q))return reject('疑问、否定、条件、引用或第三方表达不是当前提交授权。');
 if(/另一|其他|那张|那个|多张|几张|这些|那些|全部|所有|一起|分别|未知|过期|旧单/.test(q))return reject('目标不是唯一当前草稿，请明确当前单据。');
 const review=/(?:我(?:已|已经)?(?:检查|复核)(?:好|完)(?:了)?|我已复核|确认复核)/.test(q);
 const submit=/(?:帮我|请|麻烦)(?:提交|代提交)|^(?:提交|代提交)(?:当前|这张|本张|本单|这份)/.test(q);
 const rest=q.replace(/(?:我(?:已|已经)?(?:检查|复核)(?:好|完)(?:了)?|我已复核|确认复核)/g,'').replace(/(?:帮我|请|麻烦)(?:提交|代提交)|^(?:提交|代提交)/g,'').replace(/(?:这张|当前|本张|本单|这份|发布单|流程单|单据|草稿|物料|编号)/g,'').replace(/\b[A-Z][A-Z0-9_]*-[A-Z0-9_.-]+\b/gi,'').replace(/[\s，,。.!！:：]/g,'');
 if((!review&&!submit)||rest)return reject('表达不在本地明确复核 / 提交命令范围，请明确当前单据。');
 return {intent:submit?'submit-current':'review-current',review,submit,reason:'本地词典识别明确的当前单据操作。'};
}
function sceneFlowSubmissionTarget(s,text){const ref=sceneFlowDraftReference(s),ids=[...new Set((text.match(/\b[A-Z][A-Z0-9_]*-[A-Z0-9_.-]+\b/gi)||[]).map(id=>id.toUpperCase()))];return ids.every(id=>id===ref.id.toUpperCase()||id===ref.materialCode.toUpperCase());}
function sceneFlowSubmissionReason(s,intent,action){const ref=sceneFlowDraftReference(s);sceneFlowHistory('assistant',`识别意图：${intent==='submit-current'?'提交当前单据':intent==='review-current'?'复核当前单据':'未确认操作'}；当前草稿：${ref.id||'无'}；授权：${sceneFlowAuthorizations.has(state.drawer)?'当前有效':state.drawer.flow.receipt?'已消费':'未授予'}；检查：${sceneFlowTrustedCheck(s)?'当前正式校验通过，结束前仍独立终检':'未确认 / 未通过 / 已过期'}；动作：${action}`);}
function sceneFlowSendMessage(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow,text=sceneFlowRequest(f.submissionCommand),parsed=sceneFlowSubmissionIntent(text);sceneFlowHistory('user',text||'（空消息）');
 const refuse=reason=>{sceneFlowAuthorizations.delete(d);sceneFlowSubmissionReason(s,parsed.intent,reason+' 未提交。');drawOverlay();};
 if(!parsed.submit&&!parsed.review)return refuse(parsed.reason);
 if(!sceneFlowRuntimeOwned(s)||!f.generated||!sceneFlowSubmissionTarget(s,text)){sceneFlowRevoke(d);return refuse('没有唯一当前草稿或编号与当前草稿不符，请明确目标。');}
 if(!sceneFlowTrustedCheck(s)){sceneFlowRevoke(d,true);return refuse('字段必须全部确认且当前正式校验通过；不能用预校验或过期检查授权。');}
 if(sceneFlowCompleted.get(d)?.stamp===sceneFlowExecutionStamp(s,sceneFlowPayload(s))&&f.receipt){sceneFlowSubmissionReason(s,parsed.intent,'复用已有本地回执，不重复执行。');return drawOverlay();}
 if(parsed.review){sceneFlowReview();if(f.receipt){sceneFlowSubmissionReason(s,parsed.intent,'明确复核后已独立终检并自动模拟提交。');return drawOverlay();}}
 if(parsed.submit){if(!sceneFlowSubmissionSourceAllowed(s,'semantic'))return refuse(sceneFlowEffectiveSubmissionMode(s)==='manual'?'人工提交模式需要用户点击确认提交，语义消息不能授权。':'当前模式须通过明确复核触发自动提交。');if(!sceneFlowTrustedReview(s))return refuse('请先明确复核当前字段、业务行与正式校验证据，例如“这张发布单我检查好了，帮我提交”。');sceneFlowAuthorizeAndSubmit('semantic');sceneFlowSubmissionReason(s,parsed.intent,f.receipt?'明确授权后独立终检通过，已本地模拟提交。':'授权门禁或独立终检未通过，未提交。');}
 else sceneFlowSubmissionReason(s,parsed.intent,'仅记录明确复核；'+(sceneFlowEffectiveSubmissionMode(s)==='manual'?'人工提交模式仍需点击确认提交。':'语义授权提交模式仍需明确提交命令。'));
 drawOverlay();
}
function sceneFlowAuthorizeAndSubmit(source='button'){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer;
 if(!sceneFlowSubmissionSourceAllowed(s,source)){sceneFlowAuthorizations.delete(d);return errorDrawer('提交入口与当前提交方式不一致；语义授权需明确消息，人工提交需点击，自动提交需明确复核。');}
 if(sceneFlowLegacySubmission(s))return sceneFlowSubmit();
 if(!sceneFlowTrustedReview(s)){sceneFlowRevoke(d);return errorDrawer('请完成当前正式校验并明确人工复核，不能沿用过期授权。');}
 const stamp=sceneFlowExecutionStamp(s,sceneFlowPayload(s));
 if(sceneFlowCompleted.get(d)?.stamp===stamp&&d.flow.receipt)return toast('本地测试已完成，相同提交不重复执行。');
 sceneFlowAuthorizations.set(d,{flow:d.flow,stamp,target:sceneFlowDraftReference(s),source});return sceneFlowSubmit();
}
function sceneFlowInvalidate(d,all=false){
 const f=d.flow;if(!f)return;sceneFlowRevoke(d,true);sceneFlowCompleted.delete(d);f.precheck=null;f.result=null;f.finalResult=null;f.reviewStamp=null;f.resultStamp=null;f.pendingExternal=null;f.blockers=[];f.receipt=null;f.handoff=null;f.payload=null;
 if(all){f.userValues={};f.systemConfirmed=false;f.generated=null;f.generatedSeal=null;f.inputStamp=null;f.confirmations={};f.document=null;f.stage='input';f.candidates=[];f.missing=[];f.retries=0;f.branch=null;f.answer=null;f.stageDefinition=sceneFlowDefinitionSnapshot(appScenes[d.sceneId], 'input',d.fingerprint);}
 d.error='';
}
function sceneFlowInputChange(el){
 const d=state.drawer;if(d?.type!=='sceneFlow'||!['request','materialCode','projectCode','softwareCode','version','submitDepartment','subject'].includes(el.dataset.field))return;
 if(el.value!==undefined)d.draft[el.dataset.field]=el.value;sceneFlowInvalidate(d,true);if(el.dataset.field==='request'){d.flow.resolvedMaterial=null;d.flow.resolvedSlots={};d.flow.draftIntentRequest=null;for(const key of ['materialCode','projectCode','softwareCode','version','submitDepartment','subject'])d.draft[key]='';}else{d.flow.resolvedSlots??={};d.flow.resolvedSlots[el.dataset.field]={request:sceneFlowRequest(d.draft.request),value:el.value};if(el.dataset.field==='materialCode')d.flow.resolvedMaterial=catalog.some(m=>m.materialCode===el.value)?{request:sceneFlowRequest(d.draft.request),id:el.value}:null;}d.dirty=true;
 // 不重绘文本输入，不抢光标；隐藏旧操作，下一次委托动作也会核验指纹。
 overlayRoot.querySelector('[data-scene-flow-result]')?.remove();
}
function sceneFlowOpen(){
 if(!sceneFlowInlineLeave())return;
 const s=scene();if(!s||workflowScene(s).type!=='draft')return;
 const configIssue=sceneFlowConfigError(sceneFlowConfig(s));if(configIssue)return toast(configIssue);
 if(typeof objectReleasePins==='function')objectReleasePins(s);
 const block=workflowScene(s).blocks[s.selectedBlock]||Object.values(workflowScene(s).blocks)[0];if(!block)return toast('请先登记表单区块。');s.selectedBlock=block.id;
 openDrawer('sceneFlow',{request:'',materialCode:'',projectCode:'',softwareCode:'',version:'',submitDepartment:'',subject:''},{sceneId:s.id,blockId:block.id,fingerprint:sceneFlowFingerprint(s),objectRunMode:'draft',flow:{stage:'input',history:[],candidates:[],missing:[],confirmations:{},generated:null,result:null,blockers:[],retries:0,authority:demoAuthority('all-pass'),failure:'正常'}});
 const d=state.drawer;sceneFlowRuntimeOwners.set(d,{flow:d.flow,sceneId:d.sceneId,blockId:d.blockId,fingerprint:d.fingerprint});
 sceneFlowRecordStageDefinition(s,'input');sceneFlowHistory('system','当前配置测试：所有识别、附件和外部事实均为本地样例；没有调用真实 AI、业务后端或提交单据。');sceneFlowHistory('assistant',sceneFlowStageConfig(s,'input').inputPrompt);drawOverlay();
}
const sceneFlowExamples=[
 ['recognized','可识别','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“欧洲版主程序升级”'],
 ['ambiguous','模糊：选择整机','给项目 PRJ-2026-A 创建摄像机发布单，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“摄像机升级”'],
 ['unknown','无法识别','帮我处理那个东西'],
 ['missing-image','缺产品图片','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“资料发布”'],
 ['di-positive','安全 DI = 2','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“项目发布”'],
 ['minimum-unreleased','最小系统未发布','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“软件发布”'],
 ['timeout','查询超时','给项目 PRJ-2026-A 创建发布单，整机 MAT-20260081，软件 SW-20260032 版本 V5.8.2，后端业务部，主题“超时验证”']
];
function sceneFlowExample(el){
 if(!sceneFlowGuard())return;const sample=sceneFlowExamples.find(([id])=>id===el.dataset.id);if(!sample)return;
 const d=state.drawer;sceneFlowInvalidate(d,true);d.flow.resolvedMaterial=null;d.flow.resolvedSlots={};d.flow.draftIntentRequest=null;Object.assign(d.draft,{request:sample[2],materialCode:'',projectCode:'',softwareCode:'',version:'',submitDepartment:'',subject:''});
 const preset=sample[0]==='missing-image'?'missing-doc':sample[0];d.flow.authority=demoAuthority(preset);d.flow.failure=preset==='timeout'?'超时':'正常';d.flow.example=preset;
 sceneFlowHistory('system',`已载入“${sample[1]}”工作流样例；样例外部事实不是现实状态。`);drawOverlay();
}
function sceneFlowRecognition(s,v){
 const q=sceneFlowRequest(v.request),c=sceneFlowConfig(s),f=state.drawer.flow;
 const result=(branch,intent,values,candidates,message)=>({branch,intent,values,candidates,message});
 if(!q)return result('unknown',null,{},[],'请描述提单信息或要解决的问题。');
 const asks=/为什么|阻断|不能提交|解释|怎么办|需要哪些|Mapping/i.test(q),drafts=/创建|提单|填单|补充.*(?:发布|单)/.test(q);
 const intent=f.draftIntentRequest===q?'draft':asks&&drafts?'mixed':asks?'explain':drafts?'draft':null;
 const allowed=intent==='mixed'?c.intents.includes('draft')&&c.intents.includes('explain'):c.intents.includes(intent);
 const matches=pattern=>[...new Set((q.match(pattern)||[]).map(x=>x.toUpperCase()))];
 const ids=matches(/(?<![A-Z0-9_])MAT-[A-Z0-9_.-]+/gi),models=matches(/(?<![A-Z0-9_])IPC-[A-Z0-9_.-]+/gi),projects=matches(/(?<![A-Z0-9_])PRJ-[A-Z0-9_.-]+/gi),software=matches(/(?<![A-Z0-9_])SW-[A-Z0-9_.-]+/gi),versions=matches(/(?<![A-Z0-9_])V\d[A-Z0-9_.-]*/gi);
 const invalidProjects=projects.filter(x=>!/^PRJ-\d{4}-[A-Z]$/.test(x)),invalidSoftware=software.filter(x=>!/^SW-\d+$/.test(x)),invalidVersions=versions.filter(x=>!/^V\d+(?:\.\d+)+$/.test(x));
 const modelMatches=catalog.filter(m=>models.includes(m.modelCode)||q.includes(m.materialName));
 const explicit=catalog.filter(m=>ids.includes(m.materialCode)),resolved=f.resolvedMaterial?.request===q&&f.resolvedMaterial.id===v.materialCode;
 const material=v.materialCode||(ids.length===1?ids[0]:modelMatches.length===1?modelMatches[0].materialCode:'');
 const known=catalog.find(m=>m.materialCode===material);
 const candidates=[...new Map([...explicit,...modelMatches,...(!material&&/摄像机|整机|型号/.test(q)?catalog:[])].map(m=>[m.materialCode,m])).values()];
 const slot=(key,list)=>String(v[key]||'').trim()||(list.length===1?list[0]:'');
 const values={materialCode:known?material:'',projectCode:slot('projectCode',projects),softwareCode:slot('softwareCode',software),version:slot('version',versions),submitDepartment:v.submitDepartment||(/后端业务部/.test(q)&&!/前端业务部/.test(q)?'后端业务部':/前端业务部/.test(q)&&!/后端业务部/.test(q)?'前端业务部':''),subject:v.subject||q.match(/(?:主题|题目)(?:为|是)?[：:]?[“"「]([^”"」]+)[”"」]/)?.[1]||''};
 const unknownMaterial=ids.some(id=>!catalog.some(m=>m.materialCode===id))||models.some(id=>!catalog.some(m=>m.modelCode===id));
 if(!intent||!allowed||invalidProjects.length||invalidSoftware.length||invalidVersions.length||unknownMaterial&&!resolved)return result('unknown',intent,values,[],!intent?'表达不在受控业务词典内；当前只支持明确提单和发布规则问题。':!allowed?'此意图未启用，请改为支持的业务任务。':invalidProjects.length||invalidSoftware.length||invalidVersions.length?'编号或版本完整格式不合法；不能截断后缀当作另一个已登记身份。请纠正原文。':'编号 / 型号不在本地样例中，不能推测不存在的本体实例。');
 const conflict=!resolved&&(ids.length>1||models.length>1||explicit.length&&modelMatches.length&&explicit.some(m=>!modelMatches.some(x=>x.materialCode===m.materialCode))||v.materialCode&&ids.length&&!ids.includes(v.materialCode));
 if(conflict||candidates.length>1&&!material)return result('ambiguous',intent,{...values,materialCode:''},candidates,'编号、型号或多个实例有歧义 / 冲突，请明确选择本体身份；不取第一条。');
 const ambiguousSlots=[['projectCode',projects],['softwareCode',software],['version',versions]].filter(([key,list])=>list.length>1&&!(sceneFlowRequest(f.resolvedSlots?.[key]?.request)===q&&f.resolvedSlots[key].value===v[key]));
 if(ambiguousSlots.length)return result('ambiguous',intent,values,[],`上下文冲突：${ambiguousSlots.map(([key])=>key).join('、')} 有多个值；请在关键字段明确填写，不挑第一项。`);
 return result('recognized',intent,values,[],'通过受控关键词和确切编号匹配（非模型理解），已识别任务；权威事实仍需精确校验。');
}
function sceneFlowBlockUses(s,b,field,ontology){return b.fields.some(f=>f.key===field)&&(!!b.object||(s.bindings[b.id]||[]).some(m=>m.ontology===ontology));}
function sceneFlowRequired(s){
 const blocks=Object.values(workflowScene(s).blocks);return [['projectCode','项目编号'],['subject','发布主题'],['submitDepartment','提交业务部门'],...(blocks.some(b=>sceneFlowBlockUses(s,b,'materialCode','Material.materialCode'))?[['materialCode','整机物料编号']]:[]),...(blocks.some(b=>sceneFlowBlockUses(s,b,'softwareCode','Software.softwareCode'))?[['softwareCode','软件物料编号'],['version','软件版本']]:[])];
}
function sceneFlowAnswer(s){
 const d=state.drawer,f=d.flow,w=workflowScene(s),rules=sceneFlowExecutionScene(s).workflow.rules.filter(r=>r.enabled);
 const evidence=rules.map(r=>({source:'当前配置规则（本地，非单据实时事实）',location:r.id,version:`场景修订 ${s.revision}`,requirement:r.assertions.map(a=>ruleText(s,r,a)).join('；'),message:r.message}));
 f.answer={answer:'发布提交需要满足以下当前规则要求。没有绑定已保存单据和实时校验，不能断言某单当前阻断或通过；问题回答不会自动生成提单。',evidence};
 f.stage='answer';sceneFlowRecordStageDefinition(s,'recognize');f.inputStamp=JSON.stringify(d.draft);sceneFlowHistory('assistant',f.answer.answer);
}
function sceneFlowContinueDraft(){
 const s=sceneFlowGuard(),d=state.drawer;if(!s||d.flow.stage!=='answer'||d.flow.inputStamp!==JSON.stringify(d.draft)||!sceneFlowConfig(s).intents.includes('draft'))return errorDrawer('请先得到当前问题回答，再明确选择继续提单。');
 d.flow.draftIntentRequest=sceneFlowRequest(d.draft.request);sceneFlowHistory('user','明确确认：使用当前已知信息继续本地提单测试。');sceneFlowRecognize();
}
function sceneFlowRecognize(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow,retries=f.retries,recognition=sceneFlowRecognition(s,d.draft);sceneFlowInvalidate(d,true);f.retries=retries;sceneFlowRecordStageDefinition(s,'recognize');
 sceneFlowHistory('user',d.draft.request||'（未输入）');Object.assign(d.draft,recognition.values);f.branch=recognition.branch;f.intent=recognition.intent;f.candidates=recognition.candidates;f.stage='clarify';sceneFlowRecordStageDefinition(s,'clarify');sceneFlowHistory('assistant',recognition.message);
 f.missing=sceneFlowRequired(s).filter(([key])=>!String(d.draft[key]||'').trim());
 sceneFlowBranchHistory(s,f.branch);if(f.branch==='unknown'&&!recognition.intent)sceneFlowBranchHistory(s,'vague-question');
 if(f.branch!=='recognized'){if(f.branch==='ambiguous')sceneFlowBranchHistory(s,'clarify-conflict');sceneFlowHistory('assistant',sceneFlowStageConfig(s,f.branch==='unknown'?'recognize':'clarify')[f.branch==='unknown'?'noMatchPrompt':'clarifyPrompt']);return drawOverlay();}
 if(['explain','mixed'].includes(f.intent)){sceneFlowAnswer(s);return drawOverlay();}
 if(d.draft.softwareCode&&!['SW-20260032','SW-20260077'].includes(d.draft.softwareCode)){f.missing.push(['softwareCode','有效的软件样例编号']);sceneFlowHistory('assistant','软件编号不在已登记本地样例中，不能使用模拟器编造的返回身份。');}
 if(f.missing.length){sceneFlowBranchHistory(s,'clarify-missing');sceneFlowHistory('assistant',sceneFlowStageConfig(s,'clarify').clarifyPrompt);sceneFlowHistory('assistant','还需明确：'+f.missing.map(([,label])=>label).join('、')+'。请补充后再次识别；未填信息不会用样例默认值偷偷提交。');return drawOverlay();}
 try{
   const document=sceneFlowContext(s,()=>workflowDemoDocument(s,'all-pass'));
   for(const b of Object.values(workflowScene(s).blocks))for(const row of b.many?document[b.path]:[document[b.path]]){
     if(!b.parent){Object.assign(row,{projectCode:d.draft.projectCode,submitDepartment:d.draft.submitDepartment});if(b.fields.some(f=>f.key==='releaseSubject'))row.releaseSubject=d.draft.subject;}
     if(sceneFlowBlockUses(s,b,'materialCode','Material.materialCode'))row.materialCode=d.draft.materialCode;
     if(sceneFlowBlockUses(s,b,'softwareCode','Software.softwareCode'))Object.assign(row,{softwareCode:d.draft.softwareCode,version:d.draft.version});
   }
   // 业务行身份与共享物料身份分开；样例引用指向当前副本中的确切行，不沿用静态 RI/MO 默认值。
   const blocks=Object.values(workflowScene(s).blocks),main=blocks.find(b=>!b.parent),orderId=document[main.path][main.keyField];
   for(const b of blocks)for(const row of b.many?document[b.path]:[document[b.path]]){
     if(b.parent&&b.object)row.mainOrderId=orderId;
     const p=b.object?sceneFlowContext(s,()=>obj(b.object)?.props.find(p=>p.key)):null;for(const binding of s.bindings[b.id]||[])if(binding.ontology===`${b.object}.${p?.id}`)row[binding.target.split('.').at(-1)]=row[b.keyField];
   }
   const items=blocks.filter(b=>b.object==='ReleaseItem').flatMap(b=>document[b.path]),modules=blocks.filter(b=>b.object==='ModuleOrder').flatMap(b=>document[b.path]);
   for(const b of blocks.filter(b=>b.object==='Mapping'))for(const row of b.many?document[b.path]:[document[b.path]]){
     if(items.length===1&&modules.length===1){const itemBlock=blocks.find(b=>b.object==='ReleaseItem'),moduleBlock=blocks.find(b=>b.object==='ModuleOrder');row.releaseItemId=items[0][itemBlock.keyField];row.moduleOrderId=modules[0][moduleBlock.keyField];row.softwareCode=modules[0].softwareCode;}
   }
   const errors=workflowDocumentErrors(s,document);if(errors.length)throw Error(errors.join('；'));
   f.userValues={};f.systemConfirmed=false;
   for(const b of Object.values(workflowScene(s).blocks))for(const row of b.many?document[b.path]:[document[b.path]])for(const field of b.fields){
     if(field.mappingMode==='user'&&field.key!==b.keyField){row[field.key]='';f.userValues[b.id+'.'+field.key]='';}
     else if(field.mappingMode==='system'&&!field.technical&&field.key!==b.keyField){row[field.key]=field.sample!==undefined?structuredClone(field.sample):field.type==='数字'?0:field.type==='布尔'?false:field.type==='日期'?'2026-11-25':'模拟系统生成：'+field.key;}
   }
   f.document=document;f.generated=sceneFlowContext(s,()=>workflowSuggestions(s,document));f.generatedSeal=JSON.stringify(f.generated);f.inputStamp=JSON.stringify(d.draft);f.confirmations={};f.stage='mapping';sceneFlowRecordStageDefinition(s,'mapping');
   sceneFlowPrecheck(s);sceneFlowHistory('assistant',sceneFlowStageConfig(s,'prepare').interactionPrompt);sceneFlowHistory('assistant',sceneFlowStageConfig(s,'mapping').mappingPrompt);sceneFlowHistory('assistant',`草稿已生成，未提交；已按当前 ${Object.keys(s.bindings).length} 个区块生成 ${f.generated.suggestions.length} 项字段建议。来源、当前值和保存位置可见；确认仅写入本地测试副本。`);
   if(f.precheck){const p=f.precheck;sceneFlowHistory('assistant',p.result.passed?'只读预校验通过，但字段尚未确认；不能据此解锁复核，确认后还须正式校验。':`草稿已生成，但预校验未通过（不是正式校验）：${p.result.errors.join('；')}${p.blockers.map(b=>`原因：${b.detail}；处理建议：${b.guide}`).join('；')}。请核对字段后正式校验，尚未提交。`);}
 }catch(e){d.error=e.message;f.generated=null;}
 drawOverlay();
}
function sceneFlowChooseMaterial(el){
 if(!sceneFlowGuard())return;const d=state.drawer,f=d.flow,id=el.dataset.id;
 const permitted=f.candidates.some(m=>m.materialCode===id)||f.branch==='unknown'&&sceneFlowConfig(scene()).unknown==='manual'&&catalog.some(m=>m.materialCode===id);
 if(!permitted)return errorDrawer('请选择当前澄清列表中的有效本体实例。');
 d.draft.materialCode=id;if(f.branch==='unknown')d.draft.request='创建发布提单：'+d.draft.request;f.resolvedMaterial={request:sceneFlowRequest(d.draft.request),id};
 sceneFlowHistory('user','澄清选择物料 '+id);sceneFlowRecognize();
}
function sceneFlowGeneratedCurrent(){
 const d=state.drawer,f=d?.flow;if(!f?.generated||d.sceneId!==scene()?.id||d.blockId!==scene()?.selectedBlock||d.fingerprint!==sceneFlowFingerprint(scene())||f.inputStamp!==JSON.stringify(d.draft)||f.generatedSeal!==JSON.stringify(f.generated))return false;return true;
}
function sceneFlowOrdinaryFields(s){return Object.values(workflowScene(s).blocks).flatMap(b=>b.fields.filter(field=>field.mappingMode==='user'||field.mappingMode==='system'||field.mappingMode==='ai').filter(field=>!field.technical&&field.key!==b.keyField).map(field=>({block:b,field,id:b.id+'.'+field.key})));}
function sceneFlowConfirmed(){const f=state.drawer.flow,s=scene();if(sceneFlowOrdinaryFields(s).some(x=>x.field.mappingMode==='ai'))return false;return sceneFlowGeneratedCurrent()&&f.generated.suggestions.every((r,i)=>['current','suggested'].includes(f.confirmations[i])&&!r.blocking)&&(!sceneFlowOrdinaryFields(s).length||f.systemConfirmed);}
function sceneFlowConfirmField(el){
 if(!sceneFlowGuard())return;const f=state.drawer.flow;if(!sceneFlowGeneratedCurrent())return errorDrawer('输入或字段建议已变化，请重新识别生成。');
 const i=Number(el.dataset.index),r=f.generated.suggestions[i],choice=el.dataset.choice;
 if(!r||r.blocking||!['current','suggested'].includes(choice)||choice==='current'&&(r.current===undefined||r.current===null||r.current===''))return errorDrawer('该字段尚有来源缺失 / 冲突或无有效现值，请先处理映射和取数来源。');
 sceneFlowInvalidate(state.drawer);f.confirmations[i]=choice;f.stage=sceneFlowConfirmed()?'ready-check':'mapping';sceneFlowRecordStageDefinition(scene(),f.stage);drawOverlay();
}
function sceneFlowConfirmAll(){
 if(!sceneFlowGuard())return;const f=state.drawer.flow;if(!sceneFlowGeneratedCurrent())return errorDrawer('输入或字段建议已变化，请重新识别生成。');
 if(f.generated.suggestions.some(r=>r.blocking)){sceneFlowBranchHistory(scene(),'mapping-conflict');return errorDrawer('有来源缺失或冲突，不可整单确认。请先处理场景映射 / 来源。');}
 sceneFlowInvalidate(state.drawer);f.confirmations=Object.fromEntries(f.generated.suggestions.map((r,i)=>[i,r.status==='保留现值，待确认差异'?'current':'suggested']));f.stage='ready-check';sceneFlowRecordStageDefinition(scene(),'check');sceneFlowHistory('user','已复核并确认所有字段建议；差异项保留当前用户值。');drawOverlay();
}
function sceneFlowOrdinaryChange(el){
 const d=state.drawer;if(d?.type!=='sceneFlow'||el.dataset.flowUser===undefined)return;const s=sceneFlowGuard();if(!s||!sceneFlowGeneratedCurrent())return;
 const item=sceneFlowOrdinaryFields(s).find(x=>x.id===el.dataset.flowUser);if(!item||item.field.mappingMode!=='user')return;
 sceneFlowInvalidate(d);d.flow.userValues??={};d.flow.userValues[item.id]=el.value;d.flow.systemConfirmed=false;d.dirty=true;
}
function sceneFlowConfirmOrdinary(){
 const s=sceneFlowGuard();if(!s||!sceneFlowGeneratedCurrent())return;const f=state.drawer.flow;
 if(sceneFlowOrdinaryFields(s).some(x=>x.field.mappingMode==='ai'))return errorDrawer('AI 按规则生成字段尚未接入生成服务，请先生成并人工确认有效结果；原型不会忽略该字段直接提交。');
 for(const {field,id}of sceneFlowOrdinaryFields(s).filter(x=>x.field.mappingMode==='user')){
  const v=f.userValues?.[id]??'';if(field.required&&!String(v).trim())return errorDrawer(`请填写 ${field.label}。`);
  if(v!==''&&(field.type==='数字'&&!Number.isFinite(Number(v))||field.type==='布尔'&&!['true','false'].includes(v)||field.type==='日期'&&!/^\d{4}-\d{2}-\d{2}$/.test(v)))return errorDrawer(`${field.label} 类型不正确。`);
 }
 f.systemConfirmed=true;state.drawer.error='';drawOverlay();
}
function sceneFlowPayload(s){
 const f=state.drawer.flow,payload=structuredClone(f.generated.payload);
 for(const {block,field,id}of sceneFlowOrdinaryFields(s).filter(x=>x.field.mappingMode==='user')){
  const v=f.userValues?.[id]??'',value=v===''?undefined:field.type==='数字'?Number(v):field.type==='布尔'?v==='true':v;
  for(const row of block.many?payload[block.path]:[payload[block.path]]){if(value===undefined)delete row[field.key];else row[field.key]=value;}
 }
 for(const [i,r]of f.generated.suggestions.entries()){
   const match=r.target.match(/^(.+)\[([^\]]+)\]\.([^.]+)$/);if(!match)throw Error('建议定位不合法。');
   const [,path,identity,key]=match,b=Object.values(workflowScene(s).blocks).find(b=>b.path===path);if(!b)throw Error('建议区块不存在。');
   const row=(b.many?payload[path]:[payload[path]]).find(row=>String(row[b.keyField])===identity);if(!row)throw Error('具体业务行已变化。');
   const value=f.confirmations[i]==='current'?r.current:r.suggested;row[key]=structuredClone(value);
 }
 return payload;
}
// 运行实际叠加的底线查询与本地目录也属于校验证据，不能只按原配置规则判断有效性。
function sceneFlowExecutionDependencies(s){return sceneFlowContext(s,()=>{
 const dependencies=sceneReleaseDependencies(sceneFlowExecutionScene(s)),software=Object.values(workflowScene(s).blocks).some(b=>b.object==='ModuleOrder')?ability('software.getPackage'):null;
 return {dependencies,catalog:structuredClone(catalog),manualInstances:structuredClone(manualInstances),people:typeof sceneRuleChainDemoPeople==='undefined'?null:structuredClone(sceneRuleChainDemoPeople),software:structuredClone(software),softwareConnector:software?structuredClone(connector(software.connector)||null):null};
});}
function sceneFlowExecutionStamp(s,payload){const d=state.drawer,f=d.flow;return JSON.stringify([d.sceneId,d.blockId,sceneFlowFingerprint(s),sceneFlowExecutionDependencies(s),d.draft,payload,f.authority,f.failure,f.generatedSeal,f.confirmations]);}
// 场景流安全校验不可关闭：发布类场景固定执行目录资料、DI 和最小系统底线，再叠加自定义规则。
function sceneFlowExecutionScene(s){
 const copy=structuredClone(s),w=workflowScene(copy),blocks=Object.values(w.blocks);
 if(sceneKind(s)==='release')for(const rule of releaseRuleTemplates()){
   const b=rule.id==='safety-di'?blocks.find(b=>!b.parent):rule.id==='catalog-docs'?blocks.find(b=>b.fields.some(f=>f.key==='materialCode')):blocks.find(b=>b.fields.some(f=>f.key==='softwareCode'));
   if(!b)throw Error('缺少发布安全校验所需区块，请先补齐结构。');
   // 底线检查不替换用户额外的、更严格的启用条件；同 ID 自定义规则另行保留执行。
   w.rules=w.rules.map(r=>r.id===rule.id?{...r,id:`${r.id}-configured`}:r);w.rules.push({...rule,scope:b.id,enabled:true,level:'阻断'});
 }
 return copy;
}
function sceneFlowExecute(s,payload){return sceneFlowContext(s,()=>{
 const result=executeWorkflow(sceneFlowExecutionScene(s),payload,state.drawer.flow.authority,'submit',state.drawer.flow.failure);
 if(result.errors.length)return result;
 const blocks=Object.values(workflowScene(s).blocks),main=blocks.find(b=>!b.parent),order=payload[main.path],orderId=order[main.keyField];
 const add=(name,target,pass,detail,unknown=false,evidence=[])=>result.checks.push({name,target,status:unknown?'未知':pass?'通过':'阻断',level:'阻断',detail,evidence});
 const rows=b=>b.many?payload[b.path]:[payload[b.path]];
 for(const b of blocks)for(const row of rows(b)){
   const target=`${b.path}[${row[b.keyField]}]`;
   if(b.parent&&b.object)add('业务行主单归属',target,row.mainOrderId===orderId,'子行必须属于当前测试主单；不能跨单引用。');
   for(const field of b.fields){if(field.mappingMode==='system')continue;const binding=(s.bindings[b.id]||[]).find(m=>m.target===scenePrefix(s,b.id)+field.key),[oid,pid]=(binding?.ontology||'').split('.'),property=obj(oid)?.props.find(p=>p.id===pid),value=row[field.key];if(field.required||binding?.required||property?.required)add('必填字段完整性',target+'.'+field.key,value!==undefined&&value!==null&&String(value).trim()!==''&&value!=='未知',`必填字段 ${field.label} 不能以空值 / 未知提交。`);}
   for(const binding of s.bindings[b.id]||[]){const [oid,pid]=binding.ontology.split('.'),p=obj(oid)?.props.find(p=>p.id===pid),key=binding.target.split('.').at(-1);if(p?.key&&oid===b.object)add('区块唯一编号与本体身份',target,row[key]===row[b.keyField],'区块唯一编号必须等于对应本体主键，业务行身份不以物料编号代替。');}
   if(row.materialCode&&sceneFlowBlockUses(s,b,'materialCode','Material.materialCode')){
     if(workflowScene(s).instanceSource!=='manual'){
       const call=result.calls.find(c=>c.capability===s.master&&c.params?.materialCode===row.materialCode),records=call?.normalized?.filter(r=>r.properties?.materialCode===row.materialCode)||[];
       add('整机本体精确身份',target,records.length===1&&records[0].identity===`Material:${row.materialCode}`,'取数必须返回唯一且确切的当前物料身份；不能用 ok 或第一条记录代替核验。',!call?.ok||!records.length);
     }
   }
   if(b.object==='ModuleOrder'){
     const call=callCapability('software.getPackage',{softwareCode:row.softwareCode},state.drawer.flow.failure);result.calls.push(call);
     const records=(call.normalized||[]).filter(r=>r.properties?.softwareCode===row.softwareCode);
     add('软件本体精确身份与版本',target,['SW-20260032','SW-20260077'].includes(row.softwareCode)&&records.length===1&&records[0].identity===`Software:${row.softwareCode}`&&records[0].properties.version===row.version,'软件编号及版本必须与唯一来源记录一致；未登记的软件不能由模拟器虚构通过。',!call.ok,records.map(r=>({source:'software.getPackage',actual:r.properties,expected:{softwareCode:row.softwareCode,version:row.version}})));
   }
   if(b.object==='Mapping'){
     const items=blocks.filter(x=>x.object==='ReleaseItem').flatMap(x=>rows(x).map(r=>({block:x,row:r}))).filter(x=>String(x.row[x.block.keyField])===String(row.releaseItemId));
     const modules=blocks.filter(x=>x.object==='ModuleOrder').flatMap(x=>rows(x).map(r=>({block:x,row:r}))).filter(x=>String(x.row[x.block.keyField])===String(row.moduleOrderId));
     add('Mapping 具体业务行引用',target,items.length===1&&modules.length===1&&items[0].row.mainOrderId===orderId&&modules[0].row.mainOrderId===orderId&&(!row.softwareCode||row.softwareCode===modules[0].row.softwareCode),'Mapping 必须精确引用同一主单的发布行 / 模块行并匹配软件，不允许按共享物料编码关联。');
   }
 }
 result.passed=result.checks.every(c=>c.status==='通过'||c.status==='跳过'||c.status==='阻断'&&c.level==='警告');return result;
});}
function sceneFlowBlockers(result,s=scene()){
 return result.checks.filter(c=>c.status==='未知'||c.status==='阻断').map(c=>{
 let fix='',guide='请对应业务负责人按失败证据中的对象、入参与事实来源，在来源系统处理后重新查询 / 校验；本地无可用修复，不支持跳过检查。';
 if(c.status==='未知')guide='请对应业务负责人检查失败证据中的来源系统、对象 / 查询参数和记录编号，处理后重新查询 / 校验。未知不能视为通过；仅已登记本地样例故障支持显式模拟恢复。';
 else if(c.rule==='catalog-docs'&&c.evidence?.some(e=>e.field==='Product.images'&&e.source==='demo.productDocuments'&&e.params?.modelCode&&e.status==='不满足')){fix='images';guide='由商品资料维护人在对应产品型号补齐图片，再查询确认。此处仅允许补充本地图片样例。';}
 else if(c.rule==='safety-di'&&c.evidence?.some(e=>e.field==='Project.safetyDI'&&e.source==='demo.safetyDI'&&e.params?.projectCode&&e.status==='不满足')){fix='di';guide='请项目安全负责人处理安全 DI，待权威系统实际归零后重新取数。按钮不会解决真实 DI；仅可显式模拟外部事实更新。';}
 else if(c.rule==='minimum-system'&&c.evidence?.some(e=>e.field==='Minimum.status'&&e.source==='demo.minimumSystem'&&e.status==='不满足'&&e.params?.projectCode&&e.params?.softwareCode&&e.params?.version)){fix='minimum';}
 const configured={images:'imagesGuide',di:'diGuide',minimum:'minimumGuide'}[fix]||(c.rule==='minimum-system'?'minimumGuide':'');if(configured)guide=sceneFlowStageConfig(s,'check')[configured]+' 处理后必须重新查询；此处不操作真实外部系统。';
 guide=sceneFlowBranchText(s,c.status==='未知'&&state.drawer?.flow?.failure==='超时'?'timeout':'blocked','guide',guide)+(sceneFlowBranchText(s,c.status==='未知'&&state.drawer?.flow?.failure==='超时'?'timeout':'blocked','guide','')?' 处理指引不能代替权威事实与独立重检。':'');
	 if(c.evidence?.length)guide+=' 失败对象 / 入参：'+c.evidence.filter(e=>['不满足','未知','阻断'].includes(e.status)).map(e=>`${e.field||e.reference||'检查项'} · ${JSON.stringify(e.params||e.arguments||{})}`).join('；');
 return {...c,fix,guide};
 });
}
// 只读预检独立保存，绝不写 confirmations / payload / result / reviewStamp 或推进 runtime 门禁。
function sceneFlowPrecheckStamp(s){const d=state.drawer,f=d.flow;return JSON.stringify([d.sceneId,d.blockId,sceneFlowFingerprint(s),sceneFlowExecutionDependencies(s),d.draft,f.generated,f.userValues,f.systemConfirmed,f.confirmations,f.authority,f.failure]);}
function sceneFlowPrecheck(s){const f=state.drawer.flow;f.precheck=null;if(!sceneFlowGeneratedCurrent())return;try{const payload=sceneFlowPayload(s),result=sceneFlowExecute(s,payload);f.precheck={result,blockers:sceneFlowBlockers(result,s),stamp:sceneFlowPrecheckStamp(s)};}catch{ /* 预检不可用也不影响草稿和正式确认流程。 */ }}
function sceneFlowPrecheckCurrent(s){try{return !!state.drawer.flow.precheck&&sceneFlowGeneratedCurrent()&&state.drawer.flow.precheck.stamp===sceneFlowPrecheckStamp(s);}catch{return false;}}
function sceneFlowPrecheckHTML(s){const f=state.drawer.flow,p=f.precheck;if(!p)return f.generated&&!f.result?'<p class="tiny muted section-gap" data-flow-precheck>尚未检查当前单据；请确认字段后执行正式校验。</p>':'';if(!sceneFlowPrecheckCurrent(s))return inf('预校验已过期；字段、输入、事实或配置已变化，请确认后重新正式校验。','amber');return `<div class="inset-panel section-gap" data-flow-precheck><h3>未确认草稿 · 只读预校验反馈</h3>${inf(p.result.passed?'预校验通过（非正式校验）；字段尚待用户确认，不能据此复核或提交。':'草稿已生成，但预校验未通过（非正式校验），尚未提交。',p.result.passed?'blue':'amber')}<p class="tiny muted section-gap">仅根据当前建议值和本地事实预检，不自动确认字段；全部确认后须独立执行正式校验。</p>${p.result.errors.length?inf('原因：'+p.result.errors.map(esc).join('；'),'red'):''}${p.blockers.map(b=>`<article class="result-card fail"><b>${esc(b.name)}</b><code class="field-path">${esc(b.target)}</code><p>原因：${esc(b.detail)}</p><p class="tiny">处理建议：${esc(b.guide)}</p></article>`).join('')}</div>`;}
function sceneFlowPreparationHTML(s){const f=state.drawer.flow;if(!f.generated)return '';return `<section class="section-gap" data-flow-preparation><h3>单据草稿与当前校验反馈</h3><p class="tiny muted">草稿已生成，不等于已提交；字段确认、正式校验、人工复核和结束前终检仍分别受门禁保护。</p>${sceneFlowMappingHTML(s)}${sceneFlowOrdinaryHTML(s)}${!f.receipt&&!f.handoff?`<div class="row section-gap">${btn('执行正式校验 / 处理后重检','scene-flow-validate','primary','shield',sceneFlowConfirmed()?'':'disabled')}</div>`:''}${f.result?sceneFlowResultHTML(s):sceneFlowPrecheckHTML(s)}</section>`;}
function sceneFlowValidate(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow;
 if(!sceneFlowConfirmed()){if(sceneFlowGeneratedCurrent())sceneFlowBranchHistory(s,'mapping-missing');return errorDrawer('请先完成澄清、生成有效字段建议，并确认每项字段。');}
 sceneFlowRecordStageDefinition(s,'check');
 try{const payload=sceneFlowPayload(s),result=sceneFlowExecute(s,payload);sceneFlowInvalidate(d);f.payload=payload;f.result=result;if(!sceneFlowLegacySubmission(s))result.passed=sceneFlowPassed(result);f.resultStamp=sceneFlowExecutionStamp(s,payload);sceneFlowFormalChecks.set(d,{result,seal:JSON.stringify(result),stamp:f.resultStamp});f.blockers=sceneFlowBlockers(result);f.stage=result.passed?'review':'blocked';sceneFlowRecordStageDefinition(s,f.stage);
   sceneFlowBranchHistory(s,result.passed?'passed-review':f.failure==='超时'?'timeout':'blocked');sceneFlowHistory('assistant',sceneFlowStageConfig(s,result.passed?'finish':'prepare').interactionPrompt);sceneFlowHistory('assistant',sceneFlowStageConfig(s,result.passed?'review':'check')[result.passed?'reviewPrompt':'blockerPrompt']);sceneFlowHistory('assistant',result.passed?'已执行提交级本地校验。当前事实满足，需复核单据；提交时仍会重新终检。':`校验未通过：${result.errors.length} 项结构错误，${f.blockers.length} 项阻断 / 未知。处理建议不能替代事实重检。`);
 }catch(e){sceneFlowInvalidate(d);d.error=e.message;}drawOverlay();
}
function sceneFlowResultCurrent(s){const f=state.drawer.flow;if(!sceneFlowConfirmed()||!f.result)return false;try{return f.resultStamp===sceneFlowExecutionStamp(s,sceneFlowPayload(s));}catch{return false;}}
function sceneFlowReview(){
 const s=sceneFlowGuard();if(!s)return;const f=state.drawer.flow,issue=sceneFlowConfigError(sceneFlowConfig(s));if(issue)return errorDrawer(issue);
 if(!sceneFlowResultCurrent(s)||!f.result.passed||!sceneFlowLegacySubmission(s)&&!sceneFlowTrustedCheck(s)){sceneFlowRevoke(state.drawer,true);if(f.result)sceneFlowBranchHistory(s,'review-stale');return errorDrawer('校验未通过或已过期，请重新校验，不能跳过阻断。');}
 const auto=sceneFlowAutoSubmitAllowed(s);if(auto&&f.receipt)return toast('本地测试已完成，相同复核不重复提交。');
 f.reviewStamp=f.resultStamp;sceneFlowReviews.set(state.drawer,{stamp:f.resultStamp});sceneFlowHistory('user','已复核提交副本、字段来源、具体业务行和当前本地校验证据。');state.drawer.error='';
 // authorized 复核只记录复核；auto 由明确复核动作授权，仍独立终检。
 if(auto)return sceneFlowLegacySubmission(s)?sceneFlowSubmit():sceneFlowAuthorizeAndSubmit('auto');drawOverlay();
}
function sceneFlowSubmit(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow,issue=sceneFlowConfigError(sceneFlowConfig(s));if(issue)return errorDrawer(issue);
 if(!sceneFlowAssistantSubmitAllowed(s)&&!sceneFlowButtonSubmitAllowed(s))return errorDrawer('本场景已关闭代用户提交，请复核后返回表单，由用户自行提交。');
 if(f.handoff)return errorDrawer('已返回表单供用户自行提交；重新开始并确认后才能选择代提交。');
 const legacy=sceneFlowLegacySubmission(s),authorization=sceneFlowAuthorizations.get(d);
 if(f.receipt&&sceneFlowResultCurrent(s)&&(legacy||sceneFlowCompleted.get(d)?.stamp===sceneFlowExecutionStamp(s,sceneFlowPayload(s))))return toast('本地测试已完成，相同提交不重复执行。');
 if(!sceneFlowResultCurrent(s)||!f.result.passed||f.reviewStamp!==f.resultStamp||!legacy&&(!sceneFlowTrustedReview(s)||!authorization||!sceneFlowSubmissionSourceAllowed(s,authorization.source)||authorization.flow!==f||authorization.stamp!==sceneFlowExecutionStamp(s,sceneFlowPayload(s)))){sceneFlowAuthorizations.delete(d);if(!legacy&&!sceneFlowTrustedReview(s))sceneFlowRevoke(d);return errorDrawer('请完成有效校验、人工复核和当前明确提交授权；输入、配置或外部事实变化后必须重新检查。');}
 // 每次终检尝试消费授权，失败 / 异常不能重试旧授权。
 sceneFlowAuthorizations.delete(d);
 try{
   const payload=sceneFlowPayload(s),finalResult=sceneFlowExecute(s,payload);f.finalResult=finalResult;
   if(!legacy)finalResult.passed=sceneFlowPassed(finalResult);
   if(!finalResult.passed){sceneFlowRevoke(d,true);f.result=finalResult;f.blockers=sceneFlowBlockers(finalResult);f.reviewStamp=null;f.stage='blocked';sceneFlowRecordStageDefinition(s,'check');sceneFlowBranchHistory(s,'submit-failed');sceneFlowBranchHistory(s,f.failure==='超时'?'timeout':'blocked');return errorDrawer('重新终检未通过，模拟提交未执行，请处理最新阻断。');}
   const key=JSON.stringify([s.id,d.fingerprint,payload]);let receipt=sceneFlowReceipts.get(key);
   if(!receipt){receipt={id:`FLOW-TEST-${String(++sceneFlowSequence).padStart(4,'0')}`,mode:'配置测试',sceneId:s.id,at:now(),businessSubmitted:false,submissionMode:sceneFlowEffectiveSubmissionMode(s)};sceneFlowReceipts.set(key,receipt);
     log('场景流配置测试',s.name,'测试通过','人工确认 → 校验 → 复核 → 再终检；未提交真实单据，不计真实执行成功。');state.logs[0].evidence={receipt:structuredClone(receipt),payload:structuredClone(payload),checks:structuredClone(finalResult.checks)};
   }
   f.receipt=structuredClone(receipt);sceneFlowCompleted.set(d,{stamp:sceneFlowExecutionStamp(s,payload),receipt:JSON.stringify(f.receipt)});f.stage='submitted';sceneFlowRecordStageDefinition(s,'submitted');sceneFlowHistory('assistant',sceneFlowStageConfig(s,'submitted').receiptPrompt);sceneFlowHistory('assistant',`本地模拟提交完成（${receipt.id}）。没有调用业务后端、写入数据库或新增真实执行成功记录。`);d.error='';drawOverlay();
 }catch(e){sceneFlowRevoke(d,true);f.reviewStamp=null;if(!sceneFlowLegacySubmission(s)||sceneFlowAutoSubmitAllowed(s)){f.result=null;f.resultStamp=null;f.stage='blocked';}d.error=e.message;drawOverlay();}
}
function sceneFlowHandoff(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow,legacy=sceneFlowLegacySubmission(s),issue=sceneFlowConfigError(sceneFlowConfig(s));if(issue)return errorDrawer(issue);
 if(f.receipt)return errorDrawer('已完成模拟代提交，不能再次返回另一结束结果。');
 if(!sceneFlowResultCurrent(s)||!f.result.passed||f.reviewStamp!==f.resultStamp||!legacy&&!sceneFlowTrustedReview(s)){f.handoff=null;if(!legacy)sceneFlowRevoke(d);return errorDrawer('请完成有效校验和人工复核；信息、配置或事实变化后必须重新检查。');}
 try{const payload=sceneFlowPayload(s),finalResult=sceneFlowExecute(s,payload);f.finalResult=finalResult;if(!legacy)finalResult.passed=sceneFlowPassed(finalResult);
  if(!finalResult.passed){if(!legacy)sceneFlowRevoke(d,true);f.handoff=null;f.result=finalResult;f.resultStamp=sceneFlowExecutionStamp(s,payload);f.blockers=sceneFlowBlockers(finalResult);f.reviewStamp=null;f.stage='blocked';sceneFlowRecordStageDefinition(s,'check');sceneFlowBranchHistory(s,'submit-failed');return errorDrawer('返回表单前重新终检未通过，请处理最新阻断；尚未完成或提交。');}
  f.handoff={payload:structuredClone(payload),sceneId:s.id,at:now(),businessSubmitted:false,submissionMode:'manual',stamp:sceneFlowExecutionStamp(s,payload)};f.stage='submitted';sceneFlowRecordStageDefinition(s,'submitted');sceneFlowHistory('assistant','表单已完成并返回，请用户在业务系统中自行提交。此处未创建真实单据、未发起审批，也不是提交成功回执。');d.error='';drawOverlay();
 }catch(e){f.handoff=null;f.reviewStamp=null;if(!legacy){sceneFlowRevoke(d,true);f.result=null;f.resultStamp=null;f.stage='blocked';}d.error=e.message;drawOverlay();}
}
function sceneFlowExternalTargets(s,kind){
 const f=state.drawer.flow;if(sceneFlowStageConfig(s,'check').recoveryMode!=='simulate'||!sceneFlowResultCurrent(s)||f.result.passed||!f.blockers.some(b=>b.fix===kind))return [];
 const fields={images:'Product.images',di:'Project.safetyDI',minimum:'Minimum.status'},targets=[];
 for(const blocker of f.blockers.filter(b=>b.fix===kind&&b.status==='阻断'))for(const e of blocker.evidence||[]){
   if(e.field!==fields[kind]||e.status!=='不满足'||!e.params)continue;
   if(kind==='images'&&e.source==='demo.productDocuments'&&e.params.modelCode)targets.push(e.params.modelCode);
   if(kind==='di'&&e.source==='demo.safetyDI'&&e.params.projectCode)targets.push(e.params.projectCode);
   if(kind==='minimum'&&e.source==='demo.minimumSystem'&&e.params.projectCode&&e.params.softwareCode&&e.params.version)targets.push(`${e.params.projectCode}|${e.params.softwareCode}|${e.params.version}`);
 }
 return [...new Set(targets)];
}
function sceneFlowSimulateExternal(el){
 const s=sceneFlowGuard();if(!s)return;const f=state.drawer.flow,kind=el.dataset.kind,targets=sceneFlowExternalTargets(s,kind);if(!targets.length)return errorDrawer('没有与当前有效校验对应的可模拟事实，不能任意改变阻断。');
 f.pendingExternal={kind,targets,stamp:f.resultStamp,evidence:f.blockers.filter(b=>b.fix===kind).map(b=>({rule:b.rule,target:b.target,evidence:b.evidence.filter(e=>e.status==='不满足')}))};drawOverlay();
}
function sceneFlowApplyExternal(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow,p=f.pendingExternal;
 if(!p||p.stamp!==f.resultStamp||JSON.stringify(p.targets)!==JSON.stringify(sceneFlowExternalTargets(s,p.kind)))return errorDrawer('外部事实模拟确认已过期，请重新校验。');
 for(const id of p.targets){if(p.kind==='images')f.authority.products[id].images=['模拟补充：本地产品图片样例.png'];if(p.kind==='di')f.authority.projects[id].safetyDI=0;if(p.kind==='minimum')f.authority.minimumSystems[id].status='已发布';}
 sceneFlowInvalidate(d);f.stage='ready-check';sceneFlowRecordStageDefinition(scene(),'check');sceneFlowHistory('system',`非真实处理：仅更新本次测试的 ${p.kind==='images'?'产品图片':p.kind==='di'?'安全 DI = 0':'最小系统已发布'} 样例事实（${p.targets.join('、')}），未操作外部系统；请重新校验。`);drawOverlay();
}
function sceneFlowRetry(){
 const s=sceneFlowGuard();if(!s)return;const d=state.drawer,f=d.flow,max=Number(sceneFlowConfig(s).maxRetries);
 const recognitionFailure=['unknown','ambiguous'].includes(f.branch)&&!f.generated,queryTimeout=sceneFlowResultCurrent(s)&&!f.result.passed&&f.failure==='超时';
 if(queryTimeout&&sceneFlowStageConfig(s,'check').recoveryMode==='manual')return errorDrawer('本阶段仅允许回来源系统处理；请处理超时后重新开始并重检。');
 if(!recognitionFailure&&!queryTimeout)return errorDrawer('当前没有可重试的识别失败或查询超时。');if(f.retries>=max)return errorDrawer('已达到失败重试上限，请补充信息或在来源系统处理后重新开始。');
 f.retries++;if(queryTimeout){f.failure='正常';sceneFlowHistory('system','模拟查询恢复：仅将本地超时故障替身恢复正常，没有真实网络重连。');sceneFlowValidate();}else{sceneFlowHistory('system',`识别重试 ${f.retries}/${max}：相同输入使用相同词典，不凭重试捏造本体。`);sceneFlowRecognize();}drawOverlay();
}
function sceneFlowOpenSettings(){
 if(!sceneFlowInlineLeave())return;
 const s=scene();if(!sceneFlowEditAllowed(s))return toast('请先点击场景的“编辑”。');
 if(typeof objectReleasePins==='function')objectReleasePins(s);const input=sceneFlowStagePromptConfig(s,'input');openDrawer('sceneFlowSettings',{...sceneFlowConfig(s),inputMode:input.inputMode,inputPrompt:input.inputPrompt},{sceneId:s.id,blockId:s.selectedBlock,fingerprint:sceneFlowFingerprint(s)});
}
function sceneFlowSaveSettings(){
 if(state.drawer?.type!=='sceneFlowSettings')return;const s=sceneFlowGuard('sceneFlowSettings');if(!s)return;if(!sceneFlowEditAllowed(s))return errorDrawer('请先进入场景编辑。');
 const c=state.drawer.draft,error=sceneFlowConfigError(c);if(error)return errorDrawer(error);
 const keys=[...Object.keys(sceneFlowDefaults()),'submissionMode','inputMode','inputPrompt'];if(Object.keys(c).some(key=>!keys.includes(key)))return errorDrawer('包含不可编辑字段；安全校验与阶段顺序不可修改。');
 if(c.inputMode!==undefined&&!['natural','structured'].includes(c.inputMode))return errorDrawer('请选择有效输入方式。');
 if(c.inputPrompt!==undefined&&(typeof c.inputPrompt!=='string'||!c.inputPrompt.trim()||c.inputPrompt.trim().length>800))return errorDrawer('输入引导语需为 1–800 字非空提示。');
 const w=workflowScene(s);w.sceneFlow={...(Object.hasOwn(c,'submissionMode')?{submissionMode:c.submissionMode}:{}),intents:[...new Set(c.intents)],unknown:c.unknown,clarification:'candidates',maxRetries:Number(c.maxRetries),confirmation:c.confirmation,autoSubmit:c.autoSubmit,allowAssistantSubmit:c.allowAssistantSubmit,safety:'mandatory'};
 if(c.inputPrompt!==undefined||c.inputMode!==undefined)w.flow={...(w.flow||{}),stages:{...(w.flow?.stages||{}),input:{...sceneFlowStageConfig(s,'input'),...(c.inputPrompt!==undefined?{inputPrompt:c.inputPrompt.trim()}:{}),...(c.inputMode!==undefined?{inputMode:c.inputMode}:{})}}};
 workflowInvalidate();closeOverlay(true);render();toast('场景流策略已保存；安全校验和提交终检始终生效');
}
function sceneFlowSettingsDrawer(){const c=state.drawer.draft;return frame('配置智能提单场景流','只保存当前场景策略；不提供关闭安全校验或跳过人工确认的选项。',`
 <div class="inset-panel section-gap"><h3>用户输入 · 基础引导</h3><p class="tiny muted section-gap">用户输入是流程起点，不是可配置处理阶段。</p><div class="form-grid section-gap">${field('输入方式','inputMode',c.inputMode??sceneFlowStagePromptConfig(scene(),'input').inputMode,'select',sceneFlowStageFields.input.fields.inputMode[2])}${field('输入引导语','inputPrompt',c.inputPrompt??sceneFlowStagePromptConfig(scene(),'input').inputPrompt,'textarea',[],'',true)}</div></div>
 ${Object.prototype.propertyIsEnumerable.call(c,'submissionMode')?sceneFlowSubmissionModeSelect(c.submissionMode):sceneFlowAutoSubmitSwitch(c.autoSubmit)+sceneFlowSubmissionSwitch(c.allowAssistantSubmit)}<fieldset class="inset-panel"><legend>支持的用户意图</legend>${sceneFlowIntents.map(([id,label])=>`<label class="check-row"><input type="checkbox" data-scene-flow-intent="${id}" ${c.intents.includes(id)?'checked':''}>${label}</label>`).join('')}</fieldset>
 <div class="form-grid section-gap">${field('无法识别时','unknown',c.unknown,'select',[['clarify','追问关键信息'],['manual','提供人工本体选择入口']])}${field('失败最多重试','maxRetries',c.maxRetries,'select',[[0,'不重试'],[1,'1 次'],[2,'2 次'],[3,'3 次']])}${field('字段确认模式','confirmation',c.confirmation,'select',[['per-field','逐字段确认（可保留用户值）'],['summary','整单复核后确认（差异保留现值）']])}</div>
 <div class="section-gap">${inf('不可关闭：本体/业务行身份校验、来源未知阻断、发布安全底线、人工复核、提交前重新终检和提交防重。纯本地确定性模拟，不连接 AI 或后端。')}</div>`,btn('保存场景流策略','scene-flow-save-settings','primary','check'),true);}
function sceneFlowStageId(stage){return ['ready-check','blocked'].includes(stage)?'check':stage==='answer'?'recognize':sceneFlowEditableStage(stage)?stage:'input';}
function sceneFlowStageLabel(stage){if(sceneFlowDisplayStages.some(([id])=>id===stage))return sceneFlowBusinessStages[stage];if(stage==='submitted')return state.drawer?.type==='sceneFlow'&&state.drawer.flow?.handoff?'完成 / 用户自行提交':scene()&&(sceneFlowAssistantSubmitAllowed(scene())||sceneFlowButtonSubmitAllowed(scene()))?sceneFlowLegacySubmission(scene())?'模拟代提交':'模拟提交':'完成 / 用户自行提交';return ({'ready-check':'待执行校验',blocked:'校验阻断',answer:'问题解释'})[stage]||sceneFlowStages.find(([id])=>id===stage)?.[1]||'用户输入';}
function sceneFlowSelectStage(el){
 const requested=el?.dataset?.stage;if(!sceneFlowEditableStage(requested)||requested==='input')return;const stage=sceneFlowDisplayGroup(requested);if(!sceneFlowDisplayStages.some(([id])=>id===stage))return;
 const d=state.drawer;
 if(d?.type==='sceneFlow'&&d.flow){d.flow.viewStage=stage;drawOverlay();return;}
 if(d||!scene()||workflowScene(scene()).type!=='draft')return;
 if(stage===sceneFlowUI.stage)return;if(!sceneFlowInlineLeave())return;
 sceneFlowUI.stage=stage;render();
}
function sceneFlowStageHTML(stage,viewStage=stage,scope='page'){
 const group=sceneFlowDisplayGroup(viewStage),selected=group==='input'?'recognize':group,actual=sceneFlowDisplayGroup(stage),prefix=`scene-flow-${scope}`;
 return `<div class="scene-flow-stage-status row section-gap">${scope==='drawer'?pill('真实执行阶段：'+sceneFlowStageLabel(stage),'blue'):pill('业务主路径 · 浏览不执行')}${pill('查看阶段：'+sceneFlowStageLabel(selected))}</div><div class="scene-flow-stages" data-flow-main-path role="tablist" aria-label="提单业务主路径：选择阶段查看交互" style="display:flex;gap:8px;flex-wrap:wrap"><span class="tiny muted" data-flow-start="input">用户输入 · 起点</span>${sceneFlowDisplayStages.map(([id,label],i)=>btn(`${i+1} · ${label}`,'scene-flow-stage',`sm scene-flow-stage-tab${id===selected?' active':''}`,'',`data-stage="${id}" role="tab" aria-selected="${id===selected}" id="${prefix}-tab-${id}" aria-controls="${prefix}-panel"${scope==='drawer'&&id===actual?' aria-current="step"':''}`)).join('')}</div>`;
}
function sceneFlowStageSnapshotHTML(s,id){
 if(id==='prepare'||id==='finish'){
  const f=state.drawer.flow,current=!!f.result&&sceneFlowResultCurrent(s),precheck=!!f.precheck&&sceneFlowPrecheckCurrent(s);
  const status=id==='prepare'?!f.generated?'尚未生成单据草稿。':f.result?current?(f.result.passed?'草稿已生成，正式校验通过；等待人工复核。':'草稿已生成，正式校验未通过；请查看下方原因与处理建议。'):'当前校验已过期，请重新校验。':precheck?(f.precheck.result.passed?'草稿已生成，预校验通过；仍须确认字段并正式校验。':'草稿已生成，预校验未通过；请查看下方原因与处理建议。'):'草稿已生成，当前校验待执行。':f.handoff?current?'已返回表单，由用户自行提交；不是提交成功。':'返回表单已过期，需重新校验与复核。':f.receipt?current?'本地模拟代提交完成；未提交真实单据。':'模拟回执对应结果已过期。':!current||!f.result.passed?'尚未具备有效校验结果，不能完成或提交。':f.reviewStamp===f.resultStamp?'已复核；'+sceneFlowSubmissionModeDescription(s):sceneFlowAutoSubmitAllowed(s)?'当前正式校验通过，复核后系统自动提交（模拟）；等待用户明确复核。':'当前校验通过，等待用户复核。';
  return `<p class="tiny muted section-gap" data-flow-stage-summary="${id}">${esc(status)}具体单据、原因、建议与操作统一在下方执行区展示；浏览不会推进流程。</p>`;
 }
 const d=state.drawer,f=d.flow,empty=text=>`<p class="tiny muted section-gap">${esc(text)}（浏览本阶段不会自动执行）</p>`;
 let content='';
 if(id==='input')content=`<dl class="kv section-gap"><dt>当前任务 / 问题</dt><dd>${esc(d.draft.request||'尚未输入')}</dd>${sceneFlowRequired(s).map(([key,label])=>`<dt>${esc(label)} · ${esc(key)}</dt><dd>${esc(d.draft[key]||'缺失 / 尚未提取')}</dd>`).join('')}</dl>`;
 else if(id==='recognize')content=f.branch?`<dl class="kv section-gap"><dt>匹配结果</dt><dd>${esc(({recognized:'唯一 / 已识别',ambiguous:'多候选 / 冲突',unknown:'未知 / 不支持'})[f.branch]||f.branch)}</dd><dt>意图</dt><dd>${esc(({draft:'提单',explain:'问答',mixed:'混合'})[f.intent]||'未确定')}</dd></dl>${f.answer?`<p>${esc(f.answer.answer)}</p>${jsonView(f.answer.evidence)}`:''}`:empty('尚未识别；先在执行区识别任务');
 else if(id==='clarify')content=`<dl class="kv section-gap"><dt>候选</dt><dd>${esc(f.candidates.map(m=>m.materialCode+' · '+m.materialName).join('、')||'暂无候选')}</dd><dt>缺失关键字段</dt><dd>${esc(f.missing.map(([,label])=>label).join('、')||'暂无已识别缺失项')}</dd><dt>已用重试</dt><dd>${f.retries} / ${sceneFlowConfig(s).maxRetries}</dd></dl>`;
 else if(id==='mapping')content=f.generated?`<div class="table-wrap section-gap"><table class="config-table"><thead><tr><th>英文字段 / 本体属性</th><th>现值 → 建议值</th><th>来源 / 用户确认</th></tr></thead><tbody>${f.generated.suggestions.map((r,i)=>`<tr><td>${esc(r.target)}<small>${esc(r.ontology)}</small></td><td>${esc(sceneFlowDisplay(r.current))} → ${esc(sceneFlowDisplay(r.suggested))}</td><td>${esc(r.source)}<small>${esc(({current:'保留现值',suggested:'采用建议'})[f.confirmations[i]]||'待用户确认')}</small></td></tr>`).join('')}</tbody></table></div>`:empty('尚未生成字段建议；先澄清任务与关键字段');
 else if(id==='check')content=f.result?jsonView({passed:f.result.passed,errors:f.result.errors,checks:f.result.checks,calls:f.result.calls}):empty('尚无校验结果；先完成字段确认并在执行区校验');
 else if(id==='review')content=f.payload?`${pill(f.reviewStamp?'已有复核记录；提交仍核验有效性':'待人工复核','blue')}${jsonView({content:f.payload,evidence:f.result?.checks||[]})}`:empty('尚无待复核内容与校验证据');
 else if(id==='submitted')content=f.handoff?`<p class="tiny section-gap">表单已返回，请用户自行提交；不是提交成功回执。</p>${jsonView({handoff:f.handoff,finalChecks:f.finalResult?.checks||[]})}`:f.receipt?jsonView({receipt:f.receipt,finalChecks:f.finalResult?.checks||[]}):empty(sceneFlowSubmissionModeDescription(s));
 return `<div class="scene-flow-stage-snapshot section-gap"><h3>当前阶段内容 · 只读快照</h3>${content}</div>`;
}
// 以下仅解释提单交互；配置读取既有 flow.stages / sceneFlow，不生成执行结果。
function sceneFlowBusinessPolicies(s){
 const c=sceneFlowConfig(s);return {intents:sceneFlowIntents.filter(([id])=>c.intents.includes(id)).map(([,label])=>label).concat('提交当前单据（submit-current，固定本地能力）').join('、'),unknown:c.unknown==='manual'?'人工本体选择入口 + 补充信息':'追问业务任务 / 对象编号',clarification:'候选卡片 + 关键信息',confirmation:c.confirmation==='per-field'?'逐字段确认；可保留用户修改':'整单复核后确认；差异保留现值',retry:`最多 ${c.maxRetries} 次；未知始终阻断`,recovery:sceneFlowStagePromptConfig(s,'check').recoveryMode==='manual'?'仅回来源系统处理后重检':'来源系统处理；体验可显式模拟本地事实更新后独立重检'};
}
function sceneFlowStageDetails(s,stage){
 const id=sceneFlowStageId(stage),business=sceneFlowStagePromptConfig(s,id);
 const branch=sceneFlowStageBranches[id],key=sceneFlowStageInteractionField(id);if(branch)business[key]=sceneFlowBranchText(s,branch,'question',business[key]);
 if(id==='prepare')return {row:['生成单据草稿，并在同一区域展示当前校验反馈。','展示字段现值、建议与来源及失败证据中的对象与入参；未确认只做只读预检，明确确认后独立正式校验，未知与失败阻断。',business.interactionPrompt,'草稿生成不等于提交；全部字段确认且当前正式校验通过 → 复核提交；失败按原因与建议处理后重检。']};
 if(id==='finish')return {row:['当前正式校验通过后，等待用户明确复核，并按所选提交方式继续。','核对单据、来源、具体业务行与证据；结束前独立终检，输入、字段、配置或事实变化使旧结果失效。',business.interactionPrompt,sceneFlowSubmissionModeDescription(s)+'终检失败或未知返回处理；成功仅返回本地模拟回执。']};
 const details={
  input:{row:['接受任务 / 问题：用户描述要创建的流程单。','保留原文，提取字段并标记关键字段缺失；不偷偷补默认值。',business.inputPrompt,'用户发出请求 → 识别任务；改输入会使旧建议、校验与复核失效。']},
  recognize:{row:['确认在做什么、要处理哪个对象。','提单 / 问答 / 提交当前单据（submit-current，固定能力） / 混合 / 不支持分别分流；唯一 / 未知 / 多候选分别处理，不取第一条。本地受控词典不是模型理解。','核对识别的任务与对象；无法识别时：'+business.noMatchPrompt,'提单唯一且信息齐全 → 生成单据与校验反馈；有歧义 / 缺失 → 按需澄清；问答仅解释当前规则，混合由用户明确选择继续提单。']},
  clarify:{row:['多个候选、关键字段缺失或上下文冲突，暂不生成表单。','按当前策略提供候选或关键字段追问；保留用户纠错，不凭重试改变未知事实。',business.clarifyPrompt+' 用户选择确切对象、补充关键信息后再次识别。','对象唯一、任务明确、关键信息完整 → 生成单据与校验反馈；仍未知 / 冲突则留在澄清。']},
  mapping:{row:['展示当前流程单及字段建议，等待用户确认。','引用“对象与表单映射”中的配置；展示现值、建议与来源，英文 / 中文名称只作核对，不在这里配置技术字段。',business.mappingPrompt+' 用户确认采用建议或保留现值，并填写非映射字段。','全部字段明确确认且无来源缺失 / 冲突 → 规则校验；保留现值也不跳过校验。']},
  check:{row:['检查当前流程单是否具备提交条件；失败先解决，不直接放行。','引用“规则配置”逐行校验当前业务行与身份；附件、DI、最小系统依当前规则与安全底线检查，未知阻断。',business.blockerPrompt+' 用户查看失败证据中的对象与入参，联系来源系统责任人处理后重新校验。','当前有效校验全部通过 → 复核；规则阻塞 → 处理与重查；超时 / 未知仍阻断。']},
  review:{row:['校验通过，仍等待人工复核，不自动提交。','展示当前单据内容、字段来源、具体业务行与校验证据，确认结果未过期。',business.reviewPrompt+' 用户核对内容和证据后明确确认复核。','有效校验 + 当前人工复核 → 提交终检；输入、配置或事实变化需重新校验与复核。']},
  submitted:{row:['用户在复核后主动提交，查看回执。','提交前重新终检；新失败撤销旧复核。相同配置与内容本地幂等防重，生产权限 / 版本与幂等必须由后端承接。',business.receiptPrompt+' 体验中仅点击“模拟提交（重新终检）”，不会创建真实单据。','终检通过 → 本地模拟回执；终检失败 → 返回校验处理。回执是安全模拟，businessSubmitted = false。']}
 };
 if(!sceneFlowAssistantSubmitAllowed(s)&&!sceneFlowButtonSubmitAllowed(s)){
  details.review.row[3]='有效校验 + 当前人工复核 → 完成并返回表单；用户在业务系统自行提交。信息或事实变化须重新校验和复核。';
  details.submitted={row:['复核完成后，用户选择返回已填写、已校验的表单。','代用户提交开关已关闭：返回表单前独立终检，不调用提交接口、不创建提交回执。真实提交时仍由业务后端核验权限、版本与安全条件。','点击“完成并返回表单”，然后由用户自行提交；本地原型不写真实单据。','终检通过 → 返回表单，由用户自行提交；未知或失败 → 返回校验处理。不是业务提交成功。']};
 }else if(sceneFlowAutoSubmitAllowed(s)){
  details.review.row[0]='当前正式校验通过后，等待用户明确复核；不会自动完成复核。';details.review.row[3]='用户确认复核并自动提交（模拟） → 系统独立终检；终检通过才有模拟回执。';
  details.submitted.row[0]='用户明确完成复核后，系统自动提交（模拟）。';details.submitted.row[2]='点击“确认复核并自动提交（模拟）”后独立终检，无需再次点击提交。'+business.receiptPrompt;
 }else if(sceneFlowLegacySubmission(s)){details.submitted.row[0]='用户复核后，选择代提交或返回表单自行提交。';details.submitted.row[2]='允许代提交：用户明确点击“确认代提交（模拟 · 重新终检）”后才执行；也可选择完成并返回表单。'+business.receiptPrompt;}
 else{details.submitted.row[0]='用户复核后，按当前提交方式执行。';details.submitted.row[2]=sceneFlowSubmissionModeDescription(s)+business.receiptPrompt;}
 return details[id];
}
function sceneFlowStageDetailHTML(s,stage,scope='page'){
 // 起点不提供阶段编辑 / 操作表；体验的真实 input 状态与引导仍由 runtime 保留。
 if(sceneFlowStageId(stage)==='input')return `<div class="inset-panel section-gap" data-flow-input-start><h3>用户输入 · 流程起点</h3><p class="tiny muted section-gap">描述任务后进入识别；需要补充的信息统一通过卡片追问。</p>${scope==='drawer'?sceneFlowStageSnapshotHTML(s,'input'):''}</div>`;
 const id=sceneFlowDisplayGroup(stage),{detail,interaction}=sceneFlowStageDisplay(s,id),editable=sceneFlowEditAllowed(s),prefix=`scene-flow-${scope}`,cells=[['eventDescription','发生什么'],['systemAction','系统动作'],[interaction,'用户交互'],['nextStep','下一步']],e=scope==='page'?sceneFlowInlineActive(s,id):null;
 return `<section class="scene-flow-stage-detail inset-panel section-gap" id="${prefix}-panel" role="tabpanel" aria-labelledby="${prefix}-tab-${id}" data-flow-stage-panel="${id}"><div class="between scene-flow-stage-heading"><h3>${esc(id==='submitted'?(sceneFlowAssistantSubmitAllowed(s)||sceneFlowButtonSubmitAllowed(s)?'提交':'完成 / 用户自行提交'):sceneFlowBusinessStages[id])} · 当前阶段交互</h3>${scope==='page'?(e?sceneFlowInlineControls(s):btn('编辑本阶段','scene-flow-inline-edit','sm','edit',`data-stage="${id}"${editable?'':' disabled aria-disabled="true" title="请先点击场景的编辑按钮"'}`)):pill('仅查看，不推进执行','blue')}</div>${scope==='page'&&!editable?`<p class="tiny muted section-gap">请先点击场景的“编辑”，再编辑本阶段；已发布配置需先进入修订。</p>`:''}${id==='finish'?sceneFlowSubmissionModeSelect(e?e.draft.submissionMode??sceneFlowEffectiveSubmissionMode(s):sceneFlowEffectiveSubmissionMode(s),scope==='page',!e||!editable,sceneFlowLegacySubmission(s)&&sceneFlowEffectiveSubmissionMode(s)==='manual'):''}<div class="table-wrap section-gap"><table class="config-table" data-flow-operation-table="${id}" style="min-width:740px;line-height:1.9"><caption class="tiny muted" style="text-align:left;padding-bottom:8px">${e?'直接修改四列定义与下方阶段策略，保存一次全部生效；取消不写配置。':scope==='page'?'配置当前阶段的处理定义和流转要求。':'当前阶段配置要求；执行操作在下方。'}</caption><thead><tr>${cells.map(([,label])=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody><tr>${detail.row.map((text,i)=>`<td style="vertical-align:top;white-space:normal">${e?sceneFlowInlineField(cells[i][0],e.draft[cells[i][0]],cells[i][1]):`<p>${esc(text)}</p>`}</td>`).join('')}</tr></tbody></table></div>${e?sceneFlowInlinePolicyHTML(e)+sceneFlowInlineErrorHTML(e):''}${sceneFlowLegacyDefinitionsHTML(s,id)}${scope==='drawer'?`<p class="tiny muted section-gap">阶段页签仅查看内容，不改变真实执行阶段；所有操作仍核验字段确认、有效校验与人工复核。</p>${sceneFlowStageSnapshotHTML(s,id)}`:''}</section>`;
}
function sceneFlowBranchRows(s){
 const p=sceneFlowBusinessPolicies(s),recognize=sceneFlowStageConfig(s,'recognize'),clarify=sceneFlowStageConfig(s,'clarify'),check=sceneFlowStageConfig(s,'check'),review=sceneFlowStageConfig(s,'review');
 return [
  ['recognized','可识别唯一','任务明确，对象编号唯一，关键字段齐全。','展示已识别对象与本次表单，不替用户确认。','这是本次要发布的对象吗？请核对表单内容。','核对对象；采用建议或保留现值；发现错误可改输入。','对象身份正确、全部字段明确确认 → 规则校验。'],
  ['ambiguous','多个候选','同类对象多条，或编号 / 型号、项目 / 版本冲突。',p.clarification+'；不取第一条，不生成已确认表单。',clarify.clarifyPrompt,'在卡片中选择确切对象并补充关键字段，再次识别。','歧义解除、必需信息齐全 → 表单确认。'],
  ['unknown','无法识别','任务不支持、编号非法或不在本地登记样例。',p.unknown+'；未知阻断，不编造身份。',recognize.noMatchPrompt,'纠正原文、补充编号；启用人工本体选择时显式选择后补信息。','任务在支持范围、身份唯一且信息完整 → 再识别；盲目重试不放行。'],
  ['vague-question','问题模糊','“那个东西怎么办”没有明确任务 / 对象；只询问规则不等于要提单。','追问任务与对象；明确的规则问题只回答当前配置依据，不断言单据已通过。','你要创建当前流程单，还是了解规则要求？具体业务 / 对象是什么？','补充业务任务与编号；规则回答后可主动选择继续提单。','明确支持的业务任务；继续提单仍须身份、信息与字段确认。'],
  ['blocked','规则阻塞','当前字段或逐行规则不满足；来源缺失 / 冲突也不能提交。','展示失败证据中的对象与入参、实际值和责任；'+p.recovery+'。',check.blockerPrompt,'联系来源系统责任人按证据处理；如缺图片：'+check.imagesGuide+' 随后主动重查。','权威事实更新并独立重新校验全部通过 → 人工复核；处理建议不等于通过。'],
  ['timeout','超时','查询超时 / 失败，无法获得可靠事实。','标记未知并阻断；重试'+p.retry+'；'+p.recovery+'。','请确认是否在来源系统处理后重查；本地体验的恢复仅为显式模拟。','按策略受控重试；达到上限先处理来源系统，再重新开始。','独立重查获得有效事实并通过全部校验 → 复核；不能用旧结果继续。'],
  ['passed-review','通过待复核','当前有效校验通过，但用户尚未复核。','展示单据副本、来源与当前证据，不自动完成复核或提交。',review.reviewPrompt,'核对字段、业务行与证据，明确点击复核确认；再主动模拟提交。','人工复核与当前输入 / 配置 / 事实一致 → 提交终检；终检通过才有回执。'],
  ['input-empty','未输入任务','未输入业务需求。','等待用户发起任务，不生成单据或查询。','请描述你要办理的流程单。','输入业务需求或问题。','输入非空 → 意图识别。'],
  ['input-missing','关键信息缺失','用户输入缺少当前业务关键信息。','记录原文，在识别后追问缺失信息。','请补充办理业务和对象编号。','补充关键信息，不用猜测默认值。','任务可识别 → 补充澄清。'],
  ['clarify-missing','缺失信息待补充','已识别业务任务，但必需字段仍缺失。','列出缺失字段并逐项追问，不生成已确认单据。',clarify.clarifyPrompt,'填写缺失信息，再次识别。','必需信息完整且身份唯一 → 表单确认。'],
  ['clarify-conflict','冲突尚未解除','对象编号、项目或版本存在冲突。','保留候选与原文，等待用户明确选择。','请确认这次办理的对象及正确项目 / 版本。','选择唯一候选或纠正冲突字段。','冲突解除 → 重新识别并核对表单。'],
  ['mapping-conflict','字段来源冲突','多个来源值不一致或建议与现值有差异。','并列展示来源与差异，不静默覆盖用户值。','这个字段应采用哪一个值？','核对来源，采用建议或保留有效现值。','全部差异明确且来源可用 → 规则校验。'],
  ['mapping-missing','字段待填写或确认','必需字段为空，或字段建议尚未确认。','标记未填写 / 未确认字段，暂停校验。','请补齐必需字段，并确认本次表单内容。','填写字段，逐项或整单确认。','字段完整、全部确认且来源无缺失 → 规则校验。'],
  ['review-stale','复核结果过期','输入、映射、规则或权威事实在校验后发生变化。','使旧校验与复核失效，要求重新检查。','单据或依据已变化，是否重新校验？','返回校验，依据最新结果重新复核。','当前有效校验通过并重新复核 → 提交终检。'],
  ['submit-failed','提交终检失败','提交前重新终检出现新阻塞或未知。','不创建回执，撤销旧复核并定位最新失败。','提交前检查未通过，请处理最新问题。','按最新失败证据处理，重新校验与复核。','重新终检通过 → 模拟提交回执。'],
  ['duplicate','重复提交请求','相同配置和单据内容已获得模拟回执。','复用已有回执，不重复创建流程单。','本次请求已有回执，请核对提交结果。','查看已有回执；新业务需求需重新发起。','保持相同回执，不重复提交。']
 ];
}
function sceneFlowBranchesHTML(s,stage=sceneFlowUI.stage){
 stage=stage==='all'?'all':Object.hasOwn(sceneFlowBusinessStages,stage)?sceneFlowDisplayGroup(stage):null;
 const valid=stage!==null&&Object.hasOwn(sceneFlowBusinessStages,stage),editable=sceneFlowEditAllowed(s),keys=Object.keys(sceneFlowBranchFields.fields),library=sceneFlowBranchRows(s),ids=sceneFlowSelectedBranchIds(s,stage);
 const pending=sceneFlowUI.editor,owner=pending&&sceneFlowInlineOwners.get(pending);
 if(valid&&sceneFlowUI.stage===stage&&owner?.pendingNew&&sceneFlowInlineActive(s,stage,'branch',owner.branch)===pending&&['sceneId','blockId','stage','displayStage','mode','branch','pendingNew','fingerprint'].every(key=>pending[key]===owner[key])&&!ids.includes(owner.branch))ids.push(owner.branch);
 for(const id of stage==='all'?sceneFlowStages.map(([id])=>id):valid?[stage]:[])sceneFlowBranchViewOwners.set(s.id+':'+id,{blockId:s.selectedBlock,fingerprint:sceneFlowFingerprint(s)});
 const branches=library.filter(([id])=>ids.includes(id)),disabled=editable?'':' disabled aria-disabled="true" title="请先点击场景的编辑按钮"';
 const choice=sceneFlowUI.branchChoice,choiceOwner=choice&&sceneFlowBranchChoiceOwners.get(choice),value=choiceOwner&&choiceOwner.sceneId===s.id&&choiceOwner.blockId===s.selectedBlock&&choiceOwner.stage===stage&&choiceOwner.fingerprint===sceneFlowFingerprint(s)?choiceOwner.id:'';
 const candidates=valid?library.filter(([id])=>sceneFlowDisplayHasStage(stage,sceneFlowBranchStage(id))&&!ids.includes(id)):[];
 const picker=valid?`<div class="row section-gap" style="flex-wrap:wrap"><label for="scene-flow-branch-option-${stage}" class="tiny">可发生情况</label><select id="scene-flow-branch-option-${stage}" data-flow-branch-option="${stage}" data-stage="${stage}" data-scene-id="${esc(s.id)}" data-block-id="${esc(s.selectedBlock)}" aria-label="${esc(sceneFlowStageLabel(stage))} · 可发生情况"${disabled}><option value="">请选择需要处理的情况</option>${candidates.map(([id,label])=>`<option value="${id}"${id===value?' selected':''}>${esc(label)}</option>`).join('')}</select>${btn('添加处理分支','scene-flow-add-branch','sm','plus',`data-stage="${stage}" data-scene-id="${esc(s.id)}" data-block-id="${esc(s.selectedBlock)}"${disabled}`)}${!candidates.length?'<span class="tiny muted">本阶段可选情况已全部选入</span>':''}</div>`:'';
 const table=branches.length?`<div class="table-wrap section-gap"><table class="config-table" data-flow-branches style="min-width:1040px;line-height:1.9"><thead><tr><th scope="col">处理分支</th>${keys.map(key=>`<th scope="col">${sceneFlowBranchFields.fields[key][0]}</th>`).join('')}<th scope="col">操作</th></tr></thead><tbody>${branches.map(([id,label])=>{const rowStage=sceneFlowBranchStage(id),e=sceneFlowInlineActive(s,rowStage,'branch',id),c=sceneFlowBranchConfig(s,id),attrs=`data-stage="${stage==='all'?sceneFlowDisplayGroup(rowStage):stage}" data-branch="${id}" data-scene-id="${esc(s.id)}" data-block-id="${esc(s.selectedBlock)}"${disabled}`;return `<tr data-flow-branch="${id}"><th scope="row" style="vertical-align:top">${esc(label)}${e?.pendingNew?'<small class="field-path">待保存 · 取消不添加</small>':''}</th>${keys.map(key=>`<td style="vertical-align:top;white-space:normal">${e?sceneFlowInlineField(key,e.draft[key],sceneFlowBranchFields.fields[key][0]):`<p>${esc(c[key])}</p>`}</td>`).join('')}<td style="vertical-align:top">${e?sceneFlowInlineControls(s)+sceneFlowInlineErrorHTML(e):btn('编辑','scene-flow-inline-edit','sm','edit',attrs)+btn('移除','scene-flow-remove-branch','sm','trash',attrs)}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="tiny muted section-gap" data-flow-branches data-flow-branches-empty>尚未配置处理分支</p>';
 return `<div class="section-gap"><h3>处理分支（可选） · ${stage==='all'?'全流程核对':esc(sceneFlowStageLabel(stage))}</h3><p class="tiny muted section-gap">根据实际用法选择需要处理的可发生情况；仅展示已选入分支，每行一次编辑五项处理逻辑。未配置时仍执行内置安全处理。</p>${table}${picker}</div>`;
}
function sceneFlowExampleDefinitionHTML(s,stage,branch){const c=sceneFlowStageConfig(s,stage),b=branch&&sceneFlowBranchSelected(s,branch)?sceneFlowBranchConfig(s,branch):null;return `<dl class="kv tiny section-gap"><dt>本阶段配置 · 发生什么</dt><dd>${esc(c.eventDescription)}</dd><dt>系统动作 · 配置要求</dt><dd>${esc(c.systemAction)}</dd><dt>下一步 · 流转要求</dt><dd>${esc(c.nextStep)}</dd>${b?`<dt>分支配置 · 何时发生</dt><dd>${esc(b.triggerDescription)}</dd><dt>系统如何处理</dt><dd>${esc(b.systemAction)}</dd><dt>满足何条件继续</dt><dd>${esc(b.continueCondition)}</dd>`:''}</dl>`;}
function sceneFlowBusinessExampleHTML(s){
 const input=sceneFlowStageConfig(s,'input'),clarify=sceneFlowStageConfig(s,'clarify'),mapping=sceneFlowStageConfig(s,'mapping'),check=sceneFlowStageConfig(s,'check'),review=sceneFlowStageConfig(s,'review'),submitted=sceneFlowStageConfig(s,'submitted'),p=sceneFlowBusinessPolicies(s),request=sceneFlowExamples.find(([id])=>id==='ambiguous')[2];
 clarify.clarifyPrompt=sceneFlowBranchText(s,'ambiguous','question',clarify.clarifyPrompt);mapping.mappingPrompt=sceneFlowBranchText(s,'recognized','question',mapping.mappingPrompt);check.blockerPrompt=sceneFlowBranchText(s,'blocked','question',check.blockerPrompt);review.reviewPrompt=sceneFlowBranchText(s,'passed-review','question',review.reviewPrompt);
 // 示意合并“多候选”与“缺产品图片”两种已有本地样例；不读 drawer 结果、不执行规则。
 const timeline=[
  ['用户请求与语义识别','用户 / 助手',request,input.inputPrompt+'；识别业务任务及对象，缺失或歧义时按需澄清。'],
  ['按需澄清与选择','助手 / 用户',clarify.clarifyPrompt+' 用户选择 MAT-20260081，项目、软件、版本、部门和主题沿用同一请求。',p.clarification+'；这里只示意选择，不写入表单或执行。'],
  ['生成单据与校验反馈','助手',sceneFlowStageConfig(s,'prepare').interactionPrompt+' '+mapping.mappingPrompt+' '+check.blockerPrompt,'草稿已生成：PRJ-2026-A / MAT-20260081 / SW-20260032 / V5.8.2 / 后端业务部 / 摄像机升级。预校验未通过（尚未正式确认）：原因是该产品图片缺失；处理建议：'+check.imagesGuide+' 字段尚待确认（'+p.confirmation+'），草稿不等于已提交；全部确认后独立正式校验。'],
  ['处理与正式重检','用户 / 助手','联系资料责任人到来源系统为该产品补图，字段明确确认后主动重新校验。',p.recovery+'；假设重查后当前全部规则通过，仍不自动复核或提交。这里不是实际事实或本次执行结果。'],
  ['复核提交','用户 / 助手',sceneFlowStageConfig(s,'finish').interactionPrompt+' '+review.reviewPrompt,sceneFlowSubmissionModeDescription(s)+'结束前仍独立终检，未知或失败不发回执。'+(sceneFlowLegacySubmission(s)&&!sceneFlowAssistantSubmitAllowed(s)?'返回表单不是提交成功回执。':submitted.receiptPrompt)]
 ];
 return `<div class="section-gap" data-flow-business-example><h3>看一遍完整提单 · 连续业务样例</h3><p class="tiny muted section-gap">仅说明性示例，非执行结果。使用已有“模糊：选择整机”请求串联“缺产品图片”本地样例；业务提示引用当前阶段配置。真实操作仍在原体验抽屉。</p><p class="tiny section-gap">用户请求与识别 → 按需澄清 → 草稿与校验反馈 → 处理与重检 → 复核提交 · ${sceneFlowSubmitModeLabel(s)}</p><details class="plain-details section-gap"><summary>展开完整五步对话与表单说明（示意，不运行）</summary><ol data-flow-example-timeline style="margin:12px 0;padding-left:28px">${timeline.map(([label,role,text,note],i)=>`<li class="execution-step" data-flow-example-step="${i+1}" style="border:0;border-bottom:1px solid var(--line);border-radius:0"><b>${label} · ${role}</b><p class="tiny section-gap" style="line-height:1.9;overflow-wrap:anywhere">${esc(text)}</p>${sceneFlowExampleDefinitionHTML(s,({1:'recognize',2:'clarify',3:'prepare',4:'check',5:'finish'})[i+1],({2:'ambiguous',3:'blocked',5:'passed-review'})[i+1])}<small>${esc(note)}</small></li>`).join('')}</ol></details></div>`;
}
function sceneFlowView(s){const pageStage=sceneFlowDisplayGroup(sceneFlowUI.stage)==='input'?'recognize':sceneFlowDisplayGroup(sceneFlowUI.stage);return `<div class="panel-body"><p id="scene-flow-inline-notice" class="tiny danger-text" role="status" aria-live="polite">${esc(sceneFlowUI.inlineError)}</p><div class="between"><div><h3>场景流 · 用户怎样完成一张流程单</h3><p class="tiny section-gap">场景流只管理提单时的交互和流转，不重复字段映射/校验条件。</p><p class="tiny muted section-gap">输入起点 → 语义识别 → 按需澄清 → 生成单据与校验反馈 → 复核提交 · ${sceneFlowSubmitModeLabel(s)}</p><p class="tiny section-gap">${esc(sceneFlowSubmissionModeDescription(s))}可在最后阶段“复核提交”的提交方式选择器调整：四列表上方可见，点击“编辑本阶段”后修改。</p></div>${btn('体验完整提单流程（配置测试）','scene-flow-open','primary','play')}</div>${sceneFlowStageHTML('input',pageStage)}${sceneFlowStageDetailHTML(s,pageStage)}${sceneFlowBranchesHTML(s)}${sceneFlowBusinessExampleHTML(s)}<p class="tiny muted section-gap">${sceneFlowDefinitionNote}</p><div class="section-gap">${inf('本地确定性模拟 · 没有真实 AI 或后端。体验入口仅测试当前配置及锁定对象定义，不调用已发布用户运行、不写真实单据、不计真实执行成功。')}</div><div class="row section-gap">${btn('高级 JSON / 规则调试','workflow-test','sm','shield')}</div></div>`;}
function sceneFlowDisplay(value){return value===undefined?'（空）':typeof value==='object'?JSON.stringify(value):String(value);}
function sceneFlowOrdinaryHTML(s){
 const d=state.drawer;if(!d.flow.generated)return '';const fields=sceneFlowOrdinaryFields(s);if(!fields.length)return '';
 return `<div class="inset-panel section-gap"><h3>非映射字段 · 填写与确认</h3><p class="tiny muted section-gap">手动输入字段不会由 AI 代填；系统生成值仅为本地样例，真实生成由业务系统完成。</p><div class="form-grid section-gap">${fields.map(({block,field,id})=>field.mappingMode==='ai'?`<div class="form-field wide"><label>${esc(block.label)} / ${esc(field.label)} · AI 按规则生成</label><div class="sample">${esc(field.aiGenerationRule||'未配置生成规则')}</div><small>仅已保存生成要求，未接入实际生成服务；没有结果不能继续提交。</small></div>`:field.mappingMode==='user'?`<div class="form-field"><label for="flow-user-${esc(id)}">${esc(block.label)} / ${esc(field.label)}${field.required?' *':''}</label>${field.type==='布尔'?`<select id="flow-user-${esc(id)}" data-flow-user="${esc(id)}">${options([['','请选择'],['true','是'],['false','否']],d.flow.userValues?.[id]||'')}</select>`:`<input id="flow-user-${esc(id)}" data-flow-user="${esc(id)}" type="${field.type==='数字'?'number':field.type==='日期'?'date':'text'}" value="${esc(d.flow.userValues?.[id]||'')}">`}</div>`:`<div class="form-field"><label>${esc(block.label)} / ${esc(field.label)} · 系统生成（模拟）</label><div class="sample">${esc(sceneFlowDisplay((block.many?d.flow.generated.payload[block.path]?.[0]:d.flow.generated.payload[block.path])?.[field.key]))}</div></div>`).join('')}</div><div class="section-gap">${btn(d.flow.systemConfirmed?'已确认非映射字段':'确认填写与系统样例','scene-flow-confirm-ordinary','sm','check')}</div></div>`;
}
function sceneFlowMappingHTML(s){
 const f=state.drawer.flow;if(!f.generated)return '';const summary=sceneFlowConfig(s).confirmation==='summary';
 return `<div class="section-gap"><div class="between"><h3>字段建议 · 确认后填入测试副本</h3>${pill(`${Object.keys(f.confirmations).length}/${f.generated.suggestions.length} 已确认`,'blue')}</div><div class="table-wrap section-gap"><table class="config-table"><thead><tr><th>字段 / 本体属性</th><th>当前值 → 建议值</th><th>来源 / 保存位置</th><th>确认</th></tr></thead><tbody>${f.generated.suggestions.map((r,i)=>`<tr><td class="field-name">${esc(r.target)}<small>${esc(r.ontology)}</small></td><td>${esc(sceneFlowDisplay(r.current))}<small class="field-path">→ ${esc(sceneFlowDisplay(r.suggested))}</small>${pill(r.status,r.blocking?'red':'blue')}</td><td class="tiny">${esc(r.source)}<small class="field-path">${esc(r.persistence?.table)}.${esc(r.persistence?.column)}</small></td><td>${r.blocking?'<span class="danger-text">处理来源 / 映射后重新生成</span>':f.receipt||f.handoff?pill('测试完成','green'):summary?pill(f.confirmations[i]?'已确认':'待整单复核',f.confirmations[i]?'green':'amber'):`${btn(f.confirmations[i]==='suggested'?'已采用建议':'采用建议','scene-flow-confirm-field','sm','','data-index="'+i+'" data-choice="suggested"')}${r.current!==undefined&&r.current!==null&&r.current!==''?btn(f.confirmations[i]==='current'?'已保留现值':'保留现值','scene-flow-confirm-field','sm','','data-index="'+i+'" data-choice="current"'):''}`}</td></tr>`).join('')}</tbody></table></div>${summary&&!f.receipt&&!f.handoff?btn('已复核全部字段，确认填入','scene-flow-confirm-all','','check'):''}<p class="tiny muted section-gap">有差异时可保留当前值，但校验不因此跳过。字段确认不修改场景映射配置或真实业务表单。</p></div>`;
}
function sceneFlowResultHTML(s){
 const f=state.drawer.flow;if(!f.result)return '';const r=f.result,current=sceneFlowResultCurrent(s),p=f.pendingExternal,delegate=sceneFlowAssistantSubmitAllowed(s),auto=sceneFlowAutoSubmitAllowed(s),button=sceneFlowButtonSubmitAllowed(s),legacy=sceneFlowLegacySubmission(s);
 return `<div class="section-gap"><h3>校验结果与解决方案</h3>${inf(!current?'结果已过期，请重新生成 / 校验。':r.passed?'当前正式校验通过；'+esc(sceneFlowSubmissionModeDescription(s)):'存在阻断或未知；没有执行提交。',current&&r.passed?'green':'amber')}${r.errors.length?inf(r.errors.map(esc).join('；'),'red'):''}${f.blockers.map(b=>`<article class="result-card fail"><div class="between"><b>${esc(b.name)}</b>${pill(b.status,'red')}</div><code class="field-path">${esc(b.target)}</code><p>${esc(b.detail)}</p><p class="tiny">处理建议：${esc(b.guide)}</p>${b.fix&&sceneFlowStageConfig(s,'check').recoveryMode==='simulate'?btn(b.fix==='images'?'模拟补充对应产品图片':'查看外部处理 / 模拟事实更新','scene-flow-simulate-external','sm','','data-kind="'+b.fix+'"'):''}</article>`).join('')}
 ${p?`<div class="inset-panel section-gap">${inf('非真实处理：只更新本次测试替身事实，绝不代表外部业务已完成。确认后清除旧结果，需要独立重新校验。','amber')}<p class="tiny section-gap">${esc(p.targets.join('、'))} → ${p.kind==='images'?'本地图片样例':p.kind==='di'?'安全 DI = 0':'最小系统已发布'}</p>${btn('明确确认：仅模拟外部事实更新','scene-flow-apply-external','sm','','')}${btn('取消此模拟','scene-flow-cancel-external','sm')}</div>`:''}
 <details class="plain-details section-gap"><summary>完整规则判断与查询证据（${r.checks.length} 项 / ${r.calls.length} 次）</summary>${jsonView({checks:r.checks,calls:r.calls,event:r.event,revision:r.revision,at:r.at})}</details>
 ${r.passed&&!f.receipt&&!f.handoff?`<details open class="plain-details section-gap"><summary>复核：当前单据副本</summary>${jsonView(f.payload)}</details><p class="tiny muted section-gap">${esc(sceneFlowSubmissionModeDescription(s))}</p><div class="row section-gap">${btn(auto?'确认复核并自动提交（模拟）':f.reviewStamp?'已完成复核':'我已复核字段、业务行与证据','scene-flow-review',auto?'primary':'','check',auto&&!current?'disabled':'')}${!auto?btn('完成并返回表单','scene-flow-handoff',delegate?'':'primary','file',(!current||f.reviewStamp!==f.resultStamp?'disabled':'')):''}${button?btn(legacy?'确认代提交（模拟 · 重新终检）':'确认提交（模拟 · 重新终检）','scene-flow-submit','primary','upload',(!current||f.reviewStamp!==f.resultStamp?'disabled':'')):''}</div>`:''}
 ${f.handoff?`<div class="inset-panel section-gap" data-flow-handoff>${inf(current?'表单已完成并返回 · 请用户自行提交。未提交业务单据、未发起审批，不是提交成功回执。':'返回表单已过期，请重新填写、校验和复核；不能沿用旧结果。',current?'green':'amber')}<details class="plain-details section-gap"><summary>查看返回的表单内容</summary>${jsonView(f.handoff.payload)}</details></div>`:''}
 ${f.receipt?`<div class="section-gap">${inf(`配置测试通过 · ${esc(f.receipt.id)}。未提交真实单据，未新增真实执行成功记录。`,'green')}</div>`:''}</div>`;
}
function sceneFlowDrawer(){
 const d=state.drawer,s=appScenes[d.sceneId];if(!s)return frame('场景已不存在','','');const f=d.flow,c=sceneFlowConfig(s),manual=f.branch==='unknown'&&c.unknown==='manual';
 return frame('智能提单 · 完整场景流','当前配置测试 · 仅本地确定性模拟，无真实 AI / 后端 / 业务提交。',`
 ${inf('使用当前配置及锁定对象定义进行测试，不替换已发布配置、不计真实运行成功。附件、DI 和发布状态变化必须显式标注样例并重检。')}${sceneFlowStageHTML(f.stage,f.viewStage||f.stage,'drawer')}${sceneFlowStageDetailHTML(s,f.viewStage||f.stage,'drawer')}
 <h3 class="section-gap">执行区 · ${esc(sceneFlowStageLabel(f.stage))}</h3><p class="tiny muted">下方操作按真实流程门禁执行；上方查看阶段不改变输入、字段确认、校验或复核状态。</p>
 <div class="application-question-list section-gap" aria-label="工作流样例">${sceneFlowExamples.map(([id,label])=>btn(label,'scene-flow-example','sm','','data-id="'+id+'"')).join('')}</div>
 <div class="section-gap">${field('描述提单信息 / 问题','request',d.draft.request,'textarea',[],'受控词典支持“创建发布单”和“为什么不能提交”；明确编号才关联本体实例。',true)}</div>
 <details ${f.stage==='clarify'||sceneFlowStageConfig(s,'input').inputMode==='structured'?'open':''} class="plain-details section-gap"><summary>补充关键信息${f.missing?.length?'（待补充 '+f.missing.map(([,label])=>label).join('、')+'）':''}</summary><div class="form-grid section-gap">${field('项目编号','projectCode',d.draft.projectCode)}${field('整机物料编号','materialCode',d.draft.materialCode)}${field('软件物料编号','softwareCode',d.draft.softwareCode)}${field('软件版本','version',d.draft.version)}${field('提交业务部门','submitDepartment',d.draft.submitDepartment,'select',[['','请选择部门'],['后端业务部','后端业务部'],['前端业务部','前端业务部']])}${field('发布主题','subject',d.draft.subject)}</div></details>
 <div class="row section-gap">${btn('识别意图 / 根据补充继续','scene-flow-recognize','primary','chat')}${btn('失败重试（'+f.retries+'/'+c.maxRetries+'）','scene-flow-retry','sm','refresh',(f.retries>=c.maxRetries?'disabled':''))}</div>
 <div class="section-gap" data-flow-submission-chat>${field('给助手的复核 / 提交消息','submissionCommand',f.submissionCommand||'','textarea',[],'仅本地确定性解析：例如“这张发布单我检查好了，帮我提交”。不修改原提单请求。',true)}${btn('发送给助手','scene-flow-send-message','primary','chat')}<p class="tiny muted section-gap">${f.generated?esc('当前草稿：'+sceneFlowDraftReference(s).id+' · '+sceneFlowDraftReference(s).materialCode):'尚无当前草稿；提交消息不能创建或确认字段。'}</p></div><div class="section-gap"><h3>对话历史</h3><div role="log" aria-live="polite" class="scene-flow-history" style="max-height:240px;overflow:auto">${f.history.map(h=>`<div class="execution-step"><b>${h.role==='user'?'用户':h.role==='assistant'?'本地流程助手':h.role==='configuration'?'配置要求（不是已执行结果）':'模拟器'}</b><small>${esc(h.at)}</small><p>${esc(h.text)}</p></div>`).join('')}</div></div>
 <div data-scene-flow-result>${f.branch?`<div class="scene-scope section-gap">${pill(({recognized:'已识别本体',ambiguous:'需要澄清',unknown:'无法识别'})[f.branch],'blue')}<span>${esc(sceneFlowIntents.find(([id])=>id===f.intent)?.[1]||'意图未确定')}</span></div>`:''}
 ${(f.candidates.length&&c.clarification==='candidates'||manual)?`<div class="section-gap"><h3>请选择确切本体实例</h3><div class="row section-gap">${(manual?catalog:f.candidates).map(m=>btn(`${m.materialCode} · ${m.materialName}`,'scene-flow-choose-material','sm','file','data-id="'+esc(m.materialCode)+'"')).join('')}</div></div>`:''}
 ${f.answer?`<div class="inset-panel section-gap"><h3>问题解释（不自动提单）</h3><p>${esc(f.answer.answer)}</p><details class="plain-details section-gap"><summary>当前规则依据（不是实时单据结论）</summary>${jsonView(f.answer.evidence)}</details>${c.intents.includes('draft')?btn('明确选择：继续本地提单测试','scene-flow-continue-draft','sm','file'):''}</div>`:''}
 ${sceneFlowPreparationHTML(s)}</div>`,'',true);
}
const sceneFlowActionsViewBefore=applicationActionsView;
applicationActionsView=function(s){return workflowScene(s).type==='draft'?sceneFlowView(s):sceneFlowActionsViewBefore(s);};
Object.assign(extraDrawers,{sceneFlow:sceneFlowDrawer,sceneFlowSettings:sceneFlowSettingsDrawer,sceneFlowStageSettings:sceneFlowStageSettingsDrawer});
// 在 scene-release.js 包装前注册配置入口；浏览 / 体验动作不属于配置变更。
Object.assign(actionsMap,{
 'scene-flow-add-branch':sceneFlowAddBranch,'scene-flow-remove-branch':sceneFlowRemoveBranch,
 'scene-flow-inline-edit':el=>sceneFlowInlineEdit({dataset:{...el?.dataset,stage:sceneFlowDisplayGroup(el?.dataset?.stage)}}),'scene-flow-inline-save':sceneFlowInlineSave,'scene-flow-inline-cancel':sceneFlowInlineCancel,
 'scene-flow-edit-stage':sceneFlowOpenStageSettings,'scene-flow-save-stage':sceneFlowSaveStage,
 'scene-flow-stage':sceneFlowSelectStage,'scene-flow-open':sceneFlowOpen,'scene-flow-settings':sceneFlowOpenSettings,'scene-flow-save-settings':sceneFlowSaveSettings,
 'scene-flow-example':sceneFlowExample,'scene-flow-recognize':sceneFlowRecognize,'scene-flow-choose-material':sceneFlowChooseMaterial,'scene-flow-continue-draft':sceneFlowContinueDraft,
 'scene-flow-confirm-field':sceneFlowConfirmField,'scene-flow-confirm-all':sceneFlowConfirmAll,'scene-flow-confirm-ordinary':sceneFlowConfirmOrdinary,'scene-flow-validate':sceneFlowValidate,
 'scene-flow-send-message':sceneFlowSendMessage,'scene-flow-review':sceneFlowReview,'scene-flow-submit':()=>sceneFlowAuthorizeAndSubmit('button'),'scene-flow-handoff':sceneFlowHandoff,'scene-flow-retry':sceneFlowRetry,
 'scene-flow-simulate-external':sceneFlowSimulateExternal,'scene-flow-apply-external':sceneFlowApplyExternal,
 'scene-flow-cancel-external':()=>{if(sceneFlowGuard()){state.drawer.flow.pendingExternal=null;drawOverlay();}}
});
// 保留已有全局委托；在相关导航 / 配置入口执行前保护未保存的行内输入。
for(const action of ['scene-tab','scene-block','select-scene','app-type','route','guide-route','workflow-test','workflow-settings','scene-release-edit','scene-release-save','scene-release-publish','scene-release-restore']){
 const original=actionsMap[action];if(original)actionsMap[action]=function(el){if(!sceneFlowInlineLeave())return;return original(el);};
}
document.addEventListener('input',e=>{sceneFlowInlineInput(e.target);sceneFlowSubmissionInput(e.target);sceneFlowInputChange(e.target);sceneFlowOrdinaryChange(e.target);sceneFlowStageSettingsInput(e.target);});
document.addEventListener('change',e=>{
 sceneFlowBranchOptionChange(e.target);sceneFlowInlineInput(e.target);
 const d=state.drawer,el=e.target;if(d?.type==='sceneFlowSettings'&&el.dataset.field==='submissionMode'){if(!sceneFlowGuard('sceneFlowSettings')||!sceneFlowEditAllowed(scene()))return;sceneFlowChooseSubmissionMode(d.draft,el.value);d.dirty=true;}
 if(d?.type==='sceneFlowSettings'&&['autoSubmit','allowAssistantSubmit'].includes(el.dataset.field)){if(!sceneFlowGuard('sceneFlowSettings')||!sceneFlowEditAllowed(scene()))return;sceneFlowSetSubmitSwitch(d.draft,el.dataset.field,el.checked);d.dirty=true;}
 if(d?.type==='sceneFlow'){sceneFlowSubmissionInput(el);sceneFlowInputChange(el);sceneFlowOrdinaryChange(el);if(el.dataset.flowUser!==undefined)drawOverlay();if(el.dataset.field==='submitDepartment')drawOverlay();}
 if(d?.type==='sceneFlowStageSettings')sceneFlowStageSettingsInput(el);
 if(['sceneFlowSettings','sceneFlowStageSettings'].includes(d?.type)&&el.dataset.sceneFlowIntent&&sceneFlowIntents.some(([id])=>id===el.dataset.sceneFlowIntent)&&Array.isArray(d.draft.intents)){if(d.type==='sceneFlowStageSettings'&&!sceneFlowStageAllowed())return;const id=el.dataset.sceneFlowIntent;d.draft.intents=d.draft.intents.filter(i=>i!==id);if(el.checked)d.draft.intents.push(id);d.dirty=true;}
});
if(state.route==='scenes')render();
