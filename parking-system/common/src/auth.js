'use strict';

const jwt = require('jsonwebtoken');
const { HttpError } = require('./errors');

const ROLES = { ADMIN: 'ADMIN', OPERATOR: 'OPERATOR' };
const STAFF = [ROLES.OPERATOR, ROLES.ADMIN];

const secret = () => process.env.JWT_SECRET;

// Токен на 8 часов (смена): id, логин и роль пользователя
function signToken(user) {
  return jwt.sign({ sub: user.id, login: user.login, role: user.role }, secret(), { expiresIn: '8h' });
}

// Аутентификация: заголовок Authorization: Bearer <token>
function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Требуется авторизация'));
  try {
    req.user = jwt.verify(token, secret());
    req.token = token;
    next();
  } catch {
    next(new HttpError(401, 'Недействительный или просроченный токен'));
  }
}

// Авторизация: доступ только для перечисленных ролей
const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'Недостаточно прав'));

module.exports = { ROLES, STAFF, signToken, authenticate, authorize };
