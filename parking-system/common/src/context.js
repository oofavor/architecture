'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

// Контекст текущего HTTP-запроса (идентификатор, пользователь), доступный в любом месте
// кода без передачи через параметры: журнал и межсервисные вызовы берут requestId отсюда.
const storage = new AsyncLocalStorage();

const runWithContext = (ctx, fn) => storage.run(ctx, fn);
const currentContext = () => storage.getStore() ?? {};

module.exports = { runWithContext, currentContext };
