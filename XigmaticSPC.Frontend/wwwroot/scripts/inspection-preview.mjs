import {numeric,evaluate} from './statistics.mjs';

// Preview is pure: typing never records a measurement, event or evaluation.
export function previewReading(text,definition,limits,previous) {
  if(String(text??'').trim()==='')return {state:'empty',valid:false,tone:'neutral',specTone:'neutral',statTone:'neutral',specText:'Awaiting reading',statText:'Not evaluated',message:'Enter a value to preview its limits.',icon:'edit',oos:false,ooc:null};
  let value;
  try{value=numeric(text);}catch(error){return {state:'invalid',valid:false,tone:'red',specTone:'red',statTone:'neutral',specText:'Invalid number',statText:'Not evaluated',message:error.message,icon:'error',oos:false,ooc:null};}
  const result=evaluate(value,previous?.value,definition,limits,previous?.segment===definition.segment);
  const f=n=>Number(n.toPrecision(6)).toString();
  let message;
  if(value<definition.lsl)message=`${f(definition.lsl-value)} ${definition.unit} below the lower specification (${f(definition.lsl)} ${definition.unit}).`;
  else if(value>definition.usl)message=`${f(value-definition.usl)} ${definition.unit} above the upper specification (${f(definition.usl)} ${definition.unit}).`;
  else if(result.ooc&&value<limits.lcl)message=`${f(limits.lcl-value)} ${definition.unit} below the lower control limit (${f(limits.lcl)} ${definition.unit}).`;
  else if(result.ooc&&value>limits.ucl)message=`${f(value-limits.ucl)} ${definition.unit} above the upper control limit (${f(limits.ucl)} ${definition.unit}).`;
  else if(result.ooc)message=`Moving range ${f(result.mr)} ${definition.unit} exceeds UCL ${f(limits.mrUcl)} ${definition.unit}.`;
  else if(result.ooc==null)message='Within specification. Statistical monitoring awaits an approved baseline.';
  else message='Within specification and approved control limits.';
  return {...result,value,valid:true,state:result.oos?'oos':result.ooc?'ooc':'inside',tone:result.oos?'red':result.ooc?'amber':'green',specTone:result.oos?'red':'green',statTone:result.ooc==null?'neutral':result.ooc?'amber':'green',specText:result.oos?'Out of specification':'Within specification',statText:result.ooc==null?'Not evaluated':result.ooc?'Statistical signal':'In control',message,icon:result.oos?'error':result.ooc?'warning':'check_circle'};
}

export function inspectionProgress(rows) {
  const saved=rows.filter(r=>r.saved).length;
  const filled=rows.filter(r=>r.saved||r.preview.valid).length;
  const unsaved=rows.filter(r=>!r.saved&&r.preview.valid).length;
  const invalid=rows.filter(r=>!r.saved&&r.preview.state==='invalid').length;
  const warnings=rows.filter(r=>!r.saved&&r.preview.valid&&(r.preview.oos||r.preview.ooc)).length;
  const pending=rows.filter(r=>r.responseRequired).length;
  return {total:rows.length,saved,filled,unsaved,invalid,warnings,pending,percent:rows.length?filled/rows.length*100:0,canSave:unsaved>0&&invalid===0,canComplete:saved===rows.length&&rows.length>0&&pending===0};
}

// A specification pass without an approved baseline must not be called in control.
export function inspectionStatus(preview) {
  if(preview.state==='invalid')return {statusLabel:'Invalid number',statusIcon:'error',statusTone:'red',hideStatus:false};
  if(!preview.valid)return {statusLabel:'',statusIcon:'',statusTone:'neutral',hideStatus:true};
  if(preview.oos)return {statusLabel:'Out of bounds',statusIcon:'error',statusTone:'red',hideStatus:false};
  if(preview.ooc===true)return {statusLabel:'Signal',statusIcon:'warning',statusTone:'amber',hideStatus:false};
  if(preview.ooc===false)return {statusLabel:'In control',statusIcon:'check_box',statusTone:'green',hideStatus:false};
  return {statusLabel:'Within spec',statusIcon:'check',statusTone:'neutral',hideStatus:false};
}
