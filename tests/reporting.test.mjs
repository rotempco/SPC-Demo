import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,buildEvidence,measurementsCsv,evidenceJson,csvCell} from '../XigmaticSPC.Frontend/wwwroot/scripts/reporting.mjs';
import {seedCustomerScenario,customerOrderContext} from '../XigmaticSPC.Frontend/wwwroot/scripts/customer-scenario.mjs';

const generatedAt='2026-10-30T14:00:00Z';
function fixture() {
  const order={id:'ORDER-A',number:'PO-1042',productCode:'CHICKEN-500',product:'Chicken strips',productRev:'PRODUCT-R1',batch:'BATCH-A',station:'PACK-01'};
  const measurement=(id,at,changes={})=>({id,streamId:'weight',orderId:order.id,orderSnapshot:structuredClone(order),orderNumber:order.number,productCode:order.productCode,product:order.product,productRev:'PRODUCT-R1',charRev:'WEIGHT-R1',specRev:'SPEC-1',specSnapshot:{lsl:495,target:500,usl:505},baselineId:'BASE-1',value:500,unit:'g',measuredAt:at,recordedAt:at,batch:order.batch,revision:1,operator:'Anna',source:'Manual',sessionId:'SESSION-A',planId:'PLAN-A',planRevision:1,oos:false,ooc:false,algorithm:'test-imr/1',...changes});
  return {
    workspace:{name:'Nordic Foods',synthetic:true},orders:[order,{...order,id:'ORDER-B',number:'PO-OTHER',batch:'SECRET-BATCH'}],
    streams:[{id:'weight',station:'PACK-01',name:'Net weight',unit:'g',product:'Changed product name',productRev:'PRODUCT-R2',charRev:'WEIGHT-R2',specRev:'SPEC-2',lsl:490,usl:510,limits:{id:'BASE-2',mean:501},baselineHistory:[{id:'BASE-1',mean:500,lcl:498,ucl:502,revision:1}]}],
    measurements:[
      measurement('M-1','2026-10-30T08:00:00Z',{value:493,oos:true,ooc:true,revisions:[{revision:1,value:492,reason:'Transcription correction'}]}),
      measurement('M-2','2026-10-30T09:00:00Z'),
      measurement('M-3','2026-10-30T10:00:00Z'),
      measurement('M-VOID','2026-10-30T09:30:00Z',{voided:true}),
      measurement('M-OTHER','2026-10-30T09:00:00Z',{orderId:'ORDER-B',orderSnapshot:{id:'ORDER-B'},batch:'SECRET-BATCH',sessionId:'SESSION-B'})
    ],
    events:[
      {id:'QE-1',orderId:'ORDER-A',measurementId:'M-1',verifiedMeasurementId:'M-2',at:'2026-10-30T08:00:00Z',status:'Closed',verification:'Repeat check passed',transitions:[{status:'Open',at:'2026-10-30T08:00:00Z'},{status:'Closed',at:'2026-10-30T09:05:00Z',response:{cause:'Filler setup',action:'Adjusted',verification:'Repeat check passed',verifiedMeasurementId:'M-2'}}]},
      {id:'QE-2',orderId:'ORDER-A',measurementId:'M-3',at:'2026-10-30T10:00:00Z',status:'Open',transitions:[]},
      {id:'QE-OLD',orderId:'ORDER-A',measurementId:'M-1',at:'2026-10-30T08:00:00Z',status:'Open',superseded:true},
      {id:'QE-OTHER',orderId:'ORDER-B',measurementId:'M-OTHER',at:'2026-10-30T09:00:00Z',status:'Open',notes:'SECRET EVENT'}
    ],
    sessions:[{id:'SESSION-A',orderId:'ORDER-A',orderSnapshot:structuredClone(order),planId:'PLAN-A',planName:'Packing checks',planRevision:1,steps:['weight'],definitions:{weight:{specRev:'SPEC-1',lsl:495,usl:505}},startedAt:'2026-10-30T07:59:00Z',completedAt:'2026-10-30T10:01:00Z',status:'Completed',results:['M-1','M-2','M-3']},{id:'SESSION-B',orderId:'ORDER-B',startedAt:'2026-10-30T08:00:00Z',status:'In progress',results:['M-OTHER']}],
    audit:[{id:'A-1',orderId:'ORDER-A',at:'2026-10-30T08:00:00Z',action:'Measurement recorded'},{id:'A-2',eventId:'QE-1',at:'2026-10-30T09:05:00Z',action:'Closed'},{id:'A-3',orderId:'ORDER-B',at:'2026-10-30T09:00:00Z',detail:'SECRET AUDIT'},{id:'A-GLOBAL',at:'2026-10-30T09:00:00Z',detail:'UNSCOPED GLOBAL ACTIVITY'}]
  };
}

test('all-time order report includes closed events and current-day records while excluding unrelated orders and voided rows',()=>{
  const data=fixture(),before=JSON.stringify(data);
  const report=buildReport(data,{orderId:'ORDER-A',generatedAt});
  assert.deepEqual(report.measurements.map(row=>row.id),['M-1','M-2','M-3']);
  assert.deepEqual(report.events.map(row=>row.id),['QE-1','QE-2']);
  assert.deepEqual(report.audit.map(row=>row.id),['A-1','A-2']);
  assert.equal(report.totals.closed,1);assert.equal(report.totals.unresolved,1);assert.equal(report.totals.completed,1);
  assert.equal(report.scope.generatedAt,'2026-10-30T14:00:00.000Z');
  assert.equal(JSON.stringify(data),before);
  report.measurements[0].specSnapshot.lsl=0;assert.equal(data.measurements[0].specSnapshot.lsl,495);
});

test('date selection is inclusive at from, exclusive at to and compares offset timestamps as instants',()=>{
  const data=fixture();
  const report=buildReport(data,{orderId:'ORDER-A',from:'2026-10-30T10:00:00+01:00',to:'2026-10-30T11:00:00+01:00',generatedAt});
  assert.deepEqual(report.measurements.map(row=>row.id),['M-2']);
  assert.deepEqual(report.events.map(row=>row.id),['QE-1']);
  assert.deepEqual(report.audit.map(row=>row.id),['A-2']);
  assert.throws(()=>buildReport(data,{from:'2026-10-30T10:00:00',generatedAt}),/timezone/);
  assert.throws(()=>buildReport(data,{from:'2026-10-30T10:00:00Z',to:'2026-10-30T09:00:00Z',generatedAt}),/earlier/);
  assert.throws(()=>buildReport(data,{orderId:'missing',generatedAt}),/Unknown/);
});

test('CSV preserves original evaluation, context and specification after live configuration changes',()=>{
  const data=fixture();data.measurements[0].measuredAt='2026-10-30T09:00:00+01:00';
  const report=buildReport(data,{orderId:'ORDER-A',generatedAt}),csv=measurementsCsv(report);
  const header=csv.slice(1).split('\r\n')[0].split(';').map(cell=>cell.slice(1,-1));
  const first=csv.split('\r\n')[1].split(';').map(cell=>cell.slice(1,-1));
  const row=Object.fromEntries(header.map((key,index)=>[key,first[index]]));
  assert.equal(row.production_order,'PO-1042');assert.equal(row.product_revision,'PRODUCT-R1');
  assert.equal(row.characteristic_revision,'WEIGHT-R1');assert.equal(row.specification_lsl,'495');assert.equal(row.baseline_id,'BASE-1');
  assert.equal(row.oos,'true');assert.equal(row.ooc,'true');assert.equal(row.session_id,'SESSION-A');
  assert.equal(row.measured_at_utc,'2026-10-30T08:00:00.000Z');
  assert.ok(!csv.includes('SECRET-BATCH'));assert.ok(!csv.includes('PRODUCT-R2'));
});

test('shared CSV escaping neutralizes formula injection even behind whitespace and preserves numeric values',()=>{
  assert.equal(csvCell('  =HYPERLINK("bad")'),'"\'  =HYPERLINK(""bad"")"');
  for(const value of ['+cmd',' -1+2','\t@SUM(A1)','\n=1','\uFEFF=1','@evil','\rtext','  \ttext'])assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell(-3.25),'"-3.25"');assert.equal(csvCell('a;b\nc'),'"a;b\nc"');assert.equal(csvCell('He said "yes"'),'"He said ""yes"""');
});

test('evidence retains revisions, closed response history, superseded events and original baseline, without another order',()=>{
  const evidence=buildEvidence(fixture(),{orderId:'ORDER-A',generatedAt});
  assert.equal(evidence.provenance.synthetic,true);assert.equal(evidence.provenance.productionValidated,false);
  assert.equal(evidence.measurements[0].revisions[0].reason,'Transcription correction');
  assert.equal(evidence.events[0].transitions[1].response.verification,'Repeat check passed');
  assert.equal(evidence.supersededEvents[0].id,'QE-OLD');assert.equal(evidence.voidedMeasurements[0].id,'M-VOID');
  assert.equal(evidence.references.baselines[0].id,'BASE-1');assert.equal(evidence.references.baselines[0].mean,500);
  assert.equal(evidence.references.configurations[0].specification.lsl,495);assert.equal(evidence.references.plans[0].definitions.weight.specRev,'SPEC-1');
  const json=evidenceJson(fixture(),{orderId:'ORDER-A',generatedAt});
  assert.ok(!json.includes('SECRET'));assert.ok(!json.includes('ORDER-B'));assert.ok(!json.includes('UNSCOPED GLOBAL'));
  assert.equal(json,evidenceJson(fixture(),{orderId:'ORDER-A',generatedAt}));
});

test('windowed evidence distinguishes selected measurements from supporting history and refuses cross-order references',()=>{
  const data=fixture();data.events[0].verifiedMeasurementId='M-OTHER';
  const evidence=buildEvidence(data,{orderId:'ORDER-A',from:'2026-10-30T09:00:00Z',to:'2026-10-30T10:00:00Z',generatedAt});
  assert.deepEqual(evidence.measurements.map(row=>row.id),['M-2']);
  assert.deepEqual(evidence.supportingMeasurements.map(row=>row.id),['M-1','M-3']);
  assert.ok(evidence.references.missing.some(row=>row.id==='M-OTHER'&&row.reason.includes('Outside')));
  assert.ok(!JSON.stringify(evidence).includes('SECRET-BATCH'));
});

test('missing original baseline is reported instead of substituting current limits',()=>{
  const data=fixture();data.streams[0].baselineHistory=[];
  const evidence=buildEvidence(data,{orderId:'ORDER-A',generatedAt});
  assert.deepEqual(evidence.references.baselines,[]);
  assert.ok(evidence.references.missing.some(row=>row.type==='baseline'&&row.id==='BASE-1'));
});

test('customer evidence includes the actual 25 baseline observations for each measured parameter without importing prior runs',()=>{
  const data=seedCustomerScenario(new Date(generatedAt)),order=data.orders[0];
  assert.equal(buildEvidence(data,{orderId:order.id,generatedAt}).supportingMeasurements.length,0);
  for (const stream of data.streams) {
    const template=data.measurements.find(row=>row.streamId===stream.id);
    data.measurements.push({...structuredClone(template),...customerOrderContext(order),id:`ORDER-READING-${stream.id}`,value:stream.target,source:'Manual',measuredAt:generatedAt,recordedAt:generatedAt});
  }
  const before=JSON.stringify(data),evidence=buildEvidence(data,{orderId:order.id,from:generatedAt,to:'2026-10-30T15:00:00Z',generatedAt});
  assert.equal(evidence.measurements.length,3);assert.equal(evidence.totals.measurements,3);
  assert.equal(evidence.supportingMeasurements.length,75);assert.equal(evidence.references.baselines.length,3);
  assert.ok(evidence.supportingMeasurements.every(row=>row.source==='Reference run'&&row.orderId===null));
  const exported=new Map(evidence.supportingMeasurements.map(row=>[row.id,row]));
  for(const baseline of evidence.references.baselines) {
    assert.equal(baseline.members.length,25);
    for(const member of baseline.members) {
      const original=data.measurements.find(row=>row.id===member.id),actual=exported.get(member.id);
      assert.equal(actual.value,original.value);assert.equal(actual.revision,member.revision);assert.equal(actual.streamId,baseline.streamId);
    }
  }
  assert.deepEqual(evidence.references.missing,[]);assert.equal(JSON.stringify(data),before);
});

test('baseline evidence rejects another order and reports missing members instead of leaking or silently dropping them',()=>{
  const data=fixture(),baseline=data.streams[0].baselineHistory[0];
  baseline.members=[{id:'M-1',revision:1},{id:'M-OTHER',revision:1},{id:'M-ABSENT',revision:1}];
  const evidence=buildEvidence(data,{orderId:'ORDER-A',generatedAt});
  assert.ok(!evidence.supportingMeasurements.some(row=>row.id==='M-OTHER'));
  assert.ok(!JSON.stringify(evidence).includes('SECRET-BATCH'));
  assert.ok(evidence.references.missing.some(row=>row.type==='baseline-member'&&row.id==='M-OTHER'&&row.reason.includes('Outside')));
  assert.ok(evidence.references.missing.some(row=>row.type==='baseline-member'&&row.id==='M-ABSENT'&&row.reason.includes('Not retained')));
  assert.equal(evidence.measurements.filter(row=>row.id==='M-1').length,1);
});
