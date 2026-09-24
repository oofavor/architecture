'use strict';

const { Pool, types } = require('pg');
const { metrics } = require('./metrics');
const { log } = require('./logger');

// NUMERIC возвращаем числом (суммы в прототипе не превышают точности double)
types.setTypeParser(types.builtins.NUMERIC, parseFloat);

// Метка запроса для метрик: «SELECT parking_sessions»
function queryLabel(sql) {
  const op = sql.trim().split(/\s+/)[0].toUpperCase();
  const table = sql.match(/\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)/i)?.[1];
  return table ? `${op} ${table}` : op;
}

// Выполняет запрос с замером времени; медленные запросы попадают в журнал
async function timed(run, sql, params) {
  const started = performance.now();
  try {
    return await run(sql, params);
  } finally {
    const ms = performance.now() - started;
    metrics.dbQuery(queryLabel(sql), ms);
    if (ms > 200) log('warn', 'slow_query', { query: queryLabel(sql), duration_ms: Math.round(ms) });
  }
}

function createPool() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const query = pool.query.bind(pool);
  pool.query = (sql, params) => timed(query, sql, params);
  return pool;
}

// Выполнение функции в транзакции; fn получает объект с методом query
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  const db = { query: (sql, params) => timed(client.query.bind(client), sql, params) };
  try {
    await client.query('BEGIN');
    const result = await fn(db);
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
