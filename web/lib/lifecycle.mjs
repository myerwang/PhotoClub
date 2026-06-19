export class ShutdownCoordinator {
  constructor({
    cancelWaiting,
    terminateActive,
    forceTerminate,
    closeServer,
    setTimeoutImpl = setTimeout,
    graceMs = 5_000,
  }) {
    this.cancelWaiting = cancelWaiting;
    this.terminateActive = terminateActive;
    this.forceTerminate = forceTerminate;
    this.closeServer = closeServer;
    this.setTimeoutImpl = setTimeoutImpl;
    this.graceMs = graceMs;
    this.started = false;
    this.reason = null;
  }

  async shutdown(reason = 'requested') {
    if (this.started) return false;
    this.started = true;
    this.reason = reason;

    await this.cancelWaiting();
    const active = await this.terminateActive('SIGTERM');
    if (active?.running) {
      this.setTimeoutImpl(() => this.forceTerminate(active), this.graceMs);
    }
    await this.closeServer();
    return true;
  }
}
