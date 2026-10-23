import {test} from 'node:test';
import assert from 'node:assert/strict';
import {specificationGauge} from '../XigmaticSPC.Frontend/wwwroot/scripts/specification-gauge.mjs';
const spec={lsl:24.95,target:25,usl:25.05,unit:'mm',precision:3};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('gauge centers target, leaves leeway beyond both limits and places equality exactly at the limit',()=>{
  const center=specificationGauge('25',spec);near(center.gaugePosition,50);near(center.gaugeLow,100/7);near(center.gaugeHigh,600/7);
  near(specificationGauge('24.95',spec).gaugePosition,center.gaugeLow);near(specificationGauge('25.05',spec).gaugePosition,center.gaugeHigh);
  assert.equal(center.gaugeValue,'25.000');assert.equal(center.gaugeHidden,false);
  const high=specificationGauge('25.06',spec);assert.ok(high.gaugePosition>high.gaugeHigh&&high.gaugePosition<100);assert.equal(high.gaugeOverflow,'');
});
test('far-out readings clamp the marker with a directional indication while retaining the actual value',()=>{
  const high=specificationGauge('26',spec),low=specificationGauge('24',spec);
  assert.equal(high.gaugePosition,100);assert.equal(high.gaugeOverflow,'above');assert.equal(high.gaugeValue,'26.000');assert.equal(high.gaugeEdgeIcon,'arrow_right');
  assert.equal(low.gaugePosition,0);assert.equal(low.gaugeOverflow,'below');assert.match(low.gaugeAria,/beyond the displayed range/);
  for(const value of ['', 'bad', 'Infinity'])assert.equal(specificationGauge(value,spec).gaugeHidden,true);
});
test('asymmetric specifications keep the target centered and handle a target equal to a boundary',()=>{
  const asymmetric={lsl:8,target:10,usl:14,precision:2,unit:'mm'};
  near(specificationGauge('10',asymmetric).gaugePosition,50);near(specificationGauge('8',asymmetric).gaugePosition,100/7);near(specificationGauge('14',asymmetric).gaugePosition,600/7);
  const edge=specificationGauge('8',{...asymmetric,target:8});near(edge.gaugeLow,50);near(edge.gaugePosition,50);assert.equal(edge.gaugeLowerCaption,'LSL / Target');assert.equal(edge.gaugeTargetCaption,'');
});
