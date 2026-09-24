\connect clients_db

CREATE TABLE discounts (
    id        SERIAL PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    percent   NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
    condition VARCHAR(255)
);

CREATE TABLE clients (
    id          SERIAL PRIMARY KEY,
    full_name   VARCHAR(150) NOT NULL,
    phone       VARCHAR(20)  NOT NULL,
    document    VARCHAR(50),
    is_regular  BOOLEAN      NOT NULL DEFAULT FALSE,
    discount_id INTEGER      REFERENCES discounts(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE cars (
    id        SERIAL PRIMARY KEY,
    plate     VARCHAR(12) NOT NULL UNIQUE,
    brand     VARCHAR(50) NOT NULL,
    model     VARCHAR(50),
    color     VARCHAR(30),
    client_id INTEGER     NOT NULL REFERENCES clients(id) ON DELETE CASCADE
);
CREATE INDEX idx_cars_client ON cars(client_id);

INSERT INTO discounts (name, percent, condition) VALUES
('Постоянный клиент', 10, 'Не менее 10 стоянок в месяц'),
('Льготная',          20, 'Ветераны и инвалиды'),
('Корпоративная',     15, 'Договор с организацией');

INSERT INTO clients (full_name, phone, document, is_regular, discount_id) VALUES
('Петров Иван Сергеевич',       '+79161234567', '4510 123456', TRUE,  1),
('Сидорова Анна Викторовна',    '+79267654321', '4512 654321', FALSE, NULL),
('Козлов Павел Николаевич',     '+79031112233', '4509 111222', TRUE,  2),
('Морозова Елена Дмитриевна',   '+79855556677', '4515 777888', FALSE, NULL),
('ООО «ТрансЛогистик» (Орлов)', '+74951234455', 'ИНН 7701234567', TRUE, 3);

INSERT INTO cars (plate, brand, model, color, client_id) VALUES
('А123ВС777', 'Toyota',     'Camry',   'Белый',   1),
('Е456КХ799', 'Kia',        'Rio',     'Серый',   2),
('М789ОР750', 'Lada',       'Vesta',   'Синий',   3),
('Т321УК177', 'Hyundai',    'Solaris', 'Чёрный',  4),
('В654АМ777', 'Volkswagen', 'Polo',    'Красный', 5),
('Н987СЕ777', 'Skoda',      'Octavia', 'Белый',   5);
