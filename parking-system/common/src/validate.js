'use strict';

const { HttpError } = require('./errors');

const CHECKS = {
  string: (v) => typeof v === 'string' && v.trim() !== '',
  integer: Number.isInteger,
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  boolean: (v) => typeof v === 'boolean',
  datetime: (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)),
};

/**
 * Оставляет из тела запроса только поля схемы и проверяет их типы.
 * schema: { поле: { type, required?, enum? } }; partial — для обновления.
 */
function validate(body, schema, { partial = false } = {}) {
  const data = {};
  for (const [field, rule] of Object.entries(schema)) {
    const value = body?.[field];
    if (value === undefined || value === null) {
      if (rule.required && !partial) throw new HttpError(400, `Поле «${field}» обязательно`);
      continue;
    }
    if (!CHECKS[rule.type](value)) throw new HttpError(400, `Поле «${field}» должно иметь тип ${rule.type}`);
    if (rule.enum && !rule.enum.includes(value)) throw new HttpError(400, `Поле «${field}»: допустимо ${rule.enum.join(', ')}`);
    data[field] = value;
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'Нет данных для сохранения');
  return data;
}

module.exports = { validate };
