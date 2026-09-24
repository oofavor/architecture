'use strict';

const { ROLES, STAFF, authenticate, authorize, crudRouter, createPool, startService } = require('@parking/common');
const { createClientsApi } = require('./clientsApi');
const { createSessionService } = require('./services/sessionService');
const { createPaymentService } = require('./services/paymentService');
const { getDebt } = require('./services/debtService');
const { sessionsRouter } = require('./routes/sessions');
const { paymentsRouter } = require('./routes/payments');

const pool = createPool();
const clientsApi = createClientsApi(process.env.CLIENTS_SERVICE_URL);
const sessions = createSessionService(pool, clientsApi);
const payments = createPaymentService(pool);

startService('parking-service', (app) => {
  app.use('/api', authenticate);

  // Парковочные места: читают сотрудники, изменяет администратор
  app.use('/api/spots', crudRouter(pool, {
    table: 'parking_spots',
    schema: {
      number: { type: 'integer', required: true },
      zone: { type: 'string', required: true },
      status: { type: 'string', enum: ['FREE', 'OCCUPIED'] },
    },
    access: { read: STAFF, write: [ROLES.ADMIN], remove: [ROLES.ADMIN] },
    filters: { status: 'eq', zone: 'like' },
  }));

  // Тарифы (ФТ-17)
  app.use('/api/tariffs', crudRouter(pool, {
    table: 'tariffs',
    schema: {
      name: { type: 'string', required: true },
      price_per_hour: { type: 'number', required: true },
      free_minutes: { type: 'integer' },
      valid_from: { type: 'datetime' },
      is_active: { type: 'boolean' },
    },
    access: { read: STAFF, write: [ROLES.ADMIN], remove: [ROLES.ADMIN] },
  }));

  app.use('/api/sessions', sessionsRouter(pool, sessions));
  app.use('/api/payments', paymentsRouter(pool, payments));

  app.get('/api/clients/:clientId/debt', authorize(...STAFF), async (req, res) => {
    res.json({ client_id: Number(req.params.clientId), debt: await getDebt(pool, req.params.clientId) });
  });

  // Личный кабинет владельца автомобиля: только собственные данные (ФТ-20)
  app.get('/api/my/sessions', authorize(ROLES.CLIENT), async (req, res) => {
    const clientId = req.user.clientId;
    const { rows } = await pool.query(
      'SELECT * FROM parking_sessions WHERE client_id = $1 ORDER BY entry_time DESC', [clientId],
    );
    res.json({ client_id: clientId, debt: await getDebt(pool, clientId), sessions: rows });
  });
}, { pool });
