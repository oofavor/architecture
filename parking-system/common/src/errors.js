'use strict';

const { logger } = require('./logger');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Коды ошибок PostgreSQL, которые являются ошибками клиента, а не сервера
const PG_ERRORS = {
  '23505': [409, 'Запись с такими данными уже существует'],
  '23503': [409, 'Нарушение ссылочной целостности'],
  '23514': [400, 'Значение не удовлетворяет ограничениям'],
  '22P02': [400, 'Некорректный формат значения'],
};

// Единый обработчик ошибок для всех сервисов
function errorHandler(err, req, res, next) {
  const pg = PG_ERRORS[err.code];
  if (pg) {
    logger.warn('request_rejected', { status: pg[0], reason: pg[1], pg_code: err.code, detail: err.detail });
    return res.status(pg[0]).json({ error: pg[1], detail: err.detail });
  }

  // Некорректный JSON в теле запроса
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
  }

  const status = err.status || 500;
  if (status === 500) {
    logger.error('unhandled_error', { message: err.message, stack: err.stack });
  } else if (status !== 401 && status !== 404) {
    logger.warn('request_rejected', { status, reason: err.message });
  }
  res.status(status).json({ error: status === 500 ? 'Внутренняя ошибка сервера' : err.message });
}

module.exports = { HttpError, errorHandler };
