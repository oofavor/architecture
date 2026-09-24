'use strict';

const { currentContext } = require('./context');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * Структурированный журнал: одна строка JSON на событие (stdout -> docker compose logs).
 * К каждой записи автоматически добавляются сервис и идентификатор запроса.
 */
const logger = {
  service: process.env.SERVICE ?? 'app',
  threshold: LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? LEVELS.info,

  write(level, event, fields = {}) {
    if (LEVELS[level] < this.threshold) return;
    const { requestId, user } = currentContext();
    const record = { time: new Date().toISOString(), level, service: this.service, event };
    if (requestId) record.requestId = requestId;
    if (user) record.user = user;
    process.stdout.write(`${JSON.stringify({ ...record, ...fields })}\n`);
  },

  debug(event, fields) { this.write('debug', event, fields); },
  info(event, fields) { this.write('info', event, fields); },
  warn(event, fields) { this.write('warn', event, fields); },
  error(event, fields) { this.write('error', event, fields); },
};

module.exports = { logger };
