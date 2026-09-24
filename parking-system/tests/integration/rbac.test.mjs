// Матрица доступа: каждая роль × закрытые операции (ожидаемый код ответа)
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH, CLIENTS, PARKING, call, token } from './helpers.mjs';

const CASES = [
  // [роль, метод, адрес, тело, ожидаемый код]
  [null, 'GET', `${CLIENTS}/api/clients`, undefined, 401],
  [null, 'GET', `${PARKING}/api/my/sessions`, undefined, 401],
  [null, 'POST', `${PARKING}/api/sessions/entry`, { plate: 'А123ВС777' }, 401],

  ['petrov', 'GET', `${CLIENTS}/api/clients`, undefined, 403],
  ['petrov', 'GET', `${CLIENTS}/api/cars/by-plate/${encodeURIComponent('А123ВС777')}`, undefined, 403],
  ['petrov', 'GET', `${PARKING}/api/sessions`, undefined, 403],
  ['petrov', 'POST', `${PARKING}/api/sessions/entry`, { plate: 'А123ВС777' }, 403],
  ['petrov', 'POST', `${PARKING}/api/payments`, { session_id: 1, amount: 1, method: 'CASH' }, 403],
  ['petrov', 'GET', `${PARKING}/api/clients/2/debt`, undefined, 403],
  ['petrov', 'GET', `${AUTH}/api/users`, undefined, 403],
  ['petrov', 'GET', `${PARKING}/api/my/sessions`, undefined, 200],

  ['operator', 'GET', `${AUTH}/api/users`, undefined, 403],
  ['operator', 'POST', `${AUTH}/api/users`, { full_name: 'x', login: 'x', password: 'x', role: 'ADMIN' }, 403],
  ['operator', 'POST', `${PARKING}/api/tariffs`, { name: 'x', price_per_hour: 1 }, 403],
  ['operator', 'PUT', `${PARKING}/api/spots/1`, { zone: 'x' }, 403],
  ['operator', 'POST', `${CLIENTS}/api/discounts`, { name: 'x', percent: 99 }, 403],
  ['operator', 'DELETE', `${CLIENTS}/api/clients/999999`, undefined, 403],
  ['operator', 'DELETE', `${CLIENTS}/api/cars/999999`, undefined, 403],
  ['operator', 'GET', `${PARKING}/api/my/sessions`, undefined, 403],
  ['operator', 'GET', `${CLIENTS}/api/clients`, undefined, 200],
  ['operator', 'GET', `${PARKING}/api/sessions`, undefined, 200],
  ['operator', 'GET', `${PARKING}/api/tariffs`, undefined, 200],

  ['admin', 'GET', `${AUTH}/api/users`, undefined, 200],
  ['admin', 'GET', `${PARKING}/api/sessions`, undefined, 200],
  ['admin', 'DELETE', `${CLIENTS}/api/clients/999999`, undefined, 404],
  ['admin', 'GET', `${PARKING}/api/my/sessions`, undefined, 403],
];

for (const [role, method, url, body, expected] of CASES) {
  test(`${role ?? 'без токена'}: ${method} ${url.replace(/^http:\/\/localhost/, '')} → ${expected}`, async () => {
    const res = await call(method, url, { token: role && await token(role), body });
    assert.equal(res.status, expected);
  });
}

test('личный кабинет возвращает только стоянки своего клиента', async () => {
  const res = await call('GET', `${PARKING}/api/my/sessions`, { token: await token('petrov') });
  assert.equal(res.body.client_id, 1);
  assert.ok(res.body.sessions.every((s) => s.client_id === 1));
  // Параметр запроса не позволяет подменить клиента
  const spoof = await call('GET', `${PARKING}/api/my/sessions?client_id=2`, { token: await token('petrov') });
  assert.ok(spoof.body.sessions.every((s) => s.client_id === 1));
});
