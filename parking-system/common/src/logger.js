'use strict';

// Журнал: одна строка JSON на событие (просмотр: docker compose logs)
function log(level, event, fields = {}) {
  if (process.env.LOG_LEVEL === 'silent') return;
  const record = { time: new Date().toISOString(), level, service: process.env.SERVICE, event, ...fields };
  console.log(JSON.stringify(record));
}

module.exports = { log };
