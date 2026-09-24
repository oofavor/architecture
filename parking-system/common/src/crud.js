'use strict';

const express = require('express');
const { authorize } = require('./auth');
const { HttpError } = require('./errors');
const { validate } = require('./validate');
const { log } = require('./logger');

/**
 * Фабрика типового REST-ресурса (DRY): GET список, GET по id, POST, PUT, DELETE.
 *   table   — таблица;  schema — допустимые поля (см. validate);
 *   read, write — роли для чтения и для изменения;
 *   filters — параметры поиска: { столбец: 'eq' | 'like' };
 *   columns — возвращаемые столбцы;  prepare — преобразование данных перед записью.
 */
function crudRouter(pool, { table, schema, read, write, filters = {}, columns = '*', prepare = (d) => d }) {
  const router = express.Router();
  const id = (req) => {
    if (!/^\d+$/.test(req.params.id)) throw new HttpError(400, 'Некорректный идентификатор');
    return Number(req.params.id);
  };
  const found = (row) => {
    if (!row) throw new HttpError(404, 'Запись не найдена');
    return row;
  };
  const audit = (req, event, recordId) => log('info', event, { requestId: req.id, user: req.user.login, table, id: recordId });

  router.get('/', authorize(...read), async (req, res) => {
    const where = [];
    const params = [];
    for (const [column, mode] of Object.entries(filters)) {
      if (req.query[column] === undefined) continue;
      params.push(mode === 'like' ? `%${req.query[column]}%` : req.query[column]);
      where.push(`${column} ${mode === 'like' ? 'ILIKE' : '='} $${params.length}`);
    }
    const sql = `SELECT ${columns} FROM ${table} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
    res.json((await pool.query(sql, params)).rows);
  });

  router.get('/:id', authorize(...read), async (req, res) => {
    res.json(found((await pool.query(`SELECT ${columns} FROM ${table} WHERE id = $1`, [id(req)])).rows[0]));
  });

  router.post('/', authorize(...write), async (req, res) => {
    const data = await prepare(validate(req.body, schema));
    const keys = Object.keys(data);
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${columns}`;
    const row = (await pool.query(sql, Object.values(data))).rows[0];
    audit(req, 'record_created', row.id);
    res.status(201).json(row);
  });

  router.put('/:id', authorize(...write), async (req, res) => {
    const data = await prepare(validate(req.body, schema, { partial: true }));
    const keys = Object.keys(data);
    const sql = `UPDATE ${table} SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING ${columns}`;
    const row = found((await pool.query(sql, [...Object.values(data), id(req)])).rows[0]);
    audit(req, 'record_updated', row.id);
    res.json(row);
  });

  router.delete('/:id', authorize(...write), async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id(req)]);
    found(rowCount);
    audit(req, 'record_deleted', Number(req.params.id));
    res.status(204).end();
  });

  return router;
}

module.exports = { crudRouter };
