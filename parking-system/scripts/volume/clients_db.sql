-- Объём данных для нагрузочного тестирования: 5 000 клиентов, 6 000 автомобилей.
-- Идентификаторы с 100001, чтобы parking_db мог ссылаться на них без межбазовых запросов.
BEGIN;
INSERT INTO clients (id, full_name, phone, is_regular, discount_id)
SELECT 100000 + k,
       (ARRAY['Смирнов','Иванов','Кузнецов','Попов','Васильев','Петров','Соколов','Михайлов','Новиков','Фёдоров'])[1 + k % 10]
         || ' ' || (ARRAY['Алексей','Иван','Сергей','Андрей','Дмитрий','Мария','Анна','Елена','Ольга','Павел'])[1 + (k / 10) % 10]
         || ' № ' || k,
       '+7916' || lpad(k::text, 7, '0'),
       k % 4 = 0,
       CASE WHEN k % 4 = 0 THEN 1 END
FROM generate_series(1, 5000) AS k
ON CONFLICT (id) DO NOTHING;

-- Госномер вида В0001ОР99 (формат не пересекается с номерами из тестов)
INSERT INTO cars (id, plate, brand, model, client_id)
SELECT 100000 + n,
       (ARRAY['В','Е','К','М','Н','О','Р','С','Т','У'])[1 + n % 10] || lpad(n::text, 4, '0') || 'ОР99',
       (ARRAY['Toyota','Kia','Lada','Hyundai','Skoda','Renault','Volkswagen','Nissan'])[1 + n % 8],
       'Model',
       100000 + 1 + (n - 1) % 5000
FROM generate_series(1, 6000) AS n
ON CONFLICT (id) DO NOTHING;
COMMIT;
ANALYZE;
