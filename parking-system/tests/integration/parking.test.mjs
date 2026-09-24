// Интеграционные тесты: сценарий стоянки, взаимодействие сервисов, отказы, журнал и метрики
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIENTS, PARKING, call, compose, newClientWithCar, uid } from './helpers.mjs';

const enter = (token, plate, entry_time) => call('POST', `${PARKING}/api/sessions/entry`, { token, body: { plate, entry_time } });
const leave = (token, id, exit_time) => call('POST', `${PARKING}/api/sessions/${id}/exit`, { token, body: { exit_time } });
const pay = (token, session_id, amount) => call('POST', `${PARKING}/api/payments`, { token, body: { session_id, amount, method: 'CASH' } });

test('сценарий ЛР № 1: 360 + долг 150 = 510, оплата 500 — долг 10', async () => {
  const { token, client, car } = await newClientWithCar(10);
  // прошлая стоянка: 3 ч 30 мин → 4 ч · 80 · 0,9 = 288, оплачено 138 → долг 150
  const first = await enter(token, car.plate, '2026-09-20T09:00:00+03:00');
  assert.equal((await leave(token, first.body.session.id, '2026-09-20T12:30:00+03:00')).body.calculation.cost, 288);
  assert.equal((await pay(token, first.body.session.id, 138)).body.debt_after, 150);

  const entry = await enter(token, car.plate, '2026-09-23T08:40:00+03:00');
  assert.equal(entry.status, 201);
  assert.equal(entry.body.car.client_id, client.id); // данные получены от clients-service
  const exit = await leave(token, entry.body.session.id, '2026-09-23T13:05:00+03:00');
  assert.deepEqual(
    [exit.body.calculation.minutes, exit.body.calculation.cost, exit.body.calculation.previous_debt, exit.body.calculation.amount_due],
    [265, 360, 150, 510],
  );
  assert.equal((await pay(token, entry.body.session.id, 500)).body.debt_after, 10);
  assert.equal((await call('GET', `${PARKING}/api/clients/${client.id}/debt`, { token })).body.debt, 10);
});

test('въезд занимает место, выезд освобождает; повторный въезд — 409, незарегистрированный номер — 404', async () => {
  const { token, car } = await newClientWithCar();
  const entry = await enter(token, car.plate);
  assert.equal(entry.status, 201);
  const spot = () => call('GET', `${PARKING}/api/spots/${entry.body.spot.id}`, { token });
  assert.equal((await spot()).body.status, 'OCCUPIED');
  assert.equal((await enter(token, car.plate)).status, 409);
  assert.equal((await enter(token, 'Х000ХХ000')).status, 404);
  await leave(token, entry.body.session.id);
  assert.equal((await spot()).body.status, 'FREE');
});

test('оплата: до выезда — 409, сверх долга — 400, точная сумма — PAID', async () => {
  const { token, car } = await newClientWithCar();
  const entry = await enter(token, car.plate, '2026-09-23T10:00:00Z');
  assert.equal((await pay(token, entry.body.session.id, 10)).status, 409);
  await leave(token, entry.body.session.id, '2026-09-23T11:00:00Z'); // 80 руб.
  assert.equal((await pay(token, entry.body.session.id, 80.01)).status, 400);
  assert.equal((await pay(token, entry.body.session.id, 80)).body.debt_after, 0);
});

test('отказ clients-service: въезд — 502 за время не более 2 с, parking-service продолжает работать', async () => {
  const { token, car } = await newClientWithCar();
  compose('stop clients-service');
  try {
    const started = Date.now();
    assert.equal((await enter(token, car.plate)).status, 502);
    assert.ok(Date.now() - started < 2500);
    assert.equal((await call('GET', `${PARKING}/api/spots`, { token })).status, 200);
  } finally {
    compose('start clients-service');
  }
  for (let i = 0; i < 40 && (await fetch(`${CLIENTS}/health`).catch(() => ({ status: 0 }))).status !== 200; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
  }
  const entry = await enter(token, car.plate);
  assert.equal(entry.status, 201); // после восстановления работает
  await leave(token, entry.body.session.id);
});

test('наблюдение: /health, /metrics и сквозной идентификатор запроса в журналах двух сервисов', async () => {
  for (const url of [CLIENTS, PARKING]) assert.equal((await call('GET', `${url}/health`)).body.database, 'ok');

  const { token, car } = await newClientWithCar();
  const requestId = `test-${uid()}`;
  const entry = await call('POST', `${PARKING}/api/sessions/entry`, { token, body: { plate: car.plate }, headers: { 'X-Request-Id': requestId } });
  await leave(token, entry.body.session.id);

  const logs = compose('logs --no-log-prefix --since 30s clients-service parking-service').split('\n').filter((l) => l.includes(requestId));
  assert.ok(logs.some((l) => l.includes('"service":"clients-service"')));
  assert.ok(logs.some((l) => l.includes('"event":"car_entry"')));

  const m = (await call('GET', `${PARKING}/metrics`)).body;
  assert.ok(m.http['POST /api/sessions/entry'].count >= 1);
  assert.ok(m.in_flight.max >= 1 && m.memory_mb.rss > 0);
  assert.ok(m.db['SELECT parking_sessions'].count >= 1);
});
