/* 取数能力的数据处理与同步。执行与定时计划仅为本地原型演示。 */
'use strict';
const capabilityPipelineState=new Map();
function capabilityPipelineDefaults(c){c.sync??={mode:'realtime',intervalMinutes:30,write:'upsert'};c.cleaning??={enabled:false,dropEmpty:true,duplicates:'reject',invalid:'stop',validate:true};return c;}
function capabilityPipelineFieldRule(m){return {enabled:false,trim:true,blankToNull:true,casing:'keep',nulls:'keep',defaultValue:'',convert:'keep',enumText:'Y=是\nN=否',factor:1,decimals:2,...m.processing};}
function capabilityPipelineClock(value=Date.now()){return new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});}
function capabilityPipelineStatus(id){if(!capabilityPipelineState.has(id))capabilityPipelineState.set(id,{records:[],runs:[],lastAttempt:null,lastSuccess:null,nextAt:null});return capabilityPipelineState.get(id);}
function capabilityPipelineConfigError(c){
  const s=c.sync||{mode:'realtime',write:'upsert'},clean=c.cleaning||{};
  if(!['realtime','manual','interval'].includes(s.mode)||!['upsert','replace'].includes(s.write))return '请选择有效同步方式与更新策略。';
  if(s.mode==='interval'&&(!Number.isInteger(Number(s.intervalMinutes))||Number(s.intervalMinutes)<1||Number(s.intervalMinutes)>10080))return '同步周期须为 1 至 10080 分钟的整数。';
  if(clean.enabled&&(!['reject','identical'].includes(clean.duplicates)||!['stop','quarantine'].includes(clean.invalid)))return '请选择有效的重复记录与异常处理策略。';
  const key=obj(c.object)?.props.find(p=>p.key);
  for(const [i,m]of c.maps.entries()){
    if([m.source,m.target].some(path=>/(?:^|\.)(?:__proto__|constructor|prototype)(?:\.|$)/.test(path)))return '字段路径包含不支持的保留名称。';
    const r=capabilityPipelineFieldRule(m);if(!r.enabled)continue;
    if(!['keep','upper','lower'].includes(r.casing)||!['keep','error','default'].includes(r.nulls)||!['keep','text','number','boolean','date','enum','scale'].includes(r.convert))return `第 ${i+1} 个字段的处理规则无效。`;
    if(key&&m.target===`${c.object}.${key.id}`&&r.nulls==='default')return '唯一编号不能用默认值补齐，请修正来源数据。';
    if(r.nulls==='default'&&!String(r.defaultValue??'').trim())return `第 ${i+1} 个字段请填写非空默认值。`;
    if(r.convert==='scale'&&(!Number.isFinite(Number(r.factor))||Number(r.factor)<=0||!Number.isInteger(Number(r.decimals))||Number(r.decimals)<0||Number(r.decimals)>6))return '换算系数须大于 0，小数位须为 0 至 6。';
    if(r.convert==='enum'){
      const lines=String(r.enumText||'').split('\n').map(s=>s.trim()).filter(Boolean),seen=new Set();if(!lines.length)return '请填写枚举对应关系，每行使用“来源值=目标值”。';
      for(const line of lines){const split=line.indexOf('='),left=line.slice(0,split).trim();if(split<1||!line.slice(split+1).trim()||seen.has(left))return '枚举来源值不能重复或为空，每行须填写“来源值=目标值”。';seen.add(left);}
    }
  }
  return '';
}
function capabilityPipelineConvert(value,r){
  let v=value;if(typeof v==='string'){if(r.trim)v=v.trim();if(r.casing==='upper')v=v.toUpperCase();if(r.casing==='lower')v=v.toLowerCase();if(r.blankToNull&&v==='')v=null;}
  if(v===null||v===undefined){if(r.nulls==='error')throw Error('字段为空');if(r.nulls==='default')v=r.defaultValue;else return v;}
  if(r.convert==='text'){if(typeof v==='object')throw Error('集合或对象不能直接转换为文本');return String(v);}
  if(r.convert==='number'||r.convert==='scale'){if(typeof v==='boolean'||typeof v==='object'||String(v).trim()===''||!Number.isFinite(Number(v)))throw Error('不能转换为有效数字');v=Number(v);if(r.convert==='scale'){const scaled=v*Number(r.factor);if(!Number.isFinite(scaled))throw Error('换算结果超出范围');v=Number(scaled.toFixed(Number(r.decimals)));}return v;}
  if(r.convert==='boolean'){const s=String(v).trim().toLowerCase();if(['true','1','y','yes','是'].includes(s))return true;if(['false','0','n','no','否'].includes(s))return false;throw Error('布尔值须为 true/false、Y/N、1/0 或是/否');}
  if(r.convert==='date'){const match=String(v).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);if(!match)throw Error('日期须为 YYYY-MM-DD 或 YYYY/MM/DD');const [y,m,d]=match.slice(1).map(Number),date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error('日期不存在');return `${match[1]}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  if(r.convert==='enum'){const line=String(r.enumText).split('\n').map(s=>s.trim()).find(s=>s.slice(0,s.indexOf('=')).trim()===String(v));if(!line)throw Error(`枚举值“${String(v)}”未配置对应关系`);return line.slice(line.indexOf('=')+1).trim();}
  return v;
}
function capabilityPipelineValueValid(value,type){
  if(value===null||value===undefined)return true;
  if(type==='数字')return typeof value==='number'&&Number.isFinite(value);
  if(type==='布尔')return typeof value==='boolean';
  if(type==='日期'){try{return capabilityPipelineConvert(value,{convert:'date',casing:'keep',nulls:'keep'})===value;}catch{return false;}}
  return ['文本','枚举','引用'].includes(type)?typeof value==='string':true;
}
const capabilityPipelineNormalizeBefore=normalizeCapabilityOutput;
function capabilityPipelineProcess(c,raw){
  if(!c.cleaning?.enabled&&!c.maps.some(m=>m.processing?.enabled))return capabilityPipelineNormalizeBefore(c,Array.isArray(raw)&&c.object!=='Context'?{items:raw}:raw);
  const report={input:0,output:0,emptyDropped:0,duplicatesDropped:0,rejected:[],changes:[],original:structuredClone(raw),accepted:[]},context=c.object==='Context';
  const fail=reason=>({ok:false,error:reason,normalized:context?{}:[],processing:report}),invalid=capabilityPipelineConfigError(c);if(invalid)return fail(invalid);
  if(!raw||typeof raw!=='object')return fail('响应须为对象或记录数组。');
  const clean=c.cleaning||{},rows=context?[raw]:Array.isArray(raw)?raw:Array.isArray(raw.items)?raw.items:[raw],key=obj(c.object)?.props.find(p=>p.key),keyMap=c.maps.find(m=>m.target===`${c.object}.${key?.id}`),conditional=c.maps.some(m=>String(m.conditionValue??'').trim()),groups=new Map();report.input=rows.length;
  const reject=(indices,reason,original)=>report.rejected.push({rows:indices.map(i=>i+1),reason,original:structuredClone(original)});
  for(const [index,row]of rows.entries()){
    const empty=row===null||typeof row==='object'&&!Array.isArray(row)&&Object.values(row).every(v=>v===null||v===undefined||typeof v==='string'&&!v.trim());
    if(clean.enabled&&clean.dropEmpty&&empty){report.emptyDropped++;continue;}
    if(!row||typeof row!=='object'||Array.isArray(row)){reject([index],'记录须为对象',row);continue;}
    const identity=context?'context':keyMap?readPath(row,keyMap.source.replace(/^items\[\]\./,'')):undefined;
    if(!context&&(identity===undefined||identity===null||typeof identity==='object'||String(identity).trim()==='')){reject([index],'记录缺少有效唯一编号，不能自动补齐',row);continue;}
    const groupKey=context?'context':conditional?`${typeof identity}:${identity}`:`row-${index}`;
    if(!groups.has(groupKey))groups.set(groupKey,{rows:[],indices:[]});groups.get(groupKey).rows.push(structuredClone(row));groups.get(groupKey).indices.push(index);
  }
  const accepted=[],evidence=[],seen=new Map(),blocked=new Set();let contextResult={},contextAccepted=false;
  for(const group of groups.values()){
    for(const row of group.rows)for(const m of c.maps){const r=capabilityPipelineFieldRule(m),path=m.source.replace(/^items\[\]\./,'');if(r.enabled&&!String(m.conditionValue??'').trim()&&m.target!==`${c.object}.${key?.id}`&&readPath(row,path)===undefined)assignPath(row,path,null);}
    const mapped=capabilityPipelineNormalizeBefore(c,context?group.rows[0]:{items:group.rows});
    if(!mapped.ok&&!context&&mapped.normalized?.length&&mapped.error==='返回结果缺少该对象的唯一编号对应关系，无法解析身份'&&mapped.normalized.every(row=>row.properties[key?.id]===0||row.properties[key?.id]===false)){mapped.ok=true;delete mapped.error;}
    if(!mapped.ok){reject(group.indices,mapped.error||'字段映射失败',group.rows);continue;}
    evidence.push(...(mapped.mappingEvidence||[]));const records=context?[{properties:mapped.normalized,identity:'本次业务'}]:mapped.normalized;
    for(const item of records){
      const properties=structuredClone(item.properties),changes=[];
      try{
        for(const m of c.maps){const r=capabilityPipelineFieldRule(m);if(!r.enabled)continue;const path=context?m.target.replace(/^Context\./,''):m.target.split('.')[1],before=readPath(properties,path),noMatch=mapped.mappingEvidence?.some(e=>e.target===m.target&&e.identity===item.identity&&e.matched===0);if(noMatch)continue;
          let after;try{after=capabilityPipelineConvert(before,r);const p=obj(c.object)?.props.find(p=>m.target===`${c.object}.${p.id}`);if(p&&!capabilityPipelineValueValid(after,p.type))throw Error(`转换结果不符合${p.type}类型`);}catch(error){throw Error(`${semanticPath(m.target)}：${error.message}`);}assignPath(properties,path,after);if(JSON.stringify(before)!==JSON.stringify(after))changes.push({identity:item.identity,field:m.target,before,after});
        }
        if(context){contextResult=properties;contextAccepted=true;report.changes.push(...changes);continue;}
        const identity=properties[key?.id];if(identity===undefined||identity===null||typeof identity==='object'||String(identity).trim()==='')throw Error('处理后的唯一编号为空或无效');
        if(clean.enabled&&clean.validate)for(const p of obj(c.object)?.props||[]){const value=properties[p.id];if(!c.maps.some(m=>m.target===`${c.object}.${p.id}`))continue;if((p.key||p.required)&&(value===undefined||value===null||typeof value==='string'&&!value.trim()))throw Error(`${p.name}为必填属性`);if(!capabilityPipelineValueValid(value,p.type))throw Error(`${p.name}不符合${p.type}类型，请配置字段转换`);}
        const record={identity:`${c.object}:${identity}`,properties};
        if(clean.enabled&&blocked.has(record.identity))throw Error(`唯一编号 ${record.identity} 已存在冲突，该编号全部隔离`);
        if(clean.enabled&&seen.has(record.identity)){const previous=seen.get(record.identity);if(clean.duplicates==='identical'&&JSON.stringify(previous.record.properties)===JSON.stringify(properties)){report.duplicatesDropped++;continue;}accepted.splice(accepted.indexOf(previous.record),1);seen.delete(record.identity);blocked.add(record.identity);reject(previous.indices,`唯一编号 ${record.identity} 冲突，该编号全部隔离`,previous.original);throw Error(`唯一编号 ${record.identity} 重复，或同一编号存在不同属性值`);}
        seen.set(record.identity,{record,indices:group.indices,original:group.rows});accepted.push(record);report.changes.push(...changes);
      }catch(error){reject(group.indices,error.message,group.rows);}
    }
  }
  report.accepted=context?contextAccepted?[contextResult]:[]:accepted;report.output=report.accepted.length;
  const errors=report.rejected.length;return {ok:!errors,...(errors?{error:`${errors} 组异常记录：${report.rejected.map(r=>r.reason).join('；')}`}:{ }),normalized:errors&&clean.invalid!=='quarantine'?(context?{}:[]):context?contextResult:accepted,processing:report,mappingEvidence:evidence};
}
normalizeCapabilityOutput=function(c,raw){return capabilityPipelineProcess(c,raw);};
function capabilityPipelineParams(c){const defaults={keyword:'',materialCode:'MAT-20260081',projectCode:'PRJ-2026-A',bomVersion:'B3',region:'欧洲',effectiveDate:'2026-11-03',softwareCode:'SW-20260032'};return Object.fromEntries((c.params||[]).map(([key])=>[key,defaults[key]??'']));}
function capabilityPipelineControl(label,key,value,kind='text',choices=[],help=''){
  const id='pipeline-'+key.replace(/\./g,'-');return `<div class="form-field"><label for="${id}">${label}</label>${kind==='select'?`<select id="${id}" data-pipeline-field="${key}">${options(choices,value)}</select>`:`<input id="${id}" type="${kind}" value="${esc(value??'')}" data-pipeline-field="${key}">`}${help?`<small>${help}</small>`:''}</div>`;
}
function capabilityPipelinePreviewHTML(result){
  if(!result)return inf('填写或加载样例后预览。预览使用抽屉中的配置，不保存配置或写入同步数据。');
  const r=result.processing;return `<div class="section-gap">${inf(result.ok?'预览通过；尚未写入同步数据。':`预览发现问题：${esc(result.error||'处理失败')}`,result.ok?'green':'amber')}${r?`<div class="pipeline-metrics"><div><b>${r.input}</b><small>原始记录</small></div><div><b>${r.output}</b><small>合格候选</small></div><div><b>${r.emptyDropped+r.duplicatesDropped}</b><small>明确移除</small></div><div><b>${r.rejected.length}</b><small>异常组</small></div></div>${r.changes.length?`<div class="table-wrap"><table><thead><tr><th>属性</th><th>处理前</th><th>处理后</th></tr></thead><tbody>${r.changes.map(change=>`<tr><td>${esc(semanticPath(change.field))}</td><td><code>${esc(JSON.stringify(change.before)??'未提供')}</code></td><td><code>${esc(JSON.stringify(change.after)??'未提供')}</code></td></tr>`).join('')}</tbody></table></div>`:''}${r.rejected.length?`<details open class="pipeline-details"><summary>异常记录（${r.rejected.length} 组）</summary>${jsonView(r.rejected)}</details>`:''}`:''}<details class="pipeline-details" open><summary>处理结果（预览）</summary>${jsonView(result.normalized)}</details></div>`;
}
function capabilityPipelinePreview(c,d){return `<section class="pipeline-preview"><div class="between"><h3>处理前后预览</h3>${btn('加载当前映射样例','pipeline-load-sample','sm','refresh')}</div><p class="tiny muted section-gap">取值条件按原始来源值判断，再对选中的属性值清洗与转换。预览不会写入任何系统。</p><label class="pipeline-input-label" for="pipeline-sample">原始响应样例（JSON）</label><textarea id="pipeline-sample" data-pipeline-sample rows="7">${esc(d.pipelineSample||'')}</textarea><div class="row section-gap">${btn('预览处理结果','pipeline-preview','primary','play')}</div><div data-pipeline-preview-result>${capabilityPipelinePreviewHTML(d.pipelinePreview)}</div></section>`;}
function capabilityPipelineCleanView(c,d){
  const clean=c.cleaning;return `<div class="pipeline-section"><h3>数据清洗 · 记录处理</h3><p class="tiny muted section-gap">保留原始响应与异常原因；唯一编号缺失时不会使用默认值补齐。</p><label class="check-row section-gap"><input type="checkbox" data-pipeline-field="cleaning.enabled" ${clean.enabled?'checked':''}>启用记录层数据清洗</label>${clean.enabled?`<div class="pipeline-checks section-gap"><label class="check-row"><input type="checkbox" data-pipeline-field="cleaning.dropEmpty" ${clean.dropEmpty?'checked':''}>移除整行均为空的记录</label><label class="check-row"><input type="checkbox" data-pipeline-field="cleaning.validate" ${clean.validate?'checked':''}>校验映射属性的必填要求与数据类型</label></div><div class="form-grid section-gap">${capabilityPipelineControl('重复编号处理','cleaning.duplicates',clean.duplicates,'select',[['reject','发现重复编号即报错'],['identical','仅合并属性完全相同的重复记录']])}${capabilityPipelineControl('异常记录处理','cleaning.invalid',clean.invalid,'select',[['stop','中止整批，不写入'],['quarantine','隔离异常，保留合格候选']])}</div>${inf('出现异常时，业务调用仍返回失败。隔离模式可供同步保留合格数据；全量替换不会使用不完整结果。','amber')}`:''}</div>${capabilityPipelinePreview(c,d)}`;
}
function capabilityPipelineRuleControl(label,index,key,value,choices){return `<div class="form-field"><label for="pipeline-rule-${index}-${key}">${label}</label><select id="pipeline-rule-${index}-${key}" data-pipeline-map="${index}" data-rule-key="${key}">${options(choices,value)}</select></div>`;}
function capabilityPipelineFieldsView(c,d){
  return `<div class="pipeline-section"><h3>字段清洗与转换</h3><p class="tiny muted section-gap">按字段对应逐项配置，不改变取值条件。布尔值、数字 0 和空值分别处理。</p>${c.maps.map((m,i)=>{const r=capabilityPipelineFieldRule(m);return `<section class="pipeline-field-card"><div class="between"><div><h4>${esc(m.target?semanticPath(m.target):'请先选择目标属性')}</h4><code>${esc(m.source||'待设置来源字段')}</code></div><label class="check-row"><input type="checkbox" data-pipeline-map="${i}" data-rule-key="enabled" ${r.enabled?'checked':''}>启用处理</label></div>${r.enabled?`<div class="pipeline-checks section-gap"><label class="check-row"><input type="checkbox" data-pipeline-map="${i}" data-rule-key="trim" ${r.trim?'checked':''}>去除首尾空格</label><label class="check-row"><input type="checkbox" data-pipeline-map="${i}" data-rule-key="blankToNull" ${r.blankToNull?'checked':''}>空字符串作为空值</label></div><div class="form-grid section-gap">${capabilityPipelineRuleControl('大小写',i,'casing',r.casing,[['keep','保持大小写'],['upper','转为大写'],['lower','转为小写']])}${capabilityPipelineRuleControl('空值处理',i,'nulls',r.nulls,[['keep','保留空值'],['error','报错并隔离'],['default','使用明确默认值']])}${capabilityPipelineRuleControl('转换方式',i,'convert',r.convert,[['keep','保持原类型'],['text','转换为文本'],['number','转换为数字'],['boolean','转换为布尔值'],['date','统一为 YYYY-MM-DD'],['enum','枚举对应'],['scale','单位换算']])}${r.nulls==='default'?`<div class="form-field"><label>默认值</label><input aria-label="字段 ${i+1} 默认值" data-pipeline-map="${i}" data-rule-key="defaultValue" value="${esc(r.defaultValue)}"><small>默认值仍接受转换，唯一编号禁止默认补齐。</small></div>`:''}${r.convert==='scale'?`<div class="form-field"><label>换算系数</label><input type="number" step="any" aria-label="字段 ${i+1} 换算系数" data-pipeline-map="${i}" data-rule-key="factor" value="${esc(r.factor)}"></div><div class="form-field"><label>保留小数位</label><input type="number" min="0" max="6" aria-label="字段 ${i+1} 小数位" data-pipeline-map="${i}" data-rule-key="decimals" value="${esc(r.decimals)}"></div>`:''}</div>${r.convert==='enum'?`<label class="pipeline-input-label">枚举对应（每行“来源值=目标值”）</label><textarea aria-label="字段 ${i+1} 枚举对应" data-pipeline-map="${i}" data-rule-key="enumText" rows="3">${esc(r.enumText)}</textarea>`:''}`:''}</section>`}).join('')||'<div class="empty">请先在取数配置中添加字段对应。</div>'}</div>${capabilityPipelinePreview(c,d)}`;
}
function capabilityPipelineSyncView(c,d){
  const sync=c.sync,s=capabilityPipelineStatus(c.id),canRun=!d.isNew&&!d.dirty,lastSuccess=sync.mode==='realtime'?s.lastSuccessfulCall:s.lastSuccess;
  return `<div class="pipeline-section"><h3>同步与更新</h3><div class="form-grid section-gap">${capabilityPipelineControl('取数 / 同步方式','sync.mode',sync.mode,'select',[['realtime','实时查询'],['manual','手动同步'],['interval','定时同步（模拟）']])}${sync.mode==='interval'?capabilityPipelineControl('执行周期（分钟）','sync.intervalMinutes',sync.intervalMinutes,'number',[],'1 至 10080 分钟；页面不会后台执行'):''}${capabilityPipelineControl('同步结果更新方式','sync.write',sync.write,'select',[['upsert','按唯一编号新增或更新'],['replace','成功后全量替换本地结果']])}</div>${inf('实时查询直接取数，不读本地同步缓存。定时方式保存周期和下次计划，通过“模拟到期执行”体验；关闭页面不会继续运行。')}<div class="pipeline-metrics"><div><b>${sync.mode==='realtime'?(s.lastCall?(s.lastCall.ok?'查询成功':'查询失败'):'尚未查询'):(s.lastAttempt?s.runs[0]?.status||'已执行':'尚未执行')}</b><small>${sync.mode==='realtime'?'最近查询':'最近尝试'}：${(sync.mode==='realtime'?s.lastCall?.at:s.lastAttempt)?esc(capabilityPipelineClock(sync.mode==='realtime'?s.lastCall.at:s.lastAttempt)):'—'}</small></div><div><b>${lastSuccess?'成功':'—'}</b><small>${sync.mode==='realtime'?'最近成功查询':'最近完整成功'}：${lastSuccess?esc(capabilityPipelineClock(lastSuccess)):'—'}</small></div><div><b>${s.records.length}</b><small>本地同步记录数</small></div><div><b>${sync.mode==='interval'?'定时计划':sync.mode==='realtime'?'按调用':'手动执行'}</b><small>${sync.mode==='interval'&&s.nextAt?esc(capabilityPipelineClock(s.nextAt)):'无后台任务'}</small></div></div><label class="pipeline-input-label" for="pipeline-params">同步请求参数（JSON）</label><textarea id="pipeline-params" data-pipeline-params rows="4">${esc(d.pipelineParamsText||'{}')}</textarea><details class="pipeline-details"><summary>同步响应演示设置</summary><label class="check-row section-gap"><input type="checkbox" data-pipeline-use-sample ${d.pipelineUseSample?'checked':''}>使用指定响应进行本次模拟同步</label>${d.pipelineUseSample?`<label class="pipeline-input-label">原始响应样例（JSON）</label><textarea data-pipeline-sample rows="6">${esc(d.pipelineSample||'')}</textarea>`:''}</details><div class="row section-gap pipeline-actions">${btn('立即同步（模拟）','pipeline-sync-now','primary','refresh',canRun?'':'disabled')}${sync.mode==='interval'?btn('模拟到期执行','pipeline-sync-due','','clock',canRun?'':'disabled'):''}</div>${!canRun?'<p class="tiny muted section-gap">请先保存配置，再执行同步。预览可使用未保存的规则。</p>':''}</div><section class="pipeline-section"><div class="between"><h3>同步执行记录</h3><span class="tiny muted">本会话最近 ${s.runs.length} 次</span></div>${s.runs.length?`<div class="table-wrap section-gap"><table class="pipeline-runs"><thead><tr><th>执行时间 / 版本</th><th>结果</th><th>写入 / 异常</th><th>详情</th></tr></thead><tbody>${s.runs.map(run=>`<tr><td>${esc(capabilityPipelineClock(run.at))}<small class="field-path">修订 ${run.revision} · ${run.trigger==='due'?'模拟到期':'手动执行'}</small></td><td>${pill(run.status,run.status==='成功'?'green':run.status==='失败'?'red':'amber')}</td><td>${run.written} / ${run.rejected}</td><td><details><summary>查看依据</summary>${jsonView({params:run.params,error:run.error,raw:run.raw,processing:run.processing,normalized:run.normalized,conditions:run.config?.maps?.map(m=>({source:m.source,target:m.target,operator:m.conditionOperator,value:m.conditionValue})),mappingEvidence:run.mappingEvidence})}</details></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">还没有同步执行记录。</div>'}<details class="pipeline-details"><summary>查看本地同步结果</summary>${jsonView(s.records)}</details></section>`;
}
const capabilityPipelineEditorBefore=extraDrawers.capability;
extraDrawers.capability=function(){
  const d=state.drawer,c=capabilityPipelineDefaults(d.draft);d.pipelineTab??='config';
  const html=capabilityPipelineEditorBefore();d.pipelineSample??=JSON.stringify(capabilityPipelineSample(c),null,2);d.pipelineParamsText??=JSON.stringify(capabilityPipelineParams(c),null,2);
  const start=html.indexOf('<div class="drawer-body">'),end=html.indexOf('<footer class="drawer-foot">');
  const tabs=`<div class="tabs pipeline-tabs" role="tablist" aria-label="取数能力设置">${[['config','取数配置'],['sync','同步与更新'],['cleaning','数据清洗'],['fields','字段清洗与转换']].map(([id,label])=>`<button role="tab" aria-selected="${d.pipelineTab===id}" class="tab ${d.pipelineTab===id?'active':''}" data-action="pipeline-tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
  if(d.pipelineTab==='config')return html.slice(0,start)+tabs+html.slice(start);
  const body=d.pipelineTab==='sync'?capabilityPipelineSyncView(c,d):d.pipelineTab==='cleaning'?capabilityPipelineCleanView(c,d):capabilityPipelineFieldsView(c,d);
  return html.slice(0,start)+tabs+`<div class="drawer-body">${d.error?`<div class="error" role="alert">${esc(d.error)}</div>`:''}${body}</div>`+html.slice(end);
};
const capabilityPipelineValidateBefore=validateAbility;
validateAbility=function(c,isNew){return capabilityPipelineConfigError(c)||capabilityPipelineValidateBefore(c,isNew);};
function capabilityPipelineDataSignature(c){return JSON.stringify({connector:c.connector,connectionType:c.connectionType,tables:c.tables,object:c.object,method:c.method,resource:c.resource,params:c.params,maps:c.maps,cleaning:c.cleaning});}
const capabilityPipelineSaveBefore=actionsMap['save-capability'];
actionsMap['save-capability']=()=>{const d=state.drawer,id=d?.draft.id,before=ability(id),signature=before&&capabilityPipelineDataSignature(before);capabilityPipelineSaveBefore();if(d&&!state.drawer&&ability(id)){const c=ability(id),s=capabilityPipelineStatus(id);if(signature&&signature!==capabilityPipelineDataSignature(c)){s.records=[];s.lastAttempt=null;s.lastSuccess=null;s.lastCall=null;s.lastSuccessfulCall=null;}s.nextAt=c.sync?.mode==='interval'?Date.now()+Number(c.sync.intervalMinutes)*60000:null;}};
function capabilityPipelineExecute(trigger){
  const d=state.drawer;if(d?.type!=='capability'||d.isNew||d.dirty)return;const saved=ability(d.draft.id);if(!saved)return errorDrawer('取数能力已不存在。');const c=capabilityPipelineDefaults(structuredClone(saved));
  if(trigger==='due'&&c.sync?.mode!=='interval')return errorDrawer('当前未配置定时同步。');
  let params;try{params=JSON.parse(d.pipelineParamsText||'{}');if(!params||typeof params!=='object'||Array.isArray(params))throw Error('参数须为对象');}catch(error){return errorDrawer(`请求参数 JSON 无效：${error.message}`);}
  let response;if(d.pipelineUseSample){try{response=JSON.parse(d.pipelineSample);if(!response||typeof response!=='object')throw Error('响应须为对象或记录数组');}catch(error){return errorDrawer(`模拟响应 JSON 无效：${error.message}`);}}
  const s=capabilityPipelineStatus(c.id),at=trigger==='due'?Math.max(Date.now(),s.nextAt||Date.now()):Math.max(Date.now(),s.lastAttempt||0),result=callCapability(c.id,params,'正常',undefined,response),processing=result.processing,partial=!result.ok&&c.cleaning?.enabled&&c.cleaning.invalid==='quarantine'&&processing?.accepted.length>0,canWrite=result.ok||partial&&c.sync.write==='upsert';
  const rows=c.object==='Context'?(result.ok?[{identity:`${c.id}:context`,properties:result.normalized}]:[]):result.ok?result.normalized:partial?processing.accepted:[];let written=0;
  if(canWrite){if(c.sync.write==='replace')s.records=structuredClone(rows);else{const merged=new Map(s.records.map(row=>[row.identity,row]));for(const row of rows)merged.set(row.identity,{...structuredClone(row),properties:Object.assign(Object.fromEntries(Object.entries(merged.get(row.identity)?.properties||{}).filter(([key])=>!c.maps.some(m=>m.target===`${c.object}.${key}`))),structuredClone(row.properties))});s.records=[...merged.values()];}written=rows.length;}
  s.lastAttempt=at;if(result.ok)s.lastSuccess=at;s.nextAt=c.sync.mode==='interval'?at+Number(c.sync.intervalMinutes)*60000:null;
  const status=result.ok?'成功':canWrite?'部分完成':'失败',run={at,revision:c.revision,trigger,status,written,rejected:processing?.rejected.length||0,params:structuredClone(params),error:result.error,raw:structuredClone(result.raw),processing:structuredClone(processing),normalized:structuredClone(result.normalized),sampleResponse:!!d.pipelineUseSample,mappingEvidence:structuredClone(result.mappingEvidence||[]),config:structuredClone(c)};
  s.runs.unshift(run);s.runs=s.runs.slice(0,20);d.error='';log('数据同步',c.name,status,`${written} 条写入，${run.rejected} 组异常；本地模拟`);drawOverlay();
}
Object.assign(actionsMap,{
  'pipeline-tab':el=>{state.drawer.pipelineTab=el.dataset.tab;state.drawer.error='';drawOverlay();},
  'pipeline-load-sample':()=>{const d=state.drawer;d.pipelineSample=JSON.stringify(capabilityPipelineSample(d.draft),null,2);d.pipelinePreview=null;drawOverlay();},
  'pipeline-preview':()=>{const d=state.drawer;let raw;try{raw=JSON.parse(d.pipelineSample);}catch(error){d.pipelinePreview=null;return errorDrawer(`样例 JSON 无效：${error.message}`);}d.error='';d.pipelinePreview=capabilityPipelineProcess(d.draft,raw);drawOverlay();},
  'pipeline-sync-now':()=>capabilityPipelineExecute('manual'),
  'pipeline-sync-due':()=>capabilityPipelineExecute('due')
});
function capabilityPipelineInput(e){
  const d=state.drawer,el=e.target;if(d?.type!=='capability')return;
  if(el.hasAttribute('data-pipeline-sample')){d.pipelineSample=el.value;d.pipelinePreview=null;const view=document.querySelector?.('[data-pipeline-preview-result]');if(view)view.textContent='样例已修改，请重新预览。';return;}
  if(el.hasAttribute('data-pipeline-params')){d.pipelineParamsText=el.value;return;}
  if(el.hasAttribute('data-pipeline-use-sample')){d.pipelineUseSample=el.checked;drawOverlay();return;}
  let handled=false;
  if(el.dataset.pipelineField){const [group,key]=el.dataset.pipelineField.split('.');d.draft[group][key]=el.type==='checkbox'?el.checked:el.value;handled=true;}
  if(el.hasAttribute('data-pipeline-map')){const m=d.draft.maps[Number(el.dataset.pipelineMap)];if(m){m.processing=capabilityPipelineFieldRule(m);m.processing[el.dataset.ruleKey]=el.type==='checkbox'?el.checked:el.value;handled=true;}}
  if(handled||el.dataset.field||el.hasAttribute('data-cap-map')||el.dataset.capabilityTable){d.pipelinePreview=null;const view=document.querySelector?.('[data-pipeline-preview-result]');if(view)view.textContent='配置已修改，请重新预览。';}
  if(handled){d.dirty=true;d.error='';if(e.type==='change'||el.type==='checkbox')drawOverlay();}
}
document.addEventListener('input',capabilityPipelineInput);
document.addEventListener('change',capabilityPipelineInput);
const capabilityPipelineCallBefore=callCapability;
callCapability=function(...args){const result=capabilityPipelineCallBefore(...args),c=ability(args[0]);if(c){const s=capabilityPipelineStatus(c.id);s.lastCall={at:Date.now(),ok:result.ok,error:result.error};if(result.ok)s.lastSuccessfulCall=s.lastCall.at;}return result;};
const capabilityPipelineTableBefore=capabilityTable;
capabilityTable=function(list){let html=capabilityPipelineTableBefore(list);for(const c of list){const mode=c.sync?.mode||'realtime',label=mode==='interval'?`每 ${c.sync.intervalMinutes} 分钟（模拟）`:mode==='manual'?'手动同步':'实时查询',s=capabilityPipelineState.get(c.id),at=mode==='realtime'?s?.lastCall?.at:s?.lastAttempt;html=html.replace(`<small>${esc(c.id)}</small>`,`<small>${esc(c.id)}</small><small class="field-path">${esc(label)}${at?' · '+esc(capabilityPipelineClock(at)):''}</small>`);html=html.replace(`<button class="link" data-action="test-capability" data-id="${esc(c.id)}">测试</button>`,`<button class="link" data-action="test-capability" data-id="${esc(c.id)}">测试</button><button class="link" data-action="pipeline-open-sync" data-id="${esc(c.id)}">同步记录</button>`);}return html;};
actionsMap['pipeline-open-sync']=el=>{actionsMap['edit-capability'](el);if(state.drawer?.type==='capability'){state.drawer.pipelineTab='sync';drawOverlay();}};
const capabilityPipelineDeleteBefore=confirmDeletion;
confirmDeletion=function(){const d=state.drawer,target=d?.deleteKind==='capability'?d.target:null,existed=target&&capabilities.includes(target);capabilityPipelineDeleteBefore();if(existed&&!capabilities.includes(target))capabilityPipelineState.delete(target.id);};
actionsMap['confirm-delete-config']=confirmDeletion;
render();
