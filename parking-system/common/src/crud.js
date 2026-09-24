"use strict";

const express = require("express");
const { authorize } = require("./auth");
const { HttpError } = require("./errors");
const { validate } = require("./validate");
const { logger } = require("./logger");
const { metrics } = require("./metrics");

// Журнал операций записи данных
function audit(event, table, id) {
  metrics.count(`${event} ${table}`);
  logger.info(event, { table, id });
}

/**
 * Фабрика типового REST-ресурса: GET список, GET по id, POST, PUT, DELETE.
 *
 * table     — имя таблицы;
 * schema    — поля, которые можно передавать в POST/PUT (см. validate);
 * access    — роли для чтения, записи и удаления: { read: [], write: [], remove: [] };
 * filters   — параметры запроса для поиска: { column: 'eq' | 'like' };
 * columns   — возвращаемые столбцы (например, чтобы скрыть хеш пароля);
 * prepare   — асинхронное преобразование данных перед записью.
 */
function crudRouter(
  pool,
  {
    table,
    schema,
    access,
    filters = {},
    columns = "*",
    prepare = async (d) => d,
  },
) {
  const router = express.Router();
  const byId = (id) => {
    const n = Number(id);
    if (!Number.isInteger(n))
      throw new HttpError(400, "Некорректный идентификатор");
    return n;
  };
  const notFound = () => new HttpError(404, "Запись не найдена");

  router.get("/", authorize(...access.read), async (req, res) => {
    const where = [];
    const params = [];
    for (const [column, mode] of Object.entries(filters)) {
      const value = req.query[column];
      if (value === undefined) continue;
      params.push(mode === "like" ? `%${value}%` : value);
      where.push(
        mode === "like"
          ? `${column} ILIKE $${params.length}`
          : `${column} = $${params.length}`,
      );
    }
    const sql = `SELECT ${columns} FROM ${table} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id`;
    res.json((await pool.query(sql, params)).rows);
  });

  router.get("/:id", authorize(...access.read), async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${columns} FROM ${table} WHERE id = $1`,
      [byId(req.params.id)],
    );
    if (!rows[0]) throw notFound();
    res.json(rows[0]);
  });

  router.post("/", authorize(...access.write), async (req, res) => {
    const data = await prepare(validate(req.body, schema));
    const keys = Object.keys(data);
    const sql = `INSERT INTO ${table} (${keys.join(", ")})
                 VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING ${columns}`;
    const { rows } = await pool.query(sql, Object.values(data));
    audit("record_created", table, rows[0].id);
    res.status(201).json(rows[0]);
  });

  router.put("/:id", authorize(...access.write), async (req, res) => {
    const data = await prepare(validate(req.body, schema, { partial: true }));
    const keys = Object.keys(data);
    const sql = `UPDATE ${table} SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")}
                 WHERE id = $${keys.length + 1} RETURNING ${columns}`;
    const { rows } = await pool.query(sql, [
      ...Object.values(data),
      byId(req.params.id),
    ]);
    if (!rows[0]) throw notFound();
    audit("record_updated", table, rows[0].id);
    res.json(rows[0]);
  });

  router.delete("/:id", authorize(...access.remove), async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE id = $1`,
      [byId(req.params.id)],
    );
    if (!rowCount) throw notFound();
    audit("record_deleted", table, Number(req.params.id));
    res.status(204).end();
  });

  return router;
}

module.exports = { crudRouter };
