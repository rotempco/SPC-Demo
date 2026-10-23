import {test} from 'node:test';
import assert from 'node:assert/strict';
import {numeric,baseline,evaluate} from '../XigmaticSPC.Frontend/wwwroot/scripts/statistics.mjs';
import {createStore,seed} from '../XigmaticSPC.Frontend/wwwroot/scripts/demo-store.mjs';
const memory=()=>{let value;return {getItem:()=>value,setItem:(_,v)=>value=v};};
test('numeric validation never coerces malformed, blank or nonfinite input to zero',()=>{
  for(const bad of ['', ' ', 'NaN','Infinity','1,25','12mm','0x10','1e309'])assert.throws(()=>numeric(bad));
  assert.equal(numeric('0'),0);assert.equal(numeric('-1.25'),-1.25);
});
test('I–MR constants and full-precision boundary policy follow the specification',()=>{
  const values=Array.from({length:25},(_,i)=>i%2?11:9),b=baseline(values);
  assert.equal(b.count,25);assert.equal(b.mr,2);assert.equal(b.sigma,2/1.128);assert.equal(b.mrUcl,3.267*2);
  const spec={lsl:0,usl:20};assert.equal(evaluate(b.ucl,null,spec,b).ooc,false);
  assert.equal(evaluate(b.ucl+1e-10,null,spec,b).ooc,true);
  assert.equal(evaluate(20,null,spec,b).oos,false);assert.equal(evaluate(20.00000001,null,spec,b).oos,true);
  assert.equal(evaluate(10,9,spec,b,false).mr,null);
});
test('invalid baseline retains specification evaluation and no invented statistical pass',()=>{
  assert.equal(baseline(Array(24).fill(10)).valid,false);assert.equal(baseline(Array(25).fill(10)).valid,false);
  const result=evaluate(21,null,{lsl:0,usl:20},null);assert.equal(result.oos,true);assert.equal(result.ooc,null);assert.equal(result.mr,null);
});
test('seed separates in-spec statistical signals and unresolved events',()=>{
  const s=seed();const latest=s.measurements.filter(m=>m.streamId==='diameter').at(-1);
  assert.equal(latest.oos,false);assert.equal(latest.ooc,true);assert.ok(s.events.some(e=>e.oos));assert.equal(s.streams.find(s=>s.id==='torque').limits.valid,false);
});
test('measurement submission is idempotent and rejects conflicting retries',()=>{
  const s=createStore(memory());const a=s.record('diameter','25.001',{submissionId:'one'});const b=s.record('diameter','25.001',{submissionId:'one'});assert.equal(a.id,b.id);assert.throws(()=>s.record('diameter','25.002',{submissionId:'one'}));
});
test('session progress survives reload, pins its plan and blocks completion until response',()=>{
  const storage=memory(),s=createStore(storage),ses=s.startSession('PLAN-1','B-TEST');
  const m=s.saveStep(ses.id,25.08,'test-save');assert.equal(m.oos,true);assert.throws(()=>s.advance(ses.id),/required cause/);
  const e=s.data.events.find(e=>e.measurementId===m.id);s.respond(e.id,{cause:'Tool wear',action:'Replace insert',notes:'Part isolated.'});
  s.publishPlan('PLAN-1',{name:'Revised plan'},'Updated instruction title');assert.equal(ses.planRevision,1);
  s.advance(ses.id);assert.equal(ses.index,1);assert.equal(createStore(storage).data.sessions[0].index,1);
  assert.equal(s.data.events.find(x=>x.id===e.id).status,'Acknowledged');
});
test('good readings never close prior events and operator cannot approve quality settings',()=>{
  const s=createStore(memory()),count=s.data.events.filter(e=>e.status!=='Closed').length;
  s.record('diameter','25.000');assert.ok(s.data.events.filter(e=>e.status!=='Closed').length>=count);
  s.setRole('Operator');assert.throws(()=>s.approve('diameter','test'),/Quality engineer/);s.setRole('Viewer');assert.throws(()=>s.record('width',10),/Switch/);
});
const csv=(id,value,at)=>`source_record_id;workstation_code;product_revision;characteristic_revision;batch_code;measured_at;value;unit\n${id};PRESS-01;BRACKET-A-R1;WIDTH-R1;B20261022;${at};${value};mm`;
test('CSV import validates before commit, deduplicates replay and rejects source conflicts',()=>{
  const s=createStore(memory()),at=new Date(Date.now()-1000).toISOString(),text=csv('fixture-1','10.012',at),preview=s.previewCsv(text);
  assert.equal(preview.valid,true);assert.equal(s.commitImport(preview).inserted,1);assert.equal(s.commitImport(s.previewCsv(text)).duplicates,1);
  assert.equal(s.previewCsv(csv('fixture-1','10.013',at)).valid,false);
  const count=s.data.measurements.length;assert.equal(s.previewCsv(csv('bad','abc',at)).valid,false);assert.equal(s.data.measurements.length,count);
});
test('late CSV rows and stale previews cannot commit',()=>{
  const s=createStore(memory());assert.equal(s.previewCsv(csv('old','10.012','2026-10-22T07:15:00Z')).valid,false);
  const preview=s.previewCsv(csv('new','10.012',new Date(Date.now()-1000).toISOString()));s.record('width','10.011');assert.throws(()=>s.commitImport(preview),/Data changed/);
});
test('correction preserves revision and invalidates a reference baseline; approval creates a frozen version',()=>{
  const s=createStore(memory()),m=s.history('diameter')[0],old=m.value;
  s.correct(m.id,25.002,'Transcription correction');assert.equal(m.revision,2);assert.equal(m.revisions[0].value,old);assert.equal(s.stream('diameter').limits.valid,false);
  assert.equal(s.record('diameter','25').ooc,null);const b=s.approve('diameter','Reference set reviewed');const ucl=b.ucl;s.record('diameter','25.04');assert.equal(s.stream('diameter').limits.ucl,ucl);assert.equal(b.members.length,25);
});
test('configuration publications pin running sessions and preserve historical specification limits',()=>{
  const s=createStore(memory()),ses=s.startSession('PLAN-1','CONFIG-TEST'),before=s.stream('diameter').limits.ucl;
  s.configureStream('diameter',{lsl:24.999,target:25,usl:25.001,instruction:'Use the revised drawing.'},'New drawing tolerance');
  assert.equal(s.stream('diameter').charRev,'DIAMETER-R2');assert.equal(s.stream('diameter').limits.ucl,before);
  const pinned=s.saveStep(ses.id,25.01,'pinned');assert.equal(pinned.oos,false);assert.equal(pinned.charRev,'DIAMETER-R1');
  const current=s.record('diameter',25.01);assert.equal(current.oos,true);assert.equal(current.charRev,'DIAMETER-R2');
  s.publishPlan('PLAN-1',{name:'Reordered plan',steps:['runout','length','diameter']},'Operator sequence review');
  assert.deepEqual(ses.steps,['diameter','length','runout']);assert.equal(ses.planName,'Precision shaft · production inspection');
  assert.throws(()=>s.configureStream('diameter',{lsl:26,target:25,usl:24,instruction:'Invalid'},'Invalid limit test'));
});
