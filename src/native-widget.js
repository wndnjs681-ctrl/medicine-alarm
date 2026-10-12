import { Capacitor, registerPlugin } from '@capacitor/core';
import { parseState } from './model.js';

const Widget = registerPlugin('MedicineWidget');
export const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
let revision = 0;
let snapshot = null;
// Widget edits invalidate app snapshots that are still waiting in the save queue.
let generation = 0;
let writes = Promise.resolve();

function accept(result) {
  if (result.revision < revision) return;
  if (result.state !== null) parseState(result.state);
  revision = result.revision;
  snapshot = result.state;
}

function conflict() {
  const error = new Error('위젯에서 기록이 변경되었습니다. 최신 기록을 반영했으니 다시 시도해 주세요.');
  error.state = parseState(snapshot);
  return error;
}

export async function loadWidgetState() {
  if (!isAndroidApp) return null;
  const result = await Widget.getState();
  accept(result);
  return snapshot;
}

export function saveWidgetState(state) {
  if (!isAndroidApp) return Promise.resolve();
  const raw = JSON.stringify(state);
  const expectedGeneration = generation;
  const operation = writes.then(async () => {
    if (raw === snapshot) return;
    if (expectedGeneration !== generation) throw conflict();
    const result = await Widget.saveState({ state: raw, expectedRevision: revision });
    accept(result);
    if (!result.accepted || expectedGeneration !== generation) {
      generation++;
      throw conflict();
    }
  });
  writes = operation.catch(() => {});
  return operation;
}

export async function subscribeWidgetState(onState, onError) {
  if (!isAndroidApp) return { remove() {} };
  return Widget.addListener('stateChanged', result => {
    try {
      if (result.revision <= revision) return;
      accept(result);
      generation++;
      onState(parseState(snapshot));
    } catch (error) { onError(error); }
  });
}

export async function requestHomeWidget() {
  return Widget.requestPin();
}

export async function getHomeWidgetStatus() {
  return Widget.getWidgetStatus();
}

export async function subscribeHomeWidgetStatus(onStatus) {
  if (!isAndroidApp) return { remove() {} };
  return Widget.addListener('widgetStatusChanged', onStatus);
}

export async function openAndroidHome() {
  return Widget.openHome();
}

export async function exportAndroidData(content, filename) {
  return Widget.exportData({ content, filename });
}

export const getNotificationStatus = () => Widget.getNotificationStatus();
export const requestNotificationPermission = () => Widget.requestNotificationPermission();
export const openNotificationSettings = () => Widget.openNotificationSettings();
export const requestExactAlarmPermission = () => Widget.requestExactAlarmPermission();
export const testNotification = () => Widget.testNotification();
