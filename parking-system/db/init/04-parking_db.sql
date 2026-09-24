\connect parking_db

-- Класс «ПарковочноеМесто»
CREATE TABLE parking_spots (
    id     SERIAL PRIMARY KEY,
    number INTEGER     NOT NULL UNIQUE,
    status VARCHAR(10) NOT NULL DEFAULT 'FREE' CHECK (status IN ('FREE', 'OCCUPIED'))
);

-- Класс «Тариф». Стоянка запоминает тариф при въезде, поэтому новый тариф
-- действует только для новых стоянок (ФТ-17)
CREATE TABLE tariffs (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(100)  NOT NULL,
    price_per_hour NUMERIC(10,2) NOT NULL CHECK (price_per_hour >= 0),
    free_minutes   INTEGER       NOT NULL DEFAULT 15
);

-- Класс «Стоянка». car_id и client_id ссылаются на данные clients-service
-- (внешние ключи между базами невозможны — целостность обеспечивает сервис)
CREATE TABLE parking_sessions (
    id               SERIAL PRIMARY KEY,
    car_id           INTEGER      NOT NULL,
    client_id        INTEGER      NOT NULL,
    plate            VARCHAR(12)  NOT NULL,
    spot_id          INTEGER      NOT NULL REFERENCES parking_spots(id),
    tariff_id        INTEGER      NOT NULL REFERENCES tariffs(id),
    entry_time       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    exit_time        TIMESTAMPTZ,
    cost             NUMERIC(10,2),
    payment_status   VARCHAR(10)  NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID'))
);
CREATE INDEX idx_sessions_client ON parking_sessions(client_id);
-- ФТ-8: автомобиль не может находиться на стоянке дважды
CREATE UNIQUE INDEX uq_sessions_active_car ON parking_sessions(car_id) WHERE exit_time IS NULL;

-- Класс «Оплата»: стоянка оплачивается 0..* оплатами
CREATE TABLE payments (
    id         SERIAL PRIMARY KEY,
    session_id INTEGER       NOT NULL REFERENCES parking_sessions(id),
    paid_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    method     VARCHAR(10)   NOT NULL CHECK (method IN ('CASH', 'CARD'))
);

-- Задолженность не хранится (как в ЛР № 1), а вычисляется: стоимость минус оплаты
CREATE VIEW session_balances AS
SELECT s.id, s.client_id, s.entry_time, s.cost - COALESCE(SUM(p.amount), 0) AS balance
FROM parking_sessions s LEFT JOIN payments p ON p.session_id = s.id
WHERE s.cost IS NOT NULL
GROUP BY s.id;

INSERT INTO parking_spots (number) SELECT generate_series(1, 20);
INSERT INTO tariffs (name, price_per_hour, free_minutes) VALUES ('Стандартный', 80, 15);

-- У Петрова (клиент 1) долг 150 руб. за прошлую стоянку — исходные данные примера из ЛР № 1
INSERT INTO parking_sessions (car_id, client_id, plate, spot_id, tariff_id, entry_time, exit_time, cost, payment_status)
VALUES (1, 1, 'А123ВС777', 3, 1, '2026-09-20 09:00+03', '2026-09-20 12:30+03', 288, 'PARTIAL');
INSERT INTO payments (session_id, amount, method) VALUES (1, 138, 'CASH');

-- Сейчас на стоянке: Kia Rio на месте 1
INSERT INTO parking_sessions (car_id, client_id, plate, spot_id, tariff_id, entry_time)
VALUES (2, 2, 'Е456КХ799', 1, 1, now() - interval '2 hours');
UPDATE parking_spots SET status = 'OCCUPIED' WHERE id = 1;
