import {createStore} from './demo-store.mjs?v=20261030-customer';
import {buildReport,measurementsCsv,evidenceJson} from './reporting.mjs';
import {currentShift} from './time-windows.mjs';
import {baseline} from './statistics.mjs';
import {controlChart,histogram,sparkline,mountChart} from './charts.mjs?v=20261023-readable';
import {createDashboardController} from './dashboards.mjs?v=20261030-customer';
import {createInspectionController} from './inspections.mjs?v=20261030-customer';
import {createPlanController} from './plans.mjs?v=20261023-plans';

let browserStorage;try{browserStorage=window.localStorage;}catch{}
const store=createStore(browserStorage);
const ui={page:'overview',streamId:store.data.defaultStreamId||store.data.streams[0].id,orderId:store.data.selectedOrderId||store.data.orders?.[0]?.id,reportOrderId:store.data.selectedOrderId||store.data.orders?.[0]?.id||'all',station:'all',range:'shift',batch:'all',search:'',eventStatus:'unresolved',chartTab:'individuals',tablePage:0,sessionId:null,layout:'grid',preview:null};
const labels={walkthrough:'Customer walkthrough',overview:'Overview',dashboards:'Dashboards',monitor:'Live monitor',inspections:'Inspections',events:'Quality events',baselines:'Baselines & limits',analysis:'Analysis workspace',handover:'Handover & reports',plans:'Inspection plans',imports:'Data import'};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=value=>typeof value==='string'?esc(value):Array.isArray(value)?value.map(safe):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,safe(v)])):value;
const time=at=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Copenhagen',hour:'2-digit',minute:'2-digit'}).format(new Date(at));
const date=at=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Copenhagen',day:'2-digit',month:'short',year:'numeric'}).format(new Date(at));
const fmt=(value,s)=>value==null||!Number.isFinite(value)?'—':Number(value).toFixed(s?.precision??3);
const current=()=>store.stream(ui.streamId);
let shiftWindow=currentShift();
const isShift=m=>Date.parse(m.measuredAt)>=Date.parse(shiftWindow.from)&&Date.parse(m.measuredAt)<Date.parse(shiftWindow.to);
const customer=()=>store.data.scenario==='customer';
const primaryStream=()=>store.stream(store.data.defaultStreamId||store.data.streams[0].id);
const selectedOrder=()=>store.data.orders?.find(o=>o.id===ui.orderId)||store.data.orders?.[0];
const localInput=at=>{const instant=new Date(at);return new Date(instant.getTime()-instant.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const report=()=>buildReport(store.data,{orderId:ui.reportOrderId});
const liveEvents=()=>store.data.events.filter(e=>!e.superseded);
const unresolved=id=>liveEvents().filter(e=>(!id||e.streamId===id)&&e.status!=='Closed');
const primary=()=>store.data.streams.filter((s,i,all)=>all.findIndex(x=>x.station===s.station)===i);
const filteredStations=()=>primary().filter(s=>(ui.station==='all'||s.station===ui.station)&&(!ui.search||`${s.station} ${s.process} ${s.product}`.toLowerCase().includes(ui.search.toLowerCase())));
function population(id=ui.streamId){let rows=store.history(id);if(ui.batch!=='all')rows=rows.filter(m=>m.batch===ui.batch);if(ui.range==='shift')rows=rows.filter(isShift);if(ui.range==='25')rows=rows.slice(-25);return rows;}
function reading(m,s){return {value:fmt(m?.value,s),specStatus:m?(m.oos?'Out of specification':'Within specification'):'No data',specTone:m?(m.oos?'red':'green'):'neutral',statStatus:!m?'No data':m.ooc==null?'Not evaluated':m.ooc?'Statistical signal':'In control',tone:!m||m.ooc==null?'neutral':m.ooc?'amber':'green'};}
function eventModel(e){
  const s=store.stream(e.streamId),m=store.data.measurements.find(m=>m.id===e.measurementId),spec=m?.specSnapshot||s;
  const orderId=e.orderId||m?.orderId,closed=e.status==='Closed',readOnly=closed||e.superseded||store.data.role==='Viewer';
  const candidates=orderId?store.verificationCandidates(e.id):[];
  const verification=e.verificationSnapshot||store.data.measurements.find(m=>m.id===e.verifiedMeasurementId);
  const verificationReference=verification?`${fmt(verification.value,{precision:verification.precision??s.precision})} ${verification.unit||s.unit} · ${date(verification.measuredAt)} ${time(verification.measuredAt)} CPH · r${verification.revision}`:e.verifiedMeasurementId?'Verification reading not retained':'No verification measurement linked';
  return {...e,orderId,orderNumber:e.orderNumber||m?.orderNumber||'—',batch:e.batch||m?.batch||'—',productCode:e.productCode||m?.productCode||'—',specRev:m?.specRev||'—',specRange:`${fmt(spec.lsl,s)}–${fmt(spec.usl,s)} ${s.unit}`,customerEvent:!!orderId,reading:fmt(e.value,s),time:time(e.at),date:date(e.at),tone:closed?'green':e.status==='Acknowledged'?'blue':'amber',typeTone:e.oos?'red':'amber',flags:[e.oos?'OOS':'Within spec',e.ooc?'OOC':''].filter(Boolean).join(' · '),supersededLabel:e.superseded?' · Superseded':'',specTone:e.oos?'red':'green',specStatus:e.oos?'Out of specification':'Within specification',statTone:e.ooc?'amber':'green',statStatus:e.ooc?'Statistical signal':'In control',ruleText:e.rules?.length?e.rules.join('; '):`Outside specification ${fmt(spec.lsl,s)}–${fmt(spec.usl,s)} ${s.unit}`,baselineId:e.baselineId||m?.baselineId||'—',closed,readOnly,cannotApprove:store.data.role!=='Quality engineer'||readOnly,cannotRespond:readOnly,cannotFollowup:readOnly,transitionCount:e.transitions.length,transitions:e.transitions.map(t=>({...t,time:date(t.at)+' '+time(t.at),response:t.response||t})),causeLabel:e.cause||'Response required',containmentLabel:e.containment||'Not recorded',actionLabel:e.action||'Action not yet recorded',notesLabel:e.notes||'Awaiting investigation response',verificationLabel:e.verification||'Awaiting verification',verificationReference,hasVerification:!!e.verifiedMeasurementId,dueLabel:e.dueAt?date(e.dueAt)+' '+time(e.dueAt)+' CPH':'Not assigned',dueInput:localInput(e.dueAt||Date.now()+86400000),verificationOptions:candidates.map(v=>({id:v.id,label:`${fmt(v.value,s)} ${s.unit} · ${date(v.measuredAt)} ${time(v.measuredAt)} · r${v.revision}`,selected:v.id===e.verifiedMeasurementId})),noVerification:!candidates.length};
}
function stationModel(s){const all=store.history(s.id),m=all.at(-1),r=reading(m,s);return {...s,...r,status:r.statStatus,unresolved:unresolved(s.id).length,spark:sparkline(all.slice(-25).map(m=>m.value)),machineIcon:s.station.startsWith('CNC')?'precision_manufacturing':s.id==='fill'?'water_drop':s.id==='torque'?'construction':'manufacturing'};}
function summary(){const stations=ui.page==='events'?primary():filteredStations(),ids=store.data.streams.filter(s=>stations.some(x=>x.station===s.station)).map(s=>s.id),rows=ids.flatMap(id=>population(id)),events=liveEvents().filter(e=>ids.includes(e.streamId));const passing=rows.filter(m=>!m.oos).length;return {stations:stations.length,active:stations.filter(s=>store.history(s.id).length).length,idle:stations.filter(s=>!store.history(s.id).length).length,measurements:rows.length,streams:ids.filter(id=>store.history(id).length).length,passing,passRate:rows.length?(passing/rows.length*100).toFixed(1):'—',unresolved:events.filter(e=>e.status!=='Closed').length,open:events.filter(e=>e.status==='Open').length,acknowledged:events.filter(e=>e.status==='Acknowledged').length,closed:events.filter(e=>e.status==='Closed').length};}
function detail(){const s=current(),m=store.history(s.id).at(-1),l=s.limits;return {...s,...reading(m,s),population:population().length,unresolved:unresolved(s.id).length,baselineId:l?.id||'—',baselineLabel:l?.valid?`${l.id} · Frozen`:'Approval required',mean:fmt(l?.mean,s),lcl:fmt(l?.lcl,s),ucl:fmt(l?.ucl,s),lsl:fmt(s.lsl,s),usl:fmt(s.usl,s),approver:l?.approvedBy||'Awaiting approval'};}
function sessions(){return [...store.data.sessions].reverse().map(s=>{const p=store.data.plans.find(p=>p.id===s.planId);return {...s,name:s.planName||p.name,station:p.station,orderNumber:s.orderNumber||'—',done:s.results.filter(Boolean).length,total:s.steps.length,tone:s.status==='Completed'?'green':s.status==='Abandoned'?'neutral':'blue',actionLabel:s.status==='In progress'?'Resume':s.orderId?'Order report':'View process'};});}
function activeSession(){return store.data.sessions.find(s=>s.id===ui.sessionId&&s.status==='In progress')||store.data.sessions.find(s=>s.status==='In progress');}
function inspection(){const ses=activeSession();if(ses)ui.sessionId=ses.id;return inspections.viewModel(ses);}
function analysis(){const s=current(),values=population().map(m=>m.value),count=values.length,mean=count?values.reduce((a,b)=>a+b,0)/count:null,sd=count>1?Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(count-1)):null;return {count,mean:fmt(mean,s),sd:fmt(sd,s),min:count?fmt(Math.min(...values),s):'—',max:count?fmt(Math.max(...values),s):'—',unit:s.unit};}
function walkthrough(){
  const order=selectedOrder();if(!customer()||!order)return {ready:false};
  const scoped=buildReport(store.data,{orderId:order.id}),events=scoped.events;
  const event=events.find(e=>e.oos&&e.status!=='Closed')||events.find(e=>e.status!=='Closed')||events[0];
  const responses=events.filter(e=>e.cause&&e.action&&e.containment&&e.notes&&e.owner!=='Unassigned').length;
  const complete=scoped.totals.completed>0,closed=events.length>0&&scoped.totals.unresolved===0;
  return {ready:true,...order,orderId:order.id,planRevision:store.data.plans.find(p=>p.id===order.planId)?.revision||1,orders:store.data.orders.map(o=>({...o,selected:o.id===order.id})),measurementCount:scoped.totals.measurements,eventCount:events.length,closedCount:scoped.totals.closed,statusLabel:closed?'Verified & documented':events.length?'Action in progress':complete?'Inspection recorded':'Ready to inspect',statusTone:closed?'green':events.length?'amber':'blue',cannotWrite:store.data.role==='Viewer',inspectionClass:complete?'complete':'',inspectionStatus:complete?'Inspection completed':scoped.totals.inProgress?'Inspection in progress':'Ready for the first inspection',responseClass:events.length&&responses===events.length?'complete':'',responseStatus:events.length?`${responses} of ${events.length} deviations have a response`:'An unusual reading will create a deviation',verificationClass:closed?'complete':'',verificationStatus:events.length?`${scoped.totals.closed} of ${events.length} deviations verified and closed`:'Follow-up evidence will stay linked to this order',reportClass:closed?'complete':'',reportStatus:`${scoped.totals.measurements} readings · ${events.length} events retained`,eventId:event?.id,noEvent:!event,cannotFollowup:!event||event.status==='Closed'||store.data.role==='Viewer',noMeasurements:!scoped.totals.measurements};
}
const dashboards=createDashboardController({store,render,dialog,closeDialog,toast,safe});
const inspections=createInspectionController({store,activeSession,render,toast,dialog});
const plans=createPlanController({store,dialog,closeDialog,render,toast,safe});
function viewData(path){switch(path){
  case 'walkthrough':return walkthrough();
  case 'station-options':return [{id:'all',label:'All workstations',selected:ui.station==='all'},...primary().map(s=>({id:s.station,label:s.station,selected:s.station===ui.station}))];
  case 'dashboards':return dashboards.dashboardList();
  case 'dashboard':return dashboards.viewModel();
  case 'summary':return summary();
  case 'pulse':{const s=primaryStream(),m=store.history(s.id).at(-1),r=reading(m,s);return {...r,...s,status:r.statStatus,statusClass:r.tone,time:m?time(m.measuredAt):'—'};}
  case 'stations':return filteredStations().map(stationModel);
  case 'attention':return unresolved().sort((a,b)=>Number(b.oos)-Number(a.oos)).slice(0,3).map(e=>({...eventModel(e),title:e.oos?'Reading outside specification':'Process variation detected',tone:e.oos?'red':'amber',icon:e.oos?'error':'show_chart'}));
  case 'stream-options':return store.data.streams.map(s=>({...s,selected:s.id===ui.streamId}));
  case 'detail':return detail();
  case 'batches':return [{id:'all',label:'All batches',selected:ui.batch==='all'},...[...new Set(store.history(ui.streamId).map(m=>m.batch))].map(id=>({id,label:id,selected:id===ui.batch}))];
  case 'measurements':return population().reverse().slice(ui.tablePage*10,ui.tablePage*10+10).map(m=>({...m,...reading(m,current()),time:time(m.measuredAt),date:date(m.measuredAt),unit:current().unit}));
  case 'inspection':return inspection();
  case 'sessions':return sessions();
  case 'events':return [...store.data.events].reverse().filter(e=>(ui.eventStatus==='all'||(ui.eventStatus==='unresolved'?e.status!=='Closed'&&!e.superseded:e.status===ui.eventStatus))&&(!ui.search||`${e.id} ${e.station} ${e.characteristic} ${e.orderNumber||''} ${e.batch||''}`.toLowerCase().includes(ui.search.toLowerCase()))).map(eventModel);
  case 'baselines':return store.data.streams.map(s=>({...s,baselineId:s.limits?.id||'—',approver:s.limits?.approvedBy||'—',count:store.history(s.id).length?(s.limits?.count||Math.min(25,store.history(s.id).length)):0,mean:fmt(s.limits?.mean,s),lcl:fmt(s.limits?.lcl,s),ucl:fmt(s.limits?.ucl,s),tone:store.history(s.id).length&&s.limits?.valid?'green':'amber',status:!store.history(s.id).length?'No reference data':s.limits?.valid?'Approved · frozen':'Review required'}));
  case 'analysis':return analysis();
  case 'plans':return store.data.plans.map(p=>({...p,count:p.steps.length,plural:p.steps.length===1?'':'s',characteristics:p.steps.map(id=>store.stream(id))}));
  case 'imports':return store.data.imports.map(j=>({...j,time:date(j.at)+' '+time(j.at)}));
  case 'handover-events':return report().events.map(eventModel);
  case 'handover-summary':return {...report().totals,actor:store.actor()};
  case 'report-options':return [{id:'all',label:'All demo orders and observations',selected:ui.reportOrderId==='all'},...(store.data.orders||[]).map(o=>({id:o.id,label:`${o.number} · ${o.product} · ${o.batch}`,selected:ui.reportOrderId===o.id}))];
  case 'report-measurements':return report().measurements.map(m=>({...m,...reading(m,store.stream(m.streamId)),time:date(m.measuredAt)+' '+time(m.measuredAt),specRange:`${fmt(m.specSnapshot?.lsl,store.stream(m.streamId))}–${fmt(m.specSnapshot?.usl,store.stream(m.streamId))}`,orderLabel:m.orderNumber||'Reference / unassigned',hasOrder:!!m.orderId}));
  case 'audit':return report().audit.map(a=>({...a,time:date(a.at)+' '+time(a.at)}));
  case 'report-meta':{const r=report();return {generated:date(r.scope.generatedAt)+' '+time(r.scope.generatedAt)+' CPH',workspace:r.workspace.name,site:r.workspace.site||'Demonstration workspace',title:r.order?`${r.order.number} · Production quality record`:'Production quality record',orderNumber:r.order?.number||'All orders',batch:r.order?.batch||'All batches',product:r.order?.product||'All demo products',scope:r.order?'Complete order history':'All recorded demo observations',empty:!r.measurements.length};}
  default:throw new Error('Unknown demo view.');
}}

// The browser-only adapter supplies htmly JSON bindings; nothing is sent to a backend.
const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.origin);if(url.origin===location.origin&&url.pathname.startsWith('/demo-api/')){try{return new Response(JSON.stringify(safe(viewData(url.pathname.slice(10)))),{status:200,headers:{'Content-Type':'application/json'}});}catch(e){return new Response(JSON.stringify({message:e.message}),{status:400,headers:{'Content-Type':'application/json'}});}}return nativeFetch(input,options);};
window.xigmaticLab={getCsrfToken:()=>'',toastFailTT:message=>toast(message),toastSuccessTT:message=>toast(message),logException:error=>console.error(error),confirm:async message=>window.confirm(message)};
let toastTimer,renderSequence=0,lastRefresh=Date.now(),searchTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
function shell(){const role=store.data.role;$('#actor-role').textContent=role;$('#actor-name').textContent=store.actor();$('.avatar').textContent=role==='Operator'?'AJ':role==='Viewer'?'LH':'MS';$('#event-count').textContent=unresolved().length;$('#event-count').hidden=!unresolved().length;$('#storage-error').hidden=!store.persistenceError;$('#workspace-name').textContent=store.data.workspace?.name||'Nordic Precision';$('#workspace-site').textContent=store.data.workspace?.site||'Copenhagen · Production';$('#current-shift').textContent=shiftWindow.label;}
async function render(){shiftWindow=currentShift();const seq=++renderSequence;const response=await nativeFetch(`/pages/${ui.page}.html?v=20261030-customer`);if(!response.ok)throw new Error('The page could not be loaded.');const html=await response.text();if(seq!==renderSequence)return;$('#main').innerHTML=html;await htmly.refresh($('#main'));if(seq!==renderSequence)return;finishPage();shell();}
function finishPage(){
  for(const key of ['station','range','batch','orderId','reportOrderId'])$$(`[data-filter="${key}"]`).forEach(el=>el.value=ui[key]);
  $$('[data-search]').forEach(el=>el.value=ui.search);
  $$('[data-action="event-filter"]').forEach(el=>el.classList.toggle('selected',el.dataset.status===ui.eventStatus));
  $$('[data-action="chart-tab"]').forEach(el=>el.classList.toggle('selected',el.dataset.tab===ui.chartTab));
  $$('[data-action="layout"]').forEach(el=>el.classList.toggle('selected',el.dataset.layout===ui.layout));
  $('.station-grid')?.classList.toggle('list-layout',ui.layout==='list');
  const empty=(id,condition)=>{if($(id))$(id).hidden=!condition;};
  empty('#stations-empty',!filteredStations().length);empty('#attention-empty',!unresolved().length);empty('#events-empty',!viewData('events').length);empty('#sessions-empty',!store.data.sessions.length);empty('#imports-empty',!store.data.imports.length);if(ui.page==='handover'){const r=report();empty('#handover-empty',!r.events.length);empty('#report-readings-empty',!r.measurements.length);empty('#report-audit-empty',!r.audit.length);}
  if($('#pulse-description'))$('#pulse-description').textContent=`${primaryStream().name} · ${primaryStream().station} · ${primaryStream().product}`;
  $$('[data-primary-stream]').forEach(el=>el.dataset.id=primaryStream().id);
  if($('#inspection-order-banner')){const ses=activeSession();$('#inspection-order-banner').hidden=!ses?.orderId;if(ses?.orderId){$('#inspection-order-heading').textContent=`${ses.orderNumber} · ${ses.product}`;$('#inspection-order-detail').textContent=`${ses.productCode} · ${ses.station} · Batch ${ses.batch} · Synthetic order`;$('#inspection-order-report').dataset.id=ses.orderId;}}
  const rows=population(),maxPage=Math.max(1,Math.ceil(rows.length/10));
  if($('#page-number'))$('#page-number').textContent=`Page ${ui.tablePage+1} of ${maxPage}`;
  if($('#pagination-label'))$('#pagination-label').textContent=`${rows.length} observations`;
  if($('[data-action="page-prev"]'))$('[data-action="page-prev"]').disabled=ui.tablePage===0;
  if($('[data-action="page-next"]'))$('[data-action="page-next"]').disabled=ui.tablePage>=maxPage-1;
  drawCharts();
  if(ui.page==='dashboards')dashboards.mount();
  if(ui.page==='inspections')inspections.mount();
  lastRefresh=Date.now();
}
function drawCharts(){
  const pulse=$('[data-chart="pulse"]');
  if(pulse){const s=primaryStream();mountChart(pulse,width=>controlChart(store.history(s.id).slice(-25),s,{height:280,width}));}
  const detailChart=$('[data-chart="detail"]');
  if(detailChart){mountChart(detailChart,width=>ui.chartTab==='histogram'?histogram(population(),current(),{width}):controlChart(population(),current(),{mr:ui.chartTab==='mr',specs:ui.chartTab==='individuals',height:310,width}));$('#chart-title').textContent=ui.chartTab==='mr'?'Moving range of successive observations':ui.chartTab==='histogram'?'Observation distribution':'Individual observations';}
  const hist=$('[data-chart="histogram"]');
  if(hist)mountChart(hist,width=>histogram(population(),current(),{width}));
}
function setMenu(open){$('.sidebar').classList.toggle('open',open);$('.nav-backdrop').hidden=!open;$('.mobile-menu').setAttribute('aria-expanded',String(open));}
async function navigate(page,options={}){if(!labels[page])page='overview';ui.page=page;ui.search='';ui.tablePage=0;if(page==='monitor'&&options.range===undefined)ui.range='25';if(page==='analysis')ui.range='all';if(page==='overview')ui.range='shift';Object.assign(ui,options);if(location.hash.slice(1)!==page)history.pushState(null,'','#'+page);$$('[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===page));$('#breadcrumb').textContent=labels[page];document.title=`Xigmatic SPC · ${labels[page]}`;setMenu(false);await render();window.scrollTo({top:0,behavior:'instant'});}
function closeDialog(){$('#dialog').close();}
function dialog(template,data={},eyebrow='XIGMATIC SPC'){const t=$(`#tpl-${template}`);if(!t)throw new Error('Dialog template unavailable.');$('#dialog-content').innerHTML=bind(t.innerHTML,safe(data));$('#dialog-eyebrow').textContent=eyebrow;if(!$('#dialog').open)$('#dialog').showModal();$('#dialog').scrollTop=0;}
function showEvent(id){const e=store.data.events.find(e=>e.id===id);if(!e)throw new Error('Event was not found.');dialog(e.orderId?'customer-event':'event',eventModel(e),'INVESTIGATION & RESPONSE');const form=$('#event-form');if(form)form.dataset.initialResponse=JSON.stringify([...new FormData(form)]);}
function showMeasurement(id){const m=store.data.measurements.find(m=>m.id===id);if(!m)throw new Error('Observation was not found.');const base=store.stream(m.streamId),s={...base,...m.specSnapshot,charRev:m.charRev||base.charRev,productRev:m.productRev||base.productRev};dialog('measurement',{...s,...m,id:m.id,...reading(m,s),value:fmt(m.value,s),revision:m.revision,orderNumber:m.orderNumber||'Reference / unassigned',productCode:m.productCode||'—',batch:m.batch,lsl:fmt(s.lsl,s),usl:fmt(s.usl,s),hasOrder:!!m.orderId,measuredAt:date(m.measuredAt)+' '+time(m.measuredAt)+' CPH',recordedAt:date(m.recordedAt)+' '+time(m.recordedAt)+' CPH',baselineId:m.baselineId||'—',specRev:m.specRev,mr:fmt(m.mr,s),ruleText:m.rules?.join('; ')||'No point-beyond-limit signal',cannotApprove:store.data.role!=='Quality engineer',revisions:m.revisions||[],hasRevisions:!!m.revisions?.length},'TRACEABILITY & EVALUATION');}
function startDialog(planId){
  if(customer()){dialog('start-order',{actor:store.actor(),orders:store.data.orders.map(o=>({...o,selected:o.id===selectedOrder()?.id})),cannotWrite:store.data.role==='Viewer'},'PRODUCTION ORDER');updateOrderPreview();}
  else dialog('start',{actor:store.actor(),batch:primaryStream().batch,plans:store.data.plans.filter(p=>p.status==='Published').map(p=>({...p,selected:p.id===planId}))},'OPERATOR WORKFLOW');
}
function updateOrderPreview(){const select=$('#start-order-select');if(!select)return;const order=store.data.orders.find(o=>o.id===select.value);if(!order)return;const p=store.data.plans.find(p=>p.id===order.planId);$('#start-order-context').textContent=`${order.productCode} · ${order.product} · ${order.station} · Batch ${order.batch} · Plan revision ${p?.revision}`;}
function showFollowup(eventId){
  const form=$('#event-form');
  if($('#dialog').open&&form?.dataset.id===eventId&&form.dataset.initialResponse!==JSON.stringify([...new FormData(form)])){
    const error=$('.form-error',form);error.textContent='Save & acknowledge before recording a follow-up. Your changes are still here.';error.scrollIntoView({block:'nearest'});return;
  }
  const e=store.data.events.find(e=>e.id===eventId);if(!e?.orderId)throw new Error('Choose an order-linked deviation.');const s=store.stream(e.streamId);dialog('followup',{...s,...eventModel(e),eventId:e.id,target:fmt(s.target,s),submissionId:crypto.randomUUID()},'FOLLOW-UP MEASUREMENT');
}
function resetUi(){Object.assign(ui,{streamId:store.data.defaultStreamId||store.data.streams[0].id,orderId:store.data.orders?.[0]?.id,reportOrderId:store.data.orders?.[0]?.id||'all',sessionId:null,station:'all',batch:'all',range:'all',eventStatus:'unresolved',chartTab:'individuals',layout:'grid',preview:null,search:''});}
function reviewBaseline(id){const s=store.stream(id),rows=store.history(id).slice(0,25),candidate=baseline(rows.map(m=>m.value));if(!candidate.valid)throw new Error(candidate.reason);dialog('baseline',{...s,count:rows.length,mean:fmt(candidate.mean,s),mr:fmt(candidate.mr,s),sigma:fmt(candidate.sigma,s),lcl:fmt(candidate.lcl,s),ucl:fmt(candidate.ucl,s),mrUcl:fmt(candidate.mrUcl,s),baselineId:s.limits.id||'None',approval:s.limits.approvedAt?s.limits.approvedBy+' · '+date(s.limits.approvedAt):'Not yet approved',cannotApprove:store.data.role!=='Quality engineer'},'BASELINE REVIEW & APPROVAL');mountChart($('[data-chart="baseline"]'),width=>controlChart(rows,{...s,limits:candidate},{height:280,reference:true,width}));}
function sampleCsv(){const s=store.data.streams.find(x=>x.id==='width')||primaryStream(),last=Date.parse(store.history(s.id).at(-1)?.measuredAt||0),start=Math.max(last+1,Date.now()-3000);return 'source_record_id;workstation_code;product_revision;characteristic_revision;batch_code;measured_at;value;unit\n'+[s.target,s.target,s.target].map((v,i)=>`DEMO-${start}-${i+1};${s.station};${s.productRev};${s.charRev};${customer()?selectedOrder().batch:s.batch};${new Date(start+i).toISOString()};${v};${s.unit}`).join('\n');}
function download(filename,content,type='text/csv;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function exportCsv(){let r=ui.page==='handover'?report():buildReport(store.data);if(ui.page==='monitor'||ui.page==='analysis'){const ids=new Set(population().map(m=>m.id));r={...r,measurements:r.measurements.filter(m=>ids.has(m.id))};}download(`Xigmatic-SPC-${r.order?.number||'measurements'}.csv`,measurementsCsv(r));toast(`${r.measurements.length} observations exported with order and revision references.`);}
async function refreshSection(path){const node=$(`[x-get-list="/demo-api/${path}"]`);if(node)await htmly.refresh(node.parentElement);shell();}

document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-nav]');if(nav){event.preventDefault();try{await navigate(nav.dataset.nav);}catch(e){toast(e.message);}return;}
  const el=event.target.closest('[data-action]');if(!el)return;const {action,id}=el.dataset;
  try{switch(action){
    case 'go':closeDialog();await navigate(el.dataset.page);break;
    case 'load-customer':dialog('load-customer');break;
    case 'confirm-customer':store.loadCustomerScenario();resetUi();closeDialog();await navigate('walkthrough');toast('Customer scenario ready. Both production orders start with no recorded inspections.');break;
    case 'restore-industrial':dialog('restore-industrial');break;
    case 'confirm-industrial':store.reset();resetUi();closeDialog();await navigate('overview',{range:'all'});toast('Industrial scenario restored.');break;
    case 'start-order':{const ses=store.startOrderSession(id||selectedOrder()?.id);ui.sessionId=ses.id;ui.orderId=ses.orderId;ui.reportOrderId=ses.orderId;store.data.selectedOrderId=ses.orderId;store.save();closeDialog();await navigate('inspections');toast('Order context and specification revisions are pinned.');break;}
    case 'followup':showFollowup(id);break;
    case 'order-report':closeDialog();await navigate('handover',{reportOrderId:id||selectedOrder()?.id||'all'});break;
    case 'evidence-export':{const r=report();download(`Xigmatic-SPC-${r.order?.number||'workspace'}-evidence.json`,evidenceJson(store.data,{orderId:ui.reportOrderId}),'application/json;charset=utf-8');toast('Evidence exported with order context, revisions and response history.');break;}
    case 'detail':closeDialog();await navigate('monitor',{streamId:id});break;
    case 'start':startDialog(id||store.data.plans.find(p=>p.steps.includes(ui.streamId))?.id);break;
    case 'single-entry':dialog('single-entry',{...current(),orderId:customer()?selectedOrder()?.id:'',orderNumber:customer()?selectedOrder()?.number:'',batch:customer()?selectedOrder()?.batch:current().batch,customer:customer(),lsl:fmt(current().lsl,current()),usl:fmt(current().usl,current()),target:fmt(current().target,current()),actor:store.actor(),submissionId:crypto.randomUUID()},'RECORD A MEASUREMENT');break;
    case 'event':showEvent(id);break;
    case 'measurement':showMeasurement(id);break;
    case 'baseline':reviewBaseline(id);break;
    case 'new-plan':plans.open();break;
    case 'edit-plan':plans.open(id);break;
    case 'configure-stream':dialog('configure',{...store.stream(id),cannotApprove:store.data.role!=='Quality engineer'},'CHARACTERISTIC CONFIGURATION');break;
    case 'guide':dialog('guide');break;
    case 'site':dialog('guide');break;
    case 'role':dialog('role',{roles:['Quality engineer','Operator','Viewer'].map(name=>({name,selected:name===store.data.role}))},'DEMO PERSONAS');break;
    case 'theme':{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{browserStorage?.setItem('xigmatic.spc.theme',theme);}catch{}break;}
    case 'menu':setMenu(!$('.sidebar').classList.contains('open'));break;
    case 'close-menu':setMenu(false);break;
    case 'close-dialog':closeDialog();break;
    case 'refresh':store.data.lastRefresh=new Date().toISOString();store.save();await render();toast('Workspace refreshed from your browser’s demo data.');break;
    case 'layout':ui.layout=el.dataset.layout;$('.station-grid').classList.toggle('list-layout',ui.layout==='list');$$('[data-action="layout"]').forEach(x=>x.classList.toggle('selected',x.dataset.layout===ui.layout));break;
    case 'chart-tab':ui.chartTab=el.dataset.tab;$$('[data-action="chart-tab"]').forEach(x=>x.classList.toggle('selected',x.dataset.tab===ui.chartTab));drawCharts();break;
    case 'page-prev':ui.tablePage=Math.max(0,ui.tablePage-1);await refreshSection('measurements');finishPage();break;
    case 'page-next':ui.tablePage=Math.min(Math.ceil(population().length/10)-1,ui.tablePage+1);await refreshSection('measurements');finishPage();break;
    case 'event-filter':ui.eventStatus=el.dataset.status;await refreshSection('events');finishPage();break;
    case 'preset':{const input=$('#measurement-value');if(input&&!input.disabled){input.value=el.dataset.value;activeSession().draft=input.value;store.save();input.focus();}break;}
    case 'next-step':{const ses=store.advance(id);toast(ses.status==='Completed'?'Inspection completed. All readings are available in process history.':'Ready for the next characteristic.');await render();break;}
    case 'resume':{const ses=store.data.sessions.find(s=>s.id===id);if(ses.status==='In progress'){ui.sessionId=id;if(ses.orderId)ui.orderId=ses.orderId;await navigate('inspections');}else if(ses.orderId)await navigate('handover',{reportOrderId:ses.orderId});else await navigate('monitor',{streamId:ses.steps[0]});break;}
    case 'abandon':dialog('abandon',{id});break;
    case 'export':exportCsv();break;
    case 'print':window.print();break;
    case 'load-sample':$('#csv-text').value=sampleCsv();ui.preview=null;$('#import-preview').hidden=true;toast('Demo CSV loaded. Validate it to inspect the mapping.');break;
    case 'sample-csv':download('Xigmatic-SPC-sample.csv',sampleCsv());break;
    case 'validate-csv':{const source=$('#csv-source').value.trim();if(!source)throw new Error('A source namespace is required.');ui.preview=store.previewCsv($('#csv-text').value,source);$('#import-error').textContent='';$('#import-preview').hidden=false;$('#import-result').textContent=`${ui.preview.rows.length} rows · ${ui.preview.rows.filter(r=>r.errors.length).length} with errors · ${ui.preview.rows.filter(r=>r.duplicate).length} identical replays`;htmly.bindElements($('#import-rows'),safe(ui.preview.rows.map(r=>({...r,value:r.value??'—',label:r.errors.length?'Rejected':r.duplicate?'Replay · skip':'Ready',tone:r.errors.length?'red':r.duplicate?'blue':'green',error:r.errors.join(' ')}))));$('#commit-button').disabled=!ui.preview.valid;$('#import-preview').scrollIntoView({behavior:'smooth',block:'nearest'});break;}
    case 'commit-csv':{el.disabled=true;const result=store.commitImport(ui.preview);ui.preview=null;await render();toast(`Import committed: ${result.inserted} observations, ${result.duplicates} duplicates skipped.`);break;}
    case 'reset':dialog('reset');break;
    case 'confirm-reset':{const wasCustomer=customer();if(wasCustomer)store.loadCustomerScenario();else store.reset();resetUi();closeDialog();await navigate(wasCustomer?'walkthrough':'overview',{range:'all'});toast('Active demo scenario restored.');break;}
  }}catch(error){if(action==='validate-csv'){$('#import-error').textContent=error.message;$('#import-preview').hidden=true;ui.preview=null;}else toast(error.message);}
});

document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.id||['plan-form','inspection-bulk-form','inspection-guided-form'].includes(form.id))return;event.preventDefault();const data=Object.fromEntries(new FormData(form));const errorBox=$('.form-error',form);if(errorBox)errorBox.textContent='';
  try{switch(form.id){
    case 'start-order-form':{const ses=store.startOrderSession(data.orderId);ui.sessionId=ses.id;ui.orderId=ses.orderId;ui.reportOrderId=ses.orderId;store.data.selectedOrderId=ses.orderId;store.save();closeDialog();await navigate('inspections');toast('Inspection ready. Production context and revisions are pinned.');break;}
    case 'followup-form':{const e=store.data.events.find(e=>e.id===form.dataset.event);if(!e)throw new Error('Event was not found.');const m=store.record(e.streamId,data.value,{orderId:e.orderId,verificationForEventId:e.id,submissionId:data.submissionId});const signal=liveEvents().find(x=>x.measurementId===m.id);await render();if(signal){showEvent(signal.id);toast('Follow-up recorded. Review its statistical signal before verification.');}else{showEvent(e.id);toast('Passing follow-up recorded. Link it in the verification section.');}break;}
    case 'start-form':{const ses=store.startSession(data.planId,data.batch);ui.sessionId=ses.id;closeDialog();await navigate('inspections');toast('Inspection ready. The plan revision is pinned.');break;}
    case 'entry-form':{const ses=activeSession();if(!ses)throw new Error('Start an inspection first.');ses.submissionId??=crypto.randomUUID();store.saveStep(ses.id,data.value,ses.submissionId+'-'+ses.index);ses.draft='';store.save();await render();toast('Measurement saved and evaluated.');break;}
    case 'single-entry-form':{const m=store.record(form.dataset.id,data.value,{batch:data.batch,orderId:data.orderId||undefined,submissionId:data.submissionId});await render();const e=liveEvents().find(e=>e.measurementId===m.id);if(e)showEvent(e.id);else showMeasurement(m.id);toast('Measurement saved and evaluated.');break;}
    case 'event-form':store.respond(form.dataset.id,{...data,dueAt:data.dueAt?new Date(data.dueAt).toISOString():undefined,status:event.submitter?.value||'Acknowledged'});closeDialog();await render();toast(event.submitter?.value==='Closed'?'Investigation closed with recorded verification.':'Response saved. Event acknowledged.');break;
    case 'baseline-form':store.approve(form.dataset.id,data.reason);closeDialog();await render();toast('New baseline approved. Its limits are now frozen for future observations.');break;
    case 'correction-form':store.correct(form.dataset.id,data.value,data.reason);closeDialog();await render();toast('Correction saved as a new measurement revision.');break;
    case 'configure-form':store.configureStream(form.dataset.id,data,data.reason);closeDialog();await render();toast('New definition published. Existing sessions retain their pinned configuration.');break;
    case 'role-form':store.setRole(data.role);closeDialog();await render();toast('Switched to '+data.role+'.');break;
    case 'abandon-form':store.abandon(form.dataset.id,data.reason);closeDialog();await render();toast('Session abandoned. Recorded observations are retained.');break;
  }}catch(error){if(errorBox)errorBox.textContent=error.message;else toast(error.message);}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  try{if(el.dataset.filter){const key=el.dataset.filter;if(key==='stream')ui.streamId=el.value;else ui[key]=el.value;if(key==='orderId'){ui.reportOrderId=el.value;store.data.selectedOrderId=el.value;store.save();}ui.tablePage=0;await render();}
  if(el.id==='start-order-select')updateOrderPreview();
  if(el.id==='csv-file'&&el.files?.[0]){const file=el.files[0];if(file.size>2*1024*1024)throw new Error('Use a CSV file smaller than 2 MB for this prototype.');$('#csv-text').value=await file.text();ui.preview=null;$('#import-preview').hidden=true;toast(file.name+' loaded. Validate before committing.');}
  }catch(e){toast(e.message);}
});
document.addEventListener('input',event=>{const el=event.target;if(el.dataset.search){ui.search=el.value;clearTimeout(searchTimer);searchTimer=setTimeout(async()=>{try{await refreshSection(el.dataset.search==='stations'?'stations':'events');if($('#stations-empty'))$('#stations-empty').hidden=!!filteredStations().length;if($('#events-empty'))$('#events-empty').hidden=!!viewData('events').length;}catch(e){toast(e.message);}},150);}if(el.id==='csv-text'||el.id==='csv-source'){ui.preview=null;$('#import-preview').hidden=true;}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('.sidebar').classList.contains('open')){setMenu(false);$('.mobile-menu').focus();}if((event.key==='Enter'||event.key===' ')&&event.target.matches('circle[data-action]')){event.preventDefault();showMeasurement(event.target.dataset.id);}});
window.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'walkthrough'));
setInterval(()=>{const age=Math.floor((Date.now()-lastRefresh)/1000);if($('#refresh-label'))$('#refresh-label').textContent=age<10?'Updated just now':`Refreshed ${age}s ago`;},10000);
// Refresh indicators only: never replace a partially entered form in the background.
setInterval(()=>{lastRefresh=Date.now();if($('#refresh-label'))$('#refresh-label').textContent='Updated just now';shell();},10000);
async function boot(){try{document.documentElement.dataset.theme=browserStorage?.getItem('xigmatic.spc.theme')||'light';const response=await nativeFetch('/pages/dialogs.html?v=20261030-customer');const host=document.createElement('div');host.hidden=true;host.innerHTML=await response.text();document.body.append(host);await navigate(location.hash.slice(1)||'walkthrough');}catch(e){console.error(e);$('#main').textContent='The demo could not start: '+e.message;}}
await boot();
