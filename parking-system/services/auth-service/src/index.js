'use strict';

const express = require('express');
const { ROLES, authenticate, crudRouter, createPool, startService, validate } = require('@parking/common');
const { createAuthService } = require('./authService');

const pool = createPool();
const auth = createAuthService(pool);

const USER_SCHEMA = {
  full_name: { type: 'string', required: true },
  login: { type: 'string', required: true },
  password: { type: 'string', required: true },
  role: { type: 'string', required: true, enum: Object.values(ROLES) },
  shift_number: { type: 'integer', nullable: true },
  client_id: { type: 'integer', nullable: true },
  is_blocked: { type: 'boolean' },
};

startService('auth-service', (app) => {
  const authRoutes = express.Router();

  // Открытая операция — вход по логину и паролю (ФТ-1)
  authRoutes.post('/login', async (req, res) => {
    const { login, password } = validate(req.body, {
      login: { type: 'string', required: true },
      password: { type: 'string', required: true },
    });
    res.json(await auth.login(login, password));
  });

  // Данные о текущем пользователе из токена
  authRoutes.get('/me', authenticate, (req, res) => res.json(req.user));

  app.use('/api/auth', authRoutes);

  // Управление учётными записями — только администратор (ФТ-18)
  app.use('/api/users', authenticate, crudRouter(pool, {
    table: 'users',
    schema: USER_SCHEMA,
    access: { read: [ROLES.ADMIN], write: [ROLES.ADMIN], remove: [ROLES.ADMIN] },
    filters: { role: 'eq', login: 'like' },
    columns: 'id, full_name, login, role, shift_number, client_id, is_blocked, created_at',
    prepare: async ({ password, ...data }) =>
      password === undefined ? data : { ...data, password_hash: await auth.hashPassword(password) },
  }));
}, { pool });
