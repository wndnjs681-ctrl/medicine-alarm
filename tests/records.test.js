import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, parseState, saveRecord } from '../src/model.js';
import { calendarDay } from '../src/calendar.js';

const now = new Date('2026-10-13T12:00:00');
const draft = { medicineId: 'pill', name: '과거 약', dose: '1정', date: '2026-10-10', time: '08:00', takenAt: '2026-10-10T08:15:00' };

test('past record can be added, edited and moved without changing other records', () => {
  const first = saveRecord([], draft, null, now);
  const other = saveRecord(first, { ...draft, time: '20:00' }, null, now);
  const edited = saveRecord(other, { ...draft, date: '2026-10-09', time: '09:00', dose: '2정' }, first[0].id, now);
  assert.equal(edited.length, 2);
  assert.equal(edited[0], other[1]);
  assert.equal(edited[1].id, 'pill:2026-10-09:09:00');
  assert.equal(edited[1].dose, '2정');
  assert.equal(first[0].date, '2026-10-10');
  assert.deepEqual(parseState(JSON.stringify({ ...emptyState(), records: edited })).records, edited);
});

test('editing never overwrites a conflicting dose or restores a removed record', () => {
  const records = saveRecord(saveRecord([], draft, null, now), { ...draft, time: '20:00' }, null, now);
  assert.throws(() => saveRecord(records, { ...draft, time: '20:00' }, records[0].id, now), /이미/);
  assert.throws(() => saveRecord(records, draft, 'removed-record', now), /변경/);
  assert.equal(records.length, 2);
});

test('future dates, future actual times and invalid entries are rejected', () => {
  for (const patch of [{ date: '2026-10-14' }, { date: '2026-02-30' }, { time: '25:00' }, { takenAt: 'invalid' }, { takenAt: '2026-10-13T13:00:00' }, { dose: '' }, { medicineId: '' }]) {
    assert.throws(() => saveRecord([], { ...draft, ...patch }, null, now));
  }
});

test('edited dose snapshots show in calendar and deleted medication records remain editable', () => {
  const records = saveRecord([], draft, null, now);
  const medicines = [{ id: 'pill', name: '변경된 약', dose: '3정', note: '', startDate: '2026-10-01', days: [0, 1, 2, 3, 4, 5, 6], times: ['08:00'] }];
  const day = calendarDay({ ...emptyState(), medicines, records }, draft.date, now);
  assert.equal(day.slots[0].dose, '1정');
  assert.equal(day.slots[0].name, draft.name);
  const edited = saveRecord(records, { ...draft, dose: '2정' }, records[0].id, now);
  assert.equal(calendarDay({ ...emptyState(), records: edited }, draft.date, now).slots[0].dose, '2정');
});
