import { test, expect } from '@playwright/test';

async function addMedicine(page, name = '비타민 D') {
  await page.getByRole('button', { name: '약 등록', exact: true }).first().click();
  await page.getByLabel('약 이름', { exact: true }).fill(name);
  await page.getByLabel('한 번에 복용할 용량').fill('1정');
  await page.getByLabel('복용 메모').fill('식사 후 복용');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

test('register, persist, complete, undo, edit and delete while preserving history', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '첫 번째 약을 등록해 주세요' })).toBeVisible();
  await addMedicine(page);
  await expect(page.getByRole('heading', { name: '비타민 D', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '비타민 D', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '08:00 비타민 D 복용 완료' }).click();
  await expect(page.getByRole('button', { name: '08:00 비타민 D 복용 취소' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '복용 기록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '비타민 D', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '기록 내보내기' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/^medicine-records-.*\.json$/);
  await page.getByRole('button', { name: '오늘의 복용', exact: true }).click();
  await page.getByRole('button', { name: '08:00 비타민 D 복용 취소' }).click();
  await expect(page.getByRole('button', { name: '08:00 비타민 D 복용 완료' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '08:00 비타민 D 복용 완료' }).click();
  await page.getByRole('button', { name: '내 약 목록', exact: true }).click();
  await page.getByRole('button', { name: '비타민 D 수정' }).click();
  await page.getByLabel('약 이름', { exact: true }).fill('비타민 D 수정');
  await page.getByRole('button', { name: '시간 추가' }).click();
  await page.getByLabel('복용 시간 2', { exact: true }).fill('18:00');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('08:00, 18:00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '비타민 D 수정 삭제' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.getByRole('heading', { name: '아직 등록한 약이 없어요' })).toBeVisible();
  await page.getByRole('button', { name: '복용 기록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '비타민 D', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('duplicate times are rejected and future doses cannot be completed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '약 등록', exact: true }).first().click();
  await page.getByLabel('약 이름', { exact: true }).fill('처방약');
  await page.getByLabel('한 번에 복용할 용량').fill('1정');
  await page.getByRole('button', { name: '시간 추가' }).click();
  await page.getByLabel('복용 시간 2', { exact: true }).fill('08:00');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('중복');
  await page.getByLabel('복용 시간 2', { exact: true }).fill('18:00');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: '다음 날', exact: true }).click();
  await expect(page.getByRole('button', { name: '08:00 처방약 복용 완료' })).toBeDisabled();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await expect(page.getByRole('button', { name: '08:00 처방약 복용 완료' })).toBeEnabled();
});

test('notifications fire once for a due dose and persist deduplication across reloads', async ({ page }) => {
  await page.addInitScript(() => {
    const existing = JSON.parse(localStorage.getItem('test:notifications') || '[]');
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      constructor(title, options) { existing.push({ title, ...options }); localStorage.setItem('test:notifications', JSON.stringify(existing)); }
      close() {}
    }
    window.Notification = FakeNotification;
    if (!localStorage.getItem('medicine-alarm:v1')) {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      localStorage.setItem('medicine-alarm:v1', JSON.stringify({ medicines: [{ id: 'due', name: '알림 테스트', dose: '1정', note: '', times: [time], days: [0, 1, 2, 3, 4, 5, 6], startDate: date }], records: [], alerts: [], notifications: true }));
    }
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('test:notifications')).length)).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('medicine-alarm:v1')).alerts.length)).toBe(1);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('test:notifications')).length)).toBe(1);
});

test('corrupt storage is preserved and warning is visible', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('medicine-alarm:v1', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('원본');
  expect(await page.evaluate(() => localStorage.getItem('medicine-alarm:v1'))).toBe('{broken');
});

test('long medicine names fit the desktop and mobile layout', async ({ page }, testInfo) => {
  await page.goto('/');
  await addMedicine(page, '아주긴약이름'.repeat(10));
  await expect(page.getByRole('heading', { name: '아주긴약이름'.repeat(10), exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-schedule.png`, fullPage: true });
  await page.getByRole('button', { name: '내 약 목록', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-medicines.png`, fullPage: true });
});

test('import restores exported medicine data after confirmation and rejects corrupt files', async ({ page }) => {
  await page.goto('/');
  await addMedicine(page);
  await page.getByRole('button', { name: '08:00 비타민 D 복용 완료' }).click();
  const exported = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('medicine-alarm:v1'));
    return JSON.stringify({ exportedAt: new Date().toISOString(), medicines: state.medicines, records: state.records });
  });
  await page.getByRole('button', { name: '알림 꺼짐' }).click();
  await page.getByLabel('복용 데이터 파일').setInputFiles({ name: 'medicine.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await expect(page.getByRole('dialog', { name: '데이터 가져오기' })).toContainText('약 1개와 복용 기록 1건');
  await page.getByRole('dialog', { name: '데이터 가져오기' }).getByRole('button', { name: '가져오기', exact: true }).click();
  await expect(page.getByRole('button', { name: '08:00 비타민 D 복용 취소' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '알림 꺼짐' }).click();
  await page.getByLabel('복용 데이터 파일').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('status')).toContainText('JSON 파일인지 확인');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByRole('button', { name: '08:00 비타민 D 복용 취소' })).toBeVisible();
});
