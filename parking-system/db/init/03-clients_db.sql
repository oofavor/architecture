\connect clients_db

-- Класс «Клиент»; скидка хранится процентом у клиента
CREATE TABLE clients (
    id               SERIAL PRIMARY KEY,
    full_name        VARCHAR(150) NOT NULL,
    phone            VARCHAR(20)  NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100)
);

-- Класс «Автомобиль»: клиент владеет 1..* автомобилями, госномер уникален
CREATE TABLE cars (
    id        SERIAL PRIMARY KEY,
    plate     VARCHAR(12) NOT NULL UNIQUE,
    brand     VARCHAR(50) NOT NULL,
    client_id INTEGER     NOT NULL REFERENCES clients(id) ON DELETE CASCADE
);

INSERT INTO clients (full_name, phone, discount_percent) VALUES
('Петров Иван Сергеевич',      '+79161234567', 10),
('Сидорова Анна Викторовна',   '+79267654321', 0),
('Козлов Павел Николаевич',    '+79031112233', 20);

INSERT INTO cars (plate, brand, client_id) VALUES
('А123ВС777', 'Toyota Camry', 1),
('Е456КХ799', 'Kia Rio',      2),
('М789ОР750', 'Lada Vesta',   3);
