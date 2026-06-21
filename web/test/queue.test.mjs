import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../lib/errors.mjs';
import { commitJobResult, JOB_RESULT_COMMITTED, SerialJobQueue } from '../lib/queue.mjs';

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

test('exposes batch metadata on public jobs without leaking internals', async () => {
  const queue = new SerialJobQueue({ runJob: async () => ({}) });
  const job = queue.enqueue({
    id: 'batch-job',
    type: 'generate',
    batchId: 'batch-1',
    styleId: 'sticker',
    batchIndex: 2,
    batchSize: 4,
    payload: { secret: true },
  });
  const snapshotJob = queue.snapshot().jobs[0];
  assert.equal(job.batchId, 'batch-1');
  assert.equal(job.styleId, 'sticker');
  assert.equal(job.batchIndex, 2);
  assert.equal(job.batchSize, 4);
  assert.equal(snapshotJob.batchId, 'batch-1');
  assert.equal(snapshotJob.styleId, 'sticker');
  assert.equal(snapshotJob.batchIndex, 2);
  assert.equal(snapshotJob.batchSize, 4);
  assert.equal(Object.hasOwn(job, 'payload'), false);
  assert.equal(Object.hasOwn(job, 'controller'), false);
  assert.equal(Object.hasOwn(job, 'cancelRequested'), false);
  assert.equal(Object.hasOwn(snapshotJob, 'payload'), false);
  assert.equal(Object.hasOwn(snapshotJob, 'controller'), false);
  assert.equal(Object.hasOwn(snapshotJob, 'cancelRequested'), false);
});

test('keeps batch fields available for legacy jobs without a batch', async () => {
  const queue = new SerialJobQueue({ runJob: async () => ({}) });
  const job = queue.enqueue({ id: 'legacy-job', type: 'profile', payload: {} });
  const snapshotJob = queue.snapshot().jobs[0];
  assert.equal(job.batchId, undefined);
  assert.equal(job.styleId, undefined);
  assert.equal(job.batchIndex, undefined);
  assert.equal(job.batchSize, undefined);
  assert.equal(snapshotJob.batchId, undefined);
  assert.equal(snapshotJob.styleId, undefined);
  assert.equal(snapshotJob.batchIndex, undefined);
  assert.equal(snapshotJob.batchSize, undefined);
});

test('cancels only jobs in the matching batch and leaves other batches queued', async () => {
  const starts = [];
  const resolvers = [];
  const queue = new SerialJobQueue({
    runJob: (job, signal) => new Promise((resolve, reject) => {
      starts.push(job.id);
      resolvers.push(resolve);
      if (job.id === 'a1') {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }
    }),
  });
  queue.enqueue({ id: 'a1', type: 'generate', batchId: 'batch-a', payload: {} });
  queue.enqueue({ id: 'b1', type: 'generate', batchId: 'batch-b', payload: {} });
  queue.enqueue({ id: 'a2', type: 'generate', batchId: 'batch-a', payload: {} });
  await tick();
  assert.equal(queue.cancelBatch('batch-a'), 2);
  const snapshotAfterCancel = queue.snapshot();
  assert.equal(snapshotAfterCancel.jobs.find((job) => job.id === 'b1').status, 'queued');
  await tick();
  await tick();
  resolvers.at(-1)({});
  await tick();
  const finalSnapshot = queue.snapshot();
  assert.deepEqual(starts, ['a1', 'b1']);
  assert.equal(finalSnapshot.jobs.find((job) => job.id === 'a1').status, 'cancelled');
  assert.equal(finalSnapshot.jobs.find((job) => job.id === 'a2').status, 'cancelled');
  assert.equal(finalSnapshot.jobs.find((job) => job.id === 'b1').status, 'succeeded');
});

test('does not count terminal jobs again when cancelling a batch twice', async () => {
  let release;
  const queue = new SerialJobQueue({
    runJob: () => new Promise((resolve) => {
      release = resolve;
    }),
  });
  queue.enqueue({ id: 'a1', type: 'generate', batchId: 'batch-a', payload: {} });
  queue.enqueue({ id: 'a2', type: 'generate', batchId: 'batch-a', payload: {} });
  await tick();
  assert.equal(queue.cancelBatch('batch-a'), 2);
  release({});
  await tick();
  await tick();
  assert.equal(queue.cancelBatch('batch-a'), 0);
});

test('returns zero for invalid or unknown batch ids', async () => {
  const queue = new SerialJobQueue({ runJob: async () => ({}) });
  queue.enqueue({ id: 'legacy', type: 'generate', payload: {} });
  assert.equal(queue.cancelBatch(undefined), 0);
  assert.equal(queue.cancelBatch(null), 0);
  assert.equal(queue.cancelBatch('missing-batch'), 0);
});

test('snapshots batch ids before cancelBatch so reentrant listeners do not cancel new jobs', async () => {
  let enqueued = false;
  const queue = new SerialJobQueue({
    runJob: (job, signal) => new Promise((resolve, reject) => {
      if (job.id === 'a1') signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  queue.onEvent((event) => {
    if (!enqueued && event.job.id === 'a2' && event.job.status === 'cancelled') {
      enqueued = true;
      queue.enqueue({ id: 'a3', type: 'generate', batchId: 'batch-a', payload: {} });
    }
  });
  queue.enqueue({ id: 'a1', type: 'generate', batchId: 'batch-a', payload: {} });
  queue.enqueue({ id: 'a2', type: 'generate', batchId: 'batch-a', payload: {} });
  await tick();
  assert.equal(queue.cancelBatch('batch-a'), 2);
  const snapshot = queue.snapshot();
  assert.equal(snapshot.jobs.find((job) => job.id === 'a3').status, 'queued');
});

test('clones public result data in snapshots and events', async () => {
  const events = [];
  const queue = new SerialJobQueue({
    runJob: async () => ({
      outputUrl: '/rendered.png',
      meta: { nested: { score: 1 } },
      helper: () => 'ignored',
    }),
  });
  queue.onEvent((event) => {
    if (event.job.status === 'succeeded') events.push(event);
  });
  queue.enqueue({ id: 'result-job', type: 'generate', payload: {} });
  await tick();
  await tick();
  const snapshot1 = queue.snapshot();
  snapshot1.jobs[0].result.meta.nested.score = 2;
  events[0].job.result.meta.nested.score = 3;
  const snapshot2 = queue.snapshot();
  assert.equal(snapshot2.jobs[0].result.meta.nested.score, 1);
  assert.equal(snapshot2.jobs[0].result.helper, undefined);
});

test('clones public error data in snapshots and events', async () => {
  const events = [];
  const queue = new SerialJobQueue({
    runJob: async (job) => {
      if (job.id === 'error-job') throw new AppError('JOB_FAILED', 'boom', 500, { nested: { count: 1 } });
      return {};
    },
  });
  queue.onEvent((event) => {
    if (event.job.status === 'failed') events.push(event);
  });
  queue.enqueue({ id: 'error-job', type: 'generate', payload: {} });
  await tick();
  await tick();
  const snapshot1 = queue.snapshot();
  snapshot1.jobs[0].error.details.nested.count = 2;
  events[0].job.error.details.nested.count = 3;
  const snapshot2 = queue.snapshot();
  assert.equal(snapshot2.jobs[0].error.details.nested.count, 1);
});

test('treats committed results as succeeded even when cancellation wins the race and strips the marker from public state', async () => {
  const events = [];
  let release;
  const queue = new SerialJobQueue({
    runJob: () => new Promise((resolve) => {
      release = resolve;
    }),
  });
  queue.onEvent((event) => {
    if (event.job.id === 'committed-job' && ['succeeded', 'cancelled'].includes(event.job.status)) {
      events.push(event);
    }
  });
  queue.enqueue({ id: 'committed-job', type: 'generate', payload: {} });
  await tick();
  assert.equal(queue.cancel('committed-job'), true);
  release(commitJobResult({ outputUrl: '/committed.png' }));
  await tick();
  await tick();
  const job = queue.snapshot().jobs.find((item) => item.id === 'committed-job');
  assert.equal(job.status, 'succeeded');
  assert.deepEqual(job.result, { outputUrl: '/committed.png' });
  assert.equal(Object.getOwnPropertySymbols(job.result).includes(JOB_RESULT_COMMITTED), false);
  assert.equal(Object.getOwnPropertySymbols(events.at(-1).job.result).includes(JOB_RESULT_COMMITTED), false);
});
