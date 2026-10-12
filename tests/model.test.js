import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, shiftDate, slotKey, scheduleFor, dueSlots, toggleRecord, parseState, emptyState } from '../src/model.js';

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
