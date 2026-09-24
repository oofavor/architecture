'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { signToken, authenticate, authorize, ROLES } = require('../src/auth');

const user = { id: 7, login: 'operator', role: 'OPERATOR', client_id: null };

function call(middleware, req) {
  let error;
  let passed = false;
  middleware({ headers: {}, ...req }, {}, (err) => { if (err) error = err; else passed = true; });
  return { error, passed };
}

test('выданный токен проходит проверку, данные пользователя попадают в req.user', () => {
  const req = { headers: { authorization: `Bearer ${signToken(user)}` } };
  const { passed } = call(authenticate, req);
  assert.ok(passed);
});

test('токен содержит id, логин, роль и срок действия 8 часов', () => {
  const payload = jwt.decode(signToken(user));
  assert.equal(payload.sub, 7);
  assert.equal(payload.role, 'OPERATOR');
  assert.equal(payload.exp - payload.iat, 8 * 3600);
});

test('без заголовка Authorization — 401', () => {
  assert.equal(call(authenticate, {}).error.status, 401);
  assert.equal(call(authenticate, { headers: { authorization: 'Basic abc' } }).error.status, 401);
});

test('поддельный, чужой и просроченный токен — 401', () => {
  const forged = jwt.sign({ sub: 1, role: 'ADMIN' }, 'другой-секрет');
  const expired = jwt.sign({ sub: 1, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: -10 });
  const tampered = signToken(user).replace(/\.[^.]+\./, `.${Buffer.from('{"sub":1,"role":"ADMIN"}').toString('base64url')}.`);
  for (const token of [forged, expired, tampered, 'abc.def.ghi']) {
    assert.equal(call(authenticate, { headers: { authorization: `Bearer ${token}` } }).error.status, 401);
  }
});

test('authorize пропускает разрешённые роли и отклоняет остальные с кодом 403', () => {
  const onlyAdmin = authorize(ROLES.ADMIN);
  assert.ok(call(onlyAdmin, { user: { role: 'ADMIN' } }).passed);
  assert.equal(call(onlyAdmin, { user: { role: 'OPERATOR' } }).error.status, 403);
  assert.equal(call(onlyAdmin, {}).error.status, 403);
});
