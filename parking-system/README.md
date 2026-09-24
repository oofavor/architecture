# АИС «Автостоянка» — прототип (ЛР №2)

Три микросервиса на Node.js (Express 5), PostgreSQL 15, база данных на каждый сервис, JWT.
Веб-интерфейс на React 19 (Vite) раздаётся nginx, который проксирует /api/* к сервисам.

| Сервис | Порт | База | Ресурсы |
|---|---|---|---|
| auth-service | 3001 | auth_db | `/api/auth/login`, `/api/auth/me`, `/api/users` |
| clients-service | 3002 | clients_db | `/api/clients`, `/api/cars`, `/api/cars/by-plate/:plate`, `/api/discounts` |
| frontend | 8080 | — | веб-интерфейс, прокси /api/* |
| parking-service | 3003 | parking_db | `/api/spots`, `/api/tariffs`, `/api/sessions` (+`/entry`, `/:id/exit`), `/api/payments`, `/api/clients/:id/debt`, `/api/my/sessions` |

Подробное описание кода и принятых решений: [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md).

## Запуск

```bash
docker compose up -d --build   # PostgreSQL + 3 сервиса + веб-интерфейс, схема и тестовые данные из db/init
# веб-интерфейс: http://localhost:8080
npm install && npm test        # модульные тесты расчёта стоимости
npm run demo                   # сценарий из 42 шагов (CRUD, безопасность, пример из ЛР №1)
docker compose down -v         # остановить и удалить данные (демо рассчитано на «чистую» БД)
```

Тестовые пользователи: `admin/admin123` (ADMIN), `operator/operator123` (OPERATOR), `petrov/client123` (CLIENT).

Пример вызова:

```bash
TOKEN=$(curl -s localhost:3001/api/auth/login -H 'Content-Type: application/json' \
  -d '{"login":"operator","password":"operator123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:3002/api/clients -H "Authorization: Bearer $TOKEN"
```

## Разработка интерфейса

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173, /api проксируется на порты 3001–3003
```

## Тестирование и наблюдение (ЛР № 3)

```bash
npm run test:unit          # 49 модульных тестов (без Docker и БД)
npm run test:coverage      # то же + покрытие кода
npm run test:integration   # 53 интеграционных теста против запущенных контейнеров (повторяемые)

# Нагрузочное тестирование на объёме ЛР № 1 (500 000 стоянок)
docker compose exec -T db psql -U parking -d clients_db < scripts/volume/clients_db.sql
docker compose exec -T db psql -U parking -d parking_db < scripts/volume/parking_db.sql
node scripts/load.mjs <метка>   # результат: results/<метка>.json

curl localhost:3003/metrics       # метрики сервиса (JSON); POST /metrics/reset — новое окно
curl localhost:3003/health/ready  # готовность (БД доступна) — 200 / 503
docker compose logs -f parking-service   # журнал: одна строка JSON на событие, поле requestId
```

`results/baseline.json` — измерение на схеме ЛР № 2, `results/optimized.json` — после индексов `db/init/05-performance.sql`.
