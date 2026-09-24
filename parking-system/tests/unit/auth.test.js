'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { signToken, authenticate, authorize } = require('../../common/src/auth');

// Вызов промежуточного обработчика Express без сервера: возвращает ошибку или req
function run(middleware, req) {
  let error;
  middleware({ headers: {}, ...req }, {}, (err) => { error = err; });
  return error;
}

test('аутентификация: выданный токен принимается', () => {
  const token = signToken({ id: 2, login: 'operator', role: 'OPERATOR' });
  assert.equal(run(authenticate, { headers: { authorization: `Bearer ${token}` } }), undefined);
});

test('аутентификация: без токена, с поддельным и просроченным токеном — 401', () => {
  const forged = jwt.sign({ sub: 1, role: 'ADMIN' }, 'чужой-секрет');
  const expired = jwt.sign({ sub: 1, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.equal(run(authenticate, {}).status, 401);
  assert.equal(run(authenticate, { headers: { authorization: `Bearer ${forged}` } }).status, 401);
  assert.equal(run(authenticate, { headers: { authorization: `Bearer ${expired}` } }).status, 401);
});

test('авторизация: разрешённая роль проходит, остальные — 403', () => {
  assert.equal(run(authorize('ADMIN'), { user: { role: 'ADMIN' } }), undefined);
  assert.equal(run(authorize('ADMIN'), { user: { role: 'OPERATOR' } }).status, 403);
});
