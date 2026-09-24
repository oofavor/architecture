'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCost } = require('../src/domain/pricing');

const tariff = { pricePerHour: 80, freeMinutes: 15 };

test('пример из ЛР №1 (таблица 10): 265 мин, скидка 10 % — 360 руб.', () => {
  const r = calculateCost({
    ...tariff,
    entryTime: '2026-09-23T08:40:00+03:00',
    exitTime: '2026-09-23T13:05:00+03:00',
    discountPercent: 10,
  });
  assert.equal(r.minutes, 265);
  assert.equal(r.hours, 5);
  assert.equal(r.base_cost, 400);
  assert.equal(r.cost, 360);
});

test('первые 15 минут бесплатны', () => {
  const r = calculateCost({ ...tariff, entryTime: '2026-09-23T10:00:00Z', exitTime: '2026-09-23T10:15:00Z' });
  assert.equal(r.cost, 0);
});

test('неполный час округляется в большую сторону', () => {
  const r = calculateCost({ ...tariff, entryTime: '2026-09-23T10:00:00Z', exitTime: '2026-09-23T10:16:00Z' });
  assert.equal(r.hours, 1);
  assert.equal(r.cost, 80);
});

test('граница бесплатного времени и часов: 75 мин — 1 ч, 76 мин — 2 ч', () => {
  const at = (min) => calculateCost({ ...tariff, entryTime: '2026-09-23T10:00:00Z', exitTime: new Date(Date.parse('2026-09-23T10:00:00Z') + min * 60000) });
  assert.equal(at(75).hours, 1);
  assert.equal(at(76).hours, 2);
  assert.equal(at(0).cost, 0);
});

test('копейки округляются до сотых, скидка 100 % даёт 0', () => {
  const r = calculateCost({ pricePerHour: 55.55, freeMinutes: 0, discountPercent: 15, entryTime: '2026-09-23T10:00:00Z', exitTime: '2026-09-23T13:00:00Z' });
  assert.equal(r.cost, 141.65); // 166,65 · 0,85 = 141,6525
  const free = calculateCost({ ...tariff, discountPercent: 100, entryTime: '2026-09-23T10:00:00Z', exitTime: '2026-09-23T15:00:00Z' });
  assert.equal(free.cost, 0);
});
