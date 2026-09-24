'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const { authenticate } = require('./auth');
const { errorHandler, HttpError } = require('./errors');
const { log } = require('./logger');
const { metrics } = require('./metrics');

/**
 * Общий каркас сервиса: JSON, журнал и метрики каждого запроса,
 * GET /health (проверка доступности вместе с БД), GET /metrics, обработка ошибок.
 * configure(app) подключает маршруты сервиса; всё под /api требует токен,
 * кроме маршрутов, перечисленных в publicRoutes (до authenticate).
 */
function startService(name, { pool, publicRoutes = () => {}, routes }) {
  process.env.SERVICE = name;
  const app = express();
  app.use(express.json());

  // Идентификатор запроса (от nginx или новый), журнал и метрики
  app.use((req, res, next) => {
    req.id = req.get('X-Request-Id') ?? randomUUID();
    res.set('X-Request-Id', req.id);
    if (req.path === '/health' || req.path.startsWith('/metrics')) return next();
    const started = performance.now();
    metrics.requestStarted();
    res.on('finish', () => {
      const ms = performance.now() - started;
      const route = req.route ? `${req.method} ${req.baseUrl}${req.route.path === '/' ? '' : req.route.path}` : `${req.method} ?`;
      metrics.requestFinished(route, ms, res.statusCode);
      log(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
        requestId: req.id, user: req.user?.login, method: req.method, path: req.originalUrl, status: res.statusCode, duration_ms: Math.round(ms),
      });
    });
    next();
  });

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ service: name, status: 'ok', database: 'ok' });
    } catch {
      res.status(503).json({ service: name, status: 'fail', database: 'unavailable' });
    }
  });
  app.get('/metrics', (req, res) => res.json({ service: name, ...metrics.snapshot() }));
  app.post('/metrics/reset', (req, res) => { metrics.reset(); res.status(204).end(); });

  publicRoutes(app);
  app.use('/api', authenticate);
  routes(app);

  app.use((req, res, next) => next(new HttpError(404, 'Ресурс не найден')));
  app.use(errorHandler);
  app.listen(process.env.PORT, () => log('info', 'service_started', { port: Number(process.env.PORT) }));
}

module.exports = { startService };
