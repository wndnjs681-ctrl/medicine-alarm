import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pill, CalendarDays, ClipboardList, History, Plus, Check, ChevronLeft, ChevronRight, Bell, BellOff, X, Pencil, Trash2, Clock3, Download, Upload, Home, PanelsTopLeft, Settings, CircleCheck, AlertCircle } from 'lucide-react';
import { STORAGE_KEY, WEEKDAYS, emptyState, dateKey, shiftDate, scheduleFor, dueSlots, toggleRecord, parseState, cycleStatus, isDateKey } from './model.js';
import { isAndroidApp, loadWidgetState, saveWidgetState, subscribeWidgetState, requestHomeWidget, exportAndroidData, getHomeWidgetStatus, subscribeHomeWidgetStatus, openAndroidHome } from './native-widget.js';
import AdherenceCalendar from './AdherenceCalendar.jsx';
import NotificationSettings from './NotificationSettings.jsx';
import { getNotificationStatus, requestNotificationPermission } from './native-widget.js';
import RecordForm from './RecordForm.jsx';
import { saveRecord } from './model.js';
import './style.css';

const formatDate = date => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`));

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
  const [scheduleMode, setScheduleMode] = useState(medicine?.cycle ? 'cycle' : 'weekly');
  const [startDate, setStartDate] = useState(medicine?.startDate || dateKey());
  const [onDays, setOnDays] = useState(medicine?.cycle?.onDays ?? 21);
  const [offDays, setOffDays] = useState(medicine?.cycle?.offDays ?? 7);
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!name.trim() || !dose.trim() || (scheduleMode === 'weekly' && !days.length) || times.some(t => !t) || !isDateKey(startDate)) { setError('약 이름, 용량, 복용 시간과 시작 날짜를 확인해 주세요.'); return; }
    if (new Set(times).size !== times.length) { setError('같은 복용 시간이 중복되어 있습니다.'); return; }
    const cycle = scheduleMode === 'cycle' ? { onDays: Number(onDays), offDays: Number(offDays) } : null;
    if (cycle && (!Number.isInteger(cycle.onDays) || cycle.onDays < 1 || cycle.onDays > 365 || !Number.isInteger(cycle.offDays) || cycle.offDays < 0 || cycle.offDays > 365)) { setError('복용 기간은 1~365일, 휴약 기간은 0~365일로 설정해 주세요.'); return; }
    onSave({ id: medicine?.id || crypto.randomUUID(), name: name.trim(), dose: dose.trim(), note: note.trim(), times: [...times].sort(), days: cycle ? [0, 1, 2, 3, 4, 5, 6] : days, startDate, cycle });
  }
  return <Modal title={medicine ? '약 정보 수정' : '새로운 약 등록'} onClose={onClose}>
    <form onSubmit={submit} className="medicine-form">
      <label>약 이름<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="예: 비타민 D" /></label>
      <label>한 번에 복용할 용량<input required maxLength={60} value={dose} onChange={e => setDose(e.target.value)} placeholder="예: 1정, 5mL" /></label>
      <fieldset><legend>복용 시간</legend><div className="time-inputs">{times.map((time, index) => <div className="time-input" key={index}><input aria-label={`복용 시간 ${index + 1}`} type="time" required value={time} onChange={e => setTimes(times.map((t, i) => i === index ? e.target.value : t))} />{times.length > 1 && <button type="button" className="icon-button" aria-label={`복용 시간 ${index + 1} 삭제`} title="시간 삭제" onClick={() => setTimes(times.filter((_, i) => i !== index))}><X size={18} /></button>}</div>)}{times.length < 8 && <button className="text-button" type="button" onClick={() => setTimes([...times, '12:00'])}><Plus size={16} />시간 추가</button>}</div></fieldset>
      <fieldset><legend>복용 일정</legend><div className="schedule-modes" role="group" aria-label="복용 일정 방식"><button type="button" aria-pressed={scheduleMode === 'weekly'} onClick={() => setScheduleMode('weekly')}>요일별</button><button type="button" aria-pressed={scheduleMode === 'cycle'} onClick={() => setScheduleMode('cycle')}>복용 · 휴약 반복</button></div></fieldset>
      {scheduleMode === 'weekly' ? <fieldset><legend>복용 요일</legend><div className="weekdays">{[1, 2, 3, 4, 5, 6, 0].map(day => <button key={day} type="button" aria-label={`${WEEKDAYS[day]}요일`} aria-pressed={days.includes(day)} onClick={() => setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day])}>{WEEKDAYS[day]}</button>)}</div></fieldset> : <div className="cycle-inputs"><label>복용 기간 (일)<input type="number" min="1" max="365" step="1" required value={onDays} onChange={e => setOnDays(e.target.value)} /></label><label>휴약 기간 (일)<input type="number" min="0" max="365" step="1" required value={offDays} onChange={e => setOffDays(e.target.value)} /></label></div>}
      <label>{scheduleMode === 'cycle' ? '주기 시작일' : '복용 시작일'}<input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
      <label>복용 메모 <span className="optional">선택</span><textarea maxLength={200} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="예: 식사 후 복용" /></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button className="primary-button" type="submit"><Check size={18} />저장</button></div>
    </form>
  </Modal>;
}

function App({ initial }) {
  const [state, setState] = useState(initial.state);
  const [storageError, setStorageError] = useState(initial.error);
  const [tab, setTab] = useState('today');
  const [date, setDate] = useState(dateKey());
  const [now, setNow] = useState(new Date());
  const [editing, setEditing] = useState(null);
  const [recordEditing, setRecordEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [settings, setSettings] = useState(false);
  const [nativeNotificationStatus, setNativeNotificationStatus] = useState(null);
  const [widgetStatus, setWidgetStatus] = useState(null);
  const [widgetAdding, setWidgetAdding] = useState(false);
  const pinRequest = useRef(null);
  const [importing, setImporting] = useState(null);
  const importInput = useRef(null);
  const [toast, setToast] = useState('');
  const [permission, setPermission] = useState('Notification' in window ? Notification.permission : 'unsupported');
  const stateRef = useRef(state);
  const alerting = useRef(new Set(state.alerts));
  const today = dateKey(now);
  const slots = scheduleFor(state.medicines, state.records, date);
  const done = slots.filter(s => s.record).length;
  const todaySlots = scheduleFor(state.medicines, state.records, today);
  const upcoming = todaySlots.find(s => !s.record && new Date(`${today}T${s.time}:00`) >= now);
  const cycles = state.medicines.filter(m => m.cycle).map(m => ({ medicine: m, status: cycleStatus(m, date) }));
  const resting = cycles.filter(c => c.status.phase === 'rest');
  const widgetRegistrationLabel = widgetAdding ? '추가 확인 중' : widgetStatus?.error ? '등록 상태 확인 불가' : widgetStatus ? `등록된 위젯 ${widgetStatus.widgetCount}개` : '등록 상태 확인 중';

  useEffect(() => {
    stateRef.current = state;
    if (initial.error) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setStorageError(''); }
    catch { setStorageError('저장 공간에 접근할 수 없습니다. 지금 변경한 내용은 브라우저를 닫으면 사라질 수 있습니다.'); }
    saveWidgetState(state).catch(error => {
      if (error.state) { setState(error.state); setToast(error.message); }
      else setStorageError('홈 화면 위젯과 기록을 동기화하지 못했습니다. 앱을 다시 열어 확인해 주세요.');
    });
  }, [state]);
  useEffect(() => {
    let active = true;
    let subscription;
    subscribeWidgetState(next => { if (active) setState(next); }, () => { if (active) setStorageError('위젯의 복용 기록을 읽지 못했습니다.'); })
      .then(handle => { if (active) subscription = handle; else handle.remove(); })
      .catch(() => { if (active) setStorageError('위젯 기록 동기화를 시작하지 못했습니다.'); });
    return () => { active = false; subscription?.remove(); };
  }, []);
  useEffect(() => {
    if (!isAndroidApp) return;
    let active = true;
    let subscription;
    function receive(status) {
      if (!active) return;
      setWidgetStatus(status);
      const request = pinRequest.current;
      if (!request) return;
      if (status.widgetCount > request.before) {
        pinRequest.current = null;
        setWidgetAdding(false);
        setToast('홈 화면에 위젯을 추가했습니다.');
      } else if (Date.now() >= request.deadline && document.visibilityState === 'visible') {
        pinRequest.current = null;
        setWidgetAdding(false);
        setToast('위젯 등록이 확인되지 않았습니다. 홈 화면의 위젯 목록에서 복약노트를 추가해 주세요.');
      }
    }
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      getHomeWidgetStatus().then(receive).catch(() => {
        if (!active) return;
        setWidgetStatus({ error: true });
        if (pinRequest.current && Date.now() >= pinRequest.current.deadline) {
          pinRequest.current = null;
          setWidgetAdding(false);
          setToast('위젯 상태를 확인하지 못했습니다. 홈 화면의 위젯 목록을 확인해 주세요.');
        }
      });
    };
    refresh();
    subscribeHomeWidgetStatus(receive).then(handle => { if (active) subscription = handle; else handle.remove(); }).catch(() => {});
    const timer = setInterval(() => { if (pinRequest.current) refresh(); }, 3000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); subscription?.remove(); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    if (!isAndroidApp) return;
    let active = true;
    const refresh = () => getNotificationStatus().then(status => { if (active) setNativeNotificationStatus(status); }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    function tick() {
      const current = new Date();
      setNow(previous => { if (dateKey(previous) !== dateKey(current)) setDate(d => d === dateKey(previous) ? dateKey(current) : d); return current; });
      if ('Notification' in window) setPermission(Notification.permission);
      const data = stateRef.current;
      if (isAndroidApp || !data.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
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
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(current => current === toast ? '' : current), 5000); return () => clearTimeout(timer); }, [toast]);

  function saveMedicine(medicine) {
    setState(s => ({ ...s, medicines: s.medicines.some(m => m.id === medicine.id) ? s.medicines.map(m => m.id === medicine.id ? medicine : m) : [...s.medicines, medicine] }));
    setEditing(null);
    setToast('약 정보를 저장했습니다.');
  }
  function saveEditedRecord(draft, originalId) {
    try {
      const current = stateRef.current;
      const records = saveRecord(current.records, draft, originalId);
      setState({ ...current, records });
      setRecordEditing(null);
      setToast('복용 기록을 저장했습니다.');
      return '';
    } catch (error) { return error.message; }
  }
  async function enableNotifications() {
    if (isAndroidApp) {
      try {
        const result = await requestNotificationPermission();
        setNativeNotificationStatus(result);
        setState(s => ({ ...s, notifications: !!result.allowed }));
        setToast(result.allowed ? '복용 알림을 켰습니다.' : 'Android 설정에서 알림 권한을 허용해 주세요.');
      } catch { setToast('알림 권한을 요청하지 못했습니다. Android 설정을 확인해 주세요.'); }
      return;
    }
    if (!('Notification' in window) || !window.isSecureContext) { setToast('알림은 HTTPS 또는 로컬 환경의 지원 브라우저에서 사용할 수 있습니다.'); return; }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setState(s => ({ ...s, notifications: result === 'granted' }));
      setToast(result === 'granted' ? '복용 알림을 켰습니다.' : '브라우저 설정에서 알림 권한을 허용해 주세요.');
    } catch { setToast('알림 권한을 요청하지 못했습니다. 브라우저 설정을 확인해 주세요.'); }
  }
  async function exportRecords() {
    const content = JSON.stringify({ exportedAt: new Date().toISOString(), medicines: state.medicines, records: state.records }, null, 2);
    const filename = `medicine-records-${today}.json`;
    if (isAndroidApp) {
      try { const result = await exportAndroidData(content, filename); setToast(result.cancelled ? '내보내기를 취소했습니다.' : '복용 데이터를 내보냈습니다.'); }
      catch { setToast('복용 데이터 파일을 저장하지 못했습니다.'); }
      return;
    }
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importRecords(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('파일 크기가 너무 큽니다.');
      const data = JSON.parse(await file.text());
      const next = parseState(JSON.stringify({ ...emptyState(), medicines: data.medicines, records: data.records }));
      setSettings(false);
      setImporting(next);
    } catch { setToast('복약노트에서 내보낸 JSON 파일인지 확인해 주세요. 최대 크기는 2MB입니다.'); }
  }
  async function addHomeWidget() {
    if (widgetAdding) return;
    setWidgetAdding(true);
    try {
      await saveWidgetState(state);
      const result = await requestHomeWidget();
      if (result.requested) {
        pinRequest.current = { before: result.widgetCount, deadline: Date.now() + 20000 };
        setToast('홈 화면에서 위젯 추가를 확인해 주세요.');
      } else {
        setWidgetAdding(false);
        setToast('홈 화면을 길게 누른 뒤 위젯 목록에서 복약노트를 선택해 주세요.');
      }
    } catch (error) {
      pinRequest.current = null;
      setWidgetAdding(false);
      if (error.state) setState(error.state);
      setToast(error.state ? error.message : '위젯을 추가하지 못했습니다. 홈 화면의 위젯 목록을 확인해 주세요.');
    }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="/" className="brand"><span className="brand-symbol"><Pill size={23} /></span><span>복약노트<small>MEDICINE ALARM</small></span></a>
      <nav aria-label="주 메뉴">{[{ id: 'today', label: '오늘의 복용', icon: CalendarDays }, { id: 'medicines', label: '내 약 목록', icon: ClipboardList }, { id: 'history', label: '복용 기록', icon: History }].map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'nav-item active' : 'nav-item'} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={19} /><span>{label}</span>{id === 'medicines' && <span className="nav-count" aria-hidden="true">{state.medicines.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-indicator"><span />이 브라우저에 저장됨</div><button className="nav-item" onClick={() => setSettings(true)}><Settings size={19} />설정</button></div>
    </aside>
    <main>
      <header className="topbar"><span className="current-date">{formatDate(today)}</span><div className="topbar-actions">{isAndroidApp && <button className="icon-button" title="홈 화면 위젯 추가" aria-label="홈 화면 위젯 추가" disabled={!!initial.error || widgetAdding} onClick={addHomeWidget}><PanelsTopLeft size={19} /></button>}<button className="notification-button" onClick={() => setSettings(true)}>{state.notifications && (isAndroidApp ? nativeNotificationStatus?.allowed : permission === 'granted') ? <Bell size={17} /> : <BellOff size={17} />}<span>알림 {state.notifications && (isAndroidApp ? nativeNotificationStatus?.allowed : permission === 'granted') ? '켜짐' : '꺼짐'}</span></button></div></header>
      <div className="content">
        {storageError && <div className="warning" role="alert"><AlertCircle size={20} /><span>{storageError}</span></div>}
        <div className="page-heading"><div><p className="eyebrow">나의 복약 관리</p><h1>{tab === 'today' ? '오늘의 복용' : tab === 'medicines' ? '내 약 목록' : '복용 기록'}</h1><p className="subtitle">{tab === 'today' ? '작은 기록으로 챙기는 매일의 건강' : tab === 'medicines' ? `등록한 약 ${state.medicines.length}개` : '차곡차곡 쌓인 나의 복용 내역'}</p></div><button className="primary-button" onClick={() => setEditing({})}><Plus size={18} />약 등록</button></div>
        {tab === 'today' && <>
          <section className="summary-band" aria-label="오늘의 복용 요약"><div className="summary-progress"><span className="progress-ring" style={{ '--progress': `${todaySlots.length ? todaySlots.filter(s => s.record).length / todaySlots.length * 100 : 0}%` }}><CircleCheck size={26} /></span><div><span className="stat-label">오늘 복용 완료</span><p><strong>{todaySlots.filter(s => s.record).length}</strong><span> / {todaySlots.length}회</span></p></div></div><div className="summary-next"><span className="stat-label">다음 복용</span><p>{upcoming ? <><strong>{upcoming.time}</strong><span>{upcoming.name}</span></> : <span className="no-next">{todaySlots.length ? '남은 예정 시간이 없습니다' : '등록된 일정이 없습니다'}</span>}</p></div></section>
          <section className="schedule-section"><div className="section-header"><div className="date-nav"><button className="icon-button" aria-label="이전 날" title="이전 날" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={20} /></button><h2>{formatDate(date)}</h2><button className="icon-button" aria-label="다음 날" title="다음 날" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={20} /></button><label className="date-picker" title="날짜 선택"><CalendarDays size={17} /><input type="date" aria-label="일정 날짜" value={date} onChange={e => { if (isDateKey(e.target.value)) setDate(e.target.value); }} /></label>{date !== today && <button className="text-button" onClick={() => setDate(today)}>오늘</button>}</div><span className="muted completion">{done} / {slots.length}회 완료</span></div>
            {!!cycles.length && <div className="cycle-status-list" aria-label="반복 복용 현황">{cycles.map(({ medicine, status }) => <div className={`cycle-status-row ${status.phase === 'rest' ? 'resting' : ''}`} key={medicine.id}><span className="cycle-medicine">{medicine.name}</span><span>{status.phase === 'pending' ? '시작 예정' : `${status.phase === 'rest' ? '휴약' : '복용'} ${status.day}일째 / ${status.length}일`}</span>{status.resumeDate && <span className="muted">{formatDate(status.resumeDate)} {status.phase === 'rest' ? '복용 재개' : '시작'}</span>}</div>)}</div>}
            {!slots.length ? <div className="empty-state"><span className="empty-icon"><Pill size={32} /></span><h3>{resting.length ? '휴약 기간입니다' : state.medicines.length ? '이날은 복용 일정이 없어요' : '첫 번째 약을 등록해 주세요'}</h3><p>{resting.length ? '다음 복용일은 반복 복용 현황에서 확인할 수 있습니다.' : state.medicines.length ? '등록한 복용 일정에 따라 표시됩니다.' : '약 이름과 복용 시간을 정하면 하루 일정이 시작됩니다.'}</p>{!state.medicines.length && <button className="primary-button" onClick={() => setEditing({})}><Plus size={18} />약 등록</button>}</div> : <div className="schedule-list">{slots.map(slot => {
              const overdue = date < today || (date === today && slot.time < `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
              return <article className={`dose-row ${slot.record ? 'taken' : ''}`} key={slot.key}><div className="dose-time"><Clock3 size={16} /><strong>{slot.time}</strong></div><span className="medicine-symbol"><Pill size={21} /></span><div className="dose-info"><h3>{slot.name}</h3><p>{slot.dose}{slot.note && <span> · {slot.note}</span>}</p></div><span className={`status ${slot.record ? 'complete' : overdue ? 'overdue' : ''}`}>{slot.record ? '복용 완료' : overdue ? '미복용' : '예정'}</span><button className={`dose-check ${slot.record ? 'checked' : ''}`} disabled={date > today || !!initial.error} aria-label={`${slot.time} ${slot.name} ${slot.record ? '복용 취소' : '복용 완료'}`} aria-pressed={!!slot.record} title={date > today ? '미래 일정은 복용 기록을 남길 수 없습니다' : slot.record ? '복용 취소' : '복용 완료'} onClick={() => setState(s => ({ ...s, records: toggleRecord(s.records, slot, date) }))}><Check size={19} /></button></article>;
            })}</div>}
          </section>
          <p className="bottom-note"><Pill size={15} />복용량과 복용 시간은 의사 또는 약사의 안내를 따라 주세요.</p>
        </>}
        {tab === 'medicines' && <section className="medicine-list">{!state.medicines.length ? <div className="empty-state"><span className="empty-icon"><ClipboardList size={32} /></span><h3>아직 등록한 약이 없어요</h3><button className="primary-button" onClick={() => setEditing({})}><Plus size={18} />약 등록</button></div> : state.medicines.map(m => <article className="medicine-row" key={m.id}><span className="medicine-symbol"><Pill size={24} /></span><div className="medicine-detail"><h2>{m.name}</h2><p>{m.dose}{m.note && ` · ${m.note}`}</p><div className="medicine-meta"><span><Clock3 size={14} />{m.times.join(', ')}</span><span>{m.cycle ? `${m.cycle.onDays}일 복용 · ${m.cycle.offDays}일 휴약` : m.days.length === 7 ? '매일' : [1, 2, 3, 4, 5, 6, 0].filter(d => m.days.includes(d)).map(d => WEEKDAYS[d]).join(' · ')}</span><span>{m.startDate} 시작</span></div></div><div className="row-actions"><button className="icon-button" title="수정" aria-label={`${m.name} 수정`} onClick={() => setEditing(m)}><Pencil size={18} /></button><button className="icon-button danger" title="삭제" aria-label={`${m.name} 삭제`} onClick={() => setDeleting(m)}><Trash2 size={18} /></button></div></article>)}</section>}
        {tab === 'history' && <AdherenceCalendar state={state} now={now} disabled={!!initial.error} onExport={exportRecords} onEdit={setRecordEditing} onAdd={(selected, medicineId, slot) => setRecordEditing({ date: selected, medicineId: medicineId || slot?.id || '', time: slot?.time, dose: slot?.dose })} onToggle={(slot, selected) => setState(s => ({ ...s, records: toggleRecord(s.records, slot, selected) }))} />}
      </div>
    </main>
    {recordEditing && <RecordForm Modal={Modal} state={state} initial={recordEditing} onSave={saveEditedRecord} onRemove={id => { setState(s => ({ ...s, records: s.records.filter(r => r.id !== id) })); setRecordEditing(null); setToast('복용 기록을 취소했습니다.'); }} onClose={() => setRecordEditing(null)} />}
    {editing && <MedicineForm medicine={editing.id ? editing : null} onSave={saveMedicine} onClose={() => setEditing(null)} />}
    {deleting && <Modal title="약 삭제" onClose={() => setDeleting(null)}><div className="modal-body"><p><strong>{deleting.name}</strong>을 목록에서 삭제할까요?</p><p className="muted">앞으로의 일정은 삭제되고, 이미 완료한 복용 기록은 남습니다.</p></div><div className="modal-footer"><button className="secondary-button" onClick={() => setDeleting(null)}>취소</button><button className="danger-button" onClick={() => { setState(s => ({ ...s, medicines: s.medicines.filter(m => m.id !== deleting.id) })); setDeleting(null); setToast('약을 삭제했습니다.'); }}><Trash2 size={17} />삭제</button></div></Modal>}
    {settings && <Modal title="설정" onClose={() => setSettings(false)}><div className="modal-body">{isAndroidApp && <div className="widget-setting"><div className="setting-row"><div><h3>홈 화면 위젯</h3><p className="muted">{widgetRegistrationLabel}</p></div><button className="secondary-button" disabled={!!initial.error || widgetAdding} onClick={addHomeWidget}><PanelsTopLeft size={17} />{widgetAdding ? '확인 중' : '위젯 추가'}</button></div><button className="text-button" onClick={() => openAndroidHome().catch(() => setToast('홈 화면을 열지 못했습니다.'))}><Home size={16} />홈 화면 열기</button></div>}{isAndroidApp ? <NotificationSettings enabled={state.notifications} onEnable={enableNotifications} onDisable={() => setState(s => ({ ...s, notifications: false }))} onStatus={setNativeNotificationStatus} onMessage={setToast} /> : <><div className="setting-row"><div><h3>브라우저 복용 알림</h3><p className="muted">{permission === 'denied' ? '브라우저 설정에서 알림 권한을 허용해 주세요.' : permission === 'unsupported' ? '이 브라우저는 알림을 지원하지 않습니다.' : '복용 시간에 알림을 받습니다.'}</p></div><button className={`toggle ${state.notifications && (isAndroidApp ? nativeNotificationStatus?.allowed : permission === 'granted') ? 'on' : ''}`} role="switch" aria-label="복용 알림" aria-checked={state.notifications && (isAndroidApp ? nativeNotificationStatus?.allowed : permission === 'granted')} onClick={() => state.notifications && (isAndroidApp ? nativeNotificationStatus?.allowed : permission === 'granted') ? setState(s => ({ ...s, notifications: false })) : enableNotifications()}><span /></button></div><p className="settings-notice">알림을 받으려면 이 페이지를 열어 두어야 합니다. 브라우저나 기기가 절전 상태이면 알림이 늦어질 수 있습니다.</p></>}<div className="setting-row"><div><h3>복용 데이터</h3><p className="muted">{isAndroidApp ? '이 앱에 저장되며 홈 화면 위젯과 공유됩니다. 앱을 삭제하면 기록도 삭제됩니다.' : '이 기기의 브라우저에만 저장됩니다. 브라우저 데이터를 삭제하면 기록도 삭제됩니다.'}</p></div></div><div className="data-actions"><button className="secondary-button" onClick={exportRecords}><Download size={16} />내보내기</button><button className="secondary-button" onClick={() => importInput.current.click()}><Upload size={16} />가져오기</button></div></div></Modal>}
    <input ref={importInput} type="file" accept=".json,application/json" className="file-input" aria-label="복용 데이터 파일" onChange={importRecords} />
    {importing && <Modal title="데이터 가져오기" onClose={() => setImporting(null)}><div className="modal-body"><p>약 {importing.medicines.length}개와 복용 기록 {importing.records.length}건을 가져올까요?</p><p className="muted">현재 약 목록과 기록을 가져온 데이터로 교체합니다.</p></div><div className="modal-footer"><button className="secondary-button" onClick={() => setImporting(null)}>취소</button><button className="primary-button" onClick={() => { setState(importing); setImporting(null); alerting.current = new Set(); setToast('복용 데이터를 가져왔습니다.'); }}><Upload size={17} />가져오기</button></div></Modal>}
    {toast && <div role="status" className="toast"><CircleCheck size={18} /><span>{toast}</span><button className="icon-button" aria-label="알림 닫기" title="닫기" onClick={() => setToast('')}><X size={16} /></button></div>}
  </div>;
}

async function bootstrap() {
  let initial;
  try {
    const native = await loadWidgetState();
    initial = { state: parseState(native ?? localStorage.getItem(STORAGE_KEY)), error: '' };
  } catch {
    initial = { state: emptyState(), error: '저장된 데이터를 읽지 못했습니다. 원본 데이터를 보존하기 위해 저장을 중단했습니다.' };
  }
  createRoot(document.getElementById('root')).render(<App initial={initial} />);
}

bootstrap();
