import React, { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, Clock3, CalendarDays, List, Pencil, Plus } from 'lucide-react';
import { dateKey } from './model.js';
import { calendarDay, calendarMonth, dayLabels } from './calendar.js';

export default function AdherenceCalendar({ state, now, onToggle, onExport, onEdit, onAdd, disabled }) {
  const today = dateKey(now);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [medicineId, setMedicineId] = useState('');
  const [view, setView] = useState('calendar');
  const data = calendarMonth(state, month, now, medicineId);
  const detail = calendarDay(state, selected, now, medicineId);
  const choices = new Map(state.records.map(r => [r.medicineId, r.name]));
  state.medicines.forEach(m => choices.set(m.id, m.name));
  const offset = new Date(`${month}-01T12:00:00`).getDay();
  function moveMonth(amount) {
    const date = new Date(`${month}-01T12:00:00`);
    date.setMonth(date.getMonth() + amount);
    const next = dateKey(date);
    setMonth(next.slice(0, 7)); setSelected(next);
  }
  const weeks = Array.from({ length: Math.ceil((offset + data.days.length) / 7) }, (_, index) => {
    const days = data.days.slice(Math.max(0, index * 7 - offset), (index + 1) * 7 - offset);
    return { done: days.reduce((sum, d) => sum + d.done, 0), due: days.reduce((sum, d) => sum + d.due, 0) };
  });
  const records = state.records.filter(r => !medicineId || r.medicineId === medicineId).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  return <section aria-label="복용 캘린더">
    <div className="calendar-toolbar"><div className="schedule-modes" role="group" aria-label="기록 보기"><button aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><CalendarDays size={16} />캘린더</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={16} />목록</button></div><button className="secondary-button" onClick={onExport}><Download size={16} />기록 내보내기</button></div>
    <label className="calendar-filter">약 선택<select value={medicineId} onChange={e => setMedicineId(e.target.value)}><option value="">전체 약</option>{[...choices].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    {view === 'calendar' ? <>
      <div className="section-header"><div className="date-nav"><button className="icon-button" title="이전 달" aria-label="이전 달" onClick={() => moveMonth(-1)}><ChevronLeft size={20} /></button><h2>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</h2><button className="icon-button" title="다음 달" aria-label="다음 달" onClick={() => moveMonth(1)}><ChevronRight size={20} /></button></div><button className="text-button" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>오늘</button></div>
      <div className="adherence-summary" aria-label="월별 복용 요약"><div><span>복용률</span><strong>{data.rate === null ? '-' : `${data.rate}%`}</strong></div><div><span>복용 완료</span><strong>{data.done}<small>회</small></strong></div><div><span>미기록</span><strong>{data.missed}<small>회</small></strong></div></div>
      <div className="calendar-grid" aria-label={`${month} 복용 현황`}>{['일', '월', '화', '수', '목', '금', '토'].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}{Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}{data.days.map(day => <button key={day.date} className={`calendar-cell ${day.status} ${day.date === selected ? 'selected' : ''}`} aria-label={`${day.date} ${dayLabels[day.status]} ${day.done}/${day.slots.length}회`} aria-pressed={day.date === selected} aria-current={day.date === today ? 'date' : undefined} onClick={() => setSelected(day.date)}><span className="calendar-number">{Number(day.date.slice(8))}</span><span className="calendar-state">{day.status === 'empty' ? '' : dayLabels[day.status]}</span><span className="calendar-count">{day.slots.length ? `${day.done}/${day.slots.length}` : ''}</span></button>)}</div>
      <div className="calendar-legend">{['complete', 'partial', 'missed', 'rest', 'planned'].map(status => <span className={status} key={status}><i />{dayLabels[status]}</span>)}</div>
      <p className="muted calendar-note">미기록·복용률은 현재 등록 일정과 경과한 복용 시간 기준입니다. 휴약일과 앞으로의 복용 시간은 제외됩니다.</p>
      <section className="adherence-trend" aria-label="주별 복용 추이"><h2>주별 복용 추이</h2>{weeks.map((week, index) => <div className="trend-row" key={index}><span>{index + 1}주</span><progress aria-label={`${index + 1}주 복용률`} max={Math.max(week.due, 1)} value={week.done} /><span>{week.due ? `${Math.round(week.done / week.due * 100)}% · ${week.done}/${week.due}회` : '집계 없음'}</span></div>)}</section>
      <div className="section-header calendar-day-heading"><h2>{selected} 복용 내역</h2><button className="secondary-button" disabled={disabled || selected > today || !choices.size} onClick={() => onAdd(selected, medicineId)}><Plus size={16} />기록 추가</button><span className="muted">{detail.done}/{detail.slots.length}회 완료</span></div>
      {!detail.slots.length && <p className="muted">{detail.resting.length ? `휴약 기간 · ${detail.resting.map(m => m.name).join(', ')}` : '복용 일정이 없습니다.'}</p>}
      <div className="schedule-list">{detail.slots.map(slot => <article className="dose-row" key={slot.key}><div className="dose-time"><Clock3 size={16} /><strong>{slot.time}</strong></div><div className="dose-info"><h3>{slot.name}</h3><p>{slot.dose}</p></div><span className={`status ${slot.record ? 'complete' : ''}`}>{slot.record ? '복용 완료' : selected > today || new Date(`${selected}T${slot.time}:00`) > now ? '예정' : '미기록'}</span><div className="record-actions"><button className="icon-button" title="기록 수정" aria-label={`${selected} ${slot.time} ${slot.name} 기록 수정`} disabled={disabled || selected > today} onClick={() => slot.record ? onEdit(slot.record) : onAdd(selected, slot.id, slot)}><Pencil size={17} /></button><button className={`dose-check ${slot.record ? 'checked' : ''}`} aria-label={`${selected} ${slot.time} ${slot.name} ${slot.record ? '복용 취소' : '복용 완료'}`} aria-pressed={!!slot.record} title={slot.record ? '복용 취소' : '복용 완료'} disabled={selected > today || disabled} onClick={() => onToggle(slot, selected)}><Check size={18} /></button></div></article>)}</div>
    </> : <><div className="section-header"><h2>복용 완료 내역 <span className="muted">{records.length}건</span></h2></div>{!records.length && <p className="muted">아직 복용 기록이 없어요</p>}<div className="history-list">{records.map(record => <article className="history-row" key={record.id}><span className="history-check"><Check size={18} /></span><div className="history-info"><h3>{record.name}</h3><p>{record.dose} · {record.date} {record.time}</p></div><span className="muted actual-time">{new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.takenAt))} 기록</span><button className="icon-button" title="기록 수정" aria-label={`${record.date} ${record.time} ${record.name} 기록 수정`} disabled={disabled} onClick={() => onEdit(record)}><Pencil size={17} /></button></article>)}</div></>}
  </section>;
}
