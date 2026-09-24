// Интеграционные тесты: авторизация, права доступа и CRUD во всех трёх сервисах
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH, CLIENTS, PARKING, call, admin, operator, login, uid, randomPlate } from './helpers.mjs';

test('вход: верный пароль — токен, неверный — 401', async () => {
  const ok = await call('POST', `${AUTH}/api/auth/login`, { body: { login: 'operator', password: 'operator123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'OPERATOR');
  assert.equal((await call('POST', `${AUTH}/api/auth/login`, { body: { login: 'operator', password: 'x' } })).status, 401);
});

test('без токена и с поддельным токеном — 401 во всех сервисах', async () => {
  for (const url of [`${AUTH}/api/users`, `${CLIENTS}/api/clients`, `${PARKING}/api/sessions`]) {
    assert.equal((await call('GET', url)).status, 401);
    assert.equal((await call('GET', url, { token: 'abc.def.ghi' })).status, 401);
  }
});

test('права: оператору запрещено управлять пользователями и тарифами (403), администратору разрешено', async () => {
  const op = await operator();
  assert.equal((await call('GET', `${AUTH}/api/users`, { token: op })).status, 403);
  assert.equal((await call('POST', `${PARKING}/api/tariffs`, { token: op, body: { name: 'x', price_per_hour: 1 } })).status, 403);
  assert.equal((await call('GET', `${AUTH}/api/users`, { token: await admin() })).status, 200);
  assert.equal((await call('GET', `${PARKING}/api/tariffs`, { token: op })).status, 200);
});

test('CRUD клиентов: создание, чтение, изменение, поиск, удаление', async () => {
  const token = await operator();
  const name = `Иванов ${uid()}`;
  const created = await call('POST', `${CLIENTS}/api/clients`, { token, body: { full_name: name, phone: '+79001234567' } });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal((await call('GET', `${CLIENTS}/api/clients/${id}`, { token })).body.full_name, name);
  const updated = await call('PUT', `${CLIENTS}/api/clients/${id}`, { token, body: { discount_percent: 10 } });
  assert.equal(updated.body.discount_percent, 10);
  assert.equal(updated.body.phone, '+79001234567');
  const found = await call('GET', `${CLIENTS}/api/clients?full_name=${encodeURIComponent(name.toLowerCase())}`, { token });
  assert.deepEqual(found.body.map((c) => c.id), [id]);
  assert.equal((await call('DELETE', `${CLIENTS}/api/clients/${id}`, { token })).status, 204);
  assert.equal((await call('GET', `${CLIENTS}/api/clients/${id}`, { token })).status, 404);
});

test('автомобили: госномер нормализуется и уникален, поиск владельца по номеру', async () => {
  const token = await operator();
  const client = (await call('POST', `${CLIENTS}/api/clients`, { token, body: { full_name: `Тест ${uid()}`, phone: '1', discount_percent: 15 } })).body;
  const plate = randomPlate();
  const car = await call('POST', `${CLIENTS}/api/cars`, { token, body: { plate: plate.toLowerCase(), brand: 'Lada', client_id: client.id } });
  assert.equal(car.body.plate, plate);
  assert.equal((await call('POST', `${CLIENTS}/api/cars`, { token, body: { plate, brand: 'Lada', client_id: client.id } })).status, 409);
  const lookup = await call('GET', `${CLIENTS}/api/cars/by-plate/${encodeURIComponent(plate)}`, { token });
  assert.equal(lookup.body.client_id, client.id);
  assert.equal(lookup.body.discount_percent, 15);
});

test('пользователи: пароль хешируется и не возвращается, новый пользователь входит', async () => {
  const token = await admin();
  const loginName = `user_${uid()}`;
  const created = await call('POST', `${AUTH}/api/users`, { token, body: { full_name: 'Тест', login: loginName, password: 'pass1', role: 'OPERATOR' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.password_hash, undefined);
  assert.ok(await login(loginName, 'pass1'));
  assert.equal((await call('DELETE', `${AUTH}/api/users/${created.body.id}`, { token })).status, 204);
});

test('тарифы: администратор создаёт, изменяет и удаляет', async () => {
  const token = await admin();
  const t = await call('POST', `${PARKING}/api/tariffs`, { token, body: { name: `Тест ${uid()}`, price_per_hour: 100 } });
  assert.equal(t.status, 201);
  assert.equal((await call('PUT', `${PARKING}/api/tariffs/${t.body.id}`, { token, body: { price_per_hour: 120 } })).body.price_per_hour, 120);
  assert.equal((await call('DELETE', `${PARKING}/api/tariffs/${t.body.id}`, { token })).status, 204);
});

test('валидация: нет обязательного поля, неверный тип, неверный id — 400', async () => {
  const token = await operator();
  assert.equal((await call('POST', `${CLIENTS}/api/clients`, { token, body: { full_name: 'Без телефона' } })).status, 400);
  assert.equal((await call('POST', `${CLIENTS}/api/clients`, { token, body: { full_name: 'x', phone: 123 } })).status, 400);
  assert.equal((await call('GET', `${CLIENTS}/api/clients/abc`, { token })).status, 400);
});
