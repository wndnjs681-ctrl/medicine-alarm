import { test, expect } from '@playwright/test';

test('past records can be added, edited, moved and cancelled after medicine deletion', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-13T12:00:00') });
  await page.addInitScript(() => {
    if (localStorage.getItem('medicine-alarm:v1')) return;
    localStorage.setItem('medicine-alarm:v1', JSON.stringify({ medicines: [], records: [{ id: 'old:2026-10-10:08:00', medicineId: 'old', name: '이전 약', dose: '1정', date: '2026-10-10', time: '08:00', takenAt: '2026-10-10T08:10:00Z' }], alerts: [], notifications: false }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: '복용 기록', exact: true }).click();
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('button', { name: '2026-10-10 08:00 이전 약 기록 수정', exact: true }).click();
  await page.getByLabel('복용 날짜', { exact: true }).fill('2026-10-09');
  await page.getByLabel('복용 시간', { exact: true }).fill('09:00');
  await page.getByLabel('복용 용량', { exact: true }).fill('2정');
  await page.getByLabel('실제 복용 시각', { exact: true }).fill('2026-10-09T09:15');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-record-edit.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('.history-row')).toContainText('2정 · 2026-10-09 09:00');
  await page.reload();
  await page.getByRole('button', { name: '복용 기록', exact: true }).click();
  await page.getByRole('button', { name: '2026-10-09 완료 1/1회', exact: true }).click();
  await expect(page.locator('.dose-info')).toContainText('2정');
  await page.getByRole('button', { name: '기록 추가', exact: true }).click();
  await page.getByLabel('복용 시간', { exact: true }).fill('09:00');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('이미 있습니다');
  await page.getByLabel('복용 시간', { exact: true }).fill('20:00');
  await page.getByLabel('실제 복용 시각', { exact: true }).fill('2026-10-09T20:10');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '2026-10-09 완료 2/2회', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2026-10-09 20:00 이전 약 기록 수정', exact: true }).click();
  await page.getByRole('button', { name: '복용 취소', exact: true }).click();
  await expect(page.getByRole('button', { name: '2026-10-09 완료 1/1회', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2026-10-14 일정 없음 0/0회', exact: true }).click();
  await expect(page.getByRole('button', { name: '기록 추가', exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('medicine-alarm:v1')).records.length)).toBe(1);
});
