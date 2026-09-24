"use strict";

const jwt = require("jsonwebtoken");
const { HttpError } = require("./errors");
const { logger } = require("./logger");

const ROLES = Object.freeze({
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
  CLIENT: "CLIENT",
});
const STAFF = [ROLES.OPERATOR, ROLES.ADMIN];
const TOKEN_TTL = "8h"; // длительность смены

function secret() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET не задан");
  return process.env.JWT_SECRET;
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      login: user.login,
      role: user.role,
      clientId: user.client_id,
    },
    secret(),
    { expiresIn: TOKEN_TTL },
  );
}

// Аутентификация: проверка JWT из заголовка Authorization: Bearer <token>
function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token)
    return next(new HttpError(401, "Требуется авторизация"));
  try {
    req.user = jwt.verify(token, secret());
    req.token = token;
    next();
  } catch (err) {
    logger.warn("auth_token_rejected", { reason: err.message });
    next(new HttpError(401, "Недействительный или просроченный токен"));
  }
}

// Авторизация: доступ только для перечисленных ролей
function authorize(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.user?.role)) return next();
    logger.warn("access_denied", {
      role: req.user?.role,
      method: req.method,
      path: req.originalUrl,
    });
    return next(new HttpError(403, "Недостаточно прав"));
  };
}

module.exports = { ROLES, STAFF, signToken, authenticate, authorize };
