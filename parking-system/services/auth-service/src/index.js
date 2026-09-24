'use strict';

const bcrypt = require('bcryptjs');
const { ROLES, HttpError, crudRouter, createPool, log, signToken, startService, validate } = require('@parking/common');

const pool = createPool();

startService('auth-service', {
  pool,

  // Вход: открытая операция, проверка пароля по хешу bcrypt, выдача JWT
  publicRoutes(app) {
    app.post('/api/auth/login', async (req, res) => {
      const { login, password } = validate(req.body, {
        login: { type: 'string', required: true },
        password: { type: 'string', required: true },
      });
      const user = (await pool.query('SELECT * FROM users WHERE login = $1', [login])).rows[0];
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        log('warn', 'login_failed', { requestId: req.id, login });
        throw new HttpError(401, 'Неверный логин или пароль');
      }
      log('info', 'login_success', { requestId: req.id, login });
      res.json({ token: signToken(user), user: { id: user.id, full_name: user.full_name, login, role: user.role } });
    });
  },

  // Учётные записи сотрудников — только администратор; пароль хешируется, хеш не возвращается
  routes(app) {
    app.use('/api/users', crudRouter(pool, {
      table: 'users',
      schema: {
        full_name: { type: 'string', required: true },
        login: { type: 'string', required: true },
        password: { type: 'string', required: true },
        role: { type: 'string', required: true, enum: Object.values(ROLES) },
      },
      read: [ROLES.ADMIN],
      write: [ROLES.ADMIN],
      columns: 'id, full_name, login, role',
      prepare: async ({ password, ...data }) =>
        password ? { ...data, password_hash: await bcrypt.hash(password, 10) } : data,
    }));
  },
});
