// Основной сценарий ЛР № 1 «Регистрация выезда» на новых данных: въезд → выезд → расчёт → оплата → долг
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH, PARKING, call, token, uid, createClientWithCar, enter, leave } from './helpers.mjs';

test('пример из таблицы 10 ЛР № 1: 360 + долг 150 = 510, оплата 500 — долг 10', async () => {
  const op = await token('operator');
  const { client, car } = await createClientWithCar({ discountId: 1 }); // «Постоянный клиент», 10 %

  // Прошлая стоянка: 3 ч 30 мин → 4 ч · 80 · 0,9 = 288 руб.; оплачено 138 → долг 150
  const first = await enter(car.plate, { entry_time: '2026-09-20T09:00:00+03:00' });
  assert.equal(first.status, 201);
  const firstExit = await leave(first.body.session.id, { exit_time: '2026-09-20T12:30:00+03:00' });
  assert.equal(firstExit.body.calculation.cost, 288);
  const partial = await call('POST', `${PARKING}/api/payments`, { token: op, body: { session_id: first.body.session.id, amount: 138, method: 'CASH' } });
  assert.equal(partial.body.debt_after, 150);

  // Текущая стоянка из примера ЛР № 1
  const entry = await enter(car.plate, { entry_time: '2026-09-23T08:40:00+03:00' });
  assert.equal(entry.status, 201);
  assert.equal(entry.body.car.client.id, client.id); // данные получены из clients-service
  assert.equal(entry.body.tariff.price_per_hour, 80);

  const exit = await leave(entry.body.session.id, { exit_time: '2026-09-23T13:05:00+03:00' });
  assert.equal(exit.status, 200);
  assert.deepEqual(
    { ...exit.body.calculation },
    { minutes: 265, hours: 5, price_per_hour: 80, base_cost: 400, discount_percent: 10, cost: 360, previous_debt: 150, amount_due: 510 },
  );

  const receipt = await call('POST', `${PARKING}/api/payments`, { token: op, body: { session_id: entry.body.session.id, amount: 500, method: 'CASH' } });
  assert.equal(receipt.status, 201);
  assert.deepEqual(receipt.body.payments.map((p) => [p.session_id, p.amount]), [[first.body.session.id, 150], [entry.body.session.id, 350]]);
  assert.equal(receipt.body.debt_after, 10);

  const debt = await call('GET', `${PARKING}/api/clients/${client.id}/debt`, { token: op });
  assert.equal(debt.body.debt, 10);

  const statuses = await call('GET', `${PARKING}/api/sessions?client_id=${client.id}`, { token: op });
  assert.deepEqual(statuses.body.map((s) => s.payment_status).sort(), ['PAID', 'PARTIAL']);

  // Личный кабинет нового владельца (учётную запись создаёт администратор)
  const login = `owner_${uid()}`;
  const user = await call('POST', `${AUTH}/api/users`, {
    token: await token('admin'), body: { full_name: client.full_name, login, password: 'owner-pass', role: 'CLIENT', client_id: client.id },
  });
  const ownerToken = (await call('POST', `${AUTH}/api/auth/login`, { body: { login, password: 'owner-pass' } })).body.token;
  const cabinet = await call('GET', `${PARKING}/api/my/sessions`, { token: ownerToken });
  assert.equal(cabinet.body.debt, 10);
  assert.equal(cabinet.body.sessions.length, 2);
  await call('DELETE', `${AUTH}/api/users/${user.body.id}`, { token: await token('admin') });
});

test('въезд занимает место, выезд освобождает; повторный въезд и повторный выезд — 409', async () => {
  const op = await token('operator');
  const { car } = await createClientWithCar();
  const entry = await enter(car.plate);
  assert.equal(entry.status, 201);
  const spotId = entry.body.spot.id;
  assert.equal((await call('GET', `${PARKING}/api/spots/${spotId}`, { token: op })).body.status, 'OCCUPIED');

  assert.equal((await enter(car.plate)).status, 409); // ФТ-8

  assert.equal((await leave(entry.body.session.id)).status, 200);
  assert.equal((await call('GET', `${PARKING}/api/spots/${spotId}`, { token: op })).body.status, 'FREE');
  assert.equal((await leave(entry.body.session.id)).status, 409);
});

test('первые 15 минут бесплатно: стоянка сразу получает статус PAID', async () => {
  const { car } = await createClientWithCar();
  const entry = await enter(car.plate, { entry_time: '2026-09-23T10:00:00Z' });
  const exit = await leave(entry.body.session.id, { exit_time: '2026-09-23T10:14:00Z' });
  assert.equal(exit.body.calculation.cost, 0);
  assert.equal(exit.body.session.payment_status, 'PAID');
});

test('ошибочные операции отклоняются с понятными кодами', async () => {
  const op = await token('operator');
  const { car } = await createClientWithCar();

  assert.equal((await enter('Х000ХХ000')).status, 404); // не зарегистрирован в clients-service
  assert.equal((await enter(car.plate, { spot_id: 99999999 })).status, 404);

  const entry = await enter(car.plate, { entry_time: '2026-09-23T10:00:00Z' });
  const occupied = await createClientWithCar();
  assert.equal((await enter(occupied.car.plate, { spot_id: entry.body.spot.id })).status, 409); // место занято

  const pay = (body) => call('POST', `${PARKING}/api/payments`, { token: op, body: { session_id: entry.body.session.id, method: 'CARD', ...body } });
  assert.equal((await pay({ amount: 10 })).status, 409); // выезд ещё не зарегистрирован

  assert.equal((await leave(entry.body.session.id, { exit_time: '2026-09-23T09:00:00Z' })).status, 400); // выезд раньше въезда
  const exit = await leave(entry.body.session.id, { exit_time: '2026-09-23T11:00:00Z' });
  assert.equal(exit.body.calculation.cost, 80);

  assert.equal((await pay({ amount: 0.004 })).status, 400);
  assert.equal((await pay({ amount: -5 })).status, 400);
  assert.equal((await pay({ amount: 10, method: 'BITCOIN' })).status, 400);
  assert.equal((await pay({ amount: 80.01 })).status, 400); // больше задолженности
  assert.equal((await pay({ amount: 80 })).status, 201);
  assert.equal((await call('GET', `${PARKING}/api/sessions/${entry.body.session.id}`, { token: op })).body.payment_status, 'PAID');
});

test('поиск стоянок по фрагменту номера, статусу, периоду и признаку «на стоянке»', async () => {
  const op = await token('operator');
  const { car } = await createClientWithCar();
  const entry = await enter(car.plate, { entry_time: '2026-09-21T10:00:00Z' });
  const q = (params) => call('GET', `${PARKING}/api/sessions?${new URLSearchParams(params)}`, { token: op });

  const fragment = car.plate.slice(0, 4).toLowerCase();
  assert.ok((await q({ plate: fragment, active: 'true' })).body.some((s) => s.id === entry.body.session.id));
  assert.ok(!(await q({ plate: fragment, active: 'false' })).body.some((s) => s.id === entry.body.session.id));
  assert.ok((await q({ plate: car.plate, from: '2026-09-21T00:00:00Z', to: '2026-09-21T23:59:59Z' })).body.length === 1);
  assert.equal((await q({ plate: car.plate, from: '2026-09-22T00:00:00Z' })).body.length, 0);
  await leave(entry.body.session.id, { exit_time: '2026-09-21T10:10:00Z' });
  assert.ok((await q({ plate: car.plate, payment_status: 'PAID' })).body.length === 1);
});
