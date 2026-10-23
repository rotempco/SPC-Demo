// Each visible slot represents the item's final position after the source is removed.
// Its visual anchor and its insertion reference are deliberately separate.
export function dashboardDropSlots(sections,source) {
  if(source.kind==='section') {
    const original=sections.findIndex(s=>s.id===source.id);
    if(original<0)throw new Error('Unknown dashboard section.');
    const remaining=sections.filter(s=>s.id!==source.id);
    return sections.map((section,index)=>({key:`section:${index}`,index,beforeId:remaining[index]?.id||null,anchorId:section.id,anchor:'section',label:`Position ${index+1} of ${sections.length}`,current:index===original}));
  }
  const origin=sections.find(s=>s.widgets.some(w=>w.id===source.id));
  if(!origin)throw new Error('Unknown dashboard widget.');
  const original=origin.widgets.findIndex(w=>w.id===source.id);
  return sections.flatMap(section=>{
    const remaining=section.widgets.filter(w=>w.id!==source.id);
    const sameSection=section.id===origin.id;
    const positions=section.collapsed
      ?[{beforeId:null,index:remaining.length,label:`End of ${section.title}`,anchor:'collapsed'}]
      :Array.from({length:remaining.length+1},(_,index)=>({
        beforeId:remaining[index]?.id||null,index,anchorId:section.widgets[index]?.id||null,
        label:`Position ${index+1} of ${remaining.length+1}`,
        anchor:section.widgets[index]?'widget':section.widgets.length?'section-end':'empty'
      }));
    return positions.map(slot=>({...slot,key:`widget:${section.id}:${slot.index}`,sectionId:section.id,sectionTitle:section.title,current:sameSection&&slot.index===original}));
  });
}
