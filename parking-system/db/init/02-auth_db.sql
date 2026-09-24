\connect auth_db

CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(150) NOT NULL,
    login           VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(100) NOT NULL,
    role            VARCHAR(20)  NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'CLIENT')),
    shift_number    INTEGER,
    client_id       INTEGER,
    is_blocked      BOOLEAN      NOT NULL DEFAULT FALSE,
    failed_attempts INTEGER      NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Пароли: admin123, operator123, client123
INSERT INTO users (full_name, login, password_hash, role, shift_number, client_id) VALUES
('Смирнов Алексей Петрович',  'admin',     '$2b$10$QxpNDXxEDbFwPk654zh9KO9d7gLSJNJZ/I5uFsQrDUSlLWwwX1rq.', 'ADMIN',    NULL, NULL),
('Кузнецова Мария Игоревна',  'operator',  '$2b$10$jjeWXon0PVBtQeZlPLBG6.7jSLIwfTF1EipbcVRxpmEe1jOlm0psG', 'OPERATOR', 1,    NULL),
('Волков Денис Андреевич',    'operator2', '$2b$10$jjeWXon0PVBtQeZlPLBG6.7jSLIwfTF1EipbcVRxpmEe1jOlm0psG', 'OPERATOR', 2,    NULL),
('Петров Иван Сергеевич',     'petrov',    '$2b$10$qRv9gl5kNx.b3GKY5WYbzOd8VKPidP8DHSBQh.slHHBVr8PtaciBi', 'CLIENT',   NULL, 1);
