'use strict';

const { HttpError } = require('./errors');

const CHECKS = {
  string: (v) => typeof v === 'string' && v.trim() !== '',
  integer: (v) => Number.isInteger(v),
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  boolean: (v) => typeof v === 'boolean',
  datetime: (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)),
};

/**
 * Отбирает из тела запроса только описанные в схеме поля и проверяет их типы.
 * schema: { field: { type, required?, nullable?, enum? } }
 * partial = true — для обновления (обязательность не проверяется).
 */
function validate(body, schema, { partial = false } = {}) {
  const data = {};
  for (const [field, rule] of Object.entries(schema)) {
    const value = body?.[field];
    if (value === undefined) {
      if (rule.required && !partial) throw new HttpError(400, `Поле «${field}» обязательно`);
      continue;
    }
    if (value === null && rule.nullable) {
      data[field] = null;
      continue;
    }
    if (!CHECKS[rule.type](value)) throw new HttpError(400, `Поле «${field}» должно иметь тип ${rule.type}`);
    if (rule.enum && !rule.enum.includes(value)) {
      throw new HttpError(400, `Поле «${field}» допускает значения: ${rule.enum.join(', ')}`);
    }
    data[field] = value;
  }
  if (Object.keys(data).length === 0) throw new HttpError(400, 'Нет данных для сохранения');
  return data;
}

module.exports = { validate };
