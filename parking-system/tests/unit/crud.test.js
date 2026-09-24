'use strict';

// CRUD-фабрика с заглушкой вместо базы данных: проверяется сформированный SQL и права
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { crudRouter } = require('../../common/src/crud');
const { errorHandler } = require('../../common/src/errors');

async function withApp(fn) {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); return { rows: [{ id: 1 }], rowCount: 1 }; } };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { login: 'test', role: req.get('x-role') }; next(); });
  app.use('/items', crudRouter(pool, {
    table: 'clients', schema: { full_name: { type: 'string', required: true } }, read: ['OPERATOR', 'ADMIN'], write: ['ADMIN'], filters: { full_name: 'like' },
  }));
  app.use(errorHandler);
  const server = app.listen(0);
  const call = async (method, path, role, body) => (await fetch(`http://127.0.0.1:${server.address().port}/items${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'x-role': role }, body: body && JSON.stringify(body),
  })).status;
  try { await fn(call, calls); } finally { server.close(); }
}

test('CRUD: поиск формирует параметризованный запрос ILIKE', async () => {
  await withApp(async (call, calls) => {
    assert.equal(await call('GET', '?full_name=петров', 'OPERATOR'), 200);
    assert.deepEqual(calls[0], { sql: 'SELECT * FROM clients WHERE full_name ILIKE $1 ORDER BY id', params: ['%петров%'] });
  });
});

test('CRUD: создание и частичное обновление — только поля схемы', async () => {
  await withApp(async (call, calls) => {
    assert.equal(await call('POST', '', 'ADMIN', { full_name: 'Иванов', id: 99 }), 201);
    assert.equal(await call('PUT', '/5', 'ADMIN', { full_name: 'Петров' }), 200);
    assert.equal(calls[0].sql, 'INSERT INTO clients (full_name) VALUES ($1) RETURNING *');
    assert.equal(calls[1].sql, 'UPDATE clients SET full_name = $1 WHERE id = $2 RETURNING *');
  });
});

test('CRUD: оператор не может изменять (403), запрос к БД не выполняется', async () => {
  await withApp(async (call, calls) => {
    assert.equal(await call('POST', '', 'OPERATOR', { full_name: 'x' }), 403);
    assert.equal(await call('DELETE', '/1', 'OPERATOR'), 403);
    assert.equal(calls.length, 0);
  });
});
