import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../XigmaticSPC.Frontend/wwwroot/scripts/demo-store.mjs';
import {createDashboardStore,WIDGET_CATALOG} from '../XigmaticSPC.Frontend/wwwroot/scripts/dashboard-store.mjs';
const memory=()=>{let saved;return {getItem:()=>saved,setItem:(_,value)=>saved=value};};
function setup(){const storage=memory(),store=createStore(storage);return {storage,store,layouts:createDashboardStore(store)};}

test('dashboard initialization migrates existing demo data without replacing measurements or investigations',()=>{
  const {store,layouts}=setup(),before=JSON.stringify({measurements:store.data.measurements,events:store.data.events});
  assert.equal(layouts.active.name,'Production focus');assert.equal(layouts.active.sections.length,3);
  assert.equal(layouts.active.sections[1].widgets[0].title,'Outer diameter · CNC-01');
  assert.equal(layouts.active.sections[1].widgets[0].streamId,'diameter');
  assert.equal(JSON.stringify({measurements:store.data.measurements,events:store.data.events}),before);
});

test('production dashboards and new stream widgets use the scenario default instead of the industrial stream',()=>{
  const {storage,store,layouts}=setup();
  store.data.streams=[{id:'seal-width',name:'Seal width',station:'PACK-01'},{id:'net-weight',name:'Net weight',station:'PACK-01'}];
  store.data.defaultStreamId='net-weight';
  const trend=layouts.active.sections[1].widgets[0];
  assert.equal(trend.streamId,'net-weight');assert.equal(trend.title,'Net weight · PACK-01');
  const another=layouts.create({name:'Packing line',starter:'production'});
  assert.equal(another.sections[1].widgets[0].streamId,'net-weight');
  const target=another.sections[0];
  for(const type of ['trend','measurements','baseline'])assert.equal(layouts.addWidget(target.id,{type}).streamId,'net-weight');
  for(const type of ['metric','events','stations','inspections','note'])assert.equal(layouts.addWidget(target.id,{type}).streamId,undefined);
  const restored=createDashboardStore(createStore(storage));
  assert.equal(restored.active.sections[1].widgets[0].title,'Net weight · PACK-01');
  assert.equal(restored.defaultStream.id,'net-weight');
});

test('scenario replacement resets dashboards independently and falls back to the first available stream',()=>{
  const {store,layouts}=setup(),old=layouts.active;
  layouts.rename({name:'Previous machining board'});
  const measurements=JSON.stringify(store.data.measurements);
  store.data.streams=[{id:'pack-weight',name:'Packed weight',station:'PACK-02'}];
  store.data.defaultStreamId='removed-stream';
  delete store.data.dashboardWorkspace;
  const next=layouts.active;
  assert.notEqual(next.id,old.id);assert.equal(next.name,'Production focus');
  assert.equal(next.sections[1].widgets[0].streamId,'pack-weight');
  assert.equal(next.sections[1].widgets[0].title,'Packed weight · PACK-02');
  assert.equal(layouts.canUndo,false);
  assert.equal(JSON.stringify(store.data.measurements),measurements);
});
test('moving a widget between sections retains identity, settings and exactly one membership',()=>{
  const {layouts}=setup(),[source,target]=layouts.active.sections,item=source.widgets[0],before=target.widgets[0];
  const original=structuredClone(item);layouts.moveWidget(item.id,target.id,before.id);
  assert.equal(source.widgets.some(w=>w.id===item.id),false);assert.equal(target.widgets[0].id,item.id);
  assert.deepEqual(target.widgets[0],original);assert.equal(layouts.active.sections.flatMap(s=>s.widgets).filter(w=>w.id===item.id).length,1);
  const snapshot=JSON.stringify(layouts.active);assert.throws(()=>layouts.moveWidget(item.id,source.id,'missing-target'));
  assert.equal(JSON.stringify(layouts.active),snapshot);
});
test('section ordering, collapse state and widget sizes survive browser reload',()=>{
  const {storage,store,layouts}=setup(),[a,b]=layouts.active.sections,w=a.widgets[0];
  layouts.moveSection(b.id,a.id);layouts.toggleSection(b.id);layouts.toggleWidget(w.id);
  layouts.updateWidget(w.id,a.id,{title:'My metric',size:'full',metric:'events',station:'CNC-01'});
  const restored=createDashboardStore(createStore(storage));
  assert.equal(restored.active.sections[0].id,b.id);assert.equal(restored.active.sections[0].collapsed,true);
  assert.equal(restored.findWidget(w.id).widget.collapsed,true);assert.equal(restored.findWidget(w.id).widget.size,'full');
  assert.equal(restored.findWidget(w.id).widget.station,'CNC-01');assert.equal(store.data.measurements.length,350);
});
test('independent dashboards support blank, production and deep-copy starters',()=>{
  const {layouts}=setup(),original=layouts.active,originalWidget=original.sections[0].widgets[0];
  const copy=layouts.create({name:'Machining cell',starter:'copy'});
  assert.notEqual(copy.sections[0].id,original.sections[0].id);assert.notEqual(copy.sections[0].widgets[0].id,originalWidget.id);
  layouts.removeWidget(copy.sections[0].widgets[0].id);assert.equal(original.sections[0].widgets.length,4);
  const blank=layouts.create({name:'My blank board',starter:'blank'});assert.equal(blank.sections[0].widgets.length,0);
  const production=layouts.create({name:'Another production board',starter:'production'});assert.equal(production.sections[0].widgets.length,4);
  layouts.select(original.id);assert.equal(layouts.active.id,original.id);
});
test('undo restores removed widgets, sections and entire dashboards with their active selection',()=>{
  const {layouts}=setup(),board=layouts.create({name:'Review board',starter:'copy'}),section=board.sections[0],widget=section.widgets[0];
  layouts.removeWidget(widget.id);layouts.undo();assert.equal(layouts.findWidget(widget.id).section.id,section.id);
  layouts.removeSection(section.id);layouts.undo();assert.equal(layouts.getSection(section.id).widgets.length,4);
  layouts.removeBoard();assert.notEqual(layouts.active.id,board.id);layouts.undo();assert.equal(layouts.active.id,board.id);
});
test('all widget types validate settings, and viewers cannot edit dashboard definitions',()=>{
  const {store,layouts}=setup(),section=layouts.active.sections[0];
  for(const entry of WIDGET_CATALOG)assert.equal(layouts.addWidget(section.id,{type:entry.type,title:entry.title}).type,entry.type);
  const count=section.widgets.length;assert.throws(()=>layouts.addWidget(section.id,{type:'trend',streamId:'unknown'}));assert.equal(section.widgets.length,count);
  assert.throws(()=>layouts.updateSection(section.id,{title:'Invalid',columns:7}));
  store.setRole('Viewer');assert.throws(()=>layouts.removeSection(section.id),/Switch/);assert.throws(()=>layouts.create({name:'Forbidden',starter:'blank'}),/Switch/);
  layouts.toggleSection(section.id);assert.equal(section.collapsed,true);
});
