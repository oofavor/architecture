'use strict';

// Метрики процесса: время ответа, одновременные запросы, память, запросы к БД
const MB = 1024 * 1024;
let state;

function reset() {
  state = { since: Date.now(), http: {}, db: {}, inFlight: state?.inFlight ?? 0, maxInFlight: 0, peakRss: 0 };
}
reset();

function add(map, key, ms, isError = false) {
  const s = (map[key] ??= { count: 0, errors: 0, total: 0, max: 0, samples: [] });
  s.count += 1;
  s.total += ms;
  s.max = Math.max(s.max, ms);
  if (isError) s.errors += 1;
  s.samples.push(ms);
  if (s.samples.length > 5000) s.samples.shift();
}

function summary(s) {
  const sorted = [...s.samples].sort((a, b) => a - b);
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
  const r = (x) => Math.round(x * 10) / 10;
  return { count: s.count, errors: s.errors, avg_ms: r(s.total / s.count), p95_ms: r(p95), max_ms: r(s.max), total_ms: Math.round(s.total) };
}

const metrics = {
  reset,
  requestStarted() {
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
  },
  requestFinished(route, ms, status) {
    state.inFlight -= 1;
    add(state.http, route, ms, status >= 500);
  },
  dbQuery: (label, ms) => add(state.db, label, ms),
  snapshot() {
    const rss = process.memoryUsage().rss;
    state.peakRss = Math.max(state.peakRss, rss);
    const table = (map) => Object.fromEntries(Object.entries(map).map(([k, s]) => [k, summary(s)]));
    return {
      window_s: Math.round((Date.now() - state.since) / 1000),
      in_flight: { current: state.inFlight, max: state.maxInFlight },
      memory_mb: { rss: Math.round(rss / MB), rss_peak: Math.round(state.peakRss / MB) },
      http: table(state.http),
      db: table(state.db),
    };
  },
};

// Пиковая память фиксируется раз в секунду
setInterval(() => { state.peakRss = Math.max(state.peakRss, process.memoryUsage().rss); }, 1000).unref();

module.exports = { metrics };
