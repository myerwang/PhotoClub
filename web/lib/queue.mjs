import { AppError } from './errors.mjs';

export const JOB_RESULT_COMMITTED = Symbol('jobResultCommitted');

export function commitJobResult(result = {}) {
  if (result === null || typeof result !== 'object') {
    throw new TypeError('committed job result must be an object');
  }
  return Object.defineProperty(result, JOB_RESULT_COMMITTED, {
    value: true,
    enumerable: false,
    configurable: true,
  });
}

function isCommittedJobResult(result) {
  return Boolean(result && typeof result === 'object' && result[JOB_RESULT_COMMITTED] === true);
}

function stripCommittedJobResultMarker(result) {
  if (!isCommittedJobResult(result)) {
    return result ?? {};
  }
  return Array.isArray(result) ? [...result] : { ...result };
}

export class SerialJobQueue {
  constructor({ runJob }) {
    this.runJob = runJob;
    this.jobs = [];
    this.active = null;
    this.listeners = new Set();
    this.drainScheduled = false;
  }

  enqueue(job) {
    if (!job?.id || this.jobs.some((item) => item.id === job.id)) {
      throw new AppError('JOB_ID_INVALID', '任务标识无效或重复', 400);
    }
    const stored = {
      id: job.id,
      type: job.type,
      batchId: job.batchId,
      styleId: job.styleId,
      batchIndex: job.batchIndex,
      batchSize: job.batchSize,
      payload: job.payload,
      status: 'queued',
      createdAt: new Date().toISOString(),
      controller: new AbortController(),
      cancelRequested: false,
    };
    this.jobs.push(stored);
    this.#emit(stored);
    this.#scheduleDrain();
    return this.#publicJob(stored);
  }

  cancel(id) {
    const job = this.jobs.find((item) => item.id === id);
    if (!job || ['succeeded', 'failed', 'cancelled'].includes(job.status)) return false;
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      this.#emit(job);
      return true;
    }
    job.cancelRequested = true;
    job.controller.abort(new AppError('JOB_CANCELLED', '任务已取消', 499));
    return true;
  }

  cancelWaiting() {
    let count = 0;
    for (const job of this.jobs) {
      if (job.status === 'queued' && this.cancel(job.id)) count += 1;
    }
    return count;
  }

  cancelBatch(batchId) {
    if (!batchId) return 0;
    const jobIds = this.jobs
      .filter((job) => job.batchId === batchId && ['queued', 'running'].includes(job.status))
      .map((job) => job.id);
    let count = 0;
    for (const jobId of jobIds) {
      if (this.cancel(jobId)) count += 1;
    }
    return count;
  }

  cancelWaitingBatch(batchId) {
    if (!batchId) return 0;
    let count = 0;
    for (const job of this.jobs) {
      if (job.batchId === batchId && job.status === 'queued' && this.cancel(job.id)) count += 1;
    }
    return count;
  }

  terminateActive() {
    if (!this.active) return null;
    const job = this.active;
    this.cancel(job.id);
    return { id: job.id, running: true };
  }

  snapshot() {
    return {
      activeId: this.active?.id ?? null,
      jobs: this.jobs.map((job) => this.#publicJob(job)),
    };
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #scheduleDrain() {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      this.#drain();
    });
  }

  async #drain() {
    if (this.active) return;
    const job = this.jobs.find((item) => item.status === 'queued');
    if (!job) return;

    this.active = job;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    this.#emit(job);
    try {
      const result = await this.runJob({ ...this.#publicJob(job), payload: job.payload }, job.controller.signal);
      const committed = isCommittedJobResult(result);
      if (job.cancelRequested && !committed) {
        job.status = 'cancelled';
      } else {
        job.status = 'succeeded';
        job.result = stripCommittedJobResultMarker(result);
      }
    } catch (error) {
      if (job.cancelRequested || job.controller.signal.aborted) {
        job.status = 'cancelled';
      } else {
        job.status = 'failed';
        job.error = {
          code: error?.code ?? 'JOB_FAILED',
          message: error?.message ?? '任务执行失败',
          ...(error?.details !== undefined ? { details: error.details } : {}),
        };
      }
    } finally {
      job.finishedAt = new Date().toISOString();
      this.active = null;
      this.#emit(job);
      this.#scheduleDrain();
    }
  }

  #emit(job) {
    const event = { type: 'job', job: this.#publicJob(job) };
    for (const listener of this.listeners) listener(event);
  }

  #publicJob(job) {
    const { controller, cancelRequested, payload, result, error, ...publicJob } = job;
    if (result !== undefined) publicJob.result = this.#clonePublicValue(result, {});
    if (error !== undefined) publicJob.error = this.#clonePublicValue(error, {
      code: error?.code ?? 'JOB_FAILED',
      message: error?.message ?? '任务执行失败',
    });
    return publicJob;
  }

  #clonePublicValue(value, fallback) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return value;
    }
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch {}
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {}
    return fallback;
  }
}
