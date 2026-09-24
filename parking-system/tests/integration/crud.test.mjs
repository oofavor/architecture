// CRUD всех ресурсов через REST API: создание → чтение → изменение → поиск → удаление
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH, CLIENTS, PARKING, call, token, uid, randomPlate, createClientWithCar, enter, leave } from './helpers.mjs';

test('клиенты: полный цикл CRUD (оператор создаёт и меняет, администратор удаляет)', async () => {
  const op = await token('operator');
  const name = `Иванов ${uid()}`;
  const created = await call('POST', `${CLIENTS}/api/clients`, { token: op, body: { full_name: name, phone: '+79001234567' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.is_regular, false);
  const id = created.body.id;

  assert.equal((await call('GET', `${CLIENTS}/api/clients/${id}`, { token: op })).body.full_name, name);

  const updated = await call('PUT', `${CLIENTS}/api/clients/${id}`, { token: op, body: { is_regular: true, discount_id: 1 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.discount_id, 1);
  assert.equal(updated.body.phone, '+79001234567'); // поля, которых не было в запросе, не изменились

  const found = await call('GET', `${CLIENTS}/api/clients?full_name=${encodeURIComponent(name.toLowerCase())}`, { token: op });
  assert.deepEqual(found.body.map((c) => c.id), [id]);

  assert.equal((await call('DELETE', `${CLIENTS}/api/clients/${id}`, { token: await token('admin') })).status, 204);
  assert.equal((await call('GET', `${CLIENTS}/api/clients/${id}`, { token: op })).status, 404);
});

test('клиенты: ошибки валидации и некорректные запросы', async () => {
  const op = await token('operator');
  assert.equal((await call('POST', `${CLIENTS}/api/clients`, { token: op, body: { full_name: 'Без телефона' } })).status, 400);
  assert.equal((await call('POST', `${CLIENTS}/api/clients`, { token: op, body: { full_name: 'x', phone: 123 } })).status, 400);
  assert.equal((await call('PUT', `${CLIENTS}/api/clients/1`, { token: op, body: {} })).status, 400);
  assert.equal((await call('GET', `${CLIENTS}/api/clients/abc`, { token: op })).status, 400);
  assert.equal((await call('PUT', `${CLIENTS}/api/clients/99999999`, { token: op, body: { phone: '1' } })).status, 404);
  assert.equal((await call('POST', `${CLIENTS}/api/clients`, { token: op, body: { full_name: 'x', phone: '1', discount_id: 999999 } })).status, 409);
});

test('автомобили: госномер нормализуется и уникален (ФТ-5), поиск по фрагменту, удаление', async () => {
  const op = await token('operator');
  const { client } = await createClientWithCar();
  const plate = randomPlate();
  const spaced = `${plate.slice(0, 6).toLowerCase()} ${plate.slice(6)}`;
  const car = await call('POST', `${CLIENTS}/api/cars`, { token: op, body: { plate: spaced, brand: 'Lada', client_id: client.id } });
  assert.equal(car.status, 201);
  assert.equal(car.body.plate, plate);

  const dup = await call('POST', `${CLIENTS}/api/cars`, { token: op, body: { plate, brand: 'Lada', client_id: client.id } });
  assert.equal(dup.status, 409);

  const byFragment = await call('GET', `${CLIENTS}/api/cars?plate=${encodeURIComponent(plate.slice(1, 4))}`, { token: op });
  assert.ok(byFragment.body.some((c) => c.id === car.body.id));

  const lookup = await call('GET', `${CLIENTS}/api/cars/by-plate/${encodeURIComponent(spaced)}`, { token: op });
  assert.equal(lookup.body.client.id, client.id);

  const orphan = await call('POST', `${CLIENTS}/api/cars`, { token: op, body: { plate: randomPlate(), brand: 'X', client_id: 99999999 } });
  assert.equal(orphan.status, 409);

  assert.equal((await call('DELETE', `${CLIENTS}/api/cars/${car.body.id}`, { token: await token('admin') })).status, 204);
});

test('скидки: CRUD администратора и ограничение процента 0–100', async () => {
  const admin = await token('admin');
  const created = await call('POST', `${CLIENTS}/api/discounts`, { token: admin, body: { name: `Акция ${uid()}`, percent: 5 } });
  assert.equal(created.status, 201);
  assert.equal((await call('PUT', `${CLIENTS}/api/discounts/${created.body.id}`, { token: admin, body: { percent: 7.5 } })).body.percent, 7.5);
  assert.equal((await call('PUT', `${CLIENTS}/api/discounts/${created.body.id}`, { token: admin, body: { percent: 150 } })).status, 400);
  assert.equal((await call('DELETE', `${CLIENTS}/api/discounts/${created.body.id}`, { token: admin })).status, 204);
});

test('тарифы: CRUD администратора, отрицательная цена отклоняется', async () => {
  const admin = await token('admin');
  const created = await call('POST', `${PARKING}/api/tariffs`, {
    token: admin, body: { name: `Тест ${uid()}`, price_per_hour: 100, free_minutes: 10, valid_from: '2099-01-01T00:00:00Z', is_active: false },
  });
  assert.equal(created.status, 201);
  assert.equal((await call('GET', `${PARKING}/api/tariffs/${created.body.id}`, { token: await token('operator') })).body.price_per_hour, 100);
  assert.equal((await call('PUT', `${PARKING}/api/tariffs/${created.body.id}`, { token: admin, body: { price_per_hour: 120 } })).body.price_per_hour, 120);
  assert.equal((await call('PUT', `${PARKING}/api/tariffs/${created.body.id}`, { token: admin, body: { price_per_hour: -1 } })).status, 400);
  assert.equal((await call('DELETE', `${PARKING}/api/tariffs/${created.body.id}`, { token: admin })).status, 204);
});

test('парковочные места: уникальный номер, фильтр по статусу, место со стоянками не удаляется', async () => {
  const admin = await token('admin');
  const number = 1000 + Math.floor(Math.random() * 8000);
  const spot = await call('POST', `${PARKING}/api/spots`, { token: admin, body: { number, zone: 'Тестовая зона' } });
  assert.equal(spot.status, 201);
  assert.equal(spot.body.status, 'FREE');
  assert.equal((await call('POST', `${PARKING}/api/spots`, { token: admin, body: { number, zone: 'x' } })).status, 409);

  const free = await call('GET', `${PARKING}/api/spots?status=FREE`, { token: admin });
  assert.ok(free.body.every((s) => s.status === 'FREE'));

  // Стоянка на этом месте — после неё удаление запрещено ссылочной целостностью
  const { car } = await createClientWithCar();
  const entry = await enter(car.plate, { spot_id: spot.body.id });
  assert.equal(entry.status, 201);
  await leave(entry.body.session.id);
  assert.equal((await call('DELETE', `${PARKING}/api/spots/${spot.body.id}`, { token: admin })).status, 409);
  await call('PUT', `${PARKING}/api/spots/${spot.body.id}`, { token: admin, body: { zone: 'Выведено из эксплуатации' } });
});

test('учётные записи: пароль хешируется и не возвращается, смена пароля работает', async () => {
  const admin = await token('admin');
  const login = `user_${uid()}`;
  const created = await call('POST', `${AUTH}/api/users`, {
    token: admin, body: { full_name: 'Новый оператор', login, password: 'first-pass', role: 'OPERATOR', shift_number: 3 },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.password_hash, undefined);
  assert.equal(created.body.password, undefined);

  const list = await call('GET', `${AUTH}/api/users?login=${login}`, { token: admin });
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].password_hash, undefined);

  assert.equal((await call('POST', `${AUTH}/api/users`, { token: admin, body: { full_name: 'x', login, password: 'x', role: 'OPERATOR' } })).status, 409);
  assert.equal((await call('POST', `${AUTH}/api/users`, { token: admin, body: { full_name: 'x', login: `${login}2`, password: 'x', role: 'ROOT' } })).status, 400);

  await call('PUT', `${AUTH}/api/users/${created.body.id}`, { token: admin, body: { password: 'second-pass' } });
  assert.equal((await call('POST', `${AUTH}/api/auth/login`, { body: { login, password: 'first-pass' } })).status, 401);
  assert.equal((await call('POST', `${AUTH}/api/auth/login`, { body: { login, password: 'second-pass' } })).status, 200);

  assert.equal((await call('DELETE', `${AUTH}/api/users/${created.body.id}`, { token: admin })).status, 204);
});
