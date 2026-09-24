'use strict';

const { round2 } = require('./pricing');

/**
 * Распределение оплаты по неоплаченным стоянкам клиента (ФТ-12).
 * balances — [{ id, balance }] в порядке от самой ранней стоянки.
 * Сначала гасится самый старый долг; возвращает [{ id, amount, paid_off }].
 * Чистая функция: без обращения к БД, поэтому проверяется модульными тестами.
 */
function allocatePayment(balances, amount) {
  const total = round2(balances.reduce((sum, s) => sum + s.balance, 0));
  if (amount > total) {
    const error = new Error(`Сумма превышает задолженность (${total} руб.)`);
    error.status = 400;
    throw error;
  }
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

module.exports = { allocatePayment };
