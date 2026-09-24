'use strict';

const { Pool, types } = require('pg');
const { logger } = require('./logger');
const { metrics } = require('./metrics');

// NUMERIC возвращаем числом, а не строкой (суммы в прототипе не превышают точности double)
types.setTypeParser(types.builtins.NUMERIC, parseFloat);

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 200);

// Метка запроса для метрик: «операция таблица», например «SELECT parking_sessions»
function queryLabel(text) {
  const sql = (typeof text === 'string' ? text : text?.text ?? '').trim();
  const op = sql.split(/\s+/)[0]?.toUpperCase() ?? '?';
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(op)) return op;
  const table = sql.match(/\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)/i)?.[1];
  return table ? `${op} ${table}` : sql.replace(/\s+/g, ' ').slice(0, 30);
}

// Оборачивает client.query: замер времени, метрики, журнал медленных запросов
function instrument(client) {
  if (client.instrumented) return;
  client.instrumented = true;
  const original = client.query.bind(client);

  client.query = (...args) => {
    const started = process.hrtime.bigint();
    const label = queryLabel(args[0]);
    metrics.samplePool();
    const done = (err) => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      metrics.observeDb(label, ms, Boolean(err));
      if (ms >= SLOW_QUERY_MS) {
        logger.warn('slow_query', { query: label, duration_ms: Math.round(ms), sql: String(args[0]?.text ?? args[0]).replace(/\s+/g, ' ').slice(0, 200) });
      }
    };

    const last = args[args.length - 1];
    if (typeof last === 'function') {
      // Вызов с callback (так pool.query обращается к клиенту внутри pg)
      args[args.length - 1] = (err, res) => { done(err); last(err, res); };
      return original(...args);
    }
    const result = original(...args);
    if (result && typeof result.then === 'function') {
      result.then(() => done(null), (err) => done(err));
    }
    return result;
  };
}

function createPool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
  });
  pool.on('connect', instrument);
  pool.on('error', (err) => logger.error('db_pool_error', { message: err.message }));
  metrics.trackPool(pool);
  return pool;
}

// Выполнение функции в транзакции
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createPool, withTransaction, queryLabel };
