import {createDashboardStore,WIDGET_CATALOG} from './dashboard-store.mjs';
import {controlChart,histogram,mountChart} from './charts.mjs?v=20261023-readable';
import {dashboardDropSlots} from './dashboard-drop-slots.mjs?v=20261023-positions';

export function createDashboardController({store,render,dialog,closeDialog,toast,safe}) {
  const layouts=createDashboardStore(store);
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const fmt=(n,s)=>Number.isFinite(n)?n.toFixed(s?.precision??3):'—';
  const date=at=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Copenhagen',day:'2-digit',month:'short'}).format(new Date(at));
  const time=at=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Copenhagen',hour:'2-digit',minute:'2-digit'}).format(new Date(at));
  let editing=false,dragging=null,pointerDrag=null,dragGhost=null,scrollFrame=null;
  let dropTargets=new Map(),dropWrappers=[],activeDropKey=null,keyboardDrag=false;
  const canEdit=()=>store.data.role!=='Viewer';
  const active=()=>layouts.active;
  const events=station=>store.data.events.filter(e=>!e.superseded&&e.status!=='Closed'&&(station==='all'||!station||e.station===station));
  const stationStreams=station=>store.data.streams.filter(s=>station==='all'||!station||s.station===station);
  const rows=widget=>{const all=store.history(widget.streamId);return widget.count==='all'?all:all.slice(-Number(widget.count||25));};
  const result=(measurement,stream)=>({value:fmt(measurement?.value,stream),specStatus:!measurement?'No data':measurement.oos?'Out of specification':'Within specification',specTone:!measurement?'neutral':measurement.oos?'red':'green',statStatus:!measurement?'No data':measurement.ooc==null?'Not evaluated':measurement.ooc?'Statistical signal':'In control',tone:!measurement||measurement.ooc==null?'neutral':measurement.ooc?'amber':'green'});
  const options=(entries,selected)=>entries.map(([value,label])=>({value,label,selected:String(value)===String(selected)}));
  const sectionOptions=sectionId=>active().sections.map(s=>({id:s.id,title:s.title,selected:s.id===sectionId}));

  function dashboardList() {
    return layouts.workspace.boards.map(b=>({id:b.id,name:b.name,widgetCount:b.sections.reduce((sum,s)=>sum+s.widgets.length,0),activeClass:b.id===active().id?'active':'',ariaCurrent:b.id===active().id?'page':'false'}));
  }
  function viewModel() {
    if(!canEdit())editing=false;
    const board=active();
    return {...board,editing,notEditing:!editing,cannotEdit:!canEdit(),undoDisabled:!canEdit()||!layouts.canUndo,editLabel:editing?'Done editing':'Edit layout',editIcon:editing?'check':'dashboard_customize',hasSections:!!board.sections.length,sectionCount:board.sections.length,widgetCount:board.sections.reduce((sum,s)=>sum+s.widgets.length,0),savedAt:time(board.updatedAt),sections:board.sections.map(s=>({...s,notEditing:!editing,draggable:String(editing),expanded:String(!s.collapsed),chevron:s.collapsed?'chevron_right':'expand_more',collapsedClass:s.collapsed?'is-collapsed':'',notEmpty:!!s.widgets.length,noDescription:!s.description,widgetCount:s.widgets.length,widgets:s.widgets.map(w=>({...w,notEditing:!editing,draggable:String(editing),expanded:String(!w.collapsed),chevron:w.collapsed?'chevron_right':'expand_more',icon:WIDGET_CATALOG.find(c=>c.type===w.type)?.icon||'widgets'}))}))};
  }
  function widgetModel(widget) {
    const stream=['trend','measurements','baseline'].includes(widget.type)?store.stream(widget.streamId):null;
    switch(widget.type) {
      case 'metric': {
        const streams=stationStreams(widget.station),measurements=streams.flatMap(s=>store.history(s.id)),passing=measurements.filter(m=>!m.oos).length;
        const stationCodes=[...new Set(streams.map(s=>s.station))],activeCount=stationCodes.filter(code=>streams.some(s=>s.station===code&&store.history(s.id).length)).length;
        const open=events(widget.station).length,context=widget.station==='all'?'All workstations':widget.station;
        const variants={measurements:{value:measurements.length,suffix:'',tone:'blue',label:'Recorded observations',context:`${context} · all demo observations`,destination:'monitor',linkLabel:'Explore measurements'},acceptance:{value:measurements.length?(passing/measurements.length*100).toFixed(1):'—',suffix:'%',tone:passing===measurements.length?'green':'amber',label:'Within specification',context:`${passing} of ${measurements.length} readings · ${context}`,destination:'analysis',linkLabel:'Explore analysis'},events:{value:open,suffix:'',tone:open?'amber':'green',label:open?'Needs review':'All caught up',context:`${context} · unresolved investigations`,destination:'events',linkLabel:'Review events'},stations:{value:activeCount,suffix:` / ${stationCodes.length}`,tone:'green',label:'With recorded data',context:`${stationCodes.length-activeCount} awaiting observations · ${context}`,destination:'overview',linkLabel:'Open overview'}};
        return variants[widget.metric];
      }
      case 'trend': return {...widget,...stream,streamId:stream.id,id:widget.id,...result(store.history(stream.id).at(-1),stream),population:rows(widget).length,baselineLabel:stream.limits?.valid?stream.limits.id+' · frozen limits':'Statistical approval required'};
      case 'events': {
        const all=events(widget.station);
        return {count:all.length,hasEvents:!!all.length,events:all.slice(-5).reverse().map(e=>({id:e.id,title:e.oos?'Reading outside specification':'Statistical signal',station:e.station,name:e.characteristic,status:e.status,time:time(e.at),tone:e.oos?'red':'amber',icon:e.oos?'error':'show_chart'}))};
      }
      case 'stations': {
        const streams=stationStreams(widget.station),codes=[...new Set(streams.map(s=>s.station))];
        return {stations:codes.map(code=>{const s=streams.find(s=>s.station===code);return {...s,...result(store.history(s.id).at(-1),s),open:events(code).length};})};
      }
      case 'measurements': {
        const measurements=rows(widget).slice(-6).reverse().map(m=>({...m,...result(m,stream),unit:stream.unit,time:time(m.measuredAt),date:date(m.measuredAt)}));
        return {measurements,hasMeasurements:!!measurements.length};
      }
      case 'inspections': {
        const sessions=store.data.sessions.filter(s=>widget.station==='all'||store.data.plans.find(p=>p.id===s.planId)?.station===widget.station);
        return {count:sessions.length,hasSessions:!!sessions.length,sessions:sessions.slice(-4).reverse().map(s=>({name:s.planName||'Production inspection',batch:s.batch,done:s.results.filter(Boolean).length,total:s.steps.length,status:s.status,tone:s.status==='Completed'?'green':s.status==='Abandoned'?'neutral':'blue'}))};
      }
      case 'baseline': {
        const b=stream.limits;
        return {...stream,tone:b?.valid?'green':'amber',state:b?.valid?'Approved · frozen':'Not evaluated',baselineId:b?.id||'No approved baseline',mean:fmt(b?.mean,stream),lcl:fmt(b?.lcl,stream),ucl:fmt(b?.ucl,stream),lsl:fmt(stream.lsl,stream),usl:fmt(stream.usl,stream),approver:b?.approvedBy||'Awaiting review'};
      }
      case 'note':return {text:widget.text||'No note text yet.'};
      default:return {};
    }
  }
  function mount() {
    if(dragging||pointerDrag)clearDrag();
    const root=$('spc-dashboards');if(!root)return;
    root.classList.toggle('is-editing',editing);
    for(const element of $$('[data-db-content]',root)) {
      const {widget}=layouts.findWidget(element.dataset.dbContent);
      const template=$(`#tpl-db-${widget.type}`);
      element.innerHTML=template.innerHTML;
      htmly.bindElements(element,safe(widgetModel(widget)));
      const chart=$('[data-db-chart]',element);
      if(chart) {
        const stream=store.stream(widget.streamId);
        mountChart(chart,width=>widget.chart==='histogram'?histogram(rows(widget),stream,{width}):controlChart(rows(widget),stream,{mr:widget.chart==='mr',height:280,width}));
      }
    }
    $('[data-db-action="new-board"]',root).disabled=!canEdit();
  }
  async function changed(message,focusSelector) {
    await render();
    if(focusSelector)$(focusSelector)?.focus({preventScroll:true});
    if(message)toast(message);
  }
  function openBoard(isNew) {
    dialog('dashboard-board',{heading:isNew?'Create a dashboard':'Dashboard settings',mode:isNew?'new':'settings',name:isNew?'':active().name,description:isNew?'':active().description,isNew,isSettings:!isNew,onlyBoard:layouts.workspace.boards.length===1,submitLabel:isNew?'Create dashboard':'Save dashboard'},'YOUR SAVED WORKSPACES');
  }
  function openSection(sectionId) {
    const item=sectionId?layouts.getSection(sectionId):{id:'',title:'',description:'',columns:2};
    dialog('dashboard-section',{...item,heading:sectionId?'Section settings':'Add a section',layouts:options([[1,'One column'],[2,'Two columns'],[3,'Three columns'],[4,'Four columns']],item.columns),submitLabel:sectionId?'Save section':'Add section'},'ORGANIZE YOUR DASHBOARD');
  }
  function openWidget(type,sectionId,widgetId) {
    const entry=WIDGET_CATALOG.find(c=>c.type===type);
    const item=widgetId?layouts.findWidget(widgetId).widget:{id:'',type,title:entry.title,size:entry.size,station:'all',streamId:layouts.defaultStream.id,metric:'measurements',chart:'individuals',count:'25',text:''};
    dialog('dashboard-widget',{...item,heading:widgetId?'Configure widget':'Add '+entry.title.toLowerCase(),typeLabel:entry.title,sections:sectionOptions(sectionId),sizes:options([['normal','One column'],['wide','Two columns'],['full','Full section width']],item.size),hideMetric:type!=='metric',hideStream:!['trend','measurements','baseline'].includes(type),hideStation:!['metric','events','stations','inspections'].includes(type),hideChart:type!=='trend',hideCount:!['trend','measurements'].includes(type),hideText:type!=='note',metrics:options([['measurements','Measurement count'],['acceptance','Within specification (%)'],['events','Unresolved quality events'],['stations','Active workstations']],item.metric),streams:store.data.streams.map(s=>({...s,selected:s.id===item.streamId})),stations:options([['all','All workstations'],...[...new Set(store.data.streams.map(s=>s.station))].map(s=>[s,s])],item.station),charts:options([['individuals','Individuals'],['mr','Moving range'],['histogram','Histogram']],item.chart),counts:options([['25','Latest 25 observations'],['50','Latest 50 observations'],['all','All observations']],item.count),submitLabel:widgetId?'Save widget':'Add widget'},'CONFIGURE YOUR SIGNAL');
  }
  document.addEventListener('click',async event=>{
    const slot=event.target.closest('[data-db-drop-slot]');
    if(slot&&keyboardDrag){event.preventDefault();await commitDrop(dropTargets.get(slot.dataset.dbDropSlot));return;}
    if(keyboardDrag&&!event.target.closest('[data-db-drag]'))clearDrag();
    if(dragging)return;
    const button=event.target.closest('[data-db-action]');if(!button)return;
    const {dbAction:action,id,section:sectionId,type}=button.dataset;
    try {
      switch(action) {
        case 'select-board':layouts.select(id);editing=false;await changed();break;
        case 'new-board':openBoard(true);break;
        case 'board-settings':openBoard(false);break;
        case 'edit-layout':if(!canEdit())throw new Error('Switch to an editing role.');editing=!editing;await changed(editing?'Layout editing enabled. Drag grips or use the Move controls.':'Layout saved.');break;
        case 'undo':layouts.undo();await changed('Last layout change undone.');break;
        case 'collapse-all':layouts.collapseAll(true);await changed();break;
        case 'expand-all':layouts.collapseAll(false);await changed();break;
        case 'toggle-section':layouts.toggleSection(id);await changed(null,`[data-db-action="toggle-section"][data-id="${id}"]`);break;
        case 'toggle-widget':layouts.toggleWidget(id);await changed(null,`[data-db-action="toggle-widget"][data-id="${id}"]`);break;
        case 'add-section':openSection();break;
        case 'section-settings':openSection(id);break;
        case 'remove-section':layouts.removeSection(id);await changed('Section and its widgets removed. Use Undo to restore them.');break;
        case 'add-widget':dialog('dashboard-catalog',{sectionTitle:layouts.getSection(sectionId).title,entries:WIDGET_CATALOG.map(c=>({...c,sectionId}))},'WIDGET LIBRARY');break;
        case 'choose-widget':openWidget(type,sectionId);break;
        case 'edit-widget':{const found=layouts.findWidget(id);openWidget(found.widget.type,found.section.id,id);break;}
        case 'remove-widget':layouts.removeWidget(id);await changed('Widget removed. Use Undo to restore it.');break;
        case 'move-widget':{const found=layouts.findWidget(id);dialog('dashboard-move',{id,title:found.widget.title,sections:sectionOptions(found.section.id)},'REARRANGE YOUR DASHBOARD');break;}
        case 'delete-board':layouts.removeBoard();editing=false;closeDialog();await changed('Dashboard removed. Use Undo to restore it.');break;
      }
    } catch(error){toast(error.message);}
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!form.id.startsWith('db-'))return;
    event.preventDefault();const data=Object.fromEntries(new FormData(form));const errorBox=$('.form-error',form);
    try {
      if(form.id==='db-board-form') {
        if(form.dataset.mode==='new'){layouts.create(data);editing=true;}else layouts.rename(data);
      } else if(form.id==='db-section-form') {
        if(form.dataset.id)layouts.updateSection(form.dataset.id,data);else layouts.addSection(data);
        editing=true;
      } else if(form.id==='db-widget-form') {
        if(form.dataset.id)layouts.updateWidget(form.dataset.id,data.sectionId,data);else layouts.addWidget(data.sectionId,data);
      } else if(form.id==='db-move-form') {
        const first=layouts.getSection(data.sectionId).widgets.find(w=>w.id!==form.dataset.id);
        layouts.moveWidget(form.dataset.id,data.sectionId,data.position==='start'?first?.id:null);
      } else return;
      closeDialog();await changed('Dashboard layout saved.');
    } catch(error){if(errorBox)errorBox.textContent=error.message;else toast(error.message);}
  });

  function announceDrag(message='') {const status=$('#dashboard-drag-status');if(status)status.textContent=message;}
  function clearDrag() {
    const captured=pointerDrag;pointerDrag=null;
    if(captured?.handle.hasPointerCapture(captured.pointerId))captured.handle.releasePointerCapture(captured.pointerId);
    if(scrollFrame)cancelAnimationFrame(scrollFrame);scrollFrame=null;
    dragGhost?.remove();dragGhost=null;
    $$('[data-db-drop-slot],.db-origin-slot').forEach(element=>element.remove());
    for(const {wrapper,anchor} of dropWrappers)if(wrapper.isConnected)wrapper.replaceWith(anchor);
    dropWrappers=[];dropTargets.clear();activeDropKey=null;keyboardDrag=false;dragging=null;
    document.body.classList.remove('db-is-dragging');
    $('spc-dashboards')?.classList.remove('db-slots-visible','db-drag-widgets','db-drag-sections');
    $$('.db-drop-anchor,.is-dragging').forEach(element=>element.classList.remove('db-drop-anchor','is-dragging'));
    $$('[data-db-drag][aria-pressed]').forEach(handle=>handle.removeAttribute('aria-pressed'));
    announceDrag();
  }
  function sourceCard(source) {return $(source.kind==='widget'?`[data-db-widget="${source.id}"]`:`[data-db-section="${source.id}"]`);}
  function sourceTitle(source) {return source.kind==='widget'?layouts.findWidget(source.id).widget.title:layouts.getSection(source.id).title;}
  function slotContents(element,label,index,current=false) {
    const number=document.createElement('span');number.className='db-slot-number';number.textContent=String(index+1).padStart(2,'0');
    const icon=document.createElement('span');icon.className='icon';icon.setAttribute('aria-hidden','true');icon.textContent=current?'undo':'add';
    const text=document.createElement('span');text.className='db-slot-copy';
    const title=document.createElement('strong');title.textContent=current?'Keep here':'Drop here';title.className='db-slot-title';
    const position=document.createElement('small');position.textContent=current?`Current position · ${index+1}`:label;
    text.append(title,position);element.append(number,icon,text);
  }
  function beginDrag(source,{keyboard=false}={}) {
    dragging=source;keyboardDrag=keyboard;
    const card=sourceCard(source),root=$('spc-dashboards');
    card.classList.add('is-dragging');
    root.classList.add('db-slots-visible',source.kind==='widget'?'db-drag-widgets':'db-drag-sections');
    document.body.classList.add('db-is-dragging');
    for(const descriptor of dashboardDropSlots(active().sections,source)) {
      const section=descriptor.sectionId?$(`[data-db-section="${descriptor.sectionId}"]`):null;
      let anchor;
      if(descriptor.anchor==='widget')anchor=$(`[data-db-widget="${descriptor.anchorId}"]`);
      else if(descriptor.anchor==='section')anchor=$(`[data-db-section="${descriptor.anchorId}"] .dashboard-section-header`);
      else if(descriptor.anchor==='collapsed')anchor=$('.dashboard-section-header',section);
      else if(descriptor.anchor==='empty')anchor=$('.dashboard-section-empty',section);
      else if(descriptor.anchor==='section-end')anchor=$('.dashboard-add-widget',section);
      else anchor=$('.dashboard-add-section');
      if(!anchor)continue;
      if(anchor.tagName==='BUTTON') {
        const wrapper=document.createElement('div');wrapper.className='db-drop-anchor-wrapper';anchor.before(wrapper);wrapper.append(anchor);
        dropWrappers.push({wrapper,anchor});anchor=wrapper;
      }
      anchor.classList.add('db-drop-anchor');
      const element=document.createElement('button');element.type='button';element.className='db-drop-slot';element.dataset.dbDropSlot=descriptor.key;
      element.classList.toggle('is-current',descriptor.current);
      if(!['widget','empty'].includes(descriptor.anchor))element.classList.add('is-compact');
      element.tabIndex=keyboard?0:-1;
      element.setAttribute('aria-label',`${descriptor.current?'Keep':'Place'} ${sourceTitle(source)}: ${descriptor.label}${descriptor.sectionTitle?' in '+descriptor.sectionTitle:''}`);
      slotContents(element,descriptor.label,descriptor.index,descriptor.current);anchor.append(element);
      dropTargets.set(descriptor.key,{...descriptor,element});
    }
    const handle=$(`[data-db-drag="${source.kind}"][data-id="${source.id}"]`);handle?.setAttribute('aria-pressed','true');
    announceDrag(`${sourceTitle(source)} lifted. ${dropTargets.size} available positions. Escape cancels.`);
  }
  function makeDragGhost(source) {
    const card=sourceCard(source),ghost=card.cloneNode(true);
    ghost.removeAttribute('data-db-widget');ghost.removeAttribute('data-db-section');ghost.removeAttribute('aria-label');
    ghost.classList.remove('is-dragging','db-drop-anchor');ghost.classList.add('db-drag-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
    $$('.db-drop-slot,.db-origin-slot,[data-db-drag],.dashboard-widget-tools,.dashboard-section-tools,.dashboard-add-widget',ghost).forEach(element=>element.remove());
    $$('[id]',ghost).forEach(element=>element.removeAttribute('id'));
    if(source.kind==='section')$$('.dashboard-section-body',ghost).forEach(element=>element.remove());
    ghost.style.width=Math.min(340,window.innerWidth-32,Math.max(230,card.getBoundingClientRect().width))+'px';
    document.body.append(ghost);return ghost;
  }
  function moveGhost(x,y) {
    if(!dragGhost)return;
    dragGhost.style.left=Math.max(12,Math.min(x+24,window.innerWidth-dragGhost.offsetWidth-12))+'px';
    dragGhost.style.top=Math.max(12,Math.min(y+24,window.innerHeight-dragGhost.offsetHeight-12))+'px';
  }
  function dropLocation(event) {
    const slot=event.target.closest('[data-db-drop-slot]');
    return slot?dropTargets.get(slot.dataset.dbDropSlot)||null:null;
  }
  function highlightDrop(location,{focus=false}={}) {
    const key=location?.key||null;if(key===activeDropKey)return;
    for(const slot of dropTargets.values()) {
      const selected=slot.key===key;slot.element.classList.toggle('is-active',selected);
      $('.db-slot-title',slot.element).textContent=slot.current?'Keep here':selected?'Place here':'Drop here';
    }
    activeDropKey=key;
    if(location){announceDrag(`${location.current?'Keep':'Place'} ${sourceTitle(dragging)}: ${location.label}${location.sectionTitle?' in '+location.sectionTitle:''}.`);if(focus)location.element.focus({preventScroll:false});}
  }
  function pointerLocation() {
    if(!pointerDrag||!dragging)return null;
    const target=document.elementFromPoint(pointerDrag.x,pointerDrag.y);
    return target?dropLocation({target}):null;
  }
  function scrollDuringDrag() {
    if(!pointerDrag?.started)return;
    const delta=pointerDrag.y>window.innerHeight-65?12:pointerDrag.y<65?-12:0;
    if(delta){window.scrollBy({top:delta,behavior:'instant'});highlightDrop(pointerLocation());}
    scrollFrame=requestAnimationFrame(scrollDuringDrag);
  }
  function layoutRects(source) {
    const selector=source.kind==='widget'?'[data-db-widget]':'[data-db-section]';
    const rects=new Map($$(selector).map(element=>[element.dataset.dbWidget||element.dataset.dbSection,element.getBoundingClientRect()]));
    if(dragGhost&&source.kind==='widget')rects.set(source.id,dragGhost.getBoundingClientRect());
    return rects;
  }
  function settleLayout(before,source) {
    const selector=source.kind==='widget'?'[data-db-widget]':'[data-db-section]';
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)for(const element of $$(selector)) {
      const id=element.dataset.dbWidget||element.dataset.dbSection,old=before.get(id);if(!old)continue;
      const next=element.getBoundingClientRect(),dx=old.left-next.left,dy=old.top-next.top;
      if(Math.abs(dx)+Math.abs(dy)>2&&Math.abs(dy)<2500)element.animate([{transform:`translate(${dx}px,${dy}px)`,opacity:id===source.id ? 0.65 : 1},{transform:'none',opacity:1}],{duration:230,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
    const placed=sourceCard(source);placed?.classList.add('db-just-placed');setTimeout(()=>placed?.classList.remove('db-just-placed'),850);
  }
  async function commitDrop(location) {
    const source=dragging;if(!source)return;
    const before=layoutRects(source);clearDrag();if(!location)return;
    if(location.current){$(`[data-db-drag="${source.kind}"][data-id="${source.id}"]`)?.focus({preventScroll:true});announceDrag(`${sourceTitle(source)} kept in its original position.`);return;}
    try {
      if(source.kind==='section')layouts.moveSection(source.id,location.beforeId);
      else layouts.moveWidget(source.id,location.sectionId,location.beforeId);
      await changed(source.kind==='section'?'Section moved.':'Widget moved and layout saved.',`[data-db-drag="${source.kind}"][data-id="${source.id}"]`);
      settleLayout(before,source);
    } catch(error){toast(error.message);}
  }
  document.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-db-drag]');
    if(!handle||!editing||!canEdit()||event.button!==0)return;
    if(dragging)clearDrag();event.preventDefault();handle.focus({preventScroll:true});
    pointerDrag={handle,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,kind:handle.dataset.dbDrag,id:handle.dataset.id,started:false};
    handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if(!pointerDrag||event.pointerId!==pointerDrag.pointerId)return;
    pointerDrag.x=event.clientX;pointerDrag.y=event.clientY;
    if(!pointerDrag.started) {
      if(Math.hypot(event.clientX-pointerDrag.startX,event.clientY-pointerDrag.startY)<5)return;
      pointerDrag.started=true;beginDrag({kind:pointerDrag.kind,id:pointerDrag.id});
      dragGhost=makeDragGhost(dragging);scrollFrame=requestAnimationFrame(scrollDuringDrag);
    }
    event.preventDefault();moveGhost(event.clientX,event.clientY);highlightDrop(pointerLocation());
  });
  document.addEventListener('pointerup',async event=>{
    if(!pointerDrag||event.pointerId!==pointerDrag.pointerId)return;
    if(!pointerDrag.started){clearDrag();return;}
    await commitDrop(pointerLocation());
  });
  document.addEventListener('pointercancel',()=>{if(pointerDrag)clearDrag();});
  document.addEventListener('lostpointercapture',event=>{if(pointerDrag?.pointerId===event.pointerId)clearDrag();});
  window.addEventListener('blur',()=>{if(dragging||pointerDrag)clearDrag();});
  window.addEventListener('resize',()=>{if(dragging||pointerDrag)clearDrag();});
  document.addEventListener('dragstart',event=>{
    if(pointerDrag){event.preventDefault();return;}
    const handle=event.target.closest('[data-db-drag]');if(!handle||!editing||!canEdit())return;
    const source={kind:handle.dataset.dbDrag,id:handle.dataset.id};
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',JSON.stringify(source));
    event.dataTransfer.setDragImage(sourceCard(source),20,20);beginDrag(source);
  });
  document.addEventListener('dragover',event=>{
    if(!dragging||!editing||!canEdit())return;
    const location=dropLocation(event);highlightDrop(location);if(!location)return;
    event.preventDefault();event.dataTransfer.dropEffect='move';
  });
  document.addEventListener('drop',async event=>{
    if(!dragging||!editing||!canEdit())return;
    event.preventDefault();await commitDrop(dropLocation(event));
  });
  document.addEventListener('dragend',clearDrag);
  document.addEventListener('focusin',event=>{if(keyboardDrag){const location=dropLocation(event);if(location)highlightDrop(location);}});
  document.addEventListener('keydown',async event=>{
    if(event.key==='Escape'&&(pointerDrag||dragging)){event.preventDefault();const source=dragging;clearDrag();if(source)$(`[data-db-drag="${source.kind}"][data-id="${source.id}"]`)?.focus({preventScroll:true});return;}
    if(keyboardDrag) {
      const positions=[...dropTargets.values()];
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) {
        event.preventDefault();const index=positions.findIndex(slot=>slot.key===activeDropKey),direction=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;
        if(positions.length)highlightDrop(positions[(index+direction+positions.length)%positions.length],{focus:true});
      } else if(['Enter',' '].includes(event.key)){event.preventDefault();await commitDrop(dropLocation(event)||dropTargets.get(activeDropKey));}
      return;
    }
    const handle=event.target.closest('[data-db-drag]');
    if(handle&&!event.altKey&&['Enter',' '].includes(event.key)&&editing&&canEdit()) {
      event.preventDefault();if(event.repeat)return;
      beginDrag({kind:handle.dataset.dbDrag,id:handle.dataset.id},{keyboard:true});
      highlightDrop([...dropTargets.values()][0],{focus:true});return;
    }
    if(!handle||!event.altKey||!editing||!canEdit()||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();const {id,dbDrag:kind}=handle.dataset,sections=active().sections;
    try {
      if(kind==='section') {
        const index=sections.findIndex(s=>s.id===id),direction=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;
        if(index+direction<0||index+direction>=sections.length)return;
        layouts.moveSection(id,direction<0?sections[index-1].id:sections[index+2]?.id);
      } else {
        const found=layouts.findWidget(id),sectionIndex=sections.indexOf(found.section),index=found.section.widgets.indexOf(found.widget);
        if(event.key==='ArrowLeft'||event.key==='ArrowRight') {
          const target=sections[sectionIndex+(event.key==='ArrowLeft'?-1:1)];if(!target)return;layouts.moveWidget(id,target.id);
        } else if(event.key==='ArrowUp') {
          if(index>0)layouts.moveWidget(id,found.section.id,found.section.widgets[index-1].id);
          else if(sections[sectionIndex-1])layouts.moveWidget(id,sections[sectionIndex-1].id);
          else return;
        } else {
          if(index<found.section.widgets.length-1)layouts.moveWidget(id,found.section.id,found.section.widgets[index+2]?.id);
          else if(sections[sectionIndex+1])layouts.moveWidget(id,sections[sectionIndex+1].id,sections[sectionIndex+1].widgets[0]?.id);
          else return;
        }
      }
      await changed('Layout position updated.',`[data-db-drag="${kind}"][data-id="${id}"]`);
    } catch(error){toast(error.message);}
  });
  return {dashboardList,viewModel,mount};
}
