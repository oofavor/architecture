'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const { errorHandler, HttpError } = require('./errors');
const { runWithContext, currentContext } = require('./context');
const { logger } = require('./logger');
const { metrics } = require('./metrics');

// Шаблон маршрута для метрик: «/api/sessions/:id/exit», а не «/api/sessions/6/exit»
const routeLabel = (req) => (req.route ? `${req.method} ${req.baseUrl}${req.route.path === '/' ? '' : req.route.path}` : `${req.method} (unmatched)`);

// Журнал, метрики и контекст запроса
function observe(req, res, next) {
  const requestId = req.get('X-Request-Id') || randomUUID();
  res.set('X-Request-Id', requestId);
  const started = process.hrtime.bigint();
  // Служебные запросы (проверки доступности, метрики) в статистику не попадают
  const internal = req.path.startsWith('/health') || req.path.startsWith('/metrics');
  if (!internal) metrics.requestStarted();

  res.on('finish', () => {
    if (internal) return;
    metrics.requestFinished();
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    metrics.observeHttp(routeLabel(req), ms, res.statusCode);
    logger.write(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
      requestId,
      user: req.user?.login,
      method: req.method,
      path: req.originalUrl,
      route: routeLabel(req),
      status: res.statusCode,
      duration_ms: Math.round(ms * 10) / 10,
    });
  });

  runWithContext({ requestId }, next);
}

/**
 * Общий «каркас» HTTP-сервиса: JSON, журнал, метрики, проверки доступности,
 * обработка ошибок, корректное завершение.
 * configure(app) — подключение маршрутов конкретного сервиса;
 * options.pool — пул БД, используется проверкой готовности и при завершении.
 */
function startService(name, configure, { pool } = {}) {
  logger.service = name;
  const app = express();
  app.use(express.json());
  app.use(observe);

  // Живость: процесс отвечает. Готовность: процесс отвечает И база данных доступна.
  app.get('/health/live', (req, res) => res.json({ service: name, status: 'ok' }));
  const ready = async (req, res) => {
    const checks = {};
    if (pool) {
      const started = Date.now();
      try {
        await Promise.race([
          pool.query('SELECT 1'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
        ]);
        checks.database = { status: 'ok', latency_ms: Date.now() - started };
      } catch (err) {
        checks.database = { status: 'fail', error: err.message };
      }
    }
    const ok = Object.values(checks).every((c) => c.status === 'ok');
    res.status(ok ? 200 : 503).json({ service: name, status: ok ? 'ok' : 'fail', checks });
  };
  app.get('/health/ready', ready);
  app.get('/health', ready);

  // Метрики процесса (для внутреннего мониторинга; через nginx наружу не публикуются)
  app.get('/metrics', (req, res) => res.json({ service: name, ...metrics.snapshot() }));
  app.post('/metrics/reset', (req, res) => { metrics.reset(); res.status(204).end(); });

  // Пользователь в контексте — для записей журнала бизнес-событий
  app.use((req, res, next) => {
    const ctx = currentContext();
    Object.defineProperty(ctx, 'user', { get: () => req.user?.login, enumerable: true, configurable: true });
    next();
  });

  configure(app);

  app.use((req, res, next) => next(new HttpError(404, 'Ресурс не найден')));
  app.use(errorHandler);

  const port = Number(process.env.PORT);
  const server = app.listen(port, () => logger.info('service_started', { port, pid: process.pid }));

  // Корректное завершение: дождаться текущих запросов и закрыть соединения с БД
  const shutdown = (signal) => {
    logger.info('service_stopping', { signal });
    server.close(async () => {
      await pool?.end().catch(() => {});
      logger.info('service_stopped');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return server;
}

module.exports = { startService, routeLabel };
