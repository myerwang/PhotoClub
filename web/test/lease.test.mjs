import test from 'node:test';
import assert from 'node:assert/strict';

import { LeaseManager } from '../lib/lease.mjs';
import { ShutdownCoordinator } from '../lib/lifecycle.mjs';

function clockLease() {
  let time = 1_000;
  const lease = new LeaseManager({
    ttlMs: 30_000,
    now: () => time,
    randomToken: () => 'private-token',
  });
  return { lease, advance: (milliseconds) => { time += milliseconds; } };
}

test('first client acquires the lease and second client is rejected', () => {
  const { lease } = clockLease();
  assert.deepEqual(lease.acquire('browser-a'), { status: 'owned', token: 'private-token', expiresInMs: 30_000 });
  assert.deepEqual(lease.acquire('browser-b'), { status: 'occupied' });
  assert.deepEqual(lease.snapshot(), { status: 'owned', clientId: 'browser-a', expiresInMs: 30_000 });
});

test('heartbeat extends the lease', () => {
  const { lease, advance } = clockLease();
  lease.acquire('browser-a');
  advance(20_000);
  assert.deepEqual(lease.heartbeat('browser-a', 'private-token'), { status: 'owned', expiresInMs: 30_000 });
  advance(20_000);
  assert.equal(lease.expireIfNeeded(), false);
});

test('lease expires after 30 seconds without heartbeat', () => {
  const { lease, advance } = clockLease();
  lease.acquire('browser-a');
  advance(30_001);
  assert.equal(lease.expireIfNeeded(), true);
  assert.deepEqual(lease.snapshot(), { status: 'free' });
});

test('release ignores the wrong token', () => {
  const { lease } = clockLease();
  lease.acquire('browser-a');
  assert.equal(lease.release('browser-a', 'wrong-token'), false);
  assert.equal(lease.snapshot().status, 'owned');
  assert.equal(lease.release('browser-a', 'private-token'), true);
  assert.deepEqual(lease.snapshot(), { status: 'free' });
});

test('lifecycle requests shutdown after lease expiry', async () => {
  const calls = [];
  const timers = [];
  const coordinator = new ShutdownCoordinator({
    cancelWaiting: async () => calls.push('cancelWaiting'),
    terminateActive: async () => {
      calls.push('terminateActive');
      return { running: true };
    },
    forceTerminate: async () => calls.push('forceTerminate'),
    closeServer: async () => calls.push('closeServer'),
    setTimeoutImpl: (callback, milliseconds) => {
      timers.push({ callback, milliseconds });
      return 1;
    },
  });

  const started = await coordinator.shutdown('lease-expired');
  assert.equal(started, true);
  assert.deepEqual(calls, ['cancelWaiting', 'terminateActive', 'closeServer']);
  assert.equal(timers[0].milliseconds, 5_000);
  await timers[0].callback();
  assert.deepEqual(calls, ['cancelWaiting', 'terminateActive', 'closeServer', 'forceTerminate']);
  assert.equal(await coordinator.shutdown('again'), false);
});
