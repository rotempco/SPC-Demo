import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../XigmaticSPC.Frontend/wwwroot/scripts/demo-store.mjs';
import {seedCustomerScenario} from '../XigmaticSPC.Frontend/wwwroot/scripts/customer-scenario.mjs';

const memory=()=>{let value;return {getItem:()=>value,setItem:(_,next)=>value=next};};
const setup=()=>{const storage=memory(),store=createStore(storage);store.loadCustomerScenario();return {store,storage};};
const response=(event,extra={})=>({owner:'Quality team',containment:'Affected packs held for review.',cause:'Filler setting checked.',action:'Filler adjusted and scale checked.',notes:'Demo response recorded against this order.',dueAt:new Date(Date.parse(event.at)+86400000).toISOString(),...extra});
const makeDeviation=store=>{const session=store.startOrderSession('ORDER-1042');const measurements=store.saveSessionEntries(session.id,[{index:0,value:'493'},{index:1,value:'4.00'},{index:2,value:'10.00'}]);return {session,measurement:measurements[0],event:store.data.events.find(e=>e.measurementId===measurements[0].id)};};
const followups=(store,event)=>{
  const context={orderId:event.orderId,verificationForEventId:event.id};
  const first=store.record('net-weight','500',context),second=store.record('net-weight','500',context);
  return {first,second};
};

test('customer scenario is explicitly selected, current, stable and leaves new production orders empty',()=>{
  const storage=memory(),store=createStore(storage);assert.equal(store.stream('diameter').station,'CNC-01');
  const at=new Date('2026-11-01T00:02:00.000Z'),data=seedCustomerScenario(at);
  assert.equal(data.scenario,'customer');assert.equal(data.defaultStreamId,'net-weight');assert.equal(data.orders.length,2);
  assert.equal(data.streams.length,3);assert.equal(data.measurements.length,90);assert.equal(data.events.length,0);
  assert.equal(data.measurements.filter(m=>m.orderId).length,0);
  for(const stream of data.streams){assert.equal(stream.limits.count,25);assert.equal(stream.limits.members.length,25);assert.equal(stream.limits.valid,true);}
  assert.ok(data.measurements.every(m=>Date.parse(m.measuredAt)<at.getTime()&&Date.parse(m.measuredAt)>=at.getTime()-3600000));
  assert.ok(data.measurements.filter(m=>m.source==='Synthetic prior run').every(m=>m.oos===false&&m.ooc===false));
  store.loadCustomerScenario();assert.equal(createStore(storage).data.orders[0].number,'PO-1042');
  store.reset();assert.equal(store.stream('diameter').station,'CNC-01');
});

test('production order context stays pinned through inspection, measurement, event, audit and reload',()=>{
  const {store,storage}=setup(),{session,measurement,event}=makeDeviation(store);
  assert.equal(store.startOrderSession('ORDER-1042').id,session.id);
  const other=store.startOrderSession('ORDER-1043');assert.notEqual(other.id,session.id);assert.equal(other.orderId,'ORDER-1043');
  for(const item of [session,measurement,event]){assert.equal(item.orderId,'ORDER-1042');assert.equal(item.orderNumber,'PO-1042');assert.equal(item.productCode,'CHICKEN-500');assert.equal(item.station,'PACK-01');assert.equal(item.batch,store.data.orders[0].batch);assert.equal(item.orderSnapshot.id,'ORDER-1042');}
  assert.equal(measurement.sessionId,session.id);assert.equal(measurement.planRevision,1);assert.equal(event.specRev,'SPEC-01');
  store.data.orders[0].product='Changed master name';store.data.orders[0].batch='FUTURE-BATCH';
  store.configureStream('net-weight',{lsl:490,target:500,usl:510,instruction:'Future instruction'},'New sample specification');
  assert.equal(measurement.specSnapshot.lsl,495);assert.equal(measurement.orderSnapshot.product,'Chicken strips · 500 g');
  assert.notEqual(measurement.batch,store.data.orders[0].batch);
  const audit=store.data.audit.find(entry=>entry.measurementId===measurement.id);assert.equal(audit.orderId,'ORDER-1042');assert.equal(audit.sessionId,session.id);
  store.save();const reloaded=createStore(storage);assert.equal(reloaded.data.events[0].orderSnapshot.number,'PO-1042');assert.equal(reloaded.data.measurements.find(m=>m.id===measurement.id).specSnapshot.lsl,495);
});

test('customer response requires containment, a named owner and a valid deadline without partial mutation',()=>{
  const {store}=setup(),{session,event}=makeDeviation(store);assert.equal(store.requiresResponse(event.measurementId),true);
  assert.throws(()=>store.completeSession(session.id),/required cause/);
  const before=JSON.stringify(event);
  for(const extra of [{containment:''},{owner:'Unassigned'},{owner:' '},{dueAt:'not a date'},{dueAt:'2026-10-01'},{dueAt:new Date(Date.parse(event.at)-60000).toISOString()}])assert.throws(()=>store.respond(event.id,response(event,extra)));
  assert.equal(JSON.stringify(event),before);
  store.respond(event.id,response(event));assert.equal(event.status,'Acknowledged');assert.equal(store.requiresResponse(event.measurementId),false);
  store.completeSession(session.id);assert.equal(session.status,'Completed');
  const next=store.startOrderSession('ORDER-1042');assert.notEqual(next.id,session.id);assert.equal(next.orderId,session.orderId);
  assert.equal(event.status,'Acknowledged');
});

test('493 then 500 then 500 preserves the moving-range signal and only the last reading can verify closure',()=>{
  const {store,storage}=setup(),{event}=makeDeviation(store);store.respond(event.id,response(event));
  const {first,second}=followups(store,event);
  assert.equal(first.oos,false);assert.equal(first.ooc,true);assert.equal(second.oos,false);assert.equal(second.ooc,false);
  const mrEvent=store.data.events.find(e=>e.measurementId===first.id);assert.ok(mrEvent);assert.equal(mrEvent.orderId,event.orderId);
  assert.equal(event.status,'Acknowledged');assert.equal(mrEvent.status,'Open');
  assert.deepEqual(store.verificationCandidates(event.id).map(m=>m.id),[second.id]);
  assert.throws(()=>store.respond(event.id,response(event,{status:'Closed',verification:'Follow-up checked.',verifiedMeasurementId:first.id})),/later, passing/);
  assert.throws(()=>store.respond(event.id,response(event,{status:'Closed',verifiedMeasurementId:second.id})),/Describe the verification/);
  const closure={status:'Closed',verification:'Scale check and stable follow-up confirmed.',verifiedMeasurementId:second.id};
  store.setRole('Operator');assert.throws(()=>store.respond(event.id,response(event,closure)),/Quality engineer/);
  store.setRole('Quality engineer');store.respond(event.id,response(event,closure));store.respond(mrEvent.id,response(mrEvent,closure));
  assert.equal(store.data.events.filter(e=>e.status!=='Closed').length,0);
  assert.equal(event.verificationSnapshot.measurementId,second.id);assert.equal(event.verificationSnapshot.revision,1);
  assert.equal(event.transitions.at(-1).response.verification,closure.verification);
  const reloaded=createStore(storage);assert.equal(reloaded.data.events[0].verifiedMeasurementId,second.id);assert.equal(reloaded.data.events[0].status,'Closed');
});

test('wrong-order, wrong-characteristic, earlier and unevaluated readings cannot verify a customer event',()=>{
  const {store}=setup(),{event}=makeDeviation(store);store.respond(event.id,response(event));
  const {second}=followups(store,event);
  const wrongOrder=store.record('net-weight','500',{orderId:'ORDER-1043'}),wrongStream=store.record('seal-width','4',{orderId:'ORDER-1042'});
  const earlier=store.data.measurements.find(m=>m.source==='Reference run');
  store.stream('net-weight').limits.valid=false;
  const unevaluated=store.record('net-weight','500',{orderId:'ORDER-1042'});assert.equal(unevaluated.ooc,null);
  for(const id of [wrongOrder.id,wrongStream.id,earlier.id,unevaluated.id,'missing'])assert.throws(()=>store.respond(event.id,response(event,{status:'Closed',verification:'Checked.',verifiedMeasurementId:id})),/later, passing/);
  assert.ok(store.verificationCandidates(event.id).some(m=>m.id===second.id));
  assert.throws(()=>store.record('net-weight','500',{orderId:'ORDER-1043',verificationForEventId:event.id}),/follow-up must match/);
  assert.throws(()=>store.record('net-weight','500'),/valid production order/);
  assert.throws(()=>store.record('net-weight','500',{orderId:'ORDER-1042',batch:'WRONG'}),/batch does not match/);
});

test('response history keeps prior content and changed verification evidence reopens closure with its original snapshot',()=>{
  const {store}=setup(),{event}=makeDeviation(store);store.respond(event.id,response(event));
  store.respond(event.id,response(event,{cause:'Confirmed filler setting.'}));assert.equal(event.transitions[1].response.cause,'Filler setting checked.');
  const {second}=followups(store,event);store.respond(event.id,response(event,{status:'Closed',verification:'Verified against clean follow-up.',verifiedMeasurementId:second.id}));
  const closed=event.transitions.at(-1);store.correct(second.id,'501','Transcription correction after review');
  assert.equal(event.status,'Acknowledged');assert.equal(event.verificationInvalidated,true);assert.equal(event.verificationSnapshot.value,500);assert.equal(event.verificationSnapshot.revision,1);
  assert.equal(closed.status,'Closed');assert.equal(closed.response.verificationSnapshot.value,500);assert.equal(closed.response.verificationSnapshot.revision,1);
  assert.ok(store.data.audit.some(entry=>entry.eventId===event.id&&entry.action==='Verification evidence requires review'));
});

test('customer order sessions retain role guards and submissions cannot be replayed into another order',()=>{
  const {store}=setup();store.setRole('Viewer');assert.throws(()=>store.startOrderSession('ORDER-1042'),/Switch/);assert.throws(()=>store.loadCustomerScenario(),/Quality engineer/);
  store.setRole('Operator');const context={orderId:'ORDER-1042',submissionId:'customer-once'};
  const saved=store.record('net-weight','500',context);assert.equal(store.record('net-weight','500',context).id,saved.id);
  assert.throws(()=>store.record('net-weight','500',{...context,orderId:'ORDER-1043'}),/different value or production context/);
});

test('customer CSV import maps a unique batch to its order, preserves evidence, and rejects invalid or changed mappings',()=>{
  const {store}=setup(),order=store.data.orders[0],at=new Date(Date.now()-1000).toISOString();
  const csv=(id,batch=order.batch,unit='g')=>`source_record_id;workstation_code;product_revision;characteristic_revision;batch_code;measured_at;value;unit\n${id};PACK-01;CHICKEN-500-R1;WEIGHT-R1;${batch};${at};493;${unit}`;
  const preview=store.previewCsv(csv('scale-1'),'packing-scale');assert.equal(preview.valid,true);assert.equal(preview.rows[0].orderId,'ORDER-1042');
  assert.equal(store.previewCsv(csv('unknown','NO-ORDER'),'packing-scale').valid,false);
  assert.equal(store.previewCsv(csv('wrong-unit',order.batch,'kg'),'packing-scale').valid,false);
  const before=store.data.measurements.length;assert.throws(()=>store.commitImport(store.previewCsv(csv('bad','NO-ORDER'))),/row errors/);assert.equal(store.data.measurements.length,before);
  const job=store.commitImport(preview);assert.equal(job.orderId,'ORDER-1042');assert.equal(job.inserted,1);
  const measurement=store.data.measurements.find(m=>m.sourceRecordId==='scale-1'),event=store.data.events.find(e=>e.measurementId===measurement.id);
  assert.equal(measurement.orderId,'ORDER-1042');assert.equal(measurement.unit,'g');assert.equal(measurement.characteristic,'Net weight');assert.equal(measurement.specSnapshot.lsl,495);assert.equal(event.orderSnapshot.number,'PO-1042');
  assert.equal(store.commitImport(store.previewCsv(csv('scale-1'),'packing-scale')).duplicates,1);
  store.stream('net-weight').name='Renamed current characteristic';store.stream('net-weight').precision=3;
  assert.equal(measurement.characteristic,'Net weight');assert.equal(measurement.precision,1);assert.equal(event.precision,1);
  const later=new Date(Date.now()).toISOString(),freshText=csv('scale-2').replace(at,later),fresh=store.previewCsv(freshText,'packing-scale');assert.equal(fresh.valid,true);
  store.data.orders.push({...order,id:'ORDER-AMBIGUOUS'});assert.equal(store.previewCsv(freshText,'packing-scale').valid,false);assert.throws(()=>store.commitImport(fresh),/Data changed/);
  store.data.orders.pop();const oldId=order.id;order.id='ORDER-REPLACED';assert.throws(()=>store.commitImport(fresh),/mapping changed/);order.id=oldId;
});

test('an active customer inspection retains unit, label and precision when live definitions change',()=>{
  const {store}=setup(),session=store.startOrderSession('ORDER-1042'),stream=store.stream('net-weight');
  stream.name='Changed label';stream.unit='kg';stream.precision=3;
  const [measurement]=store.saveSessionEntries(session.id,[{index:0,value:'493'}]);
  assert.equal(measurement.name,'Net weight');assert.equal(measurement.characteristic,'Net weight');assert.equal(measurement.unit,'g');assert.equal(measurement.precision,1);assert.equal(measurement.specSnapshot.unit,'g');
  const event=store.data.events.find(e=>e.measurementId===measurement.id);assert.equal(event.unit,'g');assert.equal(event.characteristic,'Net weight');
});
