\connect auth_db

-- Классы «Сотрудник», «Оператор», «Администратор» из ЛР № 1: одна таблица с полем role
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    full_name     VARCHAR(150) NOT NULL,
    login         VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR'))
);

-- Пароли: admin123, operator123 (хеши bcrypt)
INSERT INTO users (full_name, login, password_hash, role) VALUES
('Смирнов Алексей Петрович', 'admin',    '$2b$10$QxpNDXxEDbFwPk654zh9KO9d7gLSJNJZ/I5uFsQrDUSlLWwwX1rq.', 'ADMIN'),
('Кузнецова Мария Игоревна', 'operator', '$2b$10$jjeWXon0PVBtQeZlPLBG6.7jSLIwfTF1EipbcVRxpmEe1jOlm0psG', 'OPERATOR');
