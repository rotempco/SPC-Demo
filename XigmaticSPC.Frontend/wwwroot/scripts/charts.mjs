const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,p=3)=>Number(v).toFixed(p);
const time=at=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Copenhagen'}).format(new Date(at));
const chartObservers=new WeakMap();
export function mountChart(element,render) {
  chartObservers.get(element)?.disconnect();
  let lastWidth;
  const draw=()=>{const width=Math.max(520,Math.floor(element.clientWidth));if(width!==lastWidth){lastWidth=width;element.innerHTML=render(width);}};
  const observer=new ResizeObserver(()=>{if(!element.isConnected){observer.disconnect();return;}draw();});
  chartObservers.set(element,observer);observer.observe(element);draw();
}
export function sparkline(values) {
  if(values.length<2)return '';
  const low=Math.min(...values),span=Math.max(...values)-low||1;
  return values.map((v,i)=>`${i?'L':'M'}${(i/(values.length-1)*126+2).toFixed(1)},${(35-(v-low)/span*28).toFixed(1)}`).join(' ');
}
export function controlChart(rows,stream,{mr=false,specs=false,height=280,reference=false,width=840}={}) {
  if(!rows.length)return '<div class="empty-panel"><span class="icon">query_stats</span><p>No observations yet. Start an inspection to begin this stream.</p></div>';
  width=Math.max(520,width);height=Math.max(260,height);
  const left=78,right=130,top=24,bottom=44,w=width-left-right,h=height-top-bottom;
  const limits=stream.limits;
  const values=rows.map((m,i)=>mr?(reference?(i?Math.abs(m.value-rows[i-1].value):null):m.mr):m.value);
  const finite=values.filter(v=>v!=null&&Number.isFinite(v));
  const bounds=[...finite];
  if(limits?.valid) bounds.push(mr?0:limits.lcl,mr?limits.mrUcl:limits.ucl);
  if(specs&&!mr) bounds.push(stream.lsl,stream.usl);
  let min=Math.min(...bounds),max=Math.max(...bounds);const span=max-min||Math.abs(max)*.01||1;min-=span*.2;max+=span*.2;
  const y=v=>top+(max-v)/(max-min)*h,x=i=>left+i/(Math.max(rows.length-1,1))*w;
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${mr?'Moving range':'Individuals'} chart for ${esc(stream.station)} ${esc(stream.name)}, ${rows.length} observations"><defs><linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3a8dca" stop-opacity=".10"/><stop offset="100%" stop-color="#3a8dca" stop-opacity="0"/></linearGradient></defs>`;
  for(let i=0;i<5;i++){const v=min+(max-min)*i/4;svg+=`<line class="grid-line" x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}"/><text text-anchor="end" x="${left-10}" y="${y(v)+3}">${fmt(v,stream.precision)}</text>`;}
  const labels=[];
  const line=(v,label,cls)=>{labels.push({v,label,at:y(v)});return `<line class="${cls}" x1="${left}" y1="${y(v)}" x2="${width-right+4}" y2="${y(v)}"/>`;};
  if(limits?.valid){svg+=line(mr?limits.mrUcl:limits.ucl,'UCL','limit-line');svg+=line(mr?0:limits.lcl,'LCL','limit-line');svg+=line(mr?limits.mr:limits.mean,'CL','center-line');}
  if(specs&&!mr){svg+=line(stream.usl,'USL','spec-line');svg+=line(stream.lsl,'LSL','spec-line');}
  // Keep labels readable when an outlier compresses several limits together.
  // Only move the text: the reference lines retain their exact data positions.
  labels.sort((a,b)=>a.at-b.at);
  const gap=20,labelTop=top+7,labelBottom=top+h-7;
  labels.forEach((label,i)=>{label.position=Math.max(label.at,i?labels[i-1].position+gap:labelTop);});
  if(labels.length&&labels.at(-1).position>labelBottom){
    labels.at(-1).position=labelBottom;
    for(let i=labels.length-2;i>=0;i--)labels[i].position=Math.min(labels[i].position,labels[i+1].position-gap);
  }
  labels.forEach(({v,label,at,position})=>{
    const end=width-right;
    if(Math.abs(position-at)>.5)svg+=`<path class="chart-label-connector" d="M${end+4},${at} H${end+10} L${end+24},${position}"/>`;
    svg+=`<text class="chart-label" x="${end+28}" y="${position}" dominant-baseline="middle">${label} ${fmt(v,stream.precision)}</text>`;
  });
  let path='';values.forEach((v,i)=>{if(v!=null)path+=`${i&&values[i-1]!=null?'L':'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;});
  if(!mr&&path)svg+=`<path class="area" d="${path}L${x(rows.length-1)},${top+h} L${x(0)},${top+h} Z"/>`;
  svg+=`<path class="data-line" d="${path}"/>`;
  values.forEach((v,i)=>{if(v==null)return;const m=rows[i],signal=limits?.valid&&(mr?v>limits.mrUcl:v<limits.lcl||v>limits.ucl);svg+=`<circle class="point ${!mr&&m.oos?'oos-point':signal?'signal-point':''}" cx="${x(i)}" cy="${y(v)}" r="${signal?4.5:2.6}" tabindex="0" role="button" data-action="measurement" data-id="${esc(m.id)}" aria-label="Inspect ${fmt(v,stream.precision)} ${esc(stream.unit)}, ${time(m.measuredAt)}"><title>${fmt(v,stream.precision)} ${esc(stream.unit)} · ${time(m.measuredAt)}${signal?' · Statistical signal':''}</title></circle>`;});
  const count=Math.min(Math.max(3,Math.floor(w/90)),rows.length);for(let i=0;i<count;i++){const index=Math.round(i/(Math.max(count-1,1))*(rows.length-1));svg+=`<text x="${x(index)}" y="${height-12}" text-anchor="middle">${time(rows[index].measuredAt)}</text>`;}
  if(!limits?.valid)svg+=`<text x="${left+10}" y="${top+14}">Not statistically evaluated · approval required</text>`;
  return svg+'</svg>';
}
export function histogram(rows,stream,{width=840}={}) {
  if(!rows.length)return '<div class="empty-panel">No observations in this population.</div>';
  const values=rows.map(r=>r.value),min=Math.min(...values),max=Math.max(...values),count=10,step=(max-min||.01)/count;
  const bins=Array(count).fill(0);values.forEach(v=>bins[Math.min(count-1,Math.floor((v-min)/step))]++);
  width=Math.max(520,width);
  const height=300,left=65,right=40,top=25,bottom=65,w=width-left-right,h=height-top-bottom,highest=Math.max(...bins,1);
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Histogram of ${values.length} ${esc(stream.name)} observations">`;
  for(let i=0;i<5;i++){const y=top+h-i/4*h;svg+=`<line class="grid-line" x1="${left}" y1="${y}" x2="${width-right}" y2="${y}"/><text x="${left-10}" y="${y+3}" text-anchor="end">${Math.round(highest*i/4)}</text>`;}
  bins.forEach((n,i)=>{const bh=n/highest*h;svg+=`<rect x="${left+i*w/count+3}" y="${top+h-bh}" width="${w/count-6}" height="${bh}" rx="3" fill="#3a8dca" opacity="${.55+i*.04}"><title>${fmt(min+i*step,stream.precision)}–${fmt(min+(i+1)*step,stream.precision)} ${esc(stream.unit)}: ${n} observations</title></rect>`;if(i%(w<600?3:2)===0)svg+=`<text x="${left+i*w/count}" y="${height-32}" text-anchor="middle">${fmt(min+i*step,stream.precision)}</text>`;});
  return svg+`<text x="${left+w/2}" y="${height-5}" text-anchor="middle">${esc(stream.name)} (${esc(stream.unit)})</text></svg>`;
}
