'use strict';

const { HttpError, withTransaction, logger, metrics } = require('@parking/common');
const { allocatePayment } = require('../domain/allocation');
const { getDebt } = require('./debtService');

/**
 * Приём оплаты (ФТ-11, ФТ-12). Сумма распределяется по неоплаченным стоянкам клиента,
 * начиная с самой ранней: сначала гасится долг, затем текущая стоянка.
 * Неоплаченный остаток автоматически становится задолженностью.
 */
function createPaymentService(pool) {
  async function pay({ session_id: sessionId, amount, method }) {
    if (!(amount >= 0.01)) throw new HttpError(400, 'Сумма оплаты должна быть не меньше 0,01 руб.');

    const receipt = await withTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT client_id, cost FROM parking_sessions WHERE id = $1', [sessionId]);
      if (!rows[0]) throw new HttpError(404, 'Стоянка не найдена');
      if (rows[0].cost === null) throw new HttpError(409, 'Сначала зарегистрируйте выезд');
      const clientId = rows[0].client_id;

      // Блокировка стоянок клиента: две одновременные оплаты не погасят один и тот же долг дважды
      await db.query('SELECT id FROM parking_sessions WHERE client_id = $1 FOR UPDATE', [clientId]);
      const unpaid = (await db.query(
        `SELECT id, balance FROM session_balances
         WHERE client_id = $1 AND balance > 0 ORDER BY entry_time`,
        [clientId],
      )).rows;

      let parts;
      try {
        parts = allocatePayment(unpaid, amount);
      } catch (err) {
        throw new HttpError(err.status ?? 400, err.message);
      }

      const payments = [];
      for (const part of parts) {
        const payment = await db.query(
          'INSERT INTO payments (session_id, amount, method) VALUES ($1, $2, $3) RETURNING *',
          [part.id, part.amount, method],
        );
        await db.query('UPDATE parking_sessions SET payment_status = $1 WHERE id = $2',
          [part.paid_off ? 'PAID' : 'PARTIAL', part.id]);
        payments.push(payment.rows[0]);
      }

      // Квитанция
      return {
        receipt_no: payments[0].id,
        client_id: clientId,
        paid: amount,
        method,
        payments,
        debt_after: await getDebt(db, clientId),
      };
    });

    metrics.count('payment');
    logger.info('payment_accepted', {
      receipt_no: receipt.receipt_no, client_id: receipt.client_id, amount, method, debt_after: receipt.debt_after,
    });
    return receipt;
  }

  return { pay };
}

module.exports = { createPaymentService };
