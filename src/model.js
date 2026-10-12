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

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function cycleStatus(medicine, date) {
  if (!medicine.cycle) return null;
  const { onDays, offDays } = medicine.cycle;
  // Count civil dates in UTC so a 23/25-hour daylight-saving day still counts as one day.
  const elapsed = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${medicine.startDate}T00:00:00Z`)) / 86400000;
  if (elapsed < 0) return { phase: 'pending', day: 0, length: onDays, resumeDate: medicine.startDate };
  const position = elapsed % (onDays + offDays);
  return position < onDays
    ? { phase: 'taking', day: position + 1, length: onDays, resumeDate: null }
    : { phase: 'rest', day: position - onDays + 1, length: offDays, resumeDate: shiftDate(date, onDays + offDays - position) };
}

export function scheduleFor(medicines, records, date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return medicines.filter(m => m.startDate <= date && (m.cycle ? cycleStatus(m, date).phase === 'taking' : m.days.includes(day))).flatMap(m =>
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
  const validDate = isDateKey;
  const validTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const validCycle = cycle => cycle == null || (Number.isInteger(cycle.onDays) && cycle.onDays >= 1 && cycle.onDays <= 365 && Number.isInteger(cycle.offDays) && cycle.offDays >= 0 && cycle.offDays <= 365);
  const validMedicine = m => m && typeof m.id === 'string' && typeof m.name === 'string' && m.name.trim() && typeof m.dose === 'string' && typeof m.note === 'string' && validDate(m.startDate) && Array.isArray(m.times) && m.times.length > 0 && m.times.every(validTime) && Array.isArray(m.days) && m.days.length > 0 && m.days.every(d => Number.isInteger(d) && d >= 0 && d < 7) && validCycle(m.cycle);
  const validRecord = r => r && typeof r.id === 'string' && typeof r.medicineId === 'string' && typeof r.name === 'string' && typeof r.dose === 'string' && validDate(r.date) && validTime(r.time) && typeof r.takenAt === 'string' && !Number.isNaN(Date.parse(r.takenAt));
  if (!value || !Array.isArray(value.medicines) || !value.medicines.every(validMedicine) || !Array.isArray(value.records) || !value.records.every(validRecord) || !Array.isArray(value.alerts) || !value.alerts.every(a => typeof a === 'string') || typeof value.notifications !== 'boolean') throw new Error('저장된 데이터 형식이 올바르지 않습니다.');
  return value;
}
