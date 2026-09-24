-- Объём данных из НФТ ЛР № 1 для нагрузочного тестирования (ЛР № 3):
-- 5 000 клиентов, 6 000 автомобилей, 150 мест, 500 000 завершённых стоянок с оплатами.
-- Запуск: docker compose exec -T db psql -q -U parking -d postgres < scripts/volume.sql

\connect clients_db
INSERT INTO clients (id, full_name, phone, discount_percent)
SELECT 100000 + k, 'Клиент № ' || k, '+7916' || lpad(k::text, 7, '0'), CASE WHEN k % 4 = 0 THEN 10 ELSE 0 END
FROM generate_series(1, 5000) k ON CONFLICT DO NOTHING;
-- Госномер вида В0001ОР99; автомобиль n принадлежит клиенту 100000 + 1 + (n - 1) % 5000
INSERT INTO cars (id, plate, brand, client_id)
SELECT 100000 + n, (ARRAY['В','Е','К','М','Н','О','Р','С','Т','У'])[1 + n % 10] || lpad(n::text, 4, '0') || 'ОР99',
       'Test', 100000 + 1 + (n - 1) % 5000
FROM generate_series(1, 6000) n ON CONFLICT DO NOTHING;
ANALYZE;

\connect parking_db
INSERT INTO parking_spots (number) SELECT generate_series(21, 150) ON CONFLICT DO NOTHING;
INSERT INTO parking_sessions (car_id, client_id, plate, spot_id, tariff_id, entry_time, exit_time, cost, payment_status)
SELECT 100000 + n, 100000 + 1 + (n - 1) % 5000,
       (ARRAY['В','Е','К','М','Н','О','Р','С','Т','У'])[1 + n % 10] || lpad(n::text, 4, '0') || 'ОР99',
       (SELECT min(id) FROM parking_spots), 1, t, t + interval '2 hours', 160, CASE WHEN g % 20 = 0 THEN 'PARTIAL' ELSE 'PAID' END
FROM (SELECT g, 1 + (random() * 5999)::int AS n, timestamptz '2024-09-24' + random() * interval '730 days' AS t
      FROM generate_series(1, 500000) g) x;
INSERT INTO payments (session_id, amount, method)
SELECT id, CASE WHEN payment_status = 'PARTIAL' THEN 80 ELSE 160 END, 'CASH' FROM parking_sessions WHERE car_id > 100000;
ANALYZE;
