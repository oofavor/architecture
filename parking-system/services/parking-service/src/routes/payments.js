'use strict';

const express = require('express');
const { STAFF, authorize, validate } = require('@parking/common');

function paymentsRouter(pool, payments) {
  const router = express.Router();
  router.use(authorize(...STAFF));

  router.get('/', async (req, res) => {
    const { rows } = req.query.session_id
      ? await pool.query('SELECT * FROM payments WHERE session_id = $1 ORDER BY id', [req.query.session_id])
      : await pool.query('SELECT * FROM payments ORDER BY id DESC LIMIT 20');
    res.json(rows);
  });

  router.post('/', async (req, res) => {
    const data = validate(req.body, {
      session_id: { type: 'integer', required: true },
      amount: { type: 'number', required: true },
      method: { type: 'string', required: true, enum: ['CASH', 'CARD'] },
    });
    res.status(201).json(await payments.pay(data));
  });

  return router;
}

module.exports = { paymentsRouter };
