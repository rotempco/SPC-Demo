import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentShift} from '../XigmaticSPC.Frontend/wwwroot/scripts/time-windows.mjs';

test('day and evening shifts use Copenhagen wall time and exclusive end boundaries',()=>{
  assert.deepEqual(currentShift('2026-10-30T05:00:00Z'),{from:'2026-10-30T05:00:00.000Z',to:'2026-10-30T13:00:00.000Z',label:'Day shift · 06:00–14:00',localDate:'2026-10-30'});
  const day=currentShift('2026-10-30T12:59:59Z');assert.equal(day.label,'Day shift · 06:00–14:00');
  const evening=currentShift('2026-10-30T13:00:00Z');assert.equal(evening.from,'2026-10-30T13:00:00.000Z');assert.equal(evening.to,'2026-10-30T21:00:00.000Z');assert.match(evening.label,/Evening/);
  const summer=currentShift(new Date('2026-07-15T05:00:00Z'));assert.equal(summer.from,'2026-07-15T04:00:00.000Z');assert.equal(summer.to,'2026-07-15T12:00:00.000Z');
});

test('night shift after midnight keeps the preceding local date including year rollover',()=>{
  const late=currentShift('2026-10-30T21:00:00Z'),early=currentShift('2026-10-31T04:59:59Z');
  assert.deepEqual(early,late);assert.equal(late.from,'2026-10-30T21:00:00.000Z');assert.equal(late.to,'2026-10-31T05:00:00.000Z');assert.equal(late.localDate,'2026-10-30');
  const january=currentShift('2027-01-01T01:00:00Z');assert.equal(january.localDate,'2026-12-31');assert.equal(january.from,'2026-12-31T21:00:00.000Z');assert.equal(january.to,'2027-01-01T05:00:00.000Z');
});

test('spring DST night has seven real hours and remains consistent across the skipped hour',()=>{
  const before=currentShift('2026-03-29T00:30:00Z'),after=currentShift('2026-03-29T01:30:00Z');
  assert.deepEqual(before,after);assert.equal(before.localDate,'2026-03-28');
  assert.equal(before.from,'2026-03-28T21:00:00.000Z');assert.equal(before.to,'2026-03-29T04:00:00.000Z');
  assert.equal((Date.parse(before.to)-Date.parse(before.from))/3600000,7);
  assert.match(currentShift(before.to).label,/Day/);
});

test('autumn DST night has nine real hours and both repeated local hours resolve to the same shift',()=>{
  const first=currentShift('2026-10-25T00:30:00Z'),repeated=currentShift('2026-10-25T01:30:00Z');
  assert.deepEqual(first,repeated);assert.equal(first.localDate,'2026-10-24');
  assert.equal(first.from,'2026-10-24T20:00:00.000Z');assert.equal(first.to,'2026-10-25T05:00:00.000Z');
  assert.equal((Date.parse(first.to)-Date.parse(first.from))/3600000,9);
  assert.match(currentShift(first.to).label,/Day/);
});

test('invalid instants do not create silent empty report windows',()=>{
  assert.throws(()=>currentShift('bad time'),/valid instant/);
});
