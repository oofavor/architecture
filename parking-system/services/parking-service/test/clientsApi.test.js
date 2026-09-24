'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runWithContext } = require('@parking/common');
const { createClientsApi } = require('../src/clientsApi');

const car = { id: 1, plate: 'А123ВС777', client: { id: 1 }, discount: { percent: 10 } };
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('передаёт токен пользователя и идентификатор запроса, кодирует госномер', async () => {
  let seen;
  const api = createClientsApi('http://clients:3002', {
    fetchImpl: async (url, init) => { seen = { url, init }; return reply(200, car); },
  });
  const result = await runWithContext({ requestId: 'req-1' }, () => api.findCarByPlate('А123ВС777', 'tok'));
  assert.deepEqual(result, car);
  assert.equal(seen.url, `http://clients:3002/api/cars/by-plate/${encodeURIComponent('А123ВС777')}`);
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(seen.init.headers['X-Request-Id'], 'req-1');
});

test('ответ-ошибка clients-service передаётся с тем же кодом и сообщением', async () => {
  const api = createClientsApi('http://x', { fetchImpl: async () => reply(404, { error: 'не зарегистрирован' }) });
  await assert.rejects(api.findCarByPlate('Х000ХХ00', 't'), { status: 404, message: 'не зарегистрирован' });
});

test('отказ соединения: одна повторная попытка, затем 502', async () => {
  let calls = 0;
  const api = createClientsApi('http://x', { fetchImpl: async () => { calls += 1; throw new TypeError('fetch failed'); } });
  await assert.rejects(api.findCarByPlate('А123ВС777', 't'), { status: 502 });
  assert.equal(calls, 2);
});

test('повторная попытка успешна — результат возвращается', async () => {
  let calls = 0;
  const api = createClientsApi('http://x', {
    fetchImpl: async () => { calls += 1; if (calls === 1) throw new TypeError('ECONNREFUSED'); return reply(200, car); },
  });
  assert.deepEqual(await api.findCarByPlate('А123ВС777', 't'), car);
});

test('тайм-аут не повторяется (пользователь уже ждал 2 с) — сразу 502', async () => {
  let calls = 0;
  const api = createClientsApi('http://x', {
    fetchImpl: async () => { calls += 1; throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); },
  });
  await assert.rejects(api.findCarByPlate('А123ВС777', 't'), { status: 502 });
  assert.equal(calls, 1);
});
