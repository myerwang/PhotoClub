import test from 'node:test';
import assert from 'node:assert/strict';

import { SerialJobQueue } from '../lib/queue.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('runs one job at a time in insertion order', async () => {
  const starts = [];
  const releases = [];
  const queue = new SerialJobQueue({
    runJob: (job) => new Promise((resolve) => {
      starts.push(job.id);
      releases.push(resolve);
    }),
  });
  queue.enqueue({ id: 'a', type: 'generate', payload: {} });
  queue.enqueue({ id: 'b', type: 'generate', payload: {} });
  await tick();
  assert.deepEqual(starts, ['a']);
  releases.shift()({ outputUrl: '/a.png' });
  await tick();
  assert.deepEqual(starts, ['a', 'b']);
  releases.shift()({ outputUrl: '/b.png' });
  await tick();
  assert.equal(queue.snapshot().jobs.every((job) => job.status === 'succeeded'), true);
});

test('cancels a waiting job without starting it', async () => {
  let release;
  const starts = [];
  const queue = new SerialJobQueue({ runJob: (job) => new Promise((resolve) => { starts.push(job.id); release = resolve; }) });
  queue.enqueue({ id: 'a', type: 'generate', payload: {} });
  queue.enqueue({ id: 'b', type: 'generate', payload: {} });
  await tick();
  assert.equal(queue.cancel('b'), true);
  release({});
  await tick();
  assert.deepEqual(starts, ['a']);
  assert.equal(queue.snapshot().jobs.find((job) => job.id === 'b').status, 'cancelled');
});

test('cancels the active child and advances the queue', async () => {
  const starts = [];
  const queue = new SerialJobQueue({
    runJob: (job, signal) => new Promise((resolve, reject) => {
      starts.push(job.id);
      if (job.id === 'a') signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      else resolve({});
    }),
  });
  queue.enqueue({ id: 'a', type: 'generate', payload: {} });
  queue.enqueue({ id: 'b', type: 'generate', payload: {} });
  await tick();
  assert.equal(queue.cancel('a'), true);
  await tick();
  await tick();
  assert.deepEqual(starts, ['a', 'b']);
  assert.equal(queue.snapshot().jobs.find((job) => job.id === 'a').status, 'cancelled');
});

test('emits queued running succeeded failed and cancelled events', async () => {
  const statuses = [];
  const queue = new SerialJobQueue({
    runJob: async (job) => {
      if (job.id === 'bad') throw new Error('failed');
      return {};
    },
  });
  queue.onEvent((event) => statuses.push(event.job.status));
  queue.enqueue({ id: 'ok', type: 'generate', payload: {} });
  queue.enqueue({ id: 'bad', type: 'generate', payload: {} });
  queue.enqueue({ id: 'cancel', type: 'generate', payload: {} });
  queue.cancel('cancel');
  await tick();
  await tick();
  assert.deepEqual(statuses, ['queued', 'queued', 'queued', 'cancelled', 'running', 'succeeded', 'running', 'failed']);
});
