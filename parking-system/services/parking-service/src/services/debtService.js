'use strict';

// Задолженность клиента — сумма неоплаченных остатков по его стоянкам (представление session_balances)
async function getDebt(db, clientId) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(balance), 0) AS debt FROM session_balances WHERE client_id = $1 AND balance > 0',
    [clientId],
  );
  return rows[0].debt;
}

module.exports = { getDebt };
