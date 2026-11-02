export const WIDGET_CATALOG = Object.freeze([
  {type:'metric', title:'Key metric', description:'Measurements, acceptance, open events or active stations.', icon:'speed', size:'normal'},
  {type:'trend', title:'Process chart', description:'Individuals, moving range or histogram for a process.', icon:'monitoring', size:'wide'},
  {type:'events', title:'Quality events', description:'Unresolved investigations and their next action.', icon:'flag', size:'normal'},
  {type:'stations', title:'Workstation status', description:'Latest readings and status across the shop floor.', icon:'precision_manufacturing', size:'full'},
  {type:'measurements', title:'Recent measurements', description:'A traceable list of the latest observations.', icon:'straighten', size:'wide'},
  {type:'inspections', title:'Inspection sessions', description:'In-progress and completed production checks.', icon:'fact_check', size:'normal'},
  {type:'baseline', title:'Baseline & specification', description:'Approved control limits and engineering tolerance.', icon:'tune', size:'normal'},
  {type:'note', title:'Text & shift notes', description:'Instructions, reminders and handover notes.', icon:'sticky_note_2', size:'normal'}
]);

const id = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();
const title = (value, label) => {
  const text = String(value || '').trim();
  if (!text || text.length > 100) throw new Error(`${label} must contain 1–100 characters.`);
  return text;
};
const widget = (type, settings = {}) => ({id:id(), type, title:WIDGET_CATALOG.find(w=>w.type===type).title, size:WIDGET_CATALOG.find(w=>w.type===type).size, collapsed:false, station:'all', metric:'measurements', chart:'individuals', count:'25', text:'Add a note for your team.', ...settings});
const section = (name, columns, widgets = []) => ({id:id(), title:name, description:'', columns, collapsed:false, widgets});

function productionSections(stream) {
  return [
    section('Shift snapshot',4,[widget('metric',{title:'Measurements',metric:'measurements'}),widget('metric',{title:'Within specification',metric:'acceptance'}),widget('metric',{title:'Open quality events',metric:'events'}),widget('metric',{title:'Active workstations',metric:'stations'})]),
    section('Process & exceptions',3,[widget('trend',{title:`${stream.name} · ${stream.station}`,streamId:stream.id}),widget('events',{title:'Needs your attention'})]),
    section('The shop floor',3,[widget('stations',{title:'Workstation status'})])
  ];
}

export function createDashboardStore(store) {
  const defaultStream = () => {
    const selected=store.data.streams.find(s=>s.id===store.data.defaultStreamId)||store.data.streams[0];
    if(!selected)throw new Error('A process stream is required to create a dashboard.');
    return selected;
  };
  function ensure() {
    if (store.data.dashboardWorkspace?.version !== 1) {
      const board = {id:id(), name:'Production focus', description:'Your production signals, arranged around the decisions that matter.', sections:productionSections(defaultStream()), createdAt:stamp(), updatedAt:stamp()};
      store.data.dashboardWorkspace = {version:1, activeId:board.id, boards:[board], undo:[]};
      store.save();
    }
    return store.data.dashboardWorkspace;
  }
  const active = () => {
    const workspace = ensure();
    return workspace.boards.find(b=>b.id===workspace.activeId) || workspace.boards[0];
  };
  const getSection = sectionId => {
    const found = active().sections.find(s=>s.id===sectionId);
    if (!found) throw new Error('Section not found.');
    return found;
  };
  const findWidget = widgetId => {
    for (const section of active().sections) {
      const item = section.widgets.find(w=>w.id===widgetId);
      if (item) return {section, widget:item};
    }
    throw new Error('Widget not found.');
  };
  const requireEdit = () => {
    if (store.data.role === 'Viewer') throw new Error('Switch to Operator or Quality engineer to edit a dashboard.');
  };
  function mutate(change, presentationOnly = false) {
    if (!presentationOnly) requireEdit();
    const workspace = ensure();
    const snapshot = structuredClone({boards:workspace.boards, activeId:workspace.activeId});
    try {
      const result = change();
      active().updatedAt = stamp();
      workspace.undo.push(snapshot);
      if (workspace.undo.length > 20) workspace.undo.shift();
      store.save();
      return result;
    } catch (error) {
      workspace.boards = snapshot.boards;
      workspace.activeId = snapshot.activeId;
      throw error;
    }
  }
  function settings(input, original = {}) {
    const type = input.type || original.type;
    const entry = WIDGET_CATALOG.find(w=>w.type===type);
    if (!entry) throw new Error('Choose a supported widget.');
    const next = {...original, type, title:title(input.title || entry.title,'Widget title'), size:input.size || original.size || entry.size};
    if (!['normal','wide','full'].includes(next.size)) throw new Error('Choose a supported widget width.');
    if (['trend','measurements','baseline'].includes(type)) {
      next.streamId = input.streamId || original.streamId || defaultStream().id;
      store.stream(next.streamId);
    }
    if (['events','stations','metric','inspections'].includes(type)) {
      next.station = input.station || original.station || 'all';
      if (next.station !== 'all' && !store.data.streams.some(s=>s.station===next.station)) throw new Error('Unknown workstation.');
    }
    if (type==='metric') {
      next.metric = input.metric || original.metric || 'measurements';
      if (!['measurements','acceptance','events','stations'].includes(next.metric)) throw new Error('Choose a supported metric.');
    }
    if (type==='trend') {
      next.chart = input.chart || original.chart || 'individuals';
      if (!['individuals','mr','histogram'].includes(next.chart)) throw new Error('Choose a supported chart.');
    }
    if (['trend','measurements'].includes(type)) {
      next.count = String(input.count || original.count || '25');
      if (!['25','50','all'].includes(next.count)) throw new Error('Choose a supported observation window.');
    }
    if (type==='note') {
      next.text = String(input.text ?? original.text ?? '').trim();
      if (next.text.length > 4000) throw new Error('Keep notes within 4,000 characters.');
    }
    return next;
  }
  return {
    get defaultStream(){return defaultStream();},
    get workspace(){return ensure();},
    get active(){return active();},
    get canUndo(){return ensure().undo.length>0;},
    getSection, findWidget,
    select(boardId) {
      if (!ensure().boards.some(b=>b.id===boardId)) throw new Error('Dashboard not found.');
      ensure().activeId=boardId;store.save();
    },
    create(input) {
      const name=title(input.name,'Dashboard name');
      if (!['blank','production','copy'].includes(input.starter)) throw new Error('Choose a dashboard starter.');
      return mutate(()=>{
        let sections=input.starter==='production'?productionSections(defaultStream()):[section('My first section',2)];
        if(input.starter==='copy') sections=active().sections.map(s=>({...structuredClone(s),id:id(),widgets:s.widgets.map(w=>({...structuredClone(w),id:id()}))}));
        const board={id:id(),name,description:String(input.description||'').trim().slice(0,300),sections,createdAt:stamp(),updatedAt:stamp()};
        ensure().boards.push(board);ensure().activeId=board.id;return board;
      });
    },
    rename(input) {
      const name=title(input.name,'Dashboard name');
      return mutate(()=>Object.assign(active(),{name,description:String(input.description||'').trim().slice(0,300)}));
    },
    removeBoard() {
      if(ensure().boards.length===1)throw new Error('Keep at least one dashboard. You can remove every section and widget.');
      return mutate(()=>{const workspace=ensure();workspace.boards=workspace.boards.filter(b=>b.id!==active().id);workspace.activeId=workspace.boards[0].id;});
    },
    addSection(input) {
      const name=title(input.title,'Section title'),columns=Number(input.columns||2);
      if(![1,2,3,4].includes(columns))throw new Error('Choose one to four columns.');
      return mutate(()=>{const item=section(name,columns);item.description=String(input.description||'').trim().slice(0,300);active().sections.push(item);return item;});
    },
    updateSection(sectionId,input) {
      const item=getSection(sectionId),name=title(input.title,'Section title'),columns=Number(input.columns);
      if(![1,2,3,4].includes(columns))throw new Error('Choose one to four columns.');
      return mutate(()=>Object.assign(item,{title:name,description:String(input.description||'').trim().slice(0,300),columns}));
    },
    removeSection(sectionId) {getSection(sectionId);return mutate(()=>{active().sections=active().sections.filter(s=>s.id!==sectionId);});},
    moveSection(sectionId,beforeId=null) {
      const item=getSection(sectionId);
      if(beforeId===sectionId)return;
      if(beforeId)getSection(beforeId);
      return mutate(()=>{active().sections=active().sections.filter(s=>s.id!==sectionId);const index=beforeId?active().sections.findIndex(s=>s.id===beforeId):active().sections.length;active().sections.splice(index,0,item);});
    },
    toggleSection(sectionId) {const item=getSection(sectionId);return mutate(()=>{item.collapsed=!item.collapsed;},true);},
    collapseAll(collapsed) {return mutate(()=>{active().sections.forEach(s=>s.collapsed=collapsed);},true);},
    addWidget(sectionId,input) {
      const target=getSection(sectionId),config=settings(input);
      return mutate(()=>{const item=widget(config.type,config);target.widgets.push(item);target.collapsed=false;return item;});
    },
    updateWidget(widgetId,sectionId,input) {
      const found=findWidget(widgetId),target=getSection(sectionId),config=settings(input,found.widget);
      return mutate(()=>{Object.assign(found.widget,config);if(found.section!==target){found.section.widgets=found.section.widgets.filter(w=>w.id!==widgetId);target.widgets.push(found.widget);target.collapsed=false;}return found.widget;});
    },
    removeWidget(widgetId) {const found=findWidget(widgetId);return mutate(()=>{found.section.widgets=found.section.widgets.filter(w=>w.id!==widgetId);});},
    toggleWidget(widgetId) {const {widget}=findWidget(widgetId);return mutate(()=>{widget.collapsed=!widget.collapsed;},true);},
    moveWidget(widgetId,sectionId,beforeId=null) {
      const found=findWidget(widgetId),target=getSection(sectionId);
      if(beforeId===widgetId&&found.section===target)return;
      if(beforeId&&!target.widgets.some(w=>w.id===beforeId))throw new Error('The drop position is no longer available.');
      return mutate(()=>{found.section.widgets=found.section.widgets.filter(w=>w.id!==widgetId);const index=beforeId?target.widgets.findIndex(w=>w.id===beforeId):target.widgets.length;target.widgets.splice(index,0,found.widget);target.collapsed=false;});
    },
    undo() {
      requireEdit();const workspace=ensure(),snapshot=workspace.undo.pop();if(!snapshot)return false;
      workspace.boards=snapshot.boards;workspace.activeId=snapshot.activeId;store.save();return true;
    }
  };
}
