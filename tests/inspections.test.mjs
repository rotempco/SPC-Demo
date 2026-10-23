import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../XigmaticSPC.Frontend/wwwroot/scripts/demo-store.mjs';
import {previewReading,inspectionProgress,inspectionStatus} from '../XigmaticSPC.Frontend/wwwroot/scripts/inspection-preview.mjs';
const memory=()=>{let value;return {getItem:()=>value,setItem:(_,v)=>value=v};};

test('compact status reserves the green in-control check for evaluated passes and prioritizes specification failures',()=>{
  const s=createStore(memory()),d=s.stream('diameter');
  const good=inspectionStatus(previewReading('25.001',d,d.limits,{value:25,segment:d.segment}));assert.equal(good.statusLabel,'In control');assert.equal(good.statusIcon,'check_box');assert.equal(good.statusTone,'green');
  const signal=inspectionStatus(previewReading('25.03',d,d.limits,null));assert.equal(signal.statusLabel,'Signal');assert.equal(signal.statusTone,'amber');
  assert.equal(inspectionStatus(previewReading('25.001',d,d.limits,{value:25.08,segment:d.segment})).statusLabel,'Signal');
  const out=previewReading('25.08',d,d.limits,null);assert.equal(out.oos,true);assert.equal(out.ooc,true);assert.equal(inspectionStatus(out).statusLabel,'Out of bounds');assert.equal(inspectionStatus(out).statusTone,'red');
  const missing=inspectionStatus(previewReading('25.001',d,null,null));assert.equal(missing.statusLabel,'Within spec');assert.equal(missing.statusTone,'neutral');
  assert.equal(inspectionStatus(previewReading('',d,d.limits,null)).hideStatus,true);
  assert.equal(inspectionStatus(previewReading('bad',d,d.limits,null)).statusLabel,'Invalid number');
});

test('live preview distinguishes specification, statistical and invalid states without recording anything',()=>{
  const s=createStore(memory()),definition=s.stream('diameter'),before=JSON.stringify(s.data);
  const high=previewReading('25.08',definition,definition.limits,null);
  assert.equal(high.oos,true);assert.equal(high.ooc,true);assert.match(high.message,/above the upper specification/);
  const signal=previewReading('25.03',definition,definition.limits,null);assert.equal(signal.oos,false);assert.equal(signal.ooc,true);
  assert.equal(previewReading('25.05',definition,null,null).oos,false);
  assert.equal(previewReading('24.95',definition,null,null).oos,false);
  assert.equal(previewReading('25.05000001',definition,null,null).oos,true);
  assert.equal(previewReading('',definition,null,null).state,'empty');assert.equal(previewReading('banana',definition,null,null).state,'invalid');
  assert.equal(previewReading('25.00',definition,null,null).ooc,null);
  assert.equal(JSON.stringify(s.data),before);
});
test('filled progress includes valid out-of-bounds drafts, excludes invalid fields and distinguishes saved readings',()=>{
  const s=createStore(memory()),d=s.stream('diameter');
  const rows=[{saved:false,preview:previewReading('25.08',d,d.limits,null)},{saved:false,preview:previewReading('abc',d,d.limits,null)},{saved:false,preview:previewReading('',d,d.limits,null)},{saved:true,responseRequired:true,preview:{valid:true}}];
  const progress=inspectionProgress(rows);assert.equal(progress.filled,2);assert.equal(progress.saved,1);assert.equal(progress.invalid,1);assert.equal(progress.pending,1);assert.equal(progress.canSave,false);assert.equal(progress.canComplete,false);
  assert.equal(previewReading('0',{lsl:0,usl:1,unit:'mm'},null,null).valid,true);
});
test('multiple drafts survive reload and characteristics can be saved out of order without holes counting as saved',()=>{
  const storage=memory(),s=createStore(storage),session=s.startSession('PLAN-1','MULTI-TEST');
  s.setSessionDraft(session.id,0,'25.015');s.setSessionDraft(session.id,1,'80.005');s.setSessionDraft(session.id,2,'0.021');
  assert.equal(createStore(storage).data.sessions[0].drafts[1],'80.005');
  const before=s.data.measurements.length;s.saveSessionEntries(session.id,[{index:2,value:'0.021'}]);
  assert.equal(session.results.filter(Boolean).length,1);assert.equal(s.data.measurements.length,before+1);assert.throws(()=>s.completeSession(session.id),/every characteristic/);
  s.saveSessionEntries(session.id,[{index:1,value:'80.005'},{index:0,value:'25.015'}]);
  assert.equal(session.results.filter(Boolean).length,3);assert.deepEqual(session.drafts,{});
  const after=s.data.measurements.length;s.saveSessionEntries(session.id,[{index:0,value:'25.015'},{index:1,value:'80.005'}]);assert.equal(s.data.measurements.length,after);
  assert.equal(s.completeSession(session.id).status,'Completed');
});
test('multi-field save validates all numeric entries before writing while valid warning readings remain saveable',()=>{
  const s=createStore(memory()),session=s.startSession('PLAN-1','VALIDATION-TEST'),before=s.data.measurements.length;
  assert.throws(()=>s.saveSessionEntries(session.id,[{index:0,value:'25.08'},{index:1,value:'invalid'}]));assert.equal(s.data.measurements.length,before);assert.equal(session.results.filter(Boolean).length,0);
  const saved=s.saveSessionEntries(session.id,[{index:0,value:'25.08'},{index:1,value:'80.005'},{index:2,value:'0.021'}]);assert.equal(saved[0].oos,true);assert.equal(s.data.measurements.length,before+3);
  assert.throws(()=>s.completeSession(session.id),/required cause/);
  for(const e of s.data.events.filter(e=>session.results.includes(e.measurementId)))s.respond(e.id,{cause:'Setup verification',action:'Part isolated and gage checked',notes:'Response recorded during demo review.'});
  assert.equal(s.completeSession(session.id).status,'Completed');
});
test('multi-field saves respect pinned definitions, immutable saved readings and viewer restrictions',()=>{
  const s=createStore(memory()),session=s.startSession('PLAN-1','PINNED-TEST');
  s.configureStream('diameter',{lsl:24.999,target:25,usl:25.001,instruction:'Revised specification'},'Drawing change');
  const [m]=s.saveSessionEntries(session.id,[{index:0,value:'25.01'}]);assert.equal(m.oos,false);assert.equal(m.charRev,'DIAMETER-R1');
  assert.throws(()=>s.saveSessionEntries(session.id,[{index:0,value:'25.02'}]),/already saved/);
  s.setRole('Viewer');assert.throws(()=>s.setSessionDraft(session.id,1,'80'),/Switch/);assert.throws(()=>s.saveSessionEntries(session.id,[{index:1,value:'80'}]),/Switch/);
});
test('guided navigation skips already recorded fields and completes only after all fields and responses are satisfied',()=>{
  const s=createStore(memory()),session=s.startSession('PLAN-1','GUIDED-TEST');
  s.saveSessionEntries(session.id,[{index:0,value:'25.015'},{index:2,value:'0.021'}]);s.advance(session.id);assert.equal(session.index,1);
  s.saveStep(session.id,'80.005');s.advance(session.id);assert.equal(session.status,'Completed');assert.equal(session.results.filter(Boolean).length,3);
});
