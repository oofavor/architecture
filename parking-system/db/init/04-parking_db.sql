\connect parking_db

CREATE TABLE parking_spots (
    id     SERIAL PRIMARY KEY,
    number INTEGER     NOT NULL UNIQUE,
    zone   VARCHAR(50) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'FREE' CHECK (status IN ('FREE', 'OCCUPIED'))
);

CREATE TABLE tariffs (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(100)  NOT NULL,
    price_per_hour NUMERIC(10,2) NOT NULL CHECK (price_per_hour >= 0),
    free_minutes   INTEGER       NOT NULL DEFAULT 15 CHECK (free_minutes >= 0),
    valid_from     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE parking_sessions (
    id               SERIAL PRIMARY KEY,
    car_id           INTEGER       NOT NULL,
    client_id        INTEGER       NOT NULL,
    plate            VARCHAR(12)   NOT NULL,
    spot_id          INTEGER       NOT NULL REFERENCES parking_spots(id),
    tariff_id        INTEGER       NOT NULL REFERENCES tariffs(id),
    operator_id      INTEGER       NOT NULL,
    entry_time       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    exit_time        TIMESTAMPTZ,
    discount_percent NUMERIC(5,2)  NOT NULL DEFAULT 0,
    cost             NUMERIC(10,2),
    payment_status   VARCHAR(10)   NOT NULL DEFAULT 'UNPAID'
                     CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')),
    CHECK (exit_time IS NULL OR exit_time >= entry_time)
);
CREATE UNIQUE INDEX uq_sessions_active_car ON parking_sessions(car_id) WHERE exit_time IS NULL;
CREATE INDEX idx_sessions_client ON parking_sessions(client_id);
CREATE INDEX idx_sessions_plate  ON parking_sessions(plate);

CREATE TABLE payments (
    id         SERIAL PRIMARY KEY,
    session_id INTEGER       NOT NULL REFERENCES parking_sessions(id) ON DELETE CASCADE,
    paid_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    method     VARCHAR(10)   NOT NULL CHECK (method IN ('CASH', 'CARD'))
);

CREATE VIEW session_balances AS
SELECT s.id, s.client_id, s.entry_time, s.cost,
       COALESCE(SUM(p.amount), 0)          AS paid,
       s.cost - COALESCE(SUM(p.amount), 0) AS balance
FROM parking_sessions s
LEFT JOIN payments p ON p.session_id = s.id
WHERE s.cost IS NOT NULL
GROUP BY s.id;

INSERT INTO parking_spots (number, zone)
SELECT n, CASE WHEN n <= 14 THEN 'Открытая площадка' ELSE 'Навес' END
FROM generate_series(1, 20) AS n;

INSERT INTO tariffs (name, price_per_hour, free_minutes, valid_from) VALUES
('Стандартный', 80, 15, '2026-01-01 00:00+03');

INSERT INTO parking_sessions (car_id, client_id, plate, spot_id, tariff_id, operator_id,
                              entry_time, exit_time, discount_percent, cost, payment_status) VALUES
(1, 1, 'А123ВС777', 3, 1, 2, '2026-09-20 09:00+03', '2026-09-20 12:30+03', 10, 288.00, 'PARTIAL'),
(2, 2, 'Е456КХ799', 5, 1, 2, '2026-09-21 10:00+03', '2026-09-21 11:10+03', 0,  80.00,  'PAID'),
(3, 3, 'М789ОР750', 7, 1, 3, '2026-09-22 18:00+03', '2026-09-22 20:20+03', 20, 192.00, 'PAID');
INSERT INTO payments (session_id, paid_at, amount, method) VALUES
(1, '2026-09-20 12:31+03', 138.00, 'CASH'),
(2, '2026-09-21 11:11+03',  80.00, 'CARD'),
(3, '2026-09-22 20:21+03', 192.00, 'CASH');

INSERT INTO parking_sessions (car_id, client_id, plate, spot_id, tariff_id, operator_id, entry_time) VALUES
(4, 4, 'Т321УК177', 1,  1, 2, now() - interval '2 hours'),
(5, 5, 'В654АМ777', 15, 1, 2, now() - interval '40 minutes');
UPDATE parking_spots SET status = 'OCCUPIED' WHERE id IN (1, 15);
