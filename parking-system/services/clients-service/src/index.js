'use strict';

const { ROLES, STAFF, authenticate, authorize, crudRouter, createPool, startService } = require('@parking/common');
const { findCarWithOwner, normalizePlate } = require('./carLookup');

const pool = createPool();

startService('clients-service', (app) => {
  app.use('/api', authenticate);

  // Скидки: читают сотрудники, изменяет только администратор (ФТ-17)
  app.use('/api/discounts', crudRouter(pool, {
    table: 'discounts',
    schema: {
      name: { type: 'string', required: true },
      percent: { type: 'number', required: true },
      condition: { type: 'string', nullable: true },
    },
    access: { read: STAFF, write: [ROLES.ADMIN], remove: [ROLES.ADMIN] },
  }));

  // Клиенты (ФТ-4)
  app.use('/api/clients', crudRouter(pool, {
    table: 'clients',
    schema: {
      full_name: { type: 'string', required: true },
      phone: { type: 'string', required: true },
      document: { type: 'string', nullable: true },
      is_regular: { type: 'boolean' },
      discount_id: { type: 'integer', nullable: true },
    },
    access: { read: STAFF, write: STAFF, remove: [ROLES.ADMIN] },
    filters: { full_name: 'like', phone: 'like', is_regular: 'eq' },
  }));

  // Поиск автомобиля с владельцем по госномеру — регистрируется до /api/cars/:id
  app.get('/api/cars/by-plate/:plate', authorize(...STAFF), async (req, res) => {
    res.json(await findCarWithOwner(pool, req.params.plate));
  });

  // Автомобили (ФТ-5: госномер уникален — ограничение UNIQUE в БД)
  app.use('/api/cars', crudRouter(pool, {
    table: 'cars',
    schema: {
      plate: { type: 'string', required: true },
      brand: { type: 'string', required: true },
      model: { type: 'string', nullable: true },
      color: { type: 'string', nullable: true },
      client_id: { type: 'integer', required: true },
    },
    access: { read: STAFF, write: STAFF, remove: [ROLES.ADMIN] },
    filters: { plate: 'like', brand: 'like', client_id: 'eq' },
    prepare: async (d) => (d.plate ? { ...d, plate: normalizePlate(d.plate) } : d),
  }));
}, { pool });
