export const STORAGE_KEY = 'medicine-alarm:v1';
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const emptyState = () => ({ medicines: [], records: [], alerts: [], notifications: false });

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDate(key, offset) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return dateKey(date);
}

export function slotKey(medicineId, date, time) {
  return `${medicineId}:${date}:${time}`;
}

export function scheduleFor(medicines, records, date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return medicines.filter(m => m.days.includes(day) && m.startDate <= date).flatMap(m =>
    m.times.map(time => ({ ...m, time, key: slotKey(m.id, date, time), record: records.find(r => r.medicineId === m.id && r.date === date && r.time === time) }))
  ).sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

export function dueSlots(slots, date, now, alerted) {
  if (date !== dateKey(now)) return [];
  return slots.filter(slot => {
    const due = new Date(`${date}T${slot.time}:00`).getTime();
    const age = now.getTime() - due;
    return !slot.record && !alerted.includes(slot.key) && age >= 0 && age < 15 * 60 * 1000;
  });
}

export function toggleRecord(records, slot, date, now = new Date()) {
  const existing = records.some(r => r.medicineId === slot.id && r.date === date && r.time === slot.time);
  return existing
    ? records.filter(r => !(r.medicineId === slot.id && r.date === date && r.time === slot.time))
    : [...records, { id: slot.key, medicineId: slot.id, name: slot.name, dose: slot.dose, date, time: slot.time, takenAt: now.toISOString() }];
}

export function parseState(raw) {
  if (!raw) return emptyState();
  const value = JSON.parse(raw);
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00`).getTime());
  const validTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const validMedicine = m => m && typeof m.id === 'string' && typeof m.name === 'string' && m.name.trim() && typeof m.dose === 'string' && typeof m.note === 'string' && validDate(m.startDate) && Array.isArray(m.times) && m.times.length > 0 && m.times.every(validTime) && Array.isArray(m.days) && m.days.length > 0 && m.days.every(d => Number.isInteger(d) && d >= 0 && d < 7);
  const validRecord = r => r && typeof r.id === 'string' && typeof r.medicineId === 'string' && typeof r.name === 'string' && typeof r.dose === 'string' && validDate(r.date) && validTime(r.time) && typeof r.takenAt === 'string' && !Number.isNaN(Date.parse(r.takenAt));
  if (!value || !Array.isArray(value.medicines) || !value.medicines.every(validMedicine) || !Array.isArray(value.records) || !value.records.every(validRecord) || !Array.isArray(value.alerts) || !value.alerts.every(a => typeof a === 'string') || typeof value.notifications !== 'boolean') throw new Error('저장된 데이터 형식이 올바르지 않습니다.');
  return value;
}
