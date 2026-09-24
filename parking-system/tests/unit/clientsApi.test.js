'use strict';

// Межсервисный клиент с заглушкой вместо fetch
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClientsApi } = require('../../services/parking-service/src/clientsApi');

const ctx = { token: 'tok', requestId: 'req-1' };

test('межсервисный вызов: передаются токен пользователя и идентификатор запроса', async () => {
  let seen;
  const api = createClientsApi('http://clients:3002', async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => ({ id: 1 }) };
  });
  await api.findCarByPlate('А123ВС777', ctx);
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(seen.init.headers['X-Request-Id'], 'req-1');
});

test('межсервисный вызов: ошибка clients-service передаётся с тем же кодом, недоступность — 502', async () => {
  const notFound = createClientsApi('http://x', async () => ({ ok: false, status: 404, json: async () => ({ error: 'не зарегистрирован' }) }));
  await assert.rejects(notFound.findCarByPlate('Х000ХХ00', ctx), { status: 404 });
  const down = createClientsApi('http://x', async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(down.findCarByPlate('А123ВС777', ctx), { status: 502 });
});
