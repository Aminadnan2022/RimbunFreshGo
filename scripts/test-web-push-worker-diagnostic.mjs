import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const worker = await readFile('public/sw.js', 'utf8');

async function dispatchPush(showNotification) {
  const listeners = new Map();
  const entries = new Map();
  const cache = { match: async (key) => entries.get(key), put: async (key, response) => entries.set(key, response) };
  const self = {
    location: { origin: 'https://example.test' },
    registration: { scope: 'https://example.test/', showNotification },
    addEventListener: (name, handler) => listeners.set(name, handler),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  vm.runInNewContext(worker, { self, caches: { open: async () => cache, keys: async () => [], match: async () => undefined }, URL, Response, Promise, Date, JSON, Object });
  const pending = [];
  listeners.get('push')({ data: { json: () => ({ title: 'Test', body: 'Body', action: '/notifications' }) }, waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  return { record: await [...entries.values()][0].json(), calls: showNotification.mock.calls };
}

const accepted = await dispatchPush(Object.assign(async () => undefined, { mock: { calls: [] } }));
assert.equal(accepted.record.receivedCount, 1);
assert.equal(accepted.record.showResult, 'fulfilled');
assert.ok(accepted.record.receivedAt);
assert.ok(accepted.record.showAttemptedAt);
assert.equal('title' in accepted.record, false);
assert.equal('body' in accepted.record, false);

const rejected = await dispatchPush(Object.assign(async () => { throw new Error('suppressed'); }, { mock: { calls: [] } }));
assert.equal(rejected.record.receivedCount, 1);
assert.equal(rejected.record.showResult, 'rejected');
console.log('Web Push worker diagnostic tests passed.');
