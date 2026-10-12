import { test, expect } from '@playwright/test';

test('calendar shows missed, partial, complete, future and rest days with persistent edits', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-12T12:00:00') });
  await page.addInitScript(() => {
    if (localStorage.getItem('medicine-alarm:v1')) return;
    localStorage.setItem('medicine-alarm:v1', JSON.stringify({ medicines: [{ id: 'cycle', name: '주기 약', dose: '1정', note: '', startDate: '2026-10-01', times: ['08:00', '20:00'], days: [0, 1, 2, 3, 4, 5, 6], cycle: { onDays: 21, offDays: 7 } }], records: [], alerts: [], notifications: false }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: '복용 기록', exact: true }).click();
  await expect(page.getByRole('button', { name: '2026-10-11 미기록 0/2회', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2026-10-22 휴약 0/0회', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2026-10-11 미기록 0/2회', exact: true }).click();
  await page.getByRole('button', { name: '2026-10-11 08:00 주기 약 복용 완료', exact: true }).click();
  await expect(page.getByRole('button', { name: '2026-10-11 일부 복용 1/2회', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2026-10-11 20:00 주기 약 복용 완료', exact: true }).click();
  await expect(page.getByRole('button', { name: '2026-10-11 완료 2/2회', exact: true })).toBeVisible();
  await expect(page.getByLabel('월별 복용 요약')).toContainText('9%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-calendar.png`, fullPage: true });
  await page.getByRole('button', { name: '2026-10-13 예정 0/2회', exact: true }).click();
  await expect(page.getByRole('button', { name: '2026-10-13 08:00 주기 약 복용 완료', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '2026-10-22 휴약 0/0회', exact: true }).click();
  await expect(page.getByText('휴약 기간 · 주기 약', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2026년 11월' })).toBeVisible();
  await expect(page.getByLabel('월별 복용 요약')).toContainText('미기록0회');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: '복용 기록', exact: true }).click();
  await expect(page.getByRole('button', { name: '2026-10-11 완료 2/2회', exact: true })).toBeVisible();
});

test('Android permissions, test notifications and exact-alarm settings use native APIs only', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.androidBridge = {};
    window.reminderFixture = { revision: 0, state: null, allowed: false, exact: false, calls: [], listeners: new Map() };
    window.Notification = class { static permission = 'denied'; static requestPermission() { throw new Error('Native app must not request web permission'); } };
    window.Capacitor = {
      PluginHeaders: [{ name: 'MedicineWidget', methods: ['getState', 'saveState', 'getWidgetStatus', 'getNotificationStatus', 'requestNotificationPermission', 'requestExactAlarmPermission', 'openNotificationSettings', 'testNotification', 'removeListener'].map(name => ({ name, rtype: 'promise' })).concat([{ name: 'addListener', rtype: 'callback' }]) }],
      nativePromise: async (_, method, options) => {
        const fixture = window.reminderFixture;
        fixture.calls.push(method);
        if (method === 'getState') return { state: fixture.state, revision: fixture.revision, accepted: true };
        if (method === 'saveState') { fixture.state = options.state; fixture.revision++; return { state: fixture.state, revision: fixture.revision, accepted: true }; }
        if (method === 'getWidgetStatus') return { supported: true, widgetCount: 0 };
        if (method === 'requestNotificationPermission') { fixture.allowed = true; return { allowed: true, exact: fixture.exact, next: 0 }; }
        if (method === 'getNotificationStatus') return { allowed: fixture.allowed, exact: fixture.exact, next: 0 };
        if (method === 'requestExactAlarmPermission') fixture.exact = true;
        return {};
      },
      nativeCallback: (_, method, options, callback) => { if (method === 'addListener') window.reminderFixture.listeners.set(options.eventName, callback); return options.eventName; }
    };
  });
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: '알림 꺼짐' }).click();
  await page.getByRole('switch', { name: '복용 알림' }).click();
  await page.clock.fastForward(3100);
  await expect(page.getByRole('switch', { name: '복용 알림' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '테스트 알림', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('테스트 알림을 보냈습니다');
  await page.getByRole('button', { name: '허용', exact: true }).click();
  await page.clock.fastForward(3100);
  await expect(page.getByText('알람 및 리마인더 허용됨')).toBeVisible();
  await page.getByRole('button', { name: '알림 설정', exact: true }).click();
  expect(await page.evaluate(() => window.reminderFixture.calls)).toEqual(expect.arrayContaining(['requestNotificationPermission', 'testNotification', 'requestExactAlarmPermission', 'openNotificationSettings']));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-native-notifications.png`, fullPage: true });
  await page.getByRole('switch', { name: '복용 알림' }).click();
  await expect(page.getByRole('switch', { name: '복용 알림' })).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => page.evaluate(() => JSON.parse(window.reminderFixture.state).notifications)).toBe(false);
});
