'use strict';

const { HttpError } = require('@parking/common');

const normalizePlate = (plate) => plate.replace(/\s/g, '').toUpperCase();

// Автомобиль вместе с владельцем и скидкой владельца (ФТ-7).
// Используется оператором для автозаполнения и сервисом parking-service при въезде/выезде.
async function findCarWithOwner(pool, plate) {
  const { rows } = await pool.query(
    `SELECT c.id, c.plate, c.brand, c.model, c.color,
            json_build_object('id', cl.id, 'full_name', cl.full_name, 'phone', cl.phone,
                              'is_regular', cl.is_regular) AS client,
            CASE WHEN d.id IS NULL THEN NULL
                 ELSE json_build_object('id', d.id, 'name', d.name, 'percent', d.percent) END AS discount
     FROM cars c
     JOIN clients cl ON cl.id = c.client_id
     LEFT JOIN discounts d ON d.id = cl.discount_id
     WHERE c.plate = $1`,
    [normalizePlate(plate)],
  );
  if (!rows[0]) throw new HttpError(404, `Автомобиль с госномером ${plate} не зарегистрирован`);
  return rows[0];
}

module.exports = { findCarWithOwner, normalizePlate };
