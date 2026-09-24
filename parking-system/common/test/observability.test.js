'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Metrics, Series, percentile } = require('../src/metrics');
const { queryLabel } = require('../src/db');
const { logger } = require('../src/logger');
const { runWithContext } = require('../src/context');

test('перцентили считаются по отсортированной выборке', () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(sorted, 50), 50);
  assert.equal(percentile(sorted, 95), 95);
  assert.equal(percentile(sorted, 99), 99);
  assert.equal(percentile([], 95), 0);
});

test('серия замеров: число, ошибки, среднее, максимум', () => {
  const s = new Series();
  [10, 20, 30, 40].forEach((ms, i) => s.add(ms, i === 3));
  const sum = s.summary();
  assert.equal(sum.count, 4);
  assert.equal(sum.errors, 1);
  assert.equal(sum.avg_ms, 25);
  assert.equal(sum.max_ms, 40);
});

test('учёт одновременных запросов: текущее и максимальное число', () => {
  const m = new Metrics();
  m.requestStarted(); m.requestStarted(); m.requestStarted();
  m.requestFinished(); m.requestFinished();
  const snap = m.snapshot();
  assert.equal(snap.in_flight.current, 1);
  assert.equal(snap.in_flight.max, 3);
  assert.ok(snap.memory_mb.rss > 0);
  assert.ok(snap.memory_mb.rss_peak >= snap.memory_mb.rss);
});

test('метрики HTTP группируются по шаблону маршрута, 5xx считаются ошибками', () => {
  const m = new Metrics();
  m.observeHttp('GET /api/spots', 5, 200);
  m.observeHttp('GET /api/spots', 15, 500);
  assert.deepEqual(
    { count: m.snapshot().http['GET /api/spots'].count, errors: m.snapshot().http['GET /api/spots'].errors },
    { count: 2, errors: 1 },
  );
});

test('метка SQL-запроса: операция и таблица', () => {
  assert.equal(queryLabel('SELECT * FROM parking_sessions WHERE id = $1'), 'SELECT parking_sessions');
  assert.equal(queryLabel('  INSERT INTO payments (a) VALUES ($1)'), 'INSERT payments');
  assert.equal(queryLabel({ text: 'UPDATE parking_spots SET status = $1' }), 'UPDATE parking_spots');
  assert.equal(queryLabel('BEGIN'), 'BEGIN');
  assert.equal(queryLabel('SELECT 1'), 'SELECT 1');
});

test('журнал: одна строка JSON с сервисом, событием и идентификатором запроса из контекста', () => {
  const lines = [];
  const original = process.stdout.write;
  const threshold = logger.threshold;
  logger.threshold = 0;
  process.stdout.write = (chunk) => { lines.push(chunk); return true; };
  try {
    runWithContext({ requestId: 'req-42' }, () => logger.info('car_entry', { plate: 'А123ВС777' }));
  } finally {
    process.stdout.write = original;
    logger.threshold = threshold;
  }
  const record = JSON.parse(lines[0]);
  assert.equal(record.event, 'car_entry');
  assert.equal(record.requestId, 'req-42');
  assert.equal(record.plate, 'А123ВС777');
  assert.ok(Date.parse(record.time));
});
