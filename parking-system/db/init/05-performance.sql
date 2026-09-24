-- Оптимизация по результатам нагрузочного тестирования (ЛР № 3).
-- Скрипт идемпотентен: выполняется при первом запуске и может быть применён к работающей базе:
--   docker compose exec -T db psql -U parking -d postgres -f /docker-entrypoint-initdb.d/05-performance.sql

\connect parking_db
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Поиск по фрагменту госномера (ILIKE '%012%'): триграммный индекс вместо полного просмотра таблицы
CREATE INDEX IF NOT EXISTS idx_sessions_plate_trgm ON parking_sessions USING gin (plate gin_trgm_ops);
-- B-tree по plate не используется ни одним запросом (поиск только по подстроке) — лишняя нагрузка на запись
DROP INDEX IF EXISTS idx_sessions_plate;

-- Постраничный вывод «последние стоянки» (ORDER BY entry_time DESC LIMIT 20) без сортировки всей таблицы
CREATE INDEX IF NOT EXISTS idx_sessions_entry_time ON parking_sessions (entry_time DESC);

-- Внешний ключ payments.session_id без индекса: представление session_balances (расчёт долга)
-- читало всю таблицу оплат при каждом выезде, оплате и запросе задолженности
CREATE INDEX IF NOT EXISTS idx_payments_session ON payments (session_id);
ANALYZE parking_sessions;
ANALYZE payments;

\connect clients_db
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Поиск клиентов по фрагменту ФИО
CREATE INDEX IF NOT EXISTS idx_clients_full_name_trgm ON clients USING gin (full_name gin_trgm_ops);
ANALYZE clients;
