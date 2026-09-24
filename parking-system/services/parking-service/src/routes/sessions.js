'use strict';

const express = require('express');
const { STAFF, HttpError, authorize, validate } = require('@parking/common');

// Фильтры поиска стоянок (ФТ-13): параметр запроса -> условие SQL
const SEARCH = {
  plate: (v) => ['plate ILIKE $?', `%${v}%`],
  client_id: (v) => ['client_id = $?', v],
  payment_status: (v) => ['payment_status = $?', v],
  from: (v) => ['entry_time >= $?', v],
  to: (v) => ['entry_time <= $?', v],
  active: (v) => [v === 'true' ? 'exit_time IS NULL' : 'exit_time IS NOT NULL'],
};

function sessionsRouter(pool, sessions) {
  const router = express.Router();
  router.use(authorize(...STAFF));

  router.get('/', async (req, res) => {
    const where = [];
    const params = [];
    for (const [key, build] of Object.entries(SEARCH)) {
      if (req.query[key] === undefined) continue;
      const [condition, value] = build(req.query[key]);
      if (value !== undefined) params.push(value);
      where.push(condition.replace('$?', `$${params.length}`));
    }
    const { rows } = await pool.query(
      `SELECT * FROM parking_sessions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY entry_time DESC LIMIT 20 OFFSET $${params.length + 1}`, // по 20 строк на странице
      [...params, (Math.max(Number(req.query.page) || 1, 1) - 1) * 20],
    );
    res.json(rows);
  });

  router.get('/:id', async (req, res) => {
    const session = await pool.query('SELECT * FROM parking_sessions WHERE id = $1', [req.params.id]);
    if (!session.rows[0]) throw new HttpError(404, 'Стоянка не найдена');
    const payments = await pool.query('SELECT * FROM payments WHERE session_id = $1 ORDER BY id', [req.params.id]);
    res.json({ ...session.rows[0], payments: payments.rows });
  });

  router.post('/entry', async (req, res) => {
    const data = validate(req.body, {
      plate: { type: 'string', required: true },
      spot_id: { type: 'integer' },
      entry_time: { type: 'datetime' }, // для демонстрации примера из ЛР №1; по умолчанию — текущее время
    });
    res.status(201).json(await sessions.registerEntry(data, req.user, req.token));
  });

  router.post('/:id/exit', async (req, res) => {
    const data = validate({ exit_time: new Date().toISOString(), ...req.body }, {
      exit_time: { type: 'datetime' },
    });
    res.json(await sessions.registerExit(Number(req.params.id), data, req.token));
  });

  return router;
}

module.exports = { sessionsRouter };
