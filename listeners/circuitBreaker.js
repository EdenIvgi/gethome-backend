/**
 * Circuit breaker with exponential backoff.
 * States: CLOSED (normal), OPEN (blocked), HALF_OPEN (testing).
 */
const STATES = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' };
const BACKOFF_MS = [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000]; // 5m, 15m, 30m, 1h

export class CircuitBreaker {
  constructor(name, { failureThreshold = 3, halfOpenAfterMs = 5 * 60_000 } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.halfOpenAfterMs = halfOpenAfterMs;
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.backoffIndex = 0;
    this.lastFailureAt = null;
    this.openUntil = null;
  }

  get isOpen() {
    if (this.state === STATES.OPEN) {
      if (Date.now() >= this.openUntil) {
        this.state = STATES.HALF_OPEN;
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
        return false;
      }
      return true;
    }
    return false;
  }

  get canAttempt() {
    return !this.isOpen;
  }

  recordSuccess() {
    if (this.state === STATES.HALF_OPEN) {
      console.log(`[CircuitBreaker:${this.name}] HALF_OPEN -> CLOSED (success)`);
    }
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.backoffIndex = 0;
  }

  recordFailure(reason = '') {
    this.failureCount++;
    this.lastFailureAt = Date.now();

    if (this.failureCount >= this.failureThreshold || this.state === STATES.HALF_OPEN) {
      const backoffMs = BACKOFF_MS[Math.min(this.backoffIndex, BACKOFF_MS.length - 1)];
      this.state = STATES.OPEN;
      this.openUntil = Date.now() + backoffMs;
      this.backoffIndex++;
      console.log(`[CircuitBreaker:${this.name}] OPEN for ${Math.round(backoffMs / 60000)}min (failures: ${this.failureCount}, reason: ${reason})`);
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      openUntil: this.openUntil ? new Date(this.openUntil).toISOString() : null,
    };
  }
}

/**
 * Request tracker: counts requests per domain per hour.
 */
export class RequestTracker {
  constructor() {
    this.counts = new Map(); // domain -> { count, resetAt }
  }

  track(domain) {
    const now = Date.now();
    let entry = this.counts.get(domain);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + 60 * 60_000 };
      this.counts.set(domain, entry);
    }
    entry.count++;
    return entry.count;
  }

  getCount(domain) {
    const entry = this.counts.get(domain);
    if (!entry || Date.now() >= entry.resetAt) return 0;
    return entry.count;
  }

  shouldPause(domain, maxPerHour) {
    return this.getCount(domain) >= maxPerHour;
  }

  getStatus() {
    const status = {};
    for (const [domain, entry] of this.counts) {
      status[domain] = { count: entry.count, resetAt: new Date(entry.resetAt).toISOString() };
    }
    return status;
  }
}
