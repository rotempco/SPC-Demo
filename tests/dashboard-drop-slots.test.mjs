import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dashboardDropSlots} from '../XigmaticSPC.Frontend/wwwroot/scripts/dashboard-drop-slots.mjs';
import {createStore} from '../XigmaticSPC.Frontend/wwwroot/scripts/demo-store.mjs';
import {createDashboardStore} from '../XigmaticSPC.Frontend/wwwroot/scripts/dashboard-store.mjs';
const setup=()=>{const store=createStore({getItem:()=>null,setItem:()=>{}});return createDashboardStore(store);};

test('every widget slot maps to its final visible position, forwards, backwards and across sections',()=>{
  const sources=setup().active.sections.flatMap(s=>s.widgets.map((_,index)=>({sectionTitle:s.title,index})));
  for(const entry of sources){
    const layouts=setup(),sections=layouts.active.sections,origin=sections.find(s=>s.title===entry.sectionTitle),source=origin.widgets[entry.index],before=JSON.stringify(layouts.active);
    const slots=dashboardDropSlots(sections,{kind:'widget',id:source.id});
    assert.equal(JSON.stringify(layouts.active),before);assert.equal(new Set(slots.map(s=>s.key)).size,slots.length);
    assert.ok(slots.every(s=>s.beforeId!==source.id));assert.equal(slots.filter(s=>s.current).length,1);
    assert.equal(slots.length,sections.reduce((n,s)=>n+s.widgets.length,0)+sections.length-1);
    for(const slot of slots){
      const destination=layouts.getSection(slot.sectionId);
      if(slot.anchor==='widget')assert.equal(slot.anchorId,destination.widgets[slot.index].id);
      assert.equal(slot.current,slot.sectionId===origin.id&&slot.index===entry.index);
      const state=JSON.stringify(layouts.active);layouts.moveWidget(source.id,slot.sectionId,slot.beforeId);
      assert.equal(layouts.findWidget(source.id).section.id,slot.sectionId);assert.equal(layouts.findWidget(source.id).section.widgets[slot.index].id,source.id);
      layouts.undo();assert.equal(JSON.stringify(layouts.active),state);
    }
  }
});

test('dragging the first widget onto the second visible slot puts it second',()=>{
  const layouts=setup(),section=layouts.active.sections[0],ids=section.widgets.map(w=>w.id),source=section.widgets[0];
  const slot=dashboardDropSlots(layouts.active.sections,{kind:'widget',id:source.id}).find(s=>s.sectionId===section.id&&s.index===1);
  assert.equal(slot.anchorId,ids[1]);assert.equal(slot.current,false);
  layouts.moveWidget(source.id,slot.sectionId,slot.beforeId);
  assert.deepEqual(layouts.getSection(section.id).widgets.map(w=>w.id),[ids[1],ids[0],...ids.slice(2)]);
});
test('empty and collapsed destinations expose explicit append slots without changing collapse state',()=>{
  const layouts=setup(),source=layouts.active.sections[0].widgets[0],empty=layouts.addSection({title:'Empty',columns:2}),collapsed=layouts.active.sections[1];
  layouts.toggleSection(collapsed.id);const slots=dashboardDropSlots(layouts.active.sections,{kind:'widget',id:source.id});
  assert.equal(slots.find(s=>s.sectionId===empty.id).anchor,'empty');
  const target=slots.filter(s=>s.sectionId===collapsed.id);assert.equal(target.length,1);assert.equal(target[0].anchor,'collapsed');assert.equal(target[0].beforeId,null);assert.equal(collapsed.collapsed,true);
});
test('section slots correspond to every visible header, including the original position and end',()=>{
  const layouts=setup(),sections=layouts.active.sections,source=sections[1],before=JSON.stringify(layouts.active);
  const slots=dashboardDropSlots(sections,{kind:'section',id:source.id});assert.equal(slots.length,sections.length);assert.equal(slots.filter(s=>s.current).length,1);assert.ok(slots.some(s=>s.beforeId===null));
  slots.forEach((slot,index)=>assert.equal(slot.anchorId,sections[index].id));
  for(const slot of slots){layouts.moveSection(source.id,slot.beforeId);assert.equal(layouts.active.sections[slot.index].id,source.id);layouts.undo();assert.equal(JSON.stringify(layouts.active),before);}
  assert.throws(()=>dashboardDropSlots(sections,{kind:'widget',id:'missing'}),/Unknown/);
});
