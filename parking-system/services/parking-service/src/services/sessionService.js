'use strict';

const { HttpError, withTransaction, logger, metrics } = require('@parking/common');
const { calculateCost, round2 } = require('../domain/pricing');
const { getDebt } = require('./debtService');

// Регистрация въезда и выезда автомобиля (ФТ-6, ФТ-8, ФТ-9, ФТ-10, ФТ-12)
function createSessionService(pool, clientsApi) {
  async function takeSpot(db, spotId) {
    const { rows } = spotId
      ? await db.query('SELECT * FROM parking_spots WHERE id = $1 FOR UPDATE', [spotId])
      : await db.query(
          `SELECT * FROM parking_spots WHERE status = 'FREE'
           ORDER BY number LIMIT 1 FOR UPDATE SKIP LOCKED`,
        );
    const spot = rows[0];
    if (!spot) throw new HttpError(spotId ? 404 : 409, spotId ? 'Место не найдено' : 'Свободных мест нет');
    if (spot.status !== 'FREE') throw new HttpError(409, `Место №${spot.number} занято`);
    await db.query(`UPDATE parking_spots SET status = 'OCCUPIED' WHERE id = $1`, [spot.id]);
    return { ...spot, status: 'OCCUPIED' };
  }

  // Действующий на момент въезда тариф: новый тариф применяется только к новым стоянкам (ФТ-17)
  async function tariffAt(db, moment) {
    const { rows } = await db.query(
      `SELECT * FROM tariffs WHERE is_active AND valid_from <= $1 ORDER BY valid_from DESC LIMIT 1`,
      [moment],
    );
    if (!rows[0]) throw new HttpError(409, 'Нет действующего тарифа');
    return rows[0];
  }

  async function registerEntry({ plate, spot_id: spotId, entry_time: entryTime }, user, token) {
    const car = await clientsApi.findCarByPlate(plate, token);
    const moment = entryTime ? new Date(entryTime) : new Date();

    const result = await withTransaction(pool, async (db) => {
      const active = await db.query(
        'SELECT id FROM parking_sessions WHERE car_id = $1 AND exit_time IS NULL', [car.id],
      );
      if (active.rows[0]) throw new HttpError(409, `Автомобиль ${car.plate} уже находится на стоянке`);

      const spot = await takeSpot(db, spotId);
      const tariff = await tariffAt(db, moment);
      const { rows } = await db.query(
        `INSERT INTO parking_sessions (car_id, client_id, plate, spot_id, tariff_id, operator_id, entry_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [car.id, car.client.id, car.plate, spot.id, tariff.id, user.sub, moment],
      );
      return { session: rows[0], car, spot, tariff };
    });

    metrics.count('car_entry');
    logger.info('car_entry', {
      session_id: result.session.id, plate: car.plate, spot: result.spot.number, tariff_id: result.tariff.id,
    });
    return result;
  }

  async function registerExit(sessionId, { exit_time: exitTime }, token) {
    const found = await pool.query('SELECT plate FROM parking_sessions WHERE id = $1', [sessionId]);
    if (!found.rows[0]) throw new HttpError(404, 'Стоянка не найдена');
    // Скидку берём у clients-service до начала транзакции, чтобы не держать блокировки во время HTTP-запроса
    const car = await clientsApi.findCarByPlate(found.rows[0].plate, token);
    const discountPercent = car.discount?.percent ?? 0;

    const result = await withTransaction(pool, async (db) => {
      const { rows } = await db.query(
        `SELECT s.*, t.price_per_hour, t.free_minutes FROM parking_sessions s
         JOIN tariffs t ON t.id = s.tariff_id WHERE s.id = $1 FOR UPDATE OF s`,
        [sessionId],
      );
      const session = rows[0];
      if (session.exit_time) throw new HttpError(409, 'Выезд по этой стоянке уже зарегистрирован');

      const moment = exitTime ? new Date(exitTime) : new Date();
      if (moment < session.entry_time) throw new HttpError(400, 'Время выезда раньше времени въезда');

      const calculation = calculateCost({
        entryTime: session.entry_time,
        exitTime: moment,
        pricePerHour: session.price_per_hour,
        freeMinutes: session.free_minutes,
        discountPercent,
      });
      const previousDebt = await getDebt(db, session.client_id); // формула (3): S = C + D

      const updated = await db.query(
        `UPDATE parking_sessions SET exit_time = $1, cost = $2, discount_percent = $3, payment_status = $4
         WHERE id = $5 RETURNING *`,
        [moment, calculation.cost, discountPercent, calculation.cost > 0 ? 'UNPAID' : 'PAID', sessionId],
      );
      await db.query(`UPDATE parking_spots SET status = 'FREE' WHERE id = $1`, [session.spot_id]);

      return {
        session: updated.rows[0],
        calculation: {
          ...calculation,
          previous_debt: previousDebt,
          amount_due: round2(calculation.cost + previousDebt),
        },
      };
    });

    metrics.count('car_exit');
    logger.info('car_exit', {
      session_id: sessionId,
      plate: result.session.plate,
      minutes: result.calculation.minutes,
      cost: result.calculation.cost,
      amount_due: result.calculation.amount_due,
    });
    return result;
  }

  return { registerEntry, registerExit };
}

module.exports = { createSessionService };
