import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pill, CalendarDays, ClipboardList, History, Plus, Check, ChevronLeft, ChevronRight, Bell, BellOff, X, Pencil, Trash2, Clock3, Download, Settings, CircleCheck, AlertCircle } from 'lucide-react';
import { STORAGE_KEY, WEEKDAYS, emptyState, dateKey, shiftDate, scheduleFor, dueSlots, toggleRecord, parseState } from './model.js';
import './style.css';

const formatDate = date => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`));
const initial = (() => {
  try { return { state: parseState(localStorage.getItem(STORAGE_KEY)), error: '' }; }
  catch { return { state: emptyState(), error: '저장된 데이터를 읽지 못했습니다. 원본 데이터를 보존하기 위해 저장을 중단했습니다.' }; }
})();

function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => { previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-header"><h2>{title}</h2><button className="icon-button" title="닫기" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}

function MedicineForm({ medicine, onSave, onClose }) {
  const [name, setName] = useState(medicine?.name || '');
  const [dose, setDose] = useState(medicine?.dose || '');
  const [note, setNote] = useState(medicine?.note || '');
  const [times, setTimes] = useState(medicine?.times || ['08:00']);
  const [days, setDays] = useState(medicine?.days || [0, 1, 2, 3, 4, 5, 6]);
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!name.trim() || !dose.trim() || !days.length || times.some(t => !t)) { setError('약 이름, 용량, 복용 시간과 요일을 확인해 주세요.'); return; }
    if (new Set(times).size !== times.length) { setError('같은 복용 시간이 중복되어 있습니다.'); return; }
    onSave({ id: medicine?.id || crypto.randomUUID(), name: name.trim(), dose: dose.trim(), note: note.trim(), times: [...times].sort(), days, startDate: medicine?.startDate || dateKey() });
  }
  return <Modal title={medicine ? '약 정보 수정' : '새로운 약 등록'} onClose={onClose}>
    <form onSubmit={submit} className="medicine-form">
      <label>약 이름<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="예: 비타민 D" /></label>
      <label>한 번에 복용할 용량<input required maxLength={60} value={dose} onChange={e => setDose(e.target.value)} placeholder="예: 1정, 5mL" /></label>
      <fieldset><legend>복용 시간</legend><div className="time-inputs">{times.map((time, index) => <div className="time-input" key={index}><input aria-label={`복용 시간 ${index + 1}`} type="time" required value={time} onChange={e => setTimes(times.map((t, i) => i === index ? e.target.value : t))} />{times.length > 1 && <button type="button" className="icon-button" aria-label={`복용 시간 ${index + 1} 삭제`} title="시간 삭제" onClick={() => setTimes(times.filter((_, i) => i !== index))}><X size={18} /></button>}</div>)}{times.length < 8 && <button className="text-button" type="button" onClick={() => setTimes([...times, '12:00'])}><Plus size={16} />시간 추가</button>}</div></fieldset>
      <fieldset><legend>복용 요일</legend><div className="weekdays">{[1, 2, 3, 4, 5, 6, 0].map(day => <button key={day} type="button" aria-label={`${WEEKDAYS[day]}요일`} aria-pressed={days.includes(day)} onClick={() => setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day])}>{WEEKDAYS[day]}</button>)}</div></fieldset>
      <label>복용 메모 <span className="optional">선택</span><textarea maxLength={200} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="예: 식사 후 복용" /></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button className="primary-button" type="submit"><Check size={18} />저장</button></div>
    </form>
  </Modal>;
}

function App() {
  const [state, setState] = useState(initial.state);
  const [storageError, setStorageError] = useState(initial.error);
  const [tab, setTab] = useState('today');
  const [date, setDate] = useState(dateKey());
  const [now, setNow] = useState(new Date());
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState('');
  const [permission, setPermission] = useState('Notification' in window ? Notification.permission : 'unsupported');
  const stateRef = useRef(state);
  const alerting = useRef(new Set(state.alerts));
  const today = dateKey(now);
  const slots = scheduleFor(state.medicines, state.records, date);
  const done = slots.filter(s => s.record).length;
  const todaySlots = scheduleFor(state.medicines, state.records, today);
  const upcoming = todaySlots.find(s => !s.record && new Date(`${today}T${s.time}:00`) >= now);

  useEffect(() => {
    stateRef.current = state;
    if (initial.error) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setStorageError(''); }
    catch { setStorageError('저장 공간에 접근할 수 없습니다. 지금 변경한 내용은 브라우저를 닫으면 사라질 수 있습니다.'); }
  }, [state]);
  useEffect(() => {
    function tick() {
      const current = new Date();
      setNow(previous => { if (dateKey(previous) !== dateKey(current)) setDate(d => d === dateKey(previous) ? dateKey(current) : d); return current; });
      if ('Notification' in window) setPermission(Notification.permission);
      const data = stateRef.current;
      if (!data.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
      const key = dateKey(current);
      const due = dueSlots(scheduleFor(data.medicines, data.records, key), key, current, [...alerting.current]);
      for (const slot of due) {
        try {
          const notification = new Notification('복약노트 · 복용 시간', { body: `${slot.name} ${slot.dose}${slot.note ? ` · ${slot.note}` : ''}`, tag: slot.key });
          notification.onclick = () => { window.focus(); setTab('today'); setDate(dateKey()); notification.close(); };
          alerting.current.add(slot.key);
          setToast(`${slot.name} 복용 시간입니다.`);
        } catch { setToast('알림을 표시하지 못했습니다. 브라우저의 알림 설정을 확인해 주세요.'); }
      }
      if (due.length) setState(s => ({ ...s, alerts: [...alerting.current].filter(a => a.includes(key)) }));
    }
    tick();
    const timer = setInterval(tick, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);

  function saveMedicine(medicine) {
    setState(s => ({ ...s, medicines: s.medicines.some(m => m.id === medicine.id) ? s.medicines.map(m => m.id === medicine.id ? medicine : m) : [...s.medicines, medicine] }));
    setEditing(null);
    setToast('약 정보를 저장했습니다.');
  }
  async function enableNotifications() {
    if (!('Notification' in window) || !window.isSecureContext) { setToast('알림은 HTTPS 또는 로컬 환경의 지원 브라우저에서 사용할 수 있습니다.'); return; }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setState(s => ({ ...s, notifications: result === 'granted' }));
      setToast(result === 'granted' ? '복용 알림을 켰습니다.' : '브라우저 설정에서 알림 권한을 허용해 주세요.');
    } catch { setToast('알림 권한을 요청하지 못했습니다. 브라우저 설정을 확인해 주세요.'); }
  }
  function exportRecords() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), medicines: state.medicines, records: state.records }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `medicine-records-${today}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="/" className="brand"><span className="brand-symbol"><Pill size={23} /></span><span>복약노트<small>MEDICINE ALARM</small></span></a>
      <nav aria-label="주 메뉴">{[{ id: 'today', label: '오늘의 복용', icon: CalendarDays }, { id: 'medicines', label: '내 약 목록', icon: ClipboardList }, { id: 'history', label: '복용 기록', icon: History }].map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'nav-item active' : 'nav-item'} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={19} /><span>{label}</span>{id === 'medicines' && <span className="nav-count" aria-hidden="true">{state.medicines.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-indicator"><span />이 브라우저에 저장됨</div><button className="nav-item" onClick={() => setSettings(true)}><Settings size={19} />설정</button></div>
    </aside>
    <main>
      <header className="topbar"><span className="current-date">{formatDate(today)}</span><button className="notification-button" onClick={() => setSettings(true)}>{state.notifications && permission === 'granted' ? <Bell size={17} /> : <BellOff size={17} />}<span>알림 {state.notifications && permission === 'granted' ? '켜짐' : '꺼짐'}</span></button></header>
      <div className="content">
        {storageError && <div className="warning" role="alert"><AlertCircle size={20} /><span>{storageError}</span></div>}
        <div className="page-heading"><div><p className="eyebrow">나의 복약 관리</p><h1>{tab === 'today' ? '오늘의 복용' : tab === 'medicines' ? '내 약 목록' : '복용 기록'}</h1><p className="subtitle">{tab === 'today' ? '작은 기록으로 챙기는 매일의 건강' : tab === 'medicines' ? `등록한 약 ${state.medicines.length}개` : '차곡차곡 쌓인 나의 복용 내역'}</p></div><button className="primary-button" onClick={() => setEditing({})}><Plus size={18} />약 등록</button></div>
        {tab === 'today' && <>
          <section className="summary-band" aria-label="오늘의 복용 요약"><div className="summary-progress"><span className="progress-ring" style={{ '--progress': `${todaySlots.length ? todaySlots.filter(s => s.record).length / todaySlots.length * 100 : 0}%` }}><CircleCheck size={26} /></span><div><span className="stat-label">오늘 복용 완료</span><p><strong>{todaySlots.filter(s => s.record).length}</strong><span> / {todaySlots.length}회</span></p></div></div><div className="summary-next"><span className="stat-label">다음 복용</span><p>{upcoming ? <><strong>{upcoming.time}</strong><span>{upcoming.name}</span></> : <span className="no-next">{todaySlots.length ? '남은 예정 시간이 없습니다' : '등록된 일정이 없습니다'}</span>}</p></div></section>
          <section className="schedule-section"><div className="section-header"><div className="date-nav"><button className="icon-button" aria-label="이전 날" title="이전 날" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={20} /></button><h2>{formatDate(date)}</h2><button className="icon-button" aria-label="다음 날" title="다음 날" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={20} /></button>{date !== today && <button className="text-button" onClick={() => setDate(today)}>오늘</button>}</div><span className="muted completion">{done} / {slots.length}회 완료</span></div>
            {!slots.length ? <div className="empty-state"><span className="empty-icon"><Pill size={32} /></span><h3>{state.medicines.length ? '이날은 복용 일정이 없어요' : '첫 번째 약을 등록해 주세요'}</h3><p>{state.medicines.length ? '등록한 복용 요일에 일정이 표시됩니다.' : '약 이름과 복용 시간을 정하면 하루 일정이 시작됩니다.'}</p>{!state.medicines.length && <button className="primary-button" onClick={() => setEditing({})}><Plus size={18} />약 등록</button>}</div> : <div className="schedule-list">{slots.map(slot => {
              const overdue = date < today || (date === today && slot.time < `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
              return <article className={`dose-row ${slot.record ? 'taken' : ''}`} key={slot.key}><div className="dose-time"><Clock3 size={16} /><strong>{slot.time}</strong></div><span className="medicine-symbol"><Pill size={21} /></span><div className="dose-info"><h3>{slot.name}</h3><p>{slot.dose}{slot.note && <span> · {slot.note}</span>}</p></div><span className={`status ${slot.record ? 'complete' : overdue ? 'overdue' : ''}`}>{slot.record ? '복용 완료' : overdue ? '미복용' : '예정'}</span><button className={`dose-check ${slot.record ? 'checked' : ''}`} disabled={date > today || !!initial.error} aria-label={`${slot.time} ${slot.name} ${slot.record ? '복용 취소' : '복용 완료'}`} aria-pressed={!!slot.record} title={date > today ? '미래 일정은 복용 기록을 남길 수 없습니다' : slot.record ? '복용 취소' : '복용 완료'} onClick={() => setState(s => ({ ...s, records: toggleRecord(s.records, slot, date) }))}><Check size={19} /></button></article>;
            })}</div>}
          </section>
          <p className="bottom-note"><Pill size={15} />복용량과 복용 시간은 의사 또는 약사의 안내를 따라 주세요.</p>
        </>}
        {tab === 'medicines' && <section className="medicine-list">{!state.medicines.length ? <div className="empty-state"><span className="empty-icon"><ClipboardList size={32} /></span><h3>아직 등록한 약이 없어요</h3><button className="primary-button" onClick={() => setEditing({})}><Plus size={18} />약 등록</button></div> : state.medicines.map(m => <article className="medicine-row" key={m.id}><span className="medicine-symbol"><Pill size={24} /></span><div className="medicine-detail"><h2>{m.name}</h2><p>{m.dose}{m.note && ` · ${m.note}`}</p><div className="medicine-meta"><span><Clock3 size={14} />{m.times.join(', ')}</span><span>{m.days.length === 7 ? '매일' : [1, 2, 3, 4, 5, 6, 0].filter(d => m.days.includes(d)).map(d => WEEKDAYS[d]).join(' · ')}</span></div></div><div className="row-actions"><button className="icon-button" title="수정" aria-label={`${m.name} 수정`} onClick={() => setEditing(m)}><Pencil size={18} /></button><button className="icon-button danger" title="삭제" aria-label={`${m.name} 삭제`} onClick={() => setDeleting(m)}><Trash2 size={18} /></button></div></article>)}</section>}
        {tab === 'history' && <section><div className="section-header"><h2>복용 완료 내역 <span className="muted">{state.records.length}건</span></h2><button className="secondary-button" disabled={!state.records.length} onClick={exportRecords}><Download size={16} />기록 내보내기</button></div>{!state.records.length ? <div className="empty-state"><span className="empty-icon"><History size={32} /></span><h3>아직 복용 기록이 없어요</h3><p>복용을 완료하면 이곳에 기록이 남습니다.</p></div> : <div className="history-list">{[...state.records].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)).map(record => <article className="history-row" key={record.id}><span className="history-check"><Check size={18} /></span><div className="history-info"><h3>{record.name}</h3><p>{record.dose} · {formatDate(record.date)} {record.time}</p></div><span className="muted actual-time">{new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.takenAt))} 기록</span></article>)}</div>}</section>}
      </div>
    </main>
    {editing && <MedicineForm medicine={editing.id ? editing : null} onSave={saveMedicine} onClose={() => setEditing(null)} />}
    {deleting && <Modal title="약 삭제" onClose={() => setDeleting(null)}><div className="modal-body"><p><strong>{deleting.name}</strong>을 목록에서 삭제할까요?</p><p className="muted">앞으로의 일정은 삭제되고, 이미 완료한 복용 기록은 남습니다.</p></div><div className="modal-footer"><button className="secondary-button" onClick={() => setDeleting(null)}>취소</button><button className="danger-button" onClick={() => { setState(s => ({ ...s, medicines: s.medicines.filter(m => m.id !== deleting.id) })); setDeleting(null); setToast('약을 삭제했습니다.'); }}><Trash2 size={17} />삭제</button></div></Modal>}
    {settings && <Modal title="설정" onClose={() => setSettings(false)}><div className="modal-body"><div className="setting-row"><div><h3>브라우저 복용 알림</h3><p className="muted">{permission === 'denied' ? '브라우저 설정에서 알림 권한을 허용해 주세요.' : permission === 'unsupported' ? '이 브라우저는 알림을 지원하지 않습니다.' : '복용 시간에 알림을 받습니다.'}</p></div><button className={`toggle ${state.notifications && permission === 'granted' ? 'on' : ''}`} role="switch" aria-label="복용 알림" aria-checked={state.notifications && permission === 'granted'} onClick={() => state.notifications && permission === 'granted' ? setState(s => ({ ...s, notifications: false })) : enableNotifications()}><span /></button></div><p className="settings-notice">알림을 받으려면 이 페이지를 열어 두어야 합니다. 브라우저나 기기가 절전 상태이면 알림이 늦어질 수 있습니다.</p><div className="setting-row"><div><h3>복용 데이터</h3><p className="muted">이 기기의 브라우저에만 저장됩니다. 브라우저 데이터를 삭제하면 기록도 삭제됩니다.</p></div></div><button className="secondary-button" onClick={exportRecords}><Download size={16} />데이터 내보내기</button></div></Modal>}
    {toast && <div role="status" className="toast"><CircleCheck size={18} /><span>{toast}</span><button className="icon-button" aria-label="알림 닫기" title="닫기" onClick={() => setToast('')}><X size={16} /></button></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
