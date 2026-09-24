'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError, errorHandler } = require('../src/errors');

function run(err) {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  errorHandler(err, {}, res, () => {});
  return res;
}

test('HttpError передаёт свой код и сообщение', () => {
  const res = run(new HttpError(409, 'Автомобиль уже на стоянке'));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'Автомобиль уже на стоянке');
});

test('ошибки PostgreSQL переводятся в ошибки клиента', () => {
  const cases = [['23505', 409], ['23503', 409], ['23514', 400], ['22P02', 400]];
  for (const [code, status] of cases) {
    assert.equal(run(Object.assign(new Error('pg'), { code })).statusCode, status, code);
  }
});

test('некорректный JSON в теле — 400 с понятным сообщением', () => {
  const res = run(Object.assign(new Error('Unexpected token'), { type: 'entity.parse.failed', status: 400 }));
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /JSON/);
});

test('непредвиденная ошибка — 500 без раскрытия подробностей', () => {
  const res = run(new Error('connection to 10.0.0.5 refused, password=secret'));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Внутренняя ошибка сервера');
});
