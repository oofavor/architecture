'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { allocatePayment } = require('../src/domain/allocation');

test('пример из ЛР № 1: 500 руб. при долге 150 и стоянке 360 — остаток долга 10', () => {
  const parts = allocatePayment([{ id: 1, balance: 150 }, { id: 6, balance: 360 }], 500);
  assert.deepEqual(parts, [
    { id: 1, amount: 150, paid_off: true },
    { id: 6, amount: 350, paid_off: false },
  ]);
});

test('сначала гасится самая ранняя стоянка', () => {
  const parts = allocatePayment([{ id: 1, balance: 100 }, { id: 2, balance: 100 }], 60);
  assert.deepEqual(parts, [{ id: 1, amount: 60, paid_off: false }]);
});

test('точная оплата закрывает все стоянки', () => {
  const parts = allocatePayment([{ id: 1, balance: 10.1 }, { id: 2, balance: 20.2 }], 30.3);
  assert.ok(parts.every((p) => p.paid_off));
  assert.equal(parts[1].amount, 20.2);
});

test('оплата сверх задолженности — ошибка 400', () => {
  assert.throws(() => allocatePayment([{ id: 1, balance: 10 }], 10.01), { status: 400, message: /10 руб/ });
  assert.throws(() => allocatePayment([], 1), { status: 400 });
});
