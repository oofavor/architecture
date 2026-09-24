'use strict';

const { HttpError, withTransaction } = require('@parking/common');
const { calculateCost, allocatePayment, round2 } = require('./domain');

// Задолженность клиента = сумма неоплаченных остатков по его стоянкам
async function getDebt(db, clientId) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(balance), 0) AS debt FROM session_balances WHERE client_id = $1 AND balance > 0',
    [clientId],
  );
  return rows[0].debt;
}

// Операции стоянки: въезд, выезд с расчётом, оплата (сценарий ЛР № 1)
function createParking(pool, clientsApi) {
  async function entry({ plate, entry_time: entryTime }, ctx) {
    const car = await clientsApi.findCarByPlate(plate, ctx); // до транзакции — не держим блокировки во время HTTP
    return withTransaction(pool, async (db) => {
      const active = await db.query('SELECT id FROM parking_sessions WHERE car_id = $1 AND exit_time IS NULL', [car.id]);
      if (active.rows[0]) throw new HttpError(409, `Автомобиль ${car.plate} уже на стоянке`);
      // Первое свободное место; SKIP LOCKED — одновременные въезды получают разные места
      const spot = (await db.query(
        "SELECT id, number FROM parking_spots WHERE status = 'FREE' ORDER BY number LIMIT 1 FOR UPDATE SKIP LOCKED",
      )).rows[0];
      if (!spot) throw new HttpError(409, 'Свободных мест нет');
      const tariff = (await db.query('SELECT * FROM tariffs ORDER BY id DESC LIMIT 1')).rows[0];
      await db.query("UPDATE parking_spots SET status = 'OCCUPIED' WHERE id = $1", [spot.id]);
      const session = (await db.query(
        `INSERT INTO parking_sessions (car_id, client_id, plate, spot_id, tariff_id, entry_time)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [car.id, car.client_id, car.plate, spot.id, tariff.id, entryTime ?? new Date()],
      )).rows[0];
      return { session, car, spot, tariff };
    });
  }

  async function exit(sessionId, { exit_time: exitTime }, ctx) {
    const found = (await pool.query('SELECT plate FROM parking_sessions WHERE id = $1', [sessionId])).rows[0];
    if (!found) throw new HttpError(404, 'Стоянка не найдена');
    const car = await clientsApi.findCarByPlate(found.plate, ctx); // текущая скидка клиента

    return withTransaction(pool, async (db) => {
      const s = (await db.query(
        `SELECT s.*, t.price_per_hour, t.free_minutes FROM parking_sessions s
         JOIN tariffs t ON t.id = s.tariff_id WHERE s.id = $1 FOR UPDATE OF s`,
        [sessionId],
      )).rows[0];
      if (s.exit_time) throw new HttpError(409, 'Выезд уже зарегистрирован');
      const moment = exitTime ? new Date(exitTime) : new Date();
      if (moment < s.entry_time) throw new HttpError(400, 'Время выезда раньше времени въезда');

      const calc = calculateCost({
        entryTime: s.entry_time, exitTime: moment,
        pricePerHour: s.price_per_hour, freeMinutes: s.free_minutes, discountPercent: car.discount_percent,
      });
      const previousDebt = await getDebt(db, s.client_id); // до записи стоимости — только прежний долг
      const session = (await db.query(
        'UPDATE parking_sessions SET exit_time = $1, cost = $2, payment_status = $3 WHERE id = $4 RETURNING *',
        [moment, calc.cost, calc.cost > 0 ? 'UNPAID' : 'PAID', sessionId],
      )).rows[0];
      await db.query("UPDATE parking_spots SET status = 'FREE' WHERE id = $1", [s.spot_id]);
      // Формула (3) ЛР № 1: S = C + D
      return { session, calculation: { ...calc, previous_debt: previousDebt, amount_due: round2(calc.cost + previousDebt) } };
    });
  }

  async function pay({ session_id: sessionId, amount, method }) {
    if (amount < 0.01) throw new HttpError(400, 'Сумма должна быть не меньше 0,01 руб.');
    return withTransaction(pool, async (db) => {
      const s = (await db.query('SELECT client_id, cost FROM parking_sessions WHERE id = $1', [sessionId])).rows[0];
      if (!s) throw new HttpError(404, 'Стоянка не найдена');
      if (s.cost === null) throw new HttpError(409, 'Сначала зарегистрируйте выезд');
      // Блокировка стоянок клиента: две кассы не погасят один долг дважды
      await db.query('SELECT id FROM parking_sessions WHERE client_id = $1 FOR UPDATE', [s.client_id]);
      const unpaid = (await db.query(
        'SELECT id, balance FROM session_balances WHERE client_id = $1 AND balance > 0 ORDER BY entry_time',
        [s.client_id],
      )).rows;
      let parts;
      try {
        parts = allocatePayment(unpaid, amount);
      } catch (err) {
        throw new HttpError(400, err.message);
      }
      for (const part of parts) {
        await db.query('INSERT INTO payments (session_id, amount, method) VALUES ($1, $2, $3)', [part.id, part.amount, method]);
        await db.query('UPDATE parking_sessions SET payment_status = $1 WHERE id = $2', [part.paid_off ? 'PAID' : 'PARTIAL', part.id]);
      }
      return { client_id: s.client_id, paid: amount, method, payments: parts, debt_after: await getDebt(db, s.client_id) };
    });
  }

  return { entry, exit, pay, debt: (clientId) => getDebt(pool, clientId) };
}

module.exports = { createParking };
