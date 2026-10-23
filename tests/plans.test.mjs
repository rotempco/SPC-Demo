import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../XigmaticSPC.Frontend/wwwroot/scripts/demo-store.mjs';
const memory=()=>{let value;return {getItem:()=>value,setItem:(_,v)=>value=v};};
const definition={name:'First-off shaft inspection',station:'CNC-01',steps:['runout','diameter'],reason:'First part after a tool change'};

test('new plans persist, retain selected order and run with pinned definitions',()=>{
  const storage=memory(),s=createStore(storage),count=s.data.plans.length;
  const plan=s.createPlan({...definition,name:'  First-off shaft inspection  '});
  assert.equal(s.data.plans.length,count+1);assert.equal(plan.id,'PLAN-7');assert.equal(plan.name,definition.name);
  assert.equal(plan.revision,1);assert.equal(plan.status,'Published');assert.equal(plan.product,'Precision shaft');assert.equal(plan.publishedBy,s.actor());
  assert.deepEqual(plan.steps,definition.steps);assert.equal(s.data.audit[0].action,'Inspection plan created');
  assert.equal(createStore(storage).data.plans[0].id,plan.id);
  const session=s.startSession(plan.id,'FIRST-OFF');assert.deepEqual(session.steps,definition.steps);assert.equal(session.planRevision,1);
  assert.equal(session.definitions.diameter.charRev,'DIAMETER-R1');
  s.publishPlan(plan.id,{name:plan.name,steps:['length']},'Reduced check after review');
  assert.deepEqual(plan.steps,['length']);assert.deepEqual(session.steps,definition.steps);assert.equal(session.planRevision,1);
});
test('invalid plan definitions and duplicate names cause no partial writes',()=>{
  const s=createStore(memory());
  for(const changes of [{name:' '},{reason:' '},{station:'UNKNOWN'},{steps:[]},{steps:['diameter','diameter']},{steps:['width']},{steps:['missing']},{steps:null}]){
    const before=JSON.stringify(s.data);assert.throws(()=>s.createPlan({...definition,...changes}));assert.equal(JSON.stringify(s.data),before);
  }
  const plan=s.createPlan(definition);const before=JSON.stringify(s.data);
  assert.throws(()=>s.createPlan({...definition,name:'  FIRST-OFF SHAFT INSPECTION '}),/already exists/);assert.equal(JSON.stringify(s.data),before);
  definition.steps.push('length');assert.deepEqual(plan.steps,['runout','diameter']);definition.steps.pop();
  const next=s.createPlan({...definition,name:'Second check'});assert.notEqual(next.id,plan.id);
});
test('only quality engineers publish new plans and inactive characteristics cannot be selected',()=>{
  const s=createStore(memory());
  for(const role of ['Operator','Viewer']){s.setRole(role);const before=JSON.stringify(s.data);assert.throws(()=>s.createPlan(definition),/Quality engineer/);assert.equal(JSON.stringify(s.data),before);}
  s.setRole('Quality engineer');s.stream('runout').active=false;
  assert.throws(()=>s.createPlan(definition),/characteristic/);
});
