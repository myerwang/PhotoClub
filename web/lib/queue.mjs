import { AppError } from './errors.mjs';

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
      if (job.cancelRequested) {
        job.status = 'cancelled';
      } else {
        job.status = 'succeeded';
        job.result = result ?? {};
      }
    } catch (error) {
      if (job.cancelRequested || job.controller.signal.aborted) {
        job.status = 'cancelled';
      } else {
        job.status = 'failed';
        job.error = {
          code: error?.code ?? 'JOB_FAILED',
          message: error?.message ?? '任务执行失败',
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
    const { controller, cancelRequested, payload, ...publicJob } = job;
    return publicJob;
  }
}
