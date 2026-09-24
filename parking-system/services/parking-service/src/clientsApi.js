'use strict';

const { HttpError, log } = require('@parking/common');

/**
 * Межсервисный вызов clients-service по REST.
 * Передаётся токен пользователя (clients-service сам проверяет права)
 * и идентификатор запроса (для сквозного журнала). Тайм-аут 2 с — из НФТ ЛР № 1.
 */
function createClientsApi(baseUrl, fetchImpl = fetch) {
  async function findCarByPlate(plate, { token, requestId }) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/api/cars/by-plate/${encodeURIComponent(plate)}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Request-Id': requestId },
        signal: AbortSignal.timeout(2000),
      });
    } catch (err) {
      log('warn', 'clients_service_unavailable', { requestId, reason: err.message });
      throw new HttpError(502, 'Сервис клиентов недоступен');
    }
    const body = await res.json();
    if (!res.ok) throw new HttpError(res.status, body.error);
    return body;
  }
  return { findCarByPlate };
}

module.exports = { createClientsApi };
