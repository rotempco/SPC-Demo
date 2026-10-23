export function createPlanController({store,dialog,closeDialog,render,toast,safe}) {
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const selectedSteps=form=>$$('.plan-step-row',form).filter(row=>$('input',row).checked).map(row=>row.dataset.stream);
  function updateSelection(form) {
    const rows=$$('.plan-step-row',form),count=selectedSteps(form).length;
    $('#plan-selection-count',form).textContent=`${count} characteristic${count===1?'':'s'} selected`;
    rows.forEach((row,index)=>{
      row.dataset.selected=String($('input',row).checked);
      $('[data-plan-action="up"]',row).disabled=index===0;
      $('[data-plan-action="down"]',row).disabled=index===rows.length-1;
    });
  }
  function showCharacteristics(form,station,selected) {
    const streams=store.data.streams.filter(s=>s.station===station&&(s.active||selected.includes(s.id)));
    const ordered=[...selected.map(id=>streams.find(s=>s.id===id)).filter(Boolean),...streams.filter(s=>!selected.includes(s.id))];
    const template=$('#tpl-plan-characteristic').innerHTML;
    $('#plan-characteristics',form).innerHTML=ordered.map(s=>bind(template,safe({...s,selected:selected.includes(s.id),limits:`${s.lsl.toFixed(s.precision)}–${s.usl.toFixed(s.precision)} ${s.unit}`}))).join('');
    $('#plan-product',form).textContent=streams.length?[...new Set(streams.map(s=>`${s.product} · ${s.productRev}`))].join(', '):'No characteristics available.';
    updateSelection(form);
  }
  function open(id) {
    const plan=id?store.data.plans.find(p=>p.id===id):null;
    if(id&&!plan)throw new Error('Plan was not found.');
    const stations=[...new Set(store.data.streams.filter(s=>s.active).map(s=>s.station))];
    const station=plan?.station||stations[0];
    const cannotApprove=store.data.role!=='Quality engineer';
    dialog('plan',{id:plan?.id||'',name:plan?.name||'',title:plan?'Revise inspection plan':'Create inspection plan',intro:plan?`${plan.id} · ${station} · Published revision ${plan.revision}`:'Choose a workstation, select its characteristics and set the inspection order.',stations:stations.map(id=>({id,selected:id===station})),stationLocked:!!plan,nextRevision:(plan?.revision||0)+1,publishLabel:plan?'Publish revision':'Create & publish plan',reasonPlaceholder:plan?'Describe why this plan is being revised.':'Describe the purpose of this inspection plan.',cannotApprove,canApprove:!cannotApprove},'INSPECTION PLAN BUILDER');
    const form=$('#plan-form');
    showCharacteristics(form,station,plan?.steps||store.data.streams.filter(s=>s.station===station&&s.active).map(s=>s.id));
  }
  document.addEventListener('change',event=>{
    const form=event.target.closest('#plan-form');if(!form)return;
    if(event.target.name==='station')showCharacteristics(form,event.target.value,store.data.streams.filter(s=>s.station===event.target.value&&s.active).map(s=>s.id));
    if(event.target.name==='characteristic')updateSelection(form);
    $('.form-error',form).textContent='';
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-plan-action]');if(!button)return;
    const row=button.closest('.plan-step-row'),direction=button.dataset.planAction;
    if(direction==='up'&&row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);
    if(direction==='down'&&row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);
    updateSelection(row.closest('form'));
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(form.id!=='plan-form')return;
    event.preventDefault();const error=$('.form-error',form);error.textContent='';
    try {
      const values=Object.fromEntries(new FormData(form)),steps=selectedSteps(form);
      if(form.dataset.id)store.publishPlan(form.dataset.id,{name:values.name,steps},values.reason);
      else store.createPlan({...values,steps});
      closeDialog();await render();toast(form.dataset.id?'New plan revision published. Running sessions keep their existing revision.':'Inspection plan published as revision 1. Choose Run plan to start an inspection.');
    }catch(cause){error.textContent=cause.message;}
  });
  return {open};
}
