/* Weekly Fit 5.6: portable backups and editable training history. */
(()=>{
  const wfClone=value=>JSON.parse(JSON.stringify(value));
  const wfEscape=value=>String(value??'').replace(/[&<>'"]/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  let wfImportCandidate=null;
  let wfEditingHistoryId=null;

  function wfMountProfileTools(){
    const danger=$('.danger-zone');
    if(!danger||$('#backupExportBtn'))return;
    danger.insertAdjacentHTML('beforebegin',`<section class="section-block data-tools-card"><div><p class="eyebrow">DATA SAFETY</p><h3>数据备份与恢复</h3><p class="muted">备份包含计划、训练、体重与个人资料。恢复前会先显示内容摘要。</p></div><div class="button-row"><button class="outline-button" id="backupExportBtn">导出备份</button><button class="outline-button" id="backupImportBtn">恢复备份</button></div></section>`);
  }

  function wfMountSheets(){
    document.body.insertAdjacentHTML('beforeend',`<div class="sheet-backdrop" id="historySheet"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">TRAINING HISTORY</p><h3>编辑训练记录</h3></div><button class="close-btn" data-wf-close="historySheet">×</button></div><div class="editor-grid"><label><span>训练日期</span><input id="historyDateInput" type="date"></label><label><span>训练时长（分钟）</span><input id="historyMinutesInput" type="number" min="1" inputmode="numeric"></label><label class="wide"><span>训练标题</span><input id="historyTitleInput" maxlength="60"></label></div><div class="section-title-row inner"><h3>动作明细</h3><span class="muted small">可修改每组数据</span></div><div class="history-edit-list" id="historyDetailList"></div><button class="primary-button" id="saveHistoryBtn">保存本次记录</button><button class="danger-button" id="deleteHistoryBtn">删除本次记录</button></div></div><div class="sheet-backdrop" id="backupSheet"><div class="sheet compact-sheet"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">RESTORE BACKUP</p><h3>恢复训练数据</h3></div><button class="close-btn" data-wf-close="backupSheet">×</button></div><p class="muted helper">请选择由 Weekly Fit 导出的 JSON 备份文件。恢复只会在你确认后执行。</p><label class="backup-file-label">选择备份文件<input id="backupFileInput" type="file" accept="application/json,.json"></label><div class="backup-summary" id="backupSummary">尚未选择备份文件。</div><label class="backup-mode"><span>恢复方式</span><select id="backupRestoreMode"><option value="merge">合并：保留当前计划和资料，补充训练记录</option><option value="replace">覆盖：用备份完全替换当前数据</option></select></label><button class="primary-button" id="confirmRestoreBtn" disabled>确认恢复</button></div></div>`);
    $$('[data-wf-close]').forEach(button=>button.onclick=()=>closeSheet(button.dataset.wfClose));
    ['historySheet','backupSheet'].forEach(id=>$('#'+id).addEventListener('click',event=>{if(event.target.id===id)closeSheet(id)}));
  }

  function wfExportBackup(){
    const payload={format:'weekly-fit-backup',version:'5.6',exportedAt:new Date().toISOString(),state:wfClone(state)};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=`weekly-fit-backup-${isoDate()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),0);
    showToast('备份文件已导出');
  }

  function wfNormalizeBackup(payload){
    const raw=payload?.state&&typeof payload.state==='object'?payload.state:payload;
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.history)||!Array.isArray(raw.weights)||!Array.isArray(raw.plan))return null;
    const base=defaults();
    return {
      ...base,
      days:raw.days&&typeof raw.days==='object'&&!Array.isArray(raw.days)?raw.days:{},
      history:raw.history.filter(item=>item&&typeof item==='object'),
      weights:raw.weights.filter(item=>item&&typeof item==='object'),
      profile:{...base.profile,...(raw.profile&&typeof raw.profile==='object'?raw.profile:{})},
      plan:raw.plan.length===7?raw.plan:base.plan,
      session:null
    };
  }

  function wfBackupSummary(candidate){
    const profileName=candidate.profile?.name||'未命名';
    return `识别到 ${candidate.history.length} 条训练、${candidate.weights.length} 条体重记录和 7 天计划。资料昵称：${profileName}。`;
  }

  function wfRecordKey(record,index){
    return record.id!==undefined&&record.id!==null?`id:${record.id}`:`fallback:${record.date||''}:${record.day??''}:${record.title||''}:${index}`;
  }

  function wfMergeBackup(current,imported){
    const historyMap=new Map();
    [...imported.history,...current.history].forEach((record,index)=>historyMap.set(wfRecordKey(record,index),record));
    const weightMap=new Map();
    [...imported.weights,...current.weights].forEach((weight,index)=>weightMap.set(weight.date||`undated:${index}`,weight));
    return {
      ...current,
      days:{...imported.days,...current.days},
      history:[...historyMap.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))),
      weights:[...weightMap.values()].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))),
      session:null
    };
  }

  function wfReadBackupFile(file){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const parsed=JSON.parse(reader.result);
        const normalized=wfNormalizeBackup(parsed);
        if(!normalized)throw new Error('invalid');
        wfImportCandidate=normalized;
        $('#backupSummary').textContent=wfBackupSummary(normalized);
        $('#confirmRestoreBtn').disabled=false;
      }catch{
        wfImportCandidate=null;
        $('#backupSummary').textContent='无法识别此备份。请选择 Weekly Fit 导出的 JSON 文件。';
        $('#confirmRestoreBtn').disabled=true;
      }
    };
    reader.readAsText(file,'utf-8');
  }

  function wfRestoreBackup(){
    if(!wfImportCandidate)return;
    const mode=$('#backupRestoreMode').value;
    const question=mode==='replace'?'覆盖会替换此设备全部训练数据，确定继续吗？':'合并会保留此设备的计划和个人资料，并补充备份中的训练记录，确定继续吗？';
    if(!confirm(question))return;
    state=mode==='replace'?wfClone(wfImportCandidate):wfMergeBackup(state,wfImportCandidate);
    plan=state.plan;
    save();
    closeSheet('backupSheet');
    renderAll();
    showToast(mode==='replace'?'已从备份恢复全部数据':'已合并备份中的训练数据');
  }

  function wfHistoryById(id){return state.history.find(item=>String(item.id)===String(id));}

  function wfHistoryDetailsFromDom(){
    return $$('#historyDetailList .history-exercise-editor').map(card=>({
      name:card.dataset.name||'未命名动作',
      unit:card.dataset.unit||'',
      sets:$$('.history-set-row',card).map(row=>({
        weight:+(row.querySelector('.history-set-weight')?.value||0),
        reps:Math.max(0,+(row.querySelector('.history-set-reps')?.value||0)),
        done:!!row.querySelector('.history-set-done')?.checked
      }))
    }));
  }

  function wfRenderHistoryDetails(details){
    const container=$('#historyDetailList');
    if(!details.length){container.innerHTML='<div class="guide-box">这条旧记录没有保存动作明细，仍可修改标题、日期和时长。</div>';return;}
    container.innerHTML=details.map((exercise,exerciseIndex)=>`<section class="history-exercise-editor" data-name="${wfEscape(exercise.name)}" data-unit="${wfEscape(exercise.unit||'')}"><h4>${wfEscape(exercise.name)}</h4><div class="history-set-list">${(exercise.sets||[]).map((set,setIndex)=>`<div class="history-set-row" data-set-index="${setIndex}"><label><small>${exercise.unit?'重量':'重量 kg'}</small><input class="history-set-weight" type="number" min="0" step="0.5" value="${Number(set.weight)||0}" ${exercise.unit?'disabled':''}></label><label><small>${wfEscape(exercise.unit||'次数')}</small><input class="history-set-reps" type="number" min="0" inputmode="numeric" value="${Number(set.reps)||0}"></label><label><small>完成</small><input class="history-set-done" type="checkbox" ${set.done!==false?'checked':''}></label><button class="history-remove-set" data-wf-remove-set="${exerciseIndex}:${setIndex}" aria-label="删除这组">×</button></div>`).join('')}</div><button class="history-add-set" data-wf-add-set="${exerciseIndex}">+ 添加一组</button></section>`).join('');
  }

  function wfOpenHistory(id){
    const record=wfHistoryById(id);
    if(!record)return;
    wfEditingHistoryId=record.id;
    $('#historyDateInput').value=record.date||isoDate();
    $('#historyMinutesInput').value=Math.max(1,+record.minutes||1);
    $('#historyTitleInput').value=record.title||'训练记录';
    wfRenderHistoryDetails(wfClone(record.details||[]));
    openSheet('historySheet');
  }

  function wfSaveHistory(){
    const record=wfHistoryById(wfEditingHistoryId);
    if(!record)return;
    const date=$('#historyDateInput').value;
    const minutes=Math.round(+$('#historyMinutesInput').value||0);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||minutes<1)return showToast('请填写有效的日期和训练时长');
    const details=wfHistoryDetailsFromDom();
    record.date=date;
    record.title=$('#historyTitleInput').value.trim()||'训练记录';
    record.minutes=minutes;
    record.details=details;
    record.exercises=details.length;
    record.sets=details.reduce((total,exercise)=>total+exercise.sets.filter(set=>set.done!==false).length,0);
    record.volume=calcVolume(details);
    record.updatedAt=new Date().toISOString();
    save();
    closeSheet('historySheet');
    renderAll();
    showToast('训练记录已更新');
  }

  function wfDeleteHistory(){
    const record=wfHistoryById(wfEditingHistoryId);
    if(!record||!confirm(`删除“${record.title||'这次训练'}”吗？此操作无法撤销。`))return;
    state.history=state.history.filter(item=>String(item.id)!==String(wfEditingHistoryId));
    save();
    closeSheet('historySheet');
    renderAll();
    showToast('已删除本次训练记录');
  }

  function wfAttachHistoryLinks(){
    const recent=state.history.slice(0,50);
    $$('#historyList .history-card').forEach((card,index)=>{
      const record=recent[index];
      if(!record)return;
      card.classList.add('is-clickable');
      card.tabIndex=0;
      card.setAttribute('role','button');
      card.setAttribute('aria-label',`查看 ${record.title||'训练记录'}`);
      card.onclick=()=>wfOpenHistory(record.id);
      card.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();wfOpenHistory(record.id);}};
    });
    $$('#calendarGrid .calendar-day.hit').forEach(cell=>{
      const dateText=cell.textContent.padStart(2,'0');
      const date=`${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth()+1).padStart(2,'0')}-${dateText}`;
      const record=state.history.find(item=>item.date===date);
      if(!record)return;
      cell.tabIndex=0;
      cell.setAttribute('role','button');
      cell.setAttribute('aria-label',`查看 ${date} 的训练记录`);
      cell.onclick=()=>wfOpenHistory(record.id);
      cell.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();wfOpenHistory(record.id);}};
    });
  }

  function wfWireEvents(){
    $('#backupExportBtn').onclick=wfExportBackup;
    $('#backupImportBtn').onclick=()=>{wfImportCandidate=null;$('#backupFileInput').value='';$('#backupSummary').textContent='尚未选择备份文件。';$('#confirmRestoreBtn').disabled=true;openSheet('backupSheet');};
    $('#backupFileInput').onchange=event=>wfReadBackupFile(event.target.files[0]);
    $('#confirmRestoreBtn').onclick=wfRestoreBackup;
    $('#saveHistoryBtn').onclick=wfSaveHistory;
    $('#deleteHistoryBtn').onclick=wfDeleteHistory;
    $('#historyDetailList').onclick=event=>{
      const add=event.target.closest('[data-wf-add-set]');
      const remove=event.target.closest('[data-wf-remove-set]');
      if(!add&&!remove)return;
      const details=wfHistoryDetailsFromDom();
      if(add){const exercise=details[+add.dataset.wfAddSet];if(exercise){const previous=exercise.sets.at(-1)||{weight:0,reps:10,done:false};exercise.sets.push({...previous,done:false});}}
      if(remove){const [exerciseIndex,setIndex]=remove.dataset.wfRemoveSet.split(':').map(Number);const exercise=details[exerciseIndex];if(exercise&&exercise.sets.length>1)exercise.sets.splice(setIndex,1);else return showToast('每个动作至少保留一组');}
      wfRenderHistoryDetails(details);
    };
  }

  const wfBaseRenderRecords=renderRecords;
  renderRecords=function(){wfBaseRenderRecords();wfAttachHistoryLinks();};
  const wfBaseWorkoutDetails=workoutDetails;
  workoutDetails=function(day,dayStateValue){return day.exercises.map((exercise,index)=>({name:exercise.name,unit:exercise.unit||'',sets:clone(dayStateValue.exercises[index]?.sets||[])}));};

  wfMountProfileTools();
  wfMountSheets();
  wfWireEvents();
  renderAll();
})();
