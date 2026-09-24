// Одновременные запросы: блокировки строк и уникальные индексы защищают от гонок
import test from 'node:test';
import assert from 'node:assert/strict';
import { PARKING, call, token, createClientWithCar, enter, leave } from './helpers.mjs';

test('8 одновременных въездов разных автомобилей получают 8 разных мест', async () => {
  const cars = await Promise.all(Array.from({ length: 8 }, () => createClientWithCar()));
  const results = await Promise.all(cars.map(({ car }) => enter(car.plate)));
  try {
    assert.deepEqual(results.map((r) => r.status), Array(8).fill(201));
    const spots = new Set(results.map((r) => r.body.spot.id));
    assert.equal(spots.size, 8);
  } finally {
    await Promise.all(results.filter((r) => r.status === 201).map((r) => leave(r.body.session.id)));
  }
});

test('6 одновременных въездов одного автомобиля: успешен ровно один, остальные — 409', async () => {
  const { car } = await createClientWithCar();
  const results = await Promise.all(Array.from({ length: 6 }, () => enter(car.plate)));
  const ok = results.filter((r) => r.status === 201);
  try {
    assert.equal(ok.length, 1);
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409));
    const active = await call('GET', `${PARKING}/api/sessions?plate=${encodeURIComponent(car.plate)}&active=true`, { token: await token('operator') });
    assert.equal(active.body.length, 1);
  } finally {
    await Promise.all(ok.map((r) => leave(r.body.session.id)));
  }
});

test('5 одновременных оплат по 30 руб. при долге 80: сумма оплат не превышает долг', async () => {
  const op = await token('operator');
  const { client, car } = await createClientWithCar();
  const entry = await enter(car.plate, { entry_time: '2026-09-23T10:00:00Z' });
  await leave(entry.body.session.id, { exit_time: '2026-09-23T11:00:00Z' }); // 80 руб.

  const results = await Promise.all(Array.from({ length: 5 }, () => call('POST', `${PARKING}/api/payments`, {
    token: op, body: { session_id: entry.body.session.id, amount: 30, method: 'CASH' },
  })));
  const accepted = results.filter((r) => r.status === 201).length;
  assert.equal(accepted, 2);
  assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 400));
  assert.equal((await call('GET', `${PARKING}/api/clients/${client.id}/debt`, { token: op })).body.debt, 20);
});
