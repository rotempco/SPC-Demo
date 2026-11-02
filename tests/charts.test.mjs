import {test} from 'node:test';
import assert from 'node:assert/strict';
import {controlChart} from '../XigmaticSPC.Frontend/wwwroot/scripts/charts.mjs';

const stream={station:'CNC-01',name:'Outer diameter',precision:3,unit:'mm',lsl:24.98,usl:25.02,
  limits:{valid:true,lcl:24.99,mean:25,ucl:25.01,mr:0.005,mrUcl:0.02}};
const rows=[25,25.001,26.6].map((value,id)=>({id,value,mr:id?1.6:0,measuredAt:'2026-11-02T08:00:00Z'}));
const labels=svg=>[...svg.matchAll(/<text class="chart-label" x="([^"]+)" y="([^"]+)"[^>]*>([^<]+)<\/text>/g)]
  .map(([,x,y,text])=>({x:Number(x),y:Number(y),text}));

test('outliers do not cause control or specification labels to overlap or leave the plot',()=>{
  for(const width of [520,840,1100])for(const mr of [false,true]){
    const svg=controlChart(rows,stream,{width,height:260,specs:true,mr});
    const entries=labels(svg);
    assert.equal(entries.length,mr?3:5);
    for(const [i,label] of entries.entries()){
      assert.ok(label.y>=31&&label.y<=209);
      assert.ok(label.x<width);
      if(i)assert.ok(label.y-entries[i-1].y>=20);
    }
    assert.match(svg,/class="chart-label-connector"/);
    const ucl=svg.match(/<line class="limit-line"[^>]*y1="([^"]+)"/);
    const value=mr?stream.limits.mrUcl:stream.limits.ucl;
    const min=mr?-.32:24.656,max=mr?1.92:26.924;
    assert.ok(Math.abs(Number(ucl[1])-(24+(max-value)/(max-min)*192))<1e-8);
    assert.ok(entries.some(label=>label.text===`UCL ${value.toFixed(3)}`));
  }
});

test('well separated reference labels remain aligned to their reference lines',()=>{
  const svg=controlChart(rows.slice(0,2),{...stream,limits:{...stream.limits,lcl:24,mean:25,ucl:26}});
  assert.equal(labels(svg).length,3);
  assert.doesNotMatch(svg,/class="chart-label-connector"/);
});
