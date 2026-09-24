// Окружение модульных тестов: без журнала в консоли, фиксированный секрет JWT
process.env.LOG_LEVEL ??= 'silent';
process.env.JWT_SECRET ??= 'unit-test-secret';
