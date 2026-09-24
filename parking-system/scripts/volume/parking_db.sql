-- Объём данных для нагрузочного тестирования: 150 мест (как в ЛР № 1), 500 000 стоянок за 2 года.
BEGIN;
INSERT INTO parking_spots (number, zone)
SELECT n, CASE WHEN n <= 100 THEN 'Открытая площадка' ELSE 'Навес' END
FROM generate_series(21, 150) AS n
ON CONFLICT (number) DO NOTHING;

-- Завершённые стоянки: автомобиль n принадлежит клиенту 100000 + 1 + (n - 1) % 5000 (см. clients_db.sql)
CREATE TEMP TABLE gen AS
SELECT g,
       1 + floor(random() * 6000)::int                                   AS n,
       timestamptz '2024-09-24 00:00+03' + random() * interval '730 days' AS entry_time,
       (10 + floor(random() * 600))::int                                 AS minutes
FROM generate_series(1, 500000) AS g;

CREATE TEMP TABLE spot_ids AS SELECT array_agg(id ORDER BY number) AS ids FROM parking_spots WHERE number <= 150;

INSERT INTO parking_sessions (car_id, client_id, plate, spot_id, tariff_id, operator_id,
                              entry_time, exit_time, discount_percent, cost, payment_status)
SELECT 100000 + n,
       100000 + 1 + (n - 1) % 5000,
       (ARRAY['В','Е','К','М','Н','О','Р','С','Т','У'])[1 + n % 10] || lpad(n::text, 4, '0') || 'ОР99',
       spot_ids.ids[1 + g % array_length(spot_ids.ids, 1)],
       1,
       2 + g % 2,
       entry_time,
       entry_time + make_interval(mins => minutes),
       0,
       greatest(0, ceil((minutes - 15) / 60.0)) * 80,
       CASE WHEN g % 20 = 0 THEN 'PARTIAL' ELSE 'PAID' END
FROM gen, spot_ids;

-- Оплаты: полные для 95 % стоянок, половина суммы для 5 % (остаток — задолженность)
INSERT INTO payments (session_id, paid_at, amount, method)
SELECT id, exit_time, CASE WHEN payment_status = 'PARTIAL' THEN round(cost / 2, 2) ELSE cost END,
       CASE WHEN id % 3 = 0 THEN 'CARD' ELSE 'CASH' END
FROM parking_sessions
WHERE car_id > 100000 AND cost > 0;
COMMIT;
ANALYZE;
