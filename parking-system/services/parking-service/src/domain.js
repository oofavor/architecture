'use strict';

// Бизнес-правила без обращения к БД и сети — поэтому проверяются модульными тестами

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Стоимость стоянки по формулам ЛР № 1:
 *   N = ⌈(t − tб) / 60⌉,  C = N · T · (1 − d / 100)
 */
function calculateCost({ entryTime, exitTime, pricePerHour, freeMinutes, discountPercent = 0 }) {
  const minutes = Math.ceil((new Date(exitTime) - new Date(entryTime)) / 60000);
  const hours = Math.max(0, Math.ceil((minutes - freeMinutes) / 60));
  const baseCost = round2(hours * pricePerHour);
  const cost = round2(baseCost * (1 - discountPercent / 100));
  return { minutes, hours, price_per_hour: pricePerHour, base_cost: baseCost, discount_percent: discountPercent, cost };
}

/**
 * Распределение оплаты по неоплаченным стоянкам клиента (ФТ-12):
 * balances — [{ id, balance }] от самой ранней; сначала гасится старый долг.
 */
function allocatePayment(balances, amount) {
  const total = round2(balances.reduce((sum, s) => sum + s.balance, 0));
  if (amount > total) throw Object.assign(new Error(`Сумма превышает задолженность (${total} руб.)`), { status: 400 });
  const parts = [];
  let rest = round2(amount);
  for (const s of balances) {
    if (rest <= 0) break;
    const part = round2(Math.min(rest, s.balance));
    parts.push({ id: s.id, amount: part, paid_off: part === round2(s.balance) });
    rest = round2(rest - part);
  }
  return parts;
}

module.exports = { calculateCost, allocatePayment, round2 };
