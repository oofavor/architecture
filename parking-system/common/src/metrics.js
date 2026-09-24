'use strict';

const { monitorEventLoopDelay } = require('node:perf_hooks');

const SAMPLE_LIMIT = 20000; // сколько последних замеров хранить для расчёта перцентилей
const MB = 1024 * 1024;
const round = (x) => Math.round(x * 100) / 100;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

// Серия замеров длительности: число, ошибки, среднее, перцентили
class Series {
  constructor() { this.count = 0; this.errors = 0; this.total = 0; this.max = 0; this.samples = []; }

  add(ms, isError) {
    this.count += 1;
    this.total += ms;
    if (isError) this.errors += 1;
    if (ms > this.max) this.max = ms;
    if (this.samples.length >= SAMPLE_LIMIT) this.samples.shift();
    this.samples.push(ms);
  }

  summary() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    return {
      count: this.count,
      errors: this.errors,
      avg_ms: round(this.count ? this.total / this.count : 0),
      p50_ms: round(percentile(sorted, 50)),
      p95_ms: round(percentile(sorted, 95)),
      p99_ms: round(percentile(sorted, 99)),
      max_ms: round(this.max),
      total_ms: round(this.total),
    };
  }
}

/**
 * Метрики процесса без внешних систем мониторинга (KISS).
 * Отдаются в JSON на GET /metrics каждого сервиса.
 */
class Metrics {
  constructor() {
    this.pools = [];
    this.reset();
    // Задержка цикла событий: растёт, когда поток занят вычислениями (например, bcrypt)
    this.loopDelay = monitorEventLoopDelay({ resolution: 10 });
    this.loopDelay.enable();
    // Пиковая память фиксируется раз в секунду
    setInterval(() => this.sampleMemory(), 1000).unref();
  }

  reset() {
    this.startedAt = Date.now();
    this.http = new Map();
    this.db = new Map();
    this.external = new Map();
    this.events = {};
    this.inFlight = this.inFlight ?? 0;
    this.maxInFlight = this.inFlight;
    this.peakRss = process.memoryUsage().rss;
    this.maxPoolWaiting = 0;
    this.loopDelay?.reset();
  }

  static observe(map, key, ms, isError = false) {
    if (!map.has(key)) map.set(key, new Series());
    map.get(key).add(ms, isError);
  }

  observeHttp(route, ms, status) { Metrics.observe(this.http, route, ms, status >= 500); }
  observeDb(label, ms, isError) { Metrics.observe(this.db, label, ms, isError); }
  observeExternal(label, ms, isError) { Metrics.observe(this.external, label, ms, isError); }
  count(event) { this.events[event] = (this.events[event] ?? 0) + 1; }

  requestStarted() {
    this.inFlight += 1;
    if (this.inFlight > this.maxInFlight) this.maxInFlight = this.inFlight;
  }

  requestFinished() { this.inFlight -= 1; }

  trackPool(pool) { this.pools.push(pool); }

  samplePool() {
    for (const pool of this.pools) {
      if (pool.waitingCount > this.maxPoolWaiting) this.maxPoolWaiting = pool.waitingCount;
    }
  }

  sampleMemory() {
    const { rss } = process.memoryUsage();
    if (rss > this.peakRss) this.peakRss = rss;
  }

  snapshot() {
    const table = (map) => Object.fromEntries(
      [...map.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, s]) => [k, s.summary()]),
    );
    this.sampleMemory();
    const mem = process.memoryUsage();
    const pool = this.pools[0];
    return {
      window_s: round((Date.now() - this.startedAt) / 1000),
      in_flight: { current: this.inFlight, max: this.maxInFlight },
      memory_mb: {
        rss: round(mem.rss / MB),
        rss_peak: round(this.peakRss / MB),
        heap_used: round(mem.heapUsed / MB),
      },
      event_loop_delay_ms: {
        p50: round(this.loopDelay.percentile(50) / 1e6),
        p99: round(this.loopDelay.percentile(99) / 1e6),
        max: round(this.loopDelay.max / 1e6),
      },
      db_pool: pool && {
        max: pool.options.max,
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max_waiting: this.maxPoolWaiting,
      },
      http: table(this.http),
      db: table(this.db),
      external: table(this.external),
      events: this.events,
    };
  }
}

const metrics = new Metrics();

module.exports = { metrics, Metrics, Series, percentile };
