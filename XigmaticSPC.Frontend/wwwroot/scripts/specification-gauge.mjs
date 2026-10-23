import {numeric} from './statistics.mjs';

export function specificationGauge(text,{lsl,target,usl,unit,precision=3}) {
  const span=usl-lsl,left=(target-lsl||span)*1.4,right=(usl-target||span)*1.4;
  // Each side has its own scale: the target stays centered for asymmetric specs.
  const position=value=>value<=target?50-(target-value)/left*50:50+(value-target)/right*50;
  const low=position(lsl),high=position(usl);
  let value;
  try{value=numeric(text);}catch{/* Blank and invalid fields have no reading marker. */}
  const hasReading=Number.isFinite(value),raw=hasReading?position(value):50,marker=Math.max(0,Math.min(100,raw));
  const overflow=raw<0?'below':raw>100?'above':'';
  const format=value=>value.toFixed(precision);
  return {
    gaugeStyle:`--gauge-low:${low}%;--gauge-high:${high}%;--gauge-low-inner:${Math.min(50,low+8)}%;--gauge-high-inner:${Math.max(50,high-8)}%;--gauge-marker:${marker}%;`,
    gaugeLow:low,gaugeHigh:high,gaugePosition:marker,gaugeOverflow:overflow,gaugeHidden:!hasReading,
    gaugeValue:hasReading?format(value):'',gaugeEdgeIcon:overflow==='below'?'arrow_left':overflow==='above'?'arrow_right':'',
    gaugeLowerCaption:lsl===target?'LSL / Target':'LSL',gaugeTargetCaption:lsl===target||usl===target?'':'Target',gaugeUpperCaption:usl===target?'Target / USL':'USL',
    gaugeAria:`${hasReading?'Measured '+format(value)+' '+unit+'. ':''}Lower limit ${format(lsl)}, target ${format(target)}, upper limit ${format(usl)} ${unit}.${overflow?' Reading beyond the displayed range.':''}`
  };
}
