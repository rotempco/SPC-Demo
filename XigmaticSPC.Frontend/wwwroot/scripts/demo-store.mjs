import { baseline, evaluate, numeric } from './statistics.mjs';
import {seedCustomerScenario,customerOrderContext} from './customer-scenario.mjs';
export const STORAGE_KEY = 'xigmatic.spc.demo.v1';
export const BASE_TIME = '2026-10-22T08:20:00.000Z';
const wave = [0,.4,-.5,.2,.65,-.3,.1,-.6,.25,.5,-.2,.15,-.4,.6,-.1,.35,-.55,.2,.45,-.3,.15,-.5,.55,-.15,.25];
const definitions = [
  ['diameter','CNC-01','Precision shaft','SHAFT-A-R3','DIAMETER-R1','Outer diameter','mm',25,.05,.012,'CNC turning','3-axis turning center'],
  ['length','CNC-01','Precision shaft','SHAFT-A-R3','LENGTH-R1','Overall length','mm',80,.1,.025,'CNC turning','3-axis turning center'],
  ['runout','CNC-01','Precision shaft','SHAFT-A-R3','RUNOUT-R1','Radial runout','mm',.02,.015,.004,'CNC turning','3-axis turning center'],
  ['bore','CNC-02','Bearing housing','HOUSING-B-R2','BORE-R1','Bore diameter','mm',40,.05,.012,'CNC milling','Horizontal machining center'],
  ['width','PRESS-01','Mounting bracket','BRACKET-A-R1','WIDTH-R1','Bracket width','mm',10,.05,.012,'Metal forming','Hydraulic press'],
  ['fill','FILL-01','Coolant bottle','COOLANT-R1','FILL-R1','Fill quantity','ml',500,5,1.3,'Liquid filling','Volumetric filler'],
  ['roughness','GRIND-01','Guide pin','PIN-C-R1','ROUGHNESS-R1','Surface roughness','µm',.8,.25,.07,'Surface finishing','Cylindrical grinder'],
  ['torque','ASSY-01','Valve assembly','VALVE-D-R1','TORQUE-R1','Fastening torque','Nm',12,1,.2,'Final assembly','Assembly station']
];
export function seed() {
  const data = { version:1, role:'Quality engineer', measurements:[], events:[], sessions:[], imports:[], audit:[], plans:[], streams:[], lastRefresh:new Date().toISOString() };
  definitions.forEach(([id,station,product,productRev,charRev,name,unit,target,tol,spread,process,machine],di) => {
    const values=wave.map(w=>target+w*spread);
    const limits=baseline(values);
    data.streams.push({id,station,product,productRev,charRev,name,unit,target,lsl:target-tol,usl:target+tol,precision:unit==='ml'?2:3,process,machine,batch:'B20261022',segment:'SEG-01',specRev:'SPEC-01',limits:{...limits,id:'BL-'+String(di+1).padStart(3,'0'),revision:1,approvedBy:'M. Sørensen',approvedAt:'2026-10-21T12:00:00Z',reason:'Reviewed reference run after tool setup'},instruction:`Clean the part and zero the ${unit==='ml'?'calibrated scale':'digital gage'}. Measure ${name.toLowerCase()} at the marked inspection position. Record the reading using a decimal point.`,active:true});
    if (id==='torque') { data.streams.at(-1).limits={valid:false,reason:'No approved reference observations.'}; return; }
    const live=wave.map((w,i)=> target+w*spread+(id==='diameter'&&i===24 ? .027 : id==='fill'&&i===23 ? 6 : 0));
    const all=[...values,...live];
    all.forEach((value,i)=>{
      const at=new Date(Date.parse(BASE_TIME)-(49-i)*120000).toISOString();
      const result=evaluate(value,i?all[i-1]:null,data.streams.at(-1),limits);
      const m={id:`M-${id}-${i+1}`,streamId:id,station,product,characteristic:name,name,unit,precision:unit==='ml'?2:3,value,measuredAt:at,recordedAt:at,source:i<25?'Reference run':'Manual',operator:'Anna Jensen',batch:'B20261022',segment:'SEG-01',revision:1,charRev,productRev,specSnapshot:{lsl:target-tol,usl:target+tol,target,unit},specRev:'SPEC-01',baselineId:limits.id||'BL-'+String(di+1).padStart(3,'0'),...result};
      data.measurements.push(m);
      if(i>=25 && (result.oos||result.ooc)) data.events.push(eventFrom(m,data.streams.at(-1),data.events.length));
    });
  });
  data.streams.filter(s=>!['length','runout'].includes(s.id)).forEach((s,i)=>data.plans.push({id:'PLAN-'+(i+1),name:s.product+' · production inspection',station:s.station,product:s.product,revision:1,status:'Published',steps:data.streams.filter(x=>x.station===s.station).map(x=>x.id),reason:'Initial pilot release',publishedBy:'M. Sørensen'}));
  data.events.forEach((e,i)=>{if(i===1){e.status='Acknowledged';e.cause='Filler adjustment';e.action='Check nozzle and repeat measurement';e.notes='Product isolated for review.';e.transitions.push({status:'Acknowledged',actor:'Anna Jensen',at:BASE_TIME});}});
  data.audit.push({id:'A-seed',at:BASE_TIME,actor:'System',action:'Demo workspace prepared',detail:'Synthetic production observations. No customer data.'});
  return data;
}
function eventFrom(m,s,index) {
  return {id:'QE-'+String(index+1).padStart(4,'0'),measurementId:m.id,measurementRevision:m.revision,streamId:s.id,station:m.station||s.station,characteristic:m.characteristic||s.name,type:m.oos?'Specification violation':'Statistical signal',oos:m.oos,ooc:m.ooc,status:'Open',at:m.measuredAt,value:m.value,unit:m.unit||s.unit,precision:m.precision??s.precision,rules:m.rules,baselineId:m.baselineId,specRev:m.specRev,specSnapshot:structuredClone(m.specSnapshot),charRev:m.charRev,productRev:m.productRev,product:m.product||s.product,productCode:m.productCode||s.productCode,batch:m.batch,orderId:m.orderId,orderNumber:m.orderNumber,orderSnapshot:m.orderSnapshot?structuredClone(m.orderSnapshot):undefined,sessionId:m.sessionId,planId:m.planId,planRevision:m.planRevision,verificationForEventId:m.verificationForEventId,owner:'Unassigned',cause:'',action:'',notes:'',containment:'',verification:'',verifiedMeasurementId:'',dueAt:'',transitions:[{status:'Open',actor:'Evaluation',at:m.recordedAt}]};
}
export function createStore(storage) {
  let data;
  try { data=JSON.parse(storage?.getItem(STORAGE_KEY)); } catch { /* Seed if browser storage is unavailable or corrupt. */ }
  if(data?.version!==1) data=seed();
  let persistenceError=!storage;
  const save=()=>{try{if(!storage)throw new Error('Storage unavailable');storage.setItem(STORAGE_KEY,JSON.stringify(data));persistenceError=false;}catch{persistenceError=true;}return data;};
  const audit=(action,detail,context={})=>data.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:actor(),action,detail,...context});
  const auditContext=item=>({orderId:item.orderId,orderNumber:item.orderNumber,sessionId:item.sessionId,measurementId:item.measurementId,eventId:item.eventId});
  const actor=()=>data.role==='Operator'?'Anna Jensen':data.role==='Viewer'?'Lars Holm':'M. Sørensen';
  const requireWrite=()=>{if(data.role==='Viewer')throw new Error('Switch to Operator or Quality engineer to change demo data.');};
  const requireQuality=()=>{if(data.role!=='Quality engineer')throw new Error('Quality engineer role is required for this action.');};
  const stream=id=>{const s=data.streams.find(s=>s.id===id);if(!s)throw new Error('Unknown process stream.');return s;};
  const history=id=>data.measurements.filter(m=>m.streamId===id&&!m.voided).sort((a,b)=>Date.parse(a.measuredAt)-Date.parse(b.measuredAt));
  function resolveOrder(orderId,streamId,pinned) {
    const order=data.orders?.find(order=>order.id===orderId);if(!order)throw new Error('Choose a valid production order.');
    const source=pinned||order;if(source.id!==order.id)throw new Error('The pinned production order does not match.');
    if(streamId){const s=stream(streamId),plan=data.plans.find(plan=>plan.id===source.planId);if(s.station!==source.station||s.productCode!==source.productCode||(!pinned&&!plan?.steps.includes(streamId)))throw new Error('This characteristic does not belong to the production order.');}
    return customerOrderContext(source);
  }
  function record(id,input,context={}) {
    requireWrite();
    const currentDefinition=stream(id),s=context.definition?{...currentDefinition,...context.definition,limits:currentDefinition.limits}:currentDefinition, value=numeric(input), prior=history(id).at(-1);
    const orderContext=data.scenario==='customer'?resolveOrder(context.orderId||context.orderSnapshot?.id,id,context.orderSnapshot):{};
    if(context.verificationForEventId){const event=data.events.find(e=>e.id===context.verificationForEventId);if(!event||event.streamId!==id||event.orderId!==orderContext.orderId)throw new Error('The follow-up must match the event order and characteristic.');}
    if(orderContext.orderId&&context.batch&&context.batch!==orderContext.batch)throw new Error('The batch does not match the production order.');
    if(!String(orderContext.batch||context.batch||s.batch).trim())throw new Error('Batch is required.');
    if(context.submissionId){const existing=data.measurements.find(m=>m.submissionId===context.submissionId);if(existing){if(existing.value!==value||existing.streamId!==id||existing.orderId!==orderContext.orderId)throw new Error('Submission ID already contains a different value or production context.');return existing;}}
    const measuredAt=context.measuredAt||new Date(Math.max(Date.now(),Date.parse(prior?.measuredAt||0)+1)).toISOString();
    if(prior&&Date.parse(measuredAt)<=Date.parse(prior.measuredAt))throw new Error('Measured-at must be later than the latest observation in this stream.');
    if(!Number.isFinite(Date.parse(measuredAt)))throw new Error('Measured-at is invalid.');
    const m={id:crypto.randomUUID(),streamId:id,station:s.station,product:s.product,productCode:s.productCode,characteristic:s.name,name:s.name,unit:s.unit,precision:s.precision,value,measuredAt,recordedAt:new Date().toISOString(),operator:actor(),source:context.source||'Manual',sourceRecordId:context.sourceRecordId,submissionId:context.submissionId,batch:context.batch||s.batch,segment:s.segment,revision:1,specRev:s.specRev,charRev:s.charRev,productRev:s.productRev,specSnapshot:{lsl:s.lsl,usl:s.usl,target:s.target,unit:s.unit},baselineId:s.limits?.id,...orderContext,sessionId:context.sessionId,planId:context.planId,planRevision:context.planRevision,verificationForEventId:context.verificationForEventId,...evaluate(value,prior?.value,s,s.limits,prior?.segment===s.segment)};
    data.measurements.push(m);
    if(m.oos||m.ooc)data.events.push(eventFrom(m,s,data.events.length));
    audit('Measurement recorded',`${s.station} · ${s.name}: ${value} ${s.unit}`,auditContext({...m,measurementId:m.id}));save();return m;
  }
  const session = sessionId => {
    const found=data.sessions.find(s=>s.id===sessionId);
    if(!found||found.status!=='In progress')throw new Error('No active inspection.');
    return found;
  };
  const pendingResponse = measurementId => data.events.some(e=>!e.superseded&&e.measurementId===measurementId&&(!e.cause?.trim()||!e.action?.trim()||!e.notes?.trim()||(data.scenario==='customer'&&(!e.containment?.trim()||!e.owner?.trim()||e.owner.trim().toLowerCase()==='unassigned'||!e.dueAt))));
  function saveSessionEntries(sessionId,entries) {
    requireWrite();const ses=session(sessionId);
    if(!Array.isArray(entries)||!entries.length)throw new Error('Enter at least one reading before saving.');
    const indices=new Set();
    // Validate every entered field before recording any observation. A valid
    // out-of-specification value is accepted and evaluated, rather than rejected.
    const checked=entries.map(entry=>{
      const index=Number(entry.index);
      if(!Number.isInteger(index)||index<0||index>=ses.steps.length||indices.has(index))throw new Error('Invalid or repeated inspection characteristic.');
      indices.add(index);const value=numeric(entry.value);
      const existing=data.measurements.find(m=>m.id===ses.results[index]);
      if(existing&&existing.value!==value)throw new Error('This reading is already saved. Use its correction workflow to change it.');
      return {index,value,existing,submissionId:entry.submissionId||`${ses.id}:characteristic:${index}`};
    });
    const snapshot=structuredClone(data);
    try {
      const saved=checked.map(entry=>{
        if(entry.existing)return entry.existing;
        const streamId=ses.steps[entry.index];
        const measurement=record(streamId,entry.value,{batch:ses.batch,submissionId:entry.submissionId,definition:ses.definitions?.[streamId],orderId:ses.orderId,orderSnapshot:ses.orderSnapshot,sessionId:ses.id,planId:ses.planId,planRevision:ses.planRevision});
        ses.results[entry.index]=measurement.id;ses.drafts??={};delete ses.drafts[entry.index];
        if(entry.index===ses.index)ses.draft='';
        return measurement;
      });
      save();return saved;
    } catch(error){data=snapshot;save();throw error;}
  }
  function completeSession(sessionId) {
    requireWrite();const ses=session(sessionId);
    if(ses.steps.some((_,index)=>!ses.results[index]))throw new Error('Save every characteristic before completing the inspection.');
    if(ses.results.some(id=>id&&pendingResponse(id)))throw new Error('Record the required cause, action and notes before completing the inspection.');
    ses.status='Completed';ses.index=ses.steps.length;ses.completedAt=new Date().toISOString();audit('Inspection completed',ses.id,auditContext({...ses,sessionId:ses.id}));save();return ses;
  }
  function startSession(planId,batch,context={}) {
    requireWrite();if(!batch?.trim())throw new Error('Enter a batch code.');
    const plan=data.plans.find(p=>p.id===planId&&p.status==='Published');if(!plan)throw new Error('Select a published plan.');
    const orderContext=data.scenario==='customer'?resolveOrder(context.orderId):{};
    if(orderContext.orderId&&(orderContext.orderSnapshot.planId!==planId||orderContext.batch!==batch))throw new Error('The plan or batch does not match the production order.');
    const existing=data.sessions.find(s=>s.planId===planId&&s.batch===batch&&s.orderId===orderContext.orderId&&s.status==='In progress');if(existing)return existing;
    const session={id:crypto.randomUUID(),planId,planName:plan.name,batch,...orderContext,planRevision:plan.revision,steps:[...plan.steps],definitions:Object.fromEntries(plan.steps.map(id=>{const s=stream(id);return [id,{name:s.name,unit:s.unit,precision:s.precision,product:s.product,productCode:s.productCode,station:s.station,charRev:s.charRev,productRev:s.productRev,specRev:s.specRev,lsl:s.lsl,usl:s.usl,target:s.target,instruction:s.instruction}];})),index:0,results:[],drafts:{},entryMode:'all',status:'In progress',actor:actor(),startedAt:new Date().toISOString()};
    data.sessions.push(session);audit('Inspection started',plan.name,auditContext({...session,sessionId:session.id}));save();return session;
  }
  function verificationCandidates(eventId) {
    const e=data.events.find(event=>event.id===eventId);if(!e)return [];
    return history(e.streamId).filter(m=>m.orderId===e.orderId&&m.id!==e.measurementId&&Date.parse(m.measuredAt)>Date.parse(e.at)&&Date.parse(m.recordedAt)>=Date.parse(e.transitions[0].at)&&m.oos===false&&m.ooc===false);
  }
  const responseSnapshot=e=>Object.fromEntries(['cause','action','notes','owner','containment','verification','verifiedMeasurementId','dueAt','verificationSnapshot','verificationInvalidated','verificationInvalidatedReason'].filter(key=>e[key]!==undefined).map(key=>[key,structuredClone(e[key])]));
  return {
    get data(){return data;},get persistenceError(){return persistenceError;},save,actor,stream,history,
    reset(){data=seed();save();},
    loadCustomerScenario(){requireQuality();data=seedCustomerScenario();save();return data;},
    setRole(role){if(!['Quality engineer','Operator','Viewer'].includes(role))throw new Error('Unknown role.');data.role=role;save();},
    record,saveSessionEntries,completeSession,verificationCandidates,requiresResponse:pendingResponse,
    setSessionDraft(sessionId,index,value) {
      requireWrite();const ses=session(sessionId);
      if(!Number.isInteger(index)||index<0||index>=ses.steps.length)throw new Error('Unknown inspection characteristic.');
      if(ses.results[index])throw new Error('This reading is already saved.');
      ses.drafts??={};ses.drafts[index]=String(value);if(index===ses.index)ses.draft=String(value);save();
    },
    startSession,
    startOrderSession(orderId){const order=data.orders?.find(order=>order.id===orderId);if(!order)throw new Error('Choose a valid production order.');return startSession(order.planId,order.batch,{orderId});},
    saveStep(sessionId,value,submissionId) {
      const ses=session(sessionId);
      return saveSessionEntries(sessionId,[{index:ses.index,value,submissionId}])[0];
    },
    advance(sessionId) {
      requireWrite();const ses=session(sessionId);
      const id=ses.results[ses.index];if(!id)throw new Error('Save the measurement before continuing.');
      if(pendingResponse(id))throw new Error('Record the required cause, action and notes before continuing.');
      const remaining=ses.steps.map((_,index)=>index).filter(index=>!ses.results[index]||pendingResponse(ses.results[index]));
      if(!remaining.length)return completeSession(sessionId);
      ses.index=remaining.find(index=>index>ses.index)??remaining[0];save();return ses;
    },
    abandon(sessionId,reason) {requireWrite();if(!reason.trim())throw new Error('A reason is required.');const ses=data.sessions.find(s=>s.id===sessionId);if(!ses||ses.status!=='In progress')throw new Error('No active inspection.');ses.status='Abandoned';ses.reason=reason;audit('Inspection abandoned',reason,auditContext({...ses,sessionId:ses.id}));save();},
    respond(id,{cause,action,notes,owner,status,containment,verification,verifiedMeasurementId,dueAt}) {
      requireWrite();const e=data.events.find(e=>e.id===id);if(!e)throw new Error('Unknown event.');if(e.status==='Closed')throw new Error('This event is already closed.');
      if(!cause?.trim()||!action?.trim()||!notes?.trim())throw new Error('Suspected cause, action and notes are required.');
      if(status==='Closed')requireQuality();
      if(!['Acknowledged','Closed'].includes(status||'Acknowledged'))throw new Error('Choose acknowledge or verified closure.');
      const before=responseSnapshot(e),next={cause:cause.trim(),action:action.trim(),notes:notes.trim(),owner:owner?.trim()||actor(),status:status||'Acknowledged'};
      if(data.scenario==='customer') {
        if(e.superseded)throw new Error('This event has been superseded by a corrected measurement.');
        if(!owner?.trim()||owner.trim().toLowerCase()==='unassigned')throw new Error('Assign an owner for this response.');
        if(!containment?.trim())throw new Error('Describe how the affected product was contained.');
        const deadline=Date.parse(dueAt);if(!dueAt||!String(dueAt).includes('T')||!Number.isFinite(deadline)||deadline<Date.parse(e.at))throw new Error('Set a valid follow-up deadline at or after the deviation.');
        Object.assign(next,{containment:containment.trim(),dueAt:new Date(deadline).toISOString(),verification:verification?.trim()||'',verifiedMeasurementId:verifiedMeasurementId||''});
        if(next.status==='Closed') {
          if(!next.verification)throw new Error('Describe the verification before closing this event.');
          const followup=verificationCandidates(id).find(m=>m.id===verifiedMeasurementId);
          if(!followup)throw new Error('Select a later, passing evaluated measurement for the same order and characteristic.');
          next.verificationSnapshot={measurementId:followup.id,revision:followup.revision,value:followup.value,unit:followup.unit,precision:followup.precision,characteristic:followup.characteristic,measuredAt:followup.measuredAt,recordedAt:followup.recordedAt,specRev:followup.specRev,baselineId:followup.baselineId,oos:followup.oos,ooc:followup.ooc};
          next.verificationInvalidated=false;next.verificationInvalidatedReason='';
        }
      }
      Object.assign(e,next);const at=new Date().toISOString(),response=responseSnapshot(e);e.transitions.push({status:e.status,actor:actor(),at,response});audit('Quality event '+e.status.toLowerCase(),e.id+' · '+action,{...auditContext({...e,eventId:e.id}),before,after:response});save();return e;
    },
    approve(id,reason) {
      requireQuality();if(!reason.trim())throw new Error('An approval reason is required.');
      const s=stream(id), refs=history(id).slice(0,25), candidate=baseline(refs.map(m=>m.value));if(!candidate.valid)throw new Error(candidate.reason);
      s.baselineHistory??=[];s.baselineHistory.push(structuredClone(s.limits));
      s.limits={...candidate,id:`BL-${id}-R${(s.limits?.revision||0)+1}`,revision:(s.limits?.revision||0)+1,approvedBy:actor(),approvedAt:new Date().toISOString(),reason,members:refs.map(m=>({id:m.id,revision:m.revision}))};audit('Baseline approved',`${s.id}: ${reason}`);save();return s.limits;
    },
    correct(measurementId,value,reason) {
      requireQuality();if(!reason.trim())throw new Error('A correction reason is required.');const m=data.measurements.find(m=>m.id===measurementId);if(!m)throw new Error('Measurement not found.');
      const nextValue=numeric(value),s=stream(m.streamId);m.revisions??=[];m.revisions.push({value:m.value,revision:m.revision,reason,actor:actor(),at:new Date().toISOString(),oos:m.oos,ooc:m.ooc});m.value=nextValue;m.revision++;
      const isReference=history(s.id).slice(0,25).some(x=>x.id===m.id);if(isReference)s.limits={...s.limits,valid:false,reason:'Reference observation corrected; approval required.'};
      const seq=history(s.id),index=seq.indexOf(m);
      for(const item of seq.slice(index,index+2)){const i=seq.indexOf(item);Object.assign(item,evaluate(item.value,seq[i-1]?.value,item.specSnapshot||s,s.limits,seq[i-1]?.segment===item.segment));data.events.filter(e=>e.measurementId===item.id).forEach(e=>e.superseded=true);if(item.oos||item.ooc)data.events.push(eventFrom(item,s,data.events.length));}
      if(data.scenario==='customer') {
        const reevaluated=new Set(seq.slice(index,index+2).map(item=>item.id));
        for(const e of data.events.filter(event=>event.status==='Closed'&&reevaluated.has(event.verifiedMeasurementId))) {
          const evidence=data.measurements.find(item=>item.id===e.verifiedMeasurementId),snapshot=e.verificationSnapshot;
          if(evidence&&snapshot&&(evidence.revision!==snapshot.revision||evidence.oos!==snapshot.oos||evidence.ooc!==snapshot.ooc)) {
            e.status='Acknowledged';e.verificationInvalidated=true;e.verificationInvalidatedReason='Verification evidence changed after closure; review and verify again.';
            e.transitions.push({status:'Acknowledged',actor:actor(),at:new Date().toISOString(),reason:e.verificationInvalidatedReason,response:responseSnapshot(e)});
            audit('Verification evidence requires review',e.id+' · '+e.verificationInvalidatedReason,auditContext({...e,eventId:e.id}));
          }
        }
      }
      audit('Measurement corrected',`${m.id} r${m.revision}: ${reason}`,auditContext({...m,measurementId:m.id}));save();return m;
    },
    createPlan({name,station,steps,reason}) {
      requireQuality();name=name?.trim();reason=reason?.trim();
      if(!name||!reason)throw new Error('Plan name and publication reason are required.');
      if(!data.streams.some(s=>s.station===station&&s.active))throw new Error('Choose an available workstation.');
      if(!Array.isArray(steps)||!steps.length||new Set(steps).size!==steps.length||steps.some(id=>!data.streams.some(s=>s.id===id&&s.station===station&&s.active)))throw new Error('Choose at least one unique characteristic belonging to this workstation.');
      const selected=steps.map(stream);
      if(new Set(selected.map(s=>s.productRev)).size!==1)throw new Error('Choose characteristics from the same product revision.');
      if(data.plans.some(p=>p.station===station&&p.name.trim().toLowerCase()===name.toLowerCase()))throw new Error('A plan with this name already exists at this workstation.');
      const number=Math.max(0,...data.plans.map(p=>Number(/^PLAN-(\d+)$/.exec(p.id)?.[1])||0))+1;
      const plan={id:`PLAN-${number}`,name,station,product:selected[0].product,revision:1,status:'Published',steps:[...steps],reason,publishedBy:actor(),publishedAt:new Date().toISOString(),revisions:[]};
      data.plans.unshift(plan);audit('Inspection plan created',`${plan.id} r1: ${name} · ${reason}`);save();return plan;
    },
    publishPlan(id,changes,reason) {
      requireQuality();if(!changes.name?.trim()||!reason.trim())throw new Error('Plan name and change reason are required.');const p=data.plans.find(p=>p.id===id);if(!p)throw new Error('Unknown plan.');
      const steps=changes.steps||p.steps;if(!steps.length||new Set(steps).size!==steps.length||steps.some(id=>stream(id).station!==p.station))throw new Error('Choose unique characteristics belonging to this workstation.');
      p.revisions??=[];p.revisions.push({name:p.name,revision:p.revision,reason:p.reason,steps:[...p.steps]});p.name=changes.name;p.steps=[...steps];p.revision++;p.reason=reason;p.publishedBy=actor();audit('Plan revision published',`${p.id} r${p.revision}: ${reason}`);save();return p;
    },
    configureStream(id,changes,reason) {
      requireQuality();if(!reason.trim()||!changes.instruction?.trim())throw new Error('Instructions and publication reason are required.');
      const lsl=numeric(changes.lsl),usl=numeric(changes.usl),target=numeric(changes.target);if(!(lsl<usl)||target<lsl||target>usl)throw new Error('Lower limit must be below upper limit, and target must be inside the specification.');
      const s=stream(id);s.definitionHistory??=[];s.definitionHistory.push({charRev:s.charRev,specRev:s.specRev,lsl:s.lsl,usl:s.usl,target:s.target,instruction:s.instruction,actor:actor(),reason,at:new Date().toISOString()});
      s.charRev=s.charRev.replace(/-R\d+$/,`-R${s.definitionHistory.length+1}`);s.specRev='SPEC-'+String(s.definitionHistory.length+1).padStart(2,'0');Object.assign(s,{lsl,usl,target,instruction:changes.instruction});audit('Characteristic revision published',`${s.station} ${s.charRev}: ${reason}`);save();return s;
    },
    previewCsv(text,source='csv-pilot') {
      const headers='source_record_id;workstation_code;product_revision;characteristic_revision;batch_code;measured_at;value;unit';
      const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);if(lines.shift()!==headers)throw new Error('Use the eight-column semicolon CSV contract shown below.');
      const seen=new Map(),last=new Map();
      const rows=lines.map((line,i)=>{
        const cols=line.split(';'),[recordId,station,productRev,charRev,batch,at,raw,unit]=cols;const errors=[];
        const s=data.streams.find(s=>s.station===station&&s.productRev===productRev&&s.charRev===charRev);
        let value;try{value=numeric(raw??'');}catch(e){errors.push(e.message);}
        if(cols.length!==8)errors.push('Expected eight columns.');if(!recordId||!batch)errors.push('Source ID and batch are required.');if(!s)errors.push('Unknown workstation / product / characteristic revision.');if(s&&unit!==s.unit)errors.push('Unit does not match the definition.');
        let order;
        if(data.scenario==='customer'&&s){const matches=data.orders.filter(order=>order.batch===batch&&order.station===station&&order.productCode===s.productCode&&order.productRev===productRev&&data.plans.some(plan=>plan.id===order.planId&&plan.status==='Published'&&plan.steps.includes(s.id)));if(matches.length!==1)errors.push(matches.length?'Batch matches multiple production orders; use an unambiguous order batch.':'No production order matches this batch and characteristic.');else order=matches[0];}
        const time=Date.parse(at);if(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(at||'')||!Number.isFinite(time))errors.push('Use an ISO timestamp with timezone.');if(time>Date.now()+60000)errors.push('Future timestamp.');
        const fingerprint=JSON.stringify(cols), prior=data.measurements.find(m=>m.source===source&&m.sourceRecordId===recordId);const duplicate=!!prior;
        if(prior&&(prior.importFingerprint!==fingerprint))errors.push('Source ID conflicts with previously committed content.');
        if(seen.has(recordId))errors.push('Duplicate source ID within this file.');seen.set(recordId,true);
        if(s&&!duplicate){const lastTime=last.get(s.id)??Date.parse(history(s.id).at(-1)?.measuredAt||0);if(time<=lastTime)errors.push('Late or tied observation in this stream.');last.set(s.id,time);}
        return {row:i+2,recordId,streamId:s?.id,station,value,unit,batch,at,orderId:order?.id,orderNumber:order?.number,fingerprint,duplicate,errors};
      });if(!rows.length)throw new Error('The file contains no observations.');return {source,rows,valid:rows.every(r=>!r.errors.length)};
    },
    commitImport(preview) {
      requireWrite();if(!preview?.valid)throw new Error('Resolve all row errors before committing.');
      // Revalidate against current state, so an intervening inspection cannot admit late data.
      const header='source_record_id;workstation_code;product_revision;characteristic_revision;batch_code;measured_at;value;unit';
      const fresh=this.previewCsv(header+'\n'+preview.rows.map(r=>JSON.parse(r.fingerprint).join(';')).join('\n'),preview.source);if(!fresh.valid)throw new Error('Data changed since preview. Validate the file again.');
      if(data.scenario==='customer'&&fresh.rows.some((row,index)=>row.orderId!==preview.rows[index]?.orderId))throw new Error('Production order mapping changed since preview. Validate the file again.');
      const snapshot=structuredClone(data);let inserted=0;
      try {for(const r of fresh.rows){if(r.duplicate)continue;const m=record(r.streamId,r.value,{source:fresh.source,sourceRecordId:r.recordId,batch:r.batch,measuredAt:r.at,orderId:r.orderId});m.importFingerprint=r.fingerprint;inserted++;}const orderIds=[...new Set(fresh.rows.map(row=>row.orderId).filter(Boolean))],order=orderIds.length===1?data.orders?.find(order=>order.id===orderIds[0]):null;data.imports.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),source:fresh.source,inserted,duplicates:fresh.rows.length-inserted,status:'Committed',orderIds,orderId:order?.id,orderNumber:order?.number});audit('CSV import committed',`${inserted} inserted · ${fresh.rows.length-inserted} duplicates`,{orderIds,orderId:order?.id,orderNumber:order?.number});save();return data.imports[0];} catch(e){data=snapshot;save();throw e;}
    }
  };
}
