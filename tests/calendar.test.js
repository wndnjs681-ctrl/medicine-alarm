import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDay, calendarMonth, monthDates } from '../src/calendar.js';
import { emptyState, toggleRecord } from '../src/model.js';

const medicine = { id: 'pill', name: '주기 약', dose: '1정', note: '', startDate: '2026-10-01', days: [0, 1, 2, 3, 4, 5, 6], times: ['08:00', '20:00'], cycle: { onDays: 21, offDays: 7 } };
const state = { ...emptyState(), medicines: [medicine] };
const now = new Date('2026-10-12T12:00:00');

test('calendar respects leap years and month lengths', () => {
  assert.equal(monthDates('2024-02').length, 29);
  assert.equal(monthDates('2025-02').length, 28);
  assert.equal(monthDates('2026-12').at(-1), '2026-12-31');
});

test('adherence excludes future times and rest periods, not missing past records', () => {
  assert.equal(calendarDay(state, '2026-10-12', now).due, 1);
  assert.equal(calendarDay(state, '2026-10-13', now).missed, 0);
  assert.equal(calendarDay(state, '2026-10-22', now).status, 'rest');
  const month = calendarMonth(state, '2026-10', now);
  assert.equal(month.due, 23);
  assert.equal(month.missed, 23);
  assert.equal(month.rate, 0);
});

test('calendar completion, partial completion and undo follow recorded slots', () => {
  const day = calendarDay(state, '2026-10-11', now);
  const records = toggleRecord([], day.slots[0], day.date, now);
  assert.equal(calendarDay({ ...state, records }, day.date, now).status, 'partial');
  const completed = toggleRecord(records, day.slots[1], day.date, now);
  assert.equal(calendarDay({ ...state, records: completed }, day.date, now).status, 'complete');
  assert.equal(calendarMonth({ ...state, records: completed }, '2026-10', now).rate, 9);
  assert.equal(calendarDay({ ...state, records: toggleRecord(completed, day.slots[0], day.date, now) }, day.date, now).done, 1);
});

test('deleted or edited medication records remain in calendar without double counting', () => {
  const record = { id: 'pill:2026-10-11:08:00', medicineId: 'pill', name: '이전 약 이름', dose: '1정', date: '2026-10-11', time: '08:00', takenAt: now.toISOString() };
  assert.equal(calendarDay({ ...state, records: [record] }, record.date, now).slots.length, 2);
  const deleted = calendarDay({ ...emptyState(), records: [record] }, record.date, now);
  assert.equal(deleted.slots[0].name, '이전 약 이름');
  assert.equal(deleted.done, 1);
  assert.equal(deleted.status, 'complete');
  assert.equal(calendarMonth({ ...state, records: [record] }, '2026-10', now, 'other').rate, null);
});
