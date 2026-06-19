import { randomBytes } from 'node:crypto';

import { AppError } from './errors.mjs';

export class LeaseManager {
  constructor({
    ttlMs = 30_000,
    now = Date.now,
    randomToken = () => randomBytes(24).toString('base64url'),
  } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.randomToken = randomToken;
    this.owner = null;
  }

  acquire(clientId) {
    if (typeof clientId !== 'string' || clientId.length < 1 || clientId.length > 128) {
      throw new AppError('CLIENT_ID_INVALID', '客户端标识无效', 400);
    }
    this.expireIfNeeded();
    if (this.owner) return { status: 'occupied' };

    const token = this.randomToken();
    this.owner = { clientId, token, expiresAt: this.now() + this.ttlMs };
    return { status: 'owned', token, expiresInMs: this.ttlMs };
  }

  heartbeat(clientId, token) {
    this.expireIfNeeded();
    if (!this.#matches(clientId, token)) return { status: this.owner ? 'occupied' : 'free' };
    this.owner.expiresAt = this.now() + this.ttlMs;
    return { status: 'owned', expiresInMs: this.ttlMs };
  }

  release(clientId, token) {
    if (!this.#matches(clientId, token)) return false;
    this.owner = null;
    return true;
  }

  snapshot() {
    this.expireIfNeeded();
    if (!this.owner) return { status: 'free' };
    return {
      status: 'owned',
      clientId: this.owner.clientId,
      expiresInMs: Math.max(0, this.owner.expiresAt - this.now()),
    };
  }

  expireIfNeeded() {
    if (!this.owner || this.now() <= this.owner.expiresAt) return false;
    this.owner = null;
    return true;
  }

  isOwner(clientId, token) {
    this.expireIfNeeded();
    return this.#matches(clientId, token);
  }

  forceRelease() {
    const hadOwner = Boolean(this.owner);
    this.owner = null;
    return hadOwner;
  }

  #matches(clientId, token) {
    return Boolean(this.owner && this.owner.clientId === clientId && this.owner.token === token);
  }
}
