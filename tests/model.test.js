import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, shiftDate, slotKey, scheduleFor, dueSlots, toggleRecord, parseState, emptyState, cycleStatus, isDateKey } from '../src/model.js';

const medicine = { id: 'vitamin', name: '비타민 D', dose: '1정', note: '식사 후', startDate: '2026-10-12', times: ['20:00', '08:00'], days: [1, 3, 5] };

test('local dates cross month and year boundaries without UTC conversion', () => {
  assert.equal(dateKey(new Date(2026, 9, 12, 23, 59)), '2026-10-12');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('schedules respect weekdays and start date and sort dose times', () => {
  assert.deepEqual(scheduleFor([medicine], [], '2026-10-12').map(s => s.time), ['08:00', '20:00']);
  assert.equal(scheduleFor([medicine], [], '2026-10-13').length, 0);
  assert.equal(scheduleFor([medicine], [], '2026-10-09').length, 0);
});

test('completion is isolated by medicine, date and time and can be undone', () => {
  const slot = scheduleFor([medicine], [], '2026-10-12')[0];
  const records = toggleRecord([], slot, '2026-10-12', new Date('2026-10-12T08:05:00'));
  assert.equal(records.length, 1);
  assert.equal(scheduleFor([medicine], records, '2026-10-12')[0].record.name, '비타민 D');
  assert.equal(scheduleFor([medicine], records, '2026-10-12')[1].record, undefined);
  assert.equal(scheduleFor([medicine], records, '2026-10-14')[0].record, undefined);
  assert.deepEqual(toggleRecord(records, slot, '2026-10-12'), []);
  assert.equal(records[0].name, '비타민 D');
});

test('reminders include due doses only and suppress completed and already alerted doses', () => {
  const slots = scheduleFor([medicine], [], '2026-10-12');
  assert.equal(dueSlots(slots, '2026-10-12', new Date('2026-10-12T07:59:00'), []).length, 0);
  assert.equal(dueSlots(slots, '2026-10-12', new Date('2026-10-12T08:00:00'), []).length, 1);
  assert.equal(dueSlots(slots, '2026-10-12', new Date('2026-10-12T08:14:59'), []).length, 1);
  assert.equal(dueSlots(slots, '2026-10-12', new Date('2026-10-12T08:15:00'), []).length, 0);
  assert.equal(dueSlots(slots, '2026-10-12', new Date('2026-10-12T08:02:00'), [slotKey('vitamin', '2026-10-12', '08:00')]).length, 0);
  const records = toggleRecord([], slots[0], '2026-10-12');
  assert.equal(dueSlots(scheduleFor([medicine], records, '2026-10-12'), '2026-10-12', new Date('2026-10-12T08:02:00'), []).length, 0);
  assert.equal(dueSlots(slots, '2026-10-12', new Date('2026-10-13T08:02:00'), []).length, 0);
});

test('storage validates persisted data and rejects corrupt structures', () => {
  assert.deepEqual(parseState(null), emptyState());
  const state = { ...emptyState(), medicines: [medicine] };
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  assert.throws(() => parseState('{broken'));
  assert.throws(() => parseState(JSON.stringify({ ...state, medicines: [{ ...medicine, times: ['99:99'] }] })));
  assert.throws(() => parseState(JSON.stringify({ ...state, records: [{}] })));
});

test('21 days on and 7 days off repeat from the start date independently of weekdays or completion', () => {
  const cyclic = { ...medicine, cycle: { onDays: 21, offDays: 7 } };
  for (let offset = 0; offset < 84; offset++) {
    const date = shiftDate(cyclic.startDate, offset);
    const phase = offset % 28;
    assert.equal(scheduleFor([cyclic], [], date).length, phase < 21 ? 2 : 0, date);
    const status = cycleStatus(cyclic, date);
    assert.equal(status.phase, phase < 21 ? 'taking' : 'rest');
    assert.equal(status.day, phase < 21 ? phase + 1 : phase - 21 + 1);
    if (phase >= 21) assert.equal(status.resumeDate, shiftDate(date, 28 - phase));
  }
  assert.deepEqual(cycleStatus(cyclic, '2026-11-02'), { phase: 'rest', day: 1, length: 7, resumeDate: '2026-11-09' });
  const slot = scheduleFor([cyclic], [], cyclic.startDate)[0];
  const records = toggleRecord([], slot, cyclic.startDate);
  assert.equal(scheduleFor([cyclic], records, '2026-11-02').length, 0);
  assert.equal(dueSlots(scheduleFor([cyclic], records, '2026-11-02'), '2026-11-02', new Date('2026-11-02T08:00:00'), []).length, 0);
});

test('cycle dates handle leap years, daylight saving boundaries and year rollover as calendar days', () => {
  const cyclic = { ...medicine, startDate: '2024-02-15', cycle: { onDays: 21, offDays: 7 } };
  assert.equal(cycleStatus(cyclic, '2024-03-06').day, 21);
  assert.deepEqual(cycleStatus(cyclic, '2024-03-10'), { phase: 'rest', day: 4, length: 7, resumeDate: '2024-03-14' });
  assert.equal(cycleStatus(cyclic, '2024-03-14').day, 1);
  const year = { ...cyclic, startDate: '2026-12-15' };
  assert.equal(cycleStatus(year, '2027-01-05').phase, 'rest');
  assert.equal(cycleStatus(year, '2027-01-12').day, 1);
});

test('future cycles do not schedule doses before their anchor and zero rest stays continuous', () => {
  const cyclic = { ...medicine, cycle: { onDays: 21, offDays: 0 } };
  assert.equal(cycleStatus(cyclic, '2026-10-11').phase, 'pending');
  assert.equal(scheduleFor([cyclic], [], '2026-10-11').length, 0);
  assert.equal(scheduleFor([cyclic], [], '2026-11-02').length, 2);
  assert.equal(cycleStatus(cyclic, '2026-11-02').day, 1);
});

test('stored weekly schedules remain compatible and invalid cycles and impossible dates are rejected', () => {
  const state = { ...emptyState(), medicines: [medicine] };
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  for (const cycle of [{ onDays: 0, offDays: 7 }, { onDays: 21, offDays: -1 }, { onDays: 21.5, offDays: 7 }, { onDays: '21', offDays: 7 }, { onDays: 366, offDays: 7 }]) {
    assert.throws(() => parseState(JSON.stringify({ ...state, medicines: [{ ...medicine, cycle }] })));
  }
  assert.equal(isDateKey('2024-02-29'), true);
  assert.equal(isDateKey('2026-02-30'), false);
  assert.throws(() => parseState(JSON.stringify({ ...state, medicines: [{ ...medicine, startDate: '2026-02-30' }] })));
});
