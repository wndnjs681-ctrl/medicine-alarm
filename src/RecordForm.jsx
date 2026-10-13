import React, { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { dateKey } from './model.js';

function localTimestamp(date) {
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function RecordForm({ Modal, state, initial, onSave, onRemove, onClose }) {
  const choices = new Map(state.records.map(record => [record.medicineId, { id: record.medicineId, name: record.name, dose: record.dose, times: [record.time] }]));
  state.medicines.forEach(m => choices.set(m.id, m));
  const selectedMedicine = initial.medicineId || choices.keys().next().value || '';
  const selectedTime = initial.time || choices.get(selectedMedicine)?.times[0] || '08:00';
  const [medicineId, setMedicineId] = useState(selectedMedicine);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(selectedTime);
  const [dose, setDose] = useState(initial.dose || choices.get(selectedMedicine)?.dose || '');
  const [takenAt, setTakenAt] = useState(initial.takenAt ? localTimestamp(new Date(initial.takenAt)) : localTimestamp(new Date(Math.min(new Date(`${initial.date}T${selectedTime}`).getTime(), Date.now()))));
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    const medicine = choices.get(medicineId);
    const message = onSave({ medicineId, name: initial.id ? initial.name : medicine?.name || '', dose, date, time, takenAt }, initial.id || null);
    if (message) setError(message);
  }
  return <Modal title={initial.id ? '복용 기록 수정' : '복용 기록 추가'} onClose={onClose}><form className="medicine-form" onSubmit={submit}>
    <label>기록할 약<select autoFocus required disabled={!!initial.id} value={medicineId} onChange={event => { const id = event.target.value; setMedicineId(id); setDose(choices.get(id)?.dose || ''); }}><option value="" disabled>약 선택</option>{[...choices.values()].map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
    <label>복용 날짜<input type="date" required max={dateKey()} value={date} onChange={event => setDate(event.target.value)} /></label>
    <label>복용 시간<input type="time" required value={time} onChange={event => setTime(event.target.value)} /></label>
    <label>복용 용량<input required maxLength={60} value={dose} onChange={event => setDose(event.target.value)} /></label>
    <label>실제 복용 시각<input type="datetime-local" required max={localTimestamp(new Date())} value={takenAt} onChange={event => setTakenAt(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer record-footer">{initial.id && <button type="button" className="danger-button" onClick={() => onRemove(initial.id)}><Trash2 size={16} />복용 취소</button>}<button type="button" className="secondary-button" onClick={onClose}>닫기</button><button className="primary-button" type="submit"><Check size={17} />저장</button></div>
  </form></Modal>;
}
