'use strict';

const { STAFF, HttpError, authorize, crudRouter, createPool, startService } = require('@parking/common');

const pool = createPool();
const normalizePlate = (plate) => plate.replace(/\s/g, '').toUpperCase();

startService('clients-service', {
  pool,
  routes(app) {
    // Клиенты (ФТ-4)
    app.use('/api/clients', crudRouter(pool, {
      table: 'clients',
      schema: {
        full_name: { type: 'string', required: true },
        phone: { type: 'string', required: true },
        discount_percent: { type: 'number' },
      },
      read: STAFF,
      write: STAFF,
      filters: { full_name: 'like' },
    }));

    // Автомобиль с владельцем и скидкой по госномеру: автозаполнение (ФТ-7)
    // и межсервисный вызов из parking-service. Регистрируется до /api/cars/:id
    app.get('/api/cars/by-plate/:plate', authorize(...STAFF), async (req, res) => {
      const { rows } = await pool.query(
        `SELECT c.id, c.plate, c.brand, cl.id AS client_id, cl.full_name, cl.discount_percent
         FROM cars c JOIN clients cl ON cl.id = c.client_id WHERE c.plate = $1`,
        [normalizePlate(req.params.plate)],
      );
      if (!rows[0]) throw new HttpError(404, `Автомобиль ${req.params.plate} не зарегистрирован`);
      res.json(rows[0]);
    });

    // Автомобили (ФТ-5: госномер уникален — ограничение UNIQUE в БД)
    app.use('/api/cars', crudRouter(pool, {
      table: 'cars',
      schema: {
        plate: { type: 'string', required: true },
        brand: { type: 'string', required: true },
        client_id: { type: 'integer', required: true },
      },
      read: STAFF,
      write: STAFF,
      filters: { plate: 'like', client_id: 'eq' },
      prepare: (d) => (d.plate ? { ...d, plate: normalizePlate(d.plate) } : d),
    }));
  },
});
