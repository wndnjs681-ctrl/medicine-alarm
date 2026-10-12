import test from 'node:test';
import assert from 'node:assert/strict';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { emptyState } from '../src/model.js';

test('native bridge serializes app saves and preserves widget edits against stale queued writes', async () => {
  Capacitor.getPlatform = () => 'android';
  Capacitor.isNativePlatform = () => true;
  let state = null;
  let revision = 0;
  let listener;
  const writes = [];
  const fake = {
    getState: async () => ({ state, revision, accepted: true }),
    saveState: async ({ state: next, expectedRevision }) => {
      writes.push(expectedRevision);
      await new Promise(resolve => setImmediate(resolve));
      if (expectedRevision !== revision) return { state, revision, accepted: false };
      state = next; revision++;
      return { state, revision, accepted: true };
    },
    addListener: async (_, callback) => { listener = callback; return { remove() { listener = null; } }; }
  };
  registerPlugin('MedicineWidget', { web: () => fake });
  const bridge = await import('../src/native-widget.js');
  assert.equal(await bridge.loadWidgetState(), null);
  const first = { ...emptyState(), notifications: true };
  const second = { ...first, alerts: ['first'] };
  await Promise.all([bridge.saveWidgetState(first), bridge.saveWidgetState(second)]);
  assert.deepEqual(writes, [0, 1]);
  assert.deepEqual(JSON.parse(state), second);
  let received;
  const handle = await bridge.subscribeWidgetState(value => { received = value; }, error => { throw error; });

  const stale = bridge.saveWidgetState({ ...second, alerts: ['stale'] });
  const widget = { ...second, alerts: ['widget'] };
  state = JSON.stringify(widget); revision++;
  listener({ state, revision });
  await assert.rejects(stale, error => { assert.deepEqual(error.state, widget); return true; });
  assert.deepEqual(received, widget);
  assert.deepEqual(JSON.parse(state), widget);

  const background = { ...widget, alerts: ['background-widget'] };
  state = JSON.stringify(background); revision++;
  const failed = await Promise.allSettled([
    bridge.saveWidgetState({ ...widget, notifications: false }),
    bridge.saveWidgetState({ ...widget, alerts: ['another-stale-write'] })
  ]);
  assert.ok(failed.every(result => result.status === 'rejected'));
  assert.deepEqual(JSON.parse(state), background);
  assert.equal(writes.length, 3);
  await bridge.saveWidgetState(background);
  assert.equal(writes.length, 3);
  await handle.remove();
});
