import {previewReading,inspectionProgress,inspectionStatus} from './inspection-preview.mjs?v=20261023-expert-2';
import {specificationGauge} from './specification-gauge.mjs';

export function createInspectionController({store,activeSession,render,toast,dialog}) {
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const format=(value,definition)=>Number(value).toFixed(definition.precision);
  const cannotWrite=()=>store.data.role==='Viewer';
  function rows(session) {
    return session.steps.map((streamId,index)=>{
      const base=store.stream(streamId),definition={...base,...session.definitions?.[streamId]};
      const measurement=store.data.measurements.find(m=>m.id===session.results[index]);
      const event=store.data.events.find(e=>!e.superseded&&e.measurementId===measurement?.id&&(!e.cause?.trim()||!e.action?.trim()||!e.notes?.trim()));
      const saved=!!measurement;
      const draft=session.drafts?.[index]??(index===session.index?session.draft:'')??'';
      const value=saved?format(measurement.value,definition):draft;
      let preview=previewReading(value,definition,definition.limits,store.history(streamId).at(-1));
      if(saved)preview={valid:true,state:measurement.oos?'oos':measurement.ooc?'ooc':'inside',tone:measurement.oos?'red':measurement.ooc?'amber':'green',specTone:measurement.oos?'red':'green',statTone:measurement.ooc==null?'neutral':measurement.ooc?'amber':'green',specText:measurement.oos?'Out of specification':'Within specification',statText:measurement.ooc==null?'Not evaluated':measurement.ooc?'Statistical signal':'In control',message:event?'Reading recorded. Add the required investigation response before completing.':'Reading recorded. Its original evaluation is retained in history.',icon:measurement.oos?'error':measurement.ooc?'warning':'check_circle',oos:measurement.oos,ooc:measurement.ooc,mr:measurement.mr,rules:measurement.rules};
      const limits=measurement?[base.limits,...(base.baselineHistory||[])].find(l=>l.id===measurement.baselineId):definition.limits;
      const status=inspectionStatus(preview),errorText=preview.state==='invalid'?'Invalid number. Use a decimal point.':'';
      const gauge=specificationGauge(measurement?.value??value,definition);
      return {...definition,...preview,...status,...gauge,preview,index,number:index+1,entryValue:value,saved,notSaved:!saved,inputDisabled:saved||cannotWrite(),entryLabel:saved?'Saved':preview.state==='empty'?'':'Draft',savedTone:saved?'blue':'neutral',cardClass:saved?'is-saved':'',invalid:String(preview.state==='invalid'),errorText,liveText:errorText||status.statusLabel,statusAria:`${status.statusLabel||'Evaluation'} · details for ${definition.name}`,responseRequired:!!event,noResponseRequired:!event,hideActions:!saved&&!event,eventId:event?.id,measurementId:measurement?.id,lsl:format(definition.lsl,definition),usl:format(definition.usl,definition),target:format(definition.target,definition),baselineLabel:measurement?.baselineId||limits?.id||'No approved baseline',controlRange:limits?.valid?`${format(limits.lcl,definition)} – ${format(limits.ucl,definition)} ${definition.unit}`:'Not evaluated',mrLimit:limits?.valid?`${format(limits.mrUcl,definition)} ${definition.unit}`:'Not evaluated',mrValue:preview.mr==null?'—':`${format(preview.mr,definition)} ${definition.unit}`,ruleText:preview.rules?.join(' · ')||(preview.ooc==null?'Not evaluated':'No statistical signal'),progressClass:saved?'complete':preview.state==='invalid'?'invalid':preview.valid?'active':'pending',progressLabel:saved?'Saved':preview.state==='invalid'?'Invalid':preview.valid?'Draft':'Pending',progressIcon:saved?'check_circle':preview.state==='invalid'?'error':preview.valid?'edit':'radio_button_unchecked'};
    });
  }
  function summary(progress) {
    const saveSummary=progress.invalid?`${progress.invalid} invalid ${progress.invalid===1?'reading':'readings'} to correct`:progress.unsaved?`${progress.unsaved} ${progress.unsaved===1?'reading':'readings'} ready to save`:`${progress.saved} of ${progress.total} readings recorded`;
    const saveHelp=[progress.warnings?`${progress.warnings} draft ${progress.warnings===1?'exception':'exceptions'}`:'',progress.pending?`${progress.pending} ${progress.pending===1?'response':'responses'} required`:''].filter(Boolean).join(' · ')||(progress.canComplete?'Ready to complete':'');
    return {saveSummary,saveHelp};
  }
  function viewModel(session) {
    if(!session)return {active:false};
    const entries=rows(session),progress=inspectionProgress(entries),index=Math.max(0,Math.min(session.index,entries.length-1)),entry=entries[index];
    const mode=session.entryMode==='guided'?'guided':'all';
    return {...session,...entry,id:session.id,batch:session.batch,active:true,rows:entries,planName:session.planName||store.data.plans.find(p=>p.id===session.planId)?.name,step:index+1,index,total:progress.total,filled:progress.filled,percent:progress.percent,savedCount:progress.saved,pendingCount:progress.pending,hideAll:mode!=='all',hideGuided:mode!=='guided',allClass:mode==='all'?'selected':'',guidedClass:mode==='guided'?'selected':'',allPressed:String(mode==='all'),guidedPressed:String(mode==='guided'),saveDisabled:!progress.canSave||cannotWrite(),completeDisabled:!progress.canComplete||cannotWrite(),cannotWrite:cannotWrite(),shortId:session.id.slice(0,8),nextLabel:progress.canComplete?'Complete inspection':'Next characteristic',...summary(progress)};
  }
  function paintFeedback(field,row) {
    field.dataset.state=row.state;
    const status=$('[data-reading-status]',field);if(!status)return;
    status.className='inspection-status '+row.statusTone;status.hidden=row.hideStatus;
    status.setAttribute('aria-label',row.statusAria);
    $('[data-status-icon]',status).textContent=row.statusIcon;
    $('[data-status-label]',status).textContent=row.statusLabel;
    const live=$('[data-reading-live]',field);if(live&&live.textContent!==row.liveText)live.textContent=row.liveText;
    const error=$('[data-reading-error]',field);if(error)error.textContent=row.errorText;
    const label=$('[data-entry-label]',field);if(label)label.textContent=row.entryLabel;
    const gauge=$('[data-reading-gauge]',field);
    if(gauge){gauge.style.cssText=row.gaugeStyle;gauge.setAttribute('aria-label',row.gaugeAria);gauge.dataset.overflow=row.gaugeOverflow;$$('[data-gauge-reading]',gauge).forEach(element=>element.hidden=row.gaugeHidden);$('[data-gauge-value]',gauge).textContent=row.gaugeValue;$('[data-gauge-edge]',gauge).textContent=row.gaugeEdgeIcon;}
    $('[data-inspection-input]',field)?.setAttribute('aria-invalid',String(row.state==='invalid'));
  }
  function refreshPreview() {
    const session=activeSession();if(!session||!$('spc-inspections'))return;
    const entries=rows(session),progress=inspectionProgress(entries),text=summary(progress);
    $$('[data-inspection-field]').forEach(field=>paintFeedback(field,entries[Number(field.dataset.inspectionField)]));
    $$('[data-inspection-progress]').forEach(item=>{const row=entries[Number(item.dataset.inspectionProgress)];item.className=row.progressClass;$('[data-progress-label]',item).textContent=row.progressLabel;$('[data-progress-icon]',item).textContent=row.progressIcon;});
    $('#inspection-filled-count').textContent=`${progress.filled} out of ${progress.total}`;
    $('#inspection-recorded-count').textContent=`${progress.saved} saved · Responses pending: ${progress.pending}`;
    const bar=$('.inspection-progress-track');bar.setAttribute('aria-valuenow',String(progress.filled));$('span',bar).style.width=progress.percent+'%';
    $('#inspection-save-summary').textContent=text.saveSummary;$('#inspection-save-help').textContent=text.saveHelp;
    $('[data-inspection-save]').disabled=!progress.canSave||cannotWrite();
    $('[data-inspection-complete]').disabled=!progress.canComplete||cannotWrite();
    const guidedSave=$('#inspection-guided-form [type="submit"]'),entry=entries[Math.min(session.index,entries.length-1)];
    if(guidedSave)guidedSave.disabled=!entry?.preview.valid||entry.saved||cannotWrite();
  }
  function updateDraft(index,value,origin) {
    const session=activeSession();if(!session)return;
    store.setSessionDraft(session.id,index,value);
    $$(`[data-inspection-input="${index}"]`).forEach(input=>{if(input!==origin)input.value=value;});
    refreshPreview();
    $$('#inspection-bulk-error,#inspection-guided-form .form-error').forEach(error=>error.textContent='');
  }
  document.addEventListener('input',event=>{
    if(!event.target.hasAttribute('data-inspection-input'))return;
    try{updateDraft(Number(event.target.dataset.inspectionInput),event.target.value,event.target);}catch(error){toast(error.message);}
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-inspection-action]');if(!button)return;
    const session=activeSession();if(!session)return;
    try {
      if(button.dataset.inspectionAction==='mode') {
        session.entryMode=button.dataset.mode==='guided'?'guided':'all';
        if(session.entryMode==='guided')session.index=session.steps.findIndex((_,index)=>!session.results[index])>=0?session.steps.findIndex((_,index)=>!session.results[index]):0;
        store.save();await render();
      } else if(button.dataset.inspectionAction==='details') {
        const row=rows(session)[Number(button.closest('[data-inspection-field]').dataset.inspectionField)];
        if(row.hideStatus)return;
        dialog('inspection-evaluation',row,'MEASUREMENT EVALUATION');
      } else if(button.dataset.inspectionAction==='complete') {
        store.completeSession(session.id);await render();toast('Inspection completed. Every reading and response is retained.');
      }
    } catch(error){toast(error.message);}
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!['inspection-bulk-form','inspection-guided-form'].includes(form.id))return;
    event.preventDefault();const errorBox=$('.form-error',form),session=activeSession();if(!session)return;
    try {
      const entries=$$('[data-inspection-input]',form).filter(input=>!input.disabled&&input.value.trim()!=='').map(input=>({index:Number(input.dataset.inspectionInput),value:input.value}));
      const saved=store.saveSessionEntries(session.id,entries);
      await render();toast(`${saved.length} ${saved.length===1?'reading':'readings'} saved.`);
    } catch(error){if(errorBox)errorBox.textContent=error.message;else toast(error.message);}
  });
  return {viewModel,mount:refreshPreview};
}
