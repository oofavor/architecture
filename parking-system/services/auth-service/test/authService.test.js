'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createAuthService, MAX_FAILED_ATTEMPTS } = require('../src/authService');

const HASH = bcrypt.hashSync('operator123', 4); // низкая стоимость — тест быстрее

// Заглушка БД с одной учётной записью; повторяет логику SQL-запросов сервиса
function fakePool(overrides = {}) {
  const user = {
    id: 2, login: 'operator', full_name: 'Оператор', role: 'OPERATOR', client_id: null,
    password_hash: HASH, is_blocked: false, failed_attempts: 0, locked_until: null, ...overrides,
  };
  return {
    user,
    async query(sql, params) {
      if (sql.startsWith('SELECT * FROM users')) return { rows: params[0] === user.login ? [{ ...user }] : [] };
      if (sql.includes('locked_until = CASE')) {
        const [attempts, lock, minutes] = params;
        user.failed_attempts = attempts;
        if (lock) user.locked_until = new Date(Date.now() + minutes * 60000);
        return { rows: [] };
      }
      if (sql.includes('failed_attempts = 0')) {
        user.failed_attempts = 0;
        user.locked_until = null;
        return { rows: [] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

test('верный пароль: выдаётся JWT с ролью, счётчик неудач сбрасывается', async () => {
  const pool = fakePool({ failed_attempts: 3 });
  const result = await createAuthService(pool).login('operator', 'operator123');
  assert.equal(jwt.decode(result.token).role, 'OPERATOR');
  assert.equal(result.user.password_hash, undefined);
  assert.equal(pool.user.failed_attempts, 0);
});

test('неверный пароль и неизвестный логин — одинаковый ответ 401', async () => {
  const auth = createAuthService(fakePool());
  await assert.rejects(auth.login('operator', 'wrong'), { status: 401, message: 'Неверный логин или пароль' });
  await assert.rejects(auth.login('nobody', 'wrong'), { status: 401, message: 'Неверный логин или пароль' });
});

test(`после ${MAX_FAILED_ATTEMPTS} неудачных попыток — блокировка 423, даже с верным паролем`, async () => {
  const pool = fakePool();
  const auth = createAuthService(pool);
  for (let i = 1; i <= MAX_FAILED_ATTEMPTS; i += 1) {
    await assert.rejects(auth.login('operator', `bad${i}`), { status: 401 });
  }
  assert.ok(pool.user.locked_until > new Date());
  await assert.rejects(auth.login('operator', 'operator123'), { status: 423 });
});

test('истёкшая блокировка не мешает входу', async () => {
  const auth = createAuthService(fakePool({ locked_until: new Date(Date.now() - 1000) }));
  assert.ok((await auth.login('operator', 'operator123')).token);
});

test('заблокированная администратором запись — 403', async () => {
  const auth = createAuthService(fakePool({ is_blocked: true }));
  await assert.rejects(auth.login('operator', 'operator123'), { status: 403 });
});
