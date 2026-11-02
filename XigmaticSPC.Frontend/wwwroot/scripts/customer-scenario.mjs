import {baseline,evaluate} from './statistics.mjs';

const wave=[0,.4,-.5,.2,.65,-.3,.1,-.6,.25,.5,-.2,.15,-.4,.6,-.1,.35,-.55,.2,.45,-.3,.15,-.5,.55,-.15,.25];

// These are illustrative quality measurements, not customer specifications,
// legal weight tolerances, or food-safety release criteria.
export function seedCustomerScenario(now=new Date()) {
  const current=new Date(now),stamp=current.toISOString(),day=stamp.slice(0,10).replaceAll('-','');
  const data={version:1,scenario:'customer',defaultStreamId:'net-weight',workspace:{name:'Nordic Foods',site:'Demo production site',synthetic:true},role:'Quality engineer',measurements:[],events:[],sessions:[],imports:[],audit:[],plans:[],streams:[],orders:[],lastRefresh:stamp};
  const planId='CUSTOMER-PLAN-1',product='Chicken strips · 500 g',productCode='CHICKEN-500',productRev='CHICKEN-500-R1',station='PACK-01';
  for(const [number,suffix,quantity] of [[1042,'01',2400],[1043,'02',1800]]) {
    data.orders.push({id:`ORDER-${number}`,number:`PO-${number}`,planId,station,product,productCode,productRev,batch:`B${day}-${suffix}`,quantity,status:'Released',source:'Synthetic order · M3 integration not connected'});
  }
  const definitions=[
    {id:'net-weight',name:'Net weight',charRev:'WEIGHT-R1',unit:'g',target:500,lsl:495,usl:505,spread:1.1,precision:1,instruction:'Tare the scale with an empty pack, weigh the filled pack and record the net weight. Demo limits are illustrative.'},
    {id:'seal-width',name:'Seal width',charRev:'SEAL-R1',unit:'mm',target:4,lsl:3.5,usl:4.5,spread:.16,precision:2,instruction:'Measure the seal width at the marked inspection point using the approved measuring method.'},
    {id:'label-position',name:'Label position',charRev:'LABEL-R1',unit:'mm',target:10,lsl:8,usl:12,spread:.35,precision:2,instruction:'Measure the distance from the marked pack edge to the label edge.'}
  ];
  for(const [index,definition] of definitions.entries()) {
    const reference=wave.map(value=>definition.target+value*definition.spread);
    const limits={...baseline(reference),id:`CUSTOMER-BL-${index+1}-R1`,revision:1,approvedBy:'M. Sørensen',approvedAt:new Date(current.getTime()-65*60000).toISOString(),reason:'Synthetic stable reference set for customer walkthrough'};
    const stream={...definition,station,product,productCode,productRev,process:'Packing and quality inspection',machine:'Packaging line',batch:data.orders[0].batch,segment:'PACK-SEG-01',specRev:'SPEC-01',classification:'CTQ',active:true,limits};
    data.streams.push(stream);
    const recent=wave.slice(0,5).map(value=>definition.target+value*definition.spread);
    for(const [i,value] of [...reference,...recent].entries()) {
      const isReference=i<25,at=new Date(current.getTime()-(isReference?60-i:30-i)*60000).toISOString();
      const prior=data.measurements.filter(m=>m.streamId===stream.id).at(-1);
      data.measurements.push({id:`CUSTOMER-M-${stream.id}-${i+1}`,streamId:stream.id,station,product,productCode,characteristic:stream.name,name:stream.name,unit:stream.unit,precision:stream.precision,value,measuredAt:at,recordedAt:at,source:isReference?'Reference run':'Synthetic prior run',operator:isReference?'M. Sørensen':'Anna Jensen',batch:isReference?`REFERENCE-${day}`:`PRIOR-${day}`,segment:stream.segment,revision:1,productRev,charRev:stream.charRev,specRev:stream.specRev,specSnapshot:{lsl:stream.lsl,usl:stream.usl,target:stream.target,unit:stream.unit},baselineId:limits.id,...evaluate(value,prior?.value,stream,limits,true)});
    }
    limits.members=data.measurements.filter(m=>m.streamId===stream.id&&m.source==='Reference run').map(m=>({id:m.id,revision:m.revision}));
  }
  data.plans.push({id:planId,name:'Packed chicken · production inspection',station,product,productCode,productRev,revision:1,status:'Published',steps:definitions.map(d=>d.id),reason:'Synthetic customer walkthrough',publishedBy:'M. Sørensen',publishedAt:new Date(current.getTime()-65*60000).toISOString(),revisions:[]});
  data.audit.push({id:'CUSTOMER-A-seed',at:stamp,actor:'System',action:'Customer demonstration prepared',detail:'Synthetic orders and quality thresholds. No M3 connection or food-safety release decisions.'});
  return data;
}

export function customerOrderContext(order) {
  return {orderId:order.id,orderNumber:order.number,productCode:order.productCode,product:order.product,productRev:order.productRev,station:order.station,batch:order.batch,orderSnapshot:structuredClone(order)};
}
