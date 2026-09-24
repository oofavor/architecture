'use strict';

const { HttpError, currentContext, logger, metrics } = require('@parking/common');

const TIMEOUT_MS = 2000; // НФТ: время отклика не более 2 с

/**
 * REST-клиент сервиса clients-service (межсервисное взаимодействие).
 * Токен пользователя передаётся дальше, поэтому clients-service
 * сам проверяет права доступа — доверие между сервисами не требуется.
 * Идентификатор запроса (X-Request-Id) передаётся для сквозного журнала.
 */
function createClientsApi(baseUrl, { fetchImpl = fetch } = {}) {
  async function request(path, token) {
    const headers = { Authorization: `Bearer ${token}` };
    const { requestId } = currentContext();
    if (requestId) headers['X-Request-Id'] = requestId;

    // Одна повторная попытка при отказе соединения (например, сервис перезапускается).
    // При тайм-ауте не повторяем: пользователь и так ждал 2 с.
    for (let attempt = 1; ; attempt += 1) {
      const started = process.hrtime.bigint();
      try {
        const res = await fetchImpl(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = await res.json();
        metrics.observeExternal('clients-service GET /api/cars/by-plate/:plate', elapsed(started), res.status >= 500);
        if (!res.ok) throw new HttpError(res.status, body.error);
        return body;
      } catch (err) {
        if (err instanceof HttpError) throw err;
        metrics.observeExternal('clients-service GET /api/cars/by-plate/:plate', elapsed(started), true);
        const timedOut = err.name === 'TimeoutError';
        logger.warn('external_call_failed', { target: 'clients-service', attempt, reason: timedOut ? 'timeout' : err.message });
        if (timedOut || attempt >= 2) throw new HttpError(502, 'Сервис клиентов недоступен');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  const findCarByPlate = (plate, token) => request(`/api/cars/by-plate/${encodeURIComponent(plate)}`, token);

  return { findCarByPlate };
}

function elapsed(started) {
  return Number(process.hrtime.bigint() - started) / 1e6;
}

module.exports = { createClientsApi };
