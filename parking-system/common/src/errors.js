'use strict';

const { log } = require('./logger');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Ошибки PostgreSQL, которые являются ошибками клиента
const PG_ERRORS = {
  23505: [409, 'Запись с такими данными уже существует'],
  23503: [409, 'Нарушение ссылочной целостности'],
  23514: [400, 'Значение не удовлетворяет ограничениям'],
  '22P02': [400, 'Некорректный формат значения'],
};

// Единый обработчик ошибок всех сервисов
function errorHandler(err, req, res, next) {
  let [status, message] = PG_ERRORS[err.code] ?? [err.status ?? 500, err.message];
  if (err.type === 'entity.parse.failed') message = 'Некорректный JSON в теле запроса';
  if (status === 500) {
    log('error', 'error', { requestId: req.id, message: err.message, stack: err.stack });
    message = 'Внутренняя ошибка сервера';
  } else {
    log('warn', 'request_rejected', { requestId: req.id, status, reason: message });
  }
  res.status(status).json({ error: message });
}

module.exports = { HttpError, errorHandler };
