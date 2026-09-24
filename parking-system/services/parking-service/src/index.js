'use strict';

const { ROLES, STAFF, authorize, crudRouter, createPool, log, startService, validate } = require('@parking/common');
const { createClientsApi } = require('./clientsApi');
const { createParking } = require('./parking');

const pool = createPool();
const parking = createParking(pool, createClientsApi(process.env.CLIENTS_SERVICE_URL));
const ctx = (req) => ({ token: req.token, requestId: req.id });

startService('parking-service', {
  pool,
  routes(app) {
    // Справочники: читают сотрудники, изменяет администратор
    app.use('/api/spots', crudRouter(pool, {
      table: 'parking_spots',
      schema: { number: { type: 'integer', required: true }, status: { type: 'string', enum: ['FREE', 'OCCUPIED'] } },
      read: STAFF,
      write: [ROLES.ADMIN],
      filters: { status: 'eq' },
    }));
    app.use('/api/tariffs', crudRouter(pool, {
      table: 'tariffs',
      schema: {
        name: { type: 'string', required: true },
        price_per_hour: { type: 'number', required: true },
        free_minutes: { type: 'integer' },
      },
      read: STAFF,
      write: [ROLES.ADMIN],
    }));

    app.use(['/api/sessions', '/api/payments', '/api/clients'], authorize(...STAFF));

    // Поиск стоянок: ?plate=фрагмент, ?active=true — автомобили на стоянке
    app.get('/api/sessions', async (req, res) => {
      const where = [];
      const params = [];
      if (req.query.plate) where.push(`plate ILIKE $${params.push(`%${req.query.plate}%`)}`);
      if (req.query.active === 'true') where.push('exit_time IS NULL');
      const sql = `SELECT * FROM parking_sessions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY entry_time DESC LIMIT 50`;
      res.json((await pool.query(sql, params)).rows);
    });

    app.post('/api/sessions/entry', async (req, res) => {
      const data = validate(req.body, { plate: { type: 'string', required: true }, entry_time: { type: 'datetime' } });
      const result = await parking.entry(data, ctx(req));
      log('info', 'car_entry', { requestId: req.id, user: req.user.login, plate: result.car.plate, spot: result.spot.number });
      res.status(201).json(result);
    });

    app.post('/api/sessions/:id/exit', async (req, res) => {
      const data = validate({ exit_time: new Date().toISOString(), ...req.body }, { exit_time: { type: 'datetime' } });
      const result = await parking.exit(Number(req.params.id), data, ctx(req));
      log('info', 'car_exit', { requestId: req.id, user: req.user.login, plate: result.session.plate, amount_due: result.calculation.amount_due });
      res.json(result);
    });

    app.post('/api/payments', async (req, res) => {
      const data = validate(req.body, {
        session_id: { type: 'integer', required: true },
        amount: { type: 'number', required: true },
        method: { type: 'string', required: true, enum: ['CASH', 'CARD'] },
      });
      const receipt = await parking.pay(data);
      log('info', 'payment', { requestId: req.id, user: req.user.login, amount: data.amount, debt_after: receipt.debt_after });
      res.status(201).json(receipt);
    });

    app.get('/api/clients/:id/debt', async (req, res) => {
      res.json({ client_id: Number(req.params.id), debt: await parking.debt(Number(req.params.id)) });
    });
  },
});
