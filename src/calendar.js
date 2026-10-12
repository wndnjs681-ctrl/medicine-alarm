import { cycleStatus, dateKey, scheduleFor, shiftDate } from './model.js';

export function monthDates(month) {
  const first = `${month}-01`;
  const result = [];
  for (let date = first; date.startsWith(`${month}-`); date = shiftDate(date, 1)) result.push(date);
  return result;
}

export function calendarDay(state, date, now = new Date(), medicineId = '') {
  const medicines = state.medicines.filter(m => !medicineId || m.id === medicineId);
  const records = state.records.filter(r => r.date === date && (!medicineId || r.medicineId === medicineId));
  const slots = scheduleFor(medicines, records, date);
  // Recorded doses survive schedule edits and deletion; never count them twice.
  for (const record of records) {
    if (!slots.some(s => s.id === record.medicineId && s.time === record.time)) slots.push({ id: record.medicineId, name: record.name, dose: record.dose, time: record.time, key: record.id, record });
  }
  slots.sort((a, b) => a.time.localeCompare(b.time));
  const today = dateKey(now);
  const elapsed = slots.filter(s => s.record || date < today || (date === today && new Date(`${date}T${s.time}:00`) <= now));
  const done = slots.filter(s => s.record).length;
  const missed = elapsed.filter(s => !s.record).length;
  const resting = medicines.filter(m => cycleStatus(m, date)?.phase === 'rest');
  const status = slots.length && done === slots.length ? 'complete' : done ? 'partial' : missed ? 'missed' : slots.length ? 'planned' : resting.length ? 'rest' : 'empty';
  return { date, slots, done, missed, due: elapsed.length, resting, status };
}

export const dayLabels = { complete: '완료', partial: '일부 복용', missed: '미기록', planned: '예정', rest: '휴약', empty: '일정 없음' };

export function calendarMonth(state, month, now, medicineId = '') {
  const days = monthDates(month).map(date => calendarDay(state, date, now, medicineId));
  const done = days.reduce((sum, day) => sum + day.done, 0);
  const due = days.reduce((sum, day) => sum + day.due, 0);
  return { days, done, due, missed: due - done, rate: due ? Math.round(done / due * 100) : null };
}
