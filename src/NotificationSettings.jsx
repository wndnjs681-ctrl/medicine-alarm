import React, { useEffect, useState } from 'react';
import { Bell, Settings, Clock3 } from 'lucide-react';
import { getNotificationStatus, openNotificationSettings, requestExactAlarmPermission, testNotification } from './native-widget.js';

export default function NotificationSettings({ enabled, onEnable, onDisable, onStatus, onMessage }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = () => getNotificationStatus().then(next => { if (active) { setStatus(next); onStatus(next); } }).catch(() => { if (active) setStatus({ error: true }); });
    refresh();
    const timer = setInterval(refresh, 3000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const on = enabled && !!status?.allowed;
  const command = action => action().catch(() => onMessage('Android 설정을 확인해 주세요.'));
  return <div className="native-notification-settings"><div className="setting-row"><div><h3>복용 알림</h3><p className="muted">{status?.error ? '알림 상태를 확인하지 못했습니다.' : !status ? '알림 권한 확인 중' : !status.allowed ? 'Android 알림 권한이 필요합니다.' : enabled ? '앱을 닫아도 예약한 시간에 알림을 받습니다.' : '복용 알림이 꺼져 있습니다.'}</p></div><button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-label="복용 알림" aria-checked={on} onClick={enabled ? onDisable : onEnable}><span /></button></div><div className="data-actions"><button className="secondary-button" onClick={() => command(openNotificationSettings)}><Settings size={16} />알림 설정</button><button className="secondary-button" disabled={!status?.allowed} onClick={() => command(async () => { await testNotification(); onMessage('테스트 알림을 보냈습니다. 알림창을 확인해 주세요.'); })}><Bell size={16} />테스트 알림</button></div><div className="setting-row exact-alarm-setting"><div><h3>정확한 시간 알림</h3><p className="muted">{status?.exact ? '알람 및 리마인더 허용됨' : '허용하지 않으면 절전 중 알림이 늦을 수 있습니다.'}</p></div>{status && !status.exact && <button className="secondary-button" onClick={() => command(requestExactAlarmPermission)}><Clock3 size={16} />허용</button>}</div>{enabled && status?.next > 0 && <p className="muted">다음 알림: {new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(status.next))}</p>}<p className="settings-notice">Android 설정에서 알림 표시·소리와 알람 및 리마인더를 허용해 주세요. 앱을 강제 종료한 경우 다시 열어야 알림이 재개됩니다.</p></div>;
}
