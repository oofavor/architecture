'use strict';

// Модульные тесты бизнес-правил: расчёт стоимости и распределение оплаты
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCost, allocatePayment } = require('../../services/parking-service/src/domain');

const tariff = { pricePerHour: 80, freeMinutes: 15 };

test('расчёт стоимости: пример из ЛР № 1 — 265 мин, скидка 10 % → 360 руб.', () => {
  const r = calculateCost({ ...tariff, discountPercent: 10, entryTime: '2026-09-23T08:40:00+03:00', exitTime: '2026-09-23T13:05:00+03:00' });
  assert.deepEqual([r.minutes, r.hours, r.base_cost, r.cost], [265, 5, 400, 360]);
});

test('расчёт стоимости: первые 15 минут бесплатно, неполный час — вверх', () => {
  const at = (min) => calculateCost({ ...tariff, entryTime: '2026-09-23T10:00:00Z', exitTime: new Date(Date.parse('2026-09-23T10:00:00Z') + min * 60000) });
  assert.equal(at(15).cost, 0);
  assert.equal(at(16).cost, 80);
  assert.equal(at(76).hours, 2);
});

test('оплата: 500 руб. при долге 150 и стоянке 360 — сначала старый долг, остаток долга 10', () => {
  assert.deepEqual(allocatePayment([{ id: 1, balance: 150 }, { id: 6, balance: 360 }], 500), [
    { id: 1, amount: 150, paid_off: true },
    { id: 6, amount: 350, paid_off: false },
  ]);
});

test('оплата сверх задолженности — ошибка 400', () => {
  assert.throws(() => allocatePayment([{ id: 1, balance: 10 }], 10.01), { status: 400 });
});
