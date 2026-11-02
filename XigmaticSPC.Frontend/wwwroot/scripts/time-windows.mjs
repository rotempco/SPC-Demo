const localClock = new Intl.DateTimeFormat('en-GB', {
  timeZone:'Europe/Copenhagen',calendar:'iso8601',numberingSystem:'latn',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
});
const parts = instant => Object.fromEntries(localClock.formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
const calendarDay = (date, offset = 0) => {
  const instant = new Date(Date.UTC(date.year,date.month-1,date.day+offset));
  return {year:instant.getUTCFullYear(),month:instant.getUTCMonth()+1,day:instant.getUTCDate()};
};

// Shift boundaries are 06:00, 14:00 and 22:00: none falls in the ambiguous or
// missing DST hour. Resolve the zone offset separately at each boundary.
function boundary(date, hour) {
  const wallTime = Date.UTC(date.year,date.month-1,date.day,hour);
  let result = wallTime;
  for (let pass=0;pass<3;pass++) {
    const local = parts(new Date(result));
    const offset = Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute,local.second)-result;
    const candidate = wallTime-offset;
    if (candidate === result) break;
    result = candidate;
  }
  return new Date(result).toISOString();
}

/** Current Copenhagen shift, with inclusive from and exclusive to UTC bounds. */
export function currentShift(now = new Date()) {
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new Error('A valid instant is required for the shift.');
  const local = parts(instant);
  const startDay = calendarDay(local,local.hour<6?-1:0);
  const startHour = local.hour<6||local.hour>=22?22:local.hour<14?6:14;
  const endDay = calendarDay(startDay,startHour===22?1:0);
  const endHour = startHour===22?6:startHour+8;
  const name = startHour===6?'Day shift':startHour===14?'Evening shift':'Night shift';
  const clock = hour => String(hour).padStart(2,'0')+':00';
  return {
    from:boundary(startDay,startHour),to:boundary(endDay,endHour),
    label:`${name} · ${clock(startHour)}–${clock(endHour)}`,
    localDate:`${startDay.year}-${String(startDay.month).padStart(2,'0')}-${String(startDay.day).padStart(2,'0')}`
  };
}
