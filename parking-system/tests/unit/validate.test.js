'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../../common/src/validate');

const schema = { name: { type: 'string', required: true }, percent: { type: 'number' }, role: { type: 'string', enum: ['ADMIN', 'OPERATOR'] } };

test('валидация: пропускает корректные данные и отбрасывает лишние поля', () => {
  assert.deepEqual(validate({ name: 'Тариф', percent: 5, id: 99, password_hash: 'x' }, schema), { name: 'Тариф', percent: 5 });
});

test('валидация: обязательное поле, тип и перечисление — ошибка 400', () => {
  assert.throws(() => validate({ percent: 5 }, schema), { status: 400 });
  assert.throws(() => validate({ name: 'x', percent: '5' }, schema), { status: 400 });
  assert.throws(() => validate({ name: 'x', role: 'ROOT' }, schema), { status: 400 });
});

test('валидация: при обновлении обязательность не проверяется, пустое тело — 400', () => {
  assert.deepEqual(validate({ percent: 7 }, schema, { partial: true }), { percent: 7 });
  assert.throws(() => validate({}, schema, { partial: true }), { status: 400 });
});
