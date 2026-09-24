'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { crudRouter } = require('../src/crud');
const { errorHandler } = require('../src/errors');

// Заглушка пула БД: запоминает запросы и возвращает заранее заданный ответ
function fakePool() {
  const pool = {
    calls: [],
    reply: { rows: [{ id: 1, name: 'Скидка' }], rowCount: 1 },
    async query(sql, params) {
      pool.calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return pool.reply;
    },
  };
  return pool;
}

async function withServer(pool, config, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { role: req.get('x-role') }; next(); });
  app.use('/items', crudRouter(pool, config));
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/items`;
  const request = async (method, path = '', { role = 'ADMIN', body } = {}) => {
    const res = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', 'x-role': role }, body: body && JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  try {
    await fn(request);
  } finally {
    server.close();
  }
}

const config = {
  table: 'discounts',
  schema: { name: { type: 'string', required: true }, percent: { type: 'number' } },
  access: { read: ['OPERATOR', 'ADMIN'], write: ['ADMIN'], remove: ['ADMIN'] },
  filters: { name: 'like', percent: 'eq' },
};

test('GET: фильтры превращаются в параметризованный WHERE, лишние параметры игнорируются', async () => {
  const pool = fakePool();
  await withServer(pool, config, async (request) => {
    const res = await request('GET', `?name=${encodeURIComponent('пост')}&percent=10&hack=1`);
    assert.equal(res.status, 200);
  });
  assert.equal(pool.calls[0].sql, 'SELECT * FROM discounts WHERE name ILIKE $1 AND percent = $2 ORDER BY id');
  assert.deepEqual(pool.calls[0].params, ['%пост%', '10']);
});

test('POST: INSERT только из полей схемы, ответ 201', async () => {
  const pool = fakePool();
  await withServer(pool, config, async (request) => {
    const res = await request('POST', '', { body: { name: 'Акция', percent: 5, id: 999 } });
    assert.equal(res.status, 201);
  });
  assert.equal(pool.calls[0].sql, 'INSERT INTO discounts (name, percent) VALUES ($1, $2) RETURNING *');
  assert.deepEqual(pool.calls[0].params, ['Акция', 5]);
});

test('PUT: частичное обновление только присланных полей', async () => {
  const pool = fakePool();
  await withServer(pool, config, async (request) => {
    assert.equal((await request('PUT', '/3', { body: { percent: 7 } })).status, 200);
  });
  assert.equal(pool.calls[0].sql, 'UPDATE discounts SET percent = $1 WHERE id = $2 RETURNING *');
  assert.deepEqual(pool.calls[0].params, [7, 3]);
});

test('404 для несуществующей записи, 400 для некорректного id', async () => {
  const pool = fakePool();
  pool.reply = { rows: [], rowCount: 0 };
  await withServer(pool, config, async (request) => {
    assert.equal((await request('GET', '/5')).status, 404);
    assert.equal((await request('DELETE', '/5')).status, 404);
    assert.equal((await request('GET', '/abc')).status, 400);
  });
});

test('права доступа: оператор читает, но не пишет и не удаляет (403), до БД запрос не доходит', async () => {
  const pool = fakePool();
  await withServer(pool, config, async (request) => {
    assert.equal((await request('GET', '', { role: 'OPERATOR' })).status, 200);
    assert.equal((await request('POST', '', { role: 'OPERATOR', body: { name: 'x' } })).status, 403);
    assert.equal((await request('DELETE', '/1', { role: 'OPERATOR' })).status, 403);
    assert.equal((await request('GET', '', { role: 'CLIENT' })).status, 403);
  });
  assert.equal(pool.calls.length, 1);
});

test('prepare преобразует данные перед записью, columns скрывает столбцы', async () => {
  const pool = fakePool();
  const cfg = {
    ...config,
    columns: 'id, name',
    prepare: async (d) => ({ ...d, name: d.name.toUpperCase() }),
  };
  await withServer(pool, cfg, async (request) => {
    await request('POST', '', { body: { name: 'акция' } });
  });
  assert.equal(pool.calls[0].sql, 'INSERT INTO discounts (name) VALUES ($1) RETURNING id, name');
  assert.deepEqual(pool.calls[0].params, ['АКЦИЯ']);
});

test('ошибка валидации — 400, запрос к БД не выполняется', async () => {
  const pool = fakePool();
  await withServer(pool, config, async (request) => {
    assert.equal((await request('POST', '', { body: { percent: 'много' } })).status, 400);
  });
  assert.equal(pool.calls.length, 0);
});
