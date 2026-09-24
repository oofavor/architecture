'use strict';

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Расчёт стоимости стоянки по формулам (1)–(2) из ЛР №1:
 *   N = ⌈(t − tб) / 60⌉,   C = N · T · (1 − d / 100).
 * Чистая функция без обращения к БД — легко тестируется.
 */
function calculateCost({ entryTime, exitTime, pricePerHour, freeMinutes, discountPercent = 0 }) {
  const minutes = Math.ceil((new Date(exitTime) - new Date(entryTime)) / 60000);
  const hours = Math.max(0, Math.ceil((minutes - freeMinutes) / 60));
  const baseCost = round2(hours * pricePerHour);
  const cost = round2(baseCost * (1 - discountPercent / 100));
  return { minutes, hours, price_per_hour: pricePerHour, base_cost: baseCost, discount_percent: discountPercent, cost };
}

module.exports = { calculateCost, round2 };
