# АИС «Автостоянка» — прототип (ЛР № 2–3)

Три микросервиса на Node.js (Express), у каждого своя база в PostgreSQL 15; REST + JWT; веб-интерфейс на React за nginx.

| Сервис | Порт | Что делает |
|---|---|---|
| auth-service | 3001 | вход (JWT), пользователи |
| clients-service | 3002 | клиенты, автомобили |
| parking-service | 3003 | места, тарифы, въезд/выезд, оплата, долг |
| frontend | 8080 | интерфейс, прокси `/api/*` |

Пользователи: `admin / admin123`, `operator / operator123`.

```bash
docker compose down -v && docker compose up -d --build   # чистый запуск (≈1 мин), интерфейс: http://localhost:8080
npm install
npm run demo               # ЛР 2: сценарий из 16 шагов (только на чистой базе)
npm test                   # ЛР 3: 15 модульных тестов
npm run test:integration   # ЛР 3: 13 интеграционных тестов (нужны запущенные контейнеры)

# ЛР 3: нагрузочный тест на 500 000 записей
docker compose exec -T db psql -q -U parking -d postgres < scripts/volume.sql
npm run load               # результат: results/load.json

curl localhost:3003/health          # проверка доступности
curl localhost:3003/metrics         # метрики
docker compose logs parking-service # журнал (JSON)
```

Структура: `common/` — общая библиотека (JWT, CRUD-фабрика, журнал, метрики), `services/*/src` — сервисы,
`db/init` — схема и тестовые данные, `frontend/` — интерфейс, `tests/` — тесты, `scripts/` — демо и нагрузка.
