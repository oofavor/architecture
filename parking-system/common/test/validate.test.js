'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/validate');

const schema = {
  name: { type: 'string', required: true },
  percent: { type: 'number' },
  count: { type: 'integer' },
  active: { type: 'boolean' },
  since: { type: 'datetime' },
  role: { type: 'string', enum: ['ADMIN', 'OPERATOR'] },
  note: { type: 'string', nullable: true },
};

test('пропускает корректные данные', () => {
  const data = validate({ name: 'Тариф', percent: 12.5, count: 3, active: true, since: '2026-09-23T08:40:00Z' }, schema);
  assert.deepEqual(data, { name: 'Тариф', percent: 12.5, count: 3, active: true, since: '2026-09-23T08:40:00Z' });
});

test('отбрасывает поля, которых нет в схеме (белый список)', () => {
  assert.deepEqual(validate({ name: 'x', password_hash: 'hack', id: 99 }, schema), { name: 'x' });
});

test('обязательное поле: ошибка 400 при создании', () => {
  assert.throws(() => validate({ percent: 1 }, schema), { status: 400, message: /«name» обязательно/ });
});

test('обязательное поле не требуется при частичном обновлении', () => {
  assert.deepEqual(validate({ percent: 1 }, schema, { partial: true }), { percent: 1 });
});

test('проверка типов', () => {
  assert.throws(() => validate({ name: 'x', percent: '10' }, schema), { status: 400 });
  assert.throws(() => validate({ name: 'x', count: 1.5 }, schema), { status: 400 });
  assert.throws(() => validate({ name: 'x', active: 'yes' }, schema), { status: 400 });
  assert.throws(() => validate({ name: 'x', since: 'вчера' }, schema), { status: 400 });
  assert.throws(() => validate({ name: '   ' }, schema), { status: 400 });
});

test('перечисление допустимых значений', () => {
  assert.throws(() => validate({ name: 'x', role: 'ROOT' }, schema), { status: 400, message: /ADMIN, OPERATOR/ });
});

test('null разрешён только для nullable-полей', () => {
  assert.deepEqual(validate({ name: 'x', note: null }, schema), { name: 'x', note: null });
  assert.throws(() => validate({ name: 'x', percent: null }, schema), { status: 400 });
});

test('пустое тело — ошибка 400', () => {
  assert.throws(() => validate({}, schema, { partial: true }), { status: 400, message: /Нет данных/ });
  assert.throws(() => validate(undefined, schema, { partial: true }), { status: 400 });
});
