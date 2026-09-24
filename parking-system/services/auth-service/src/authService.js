"use strict";

const bcrypt = require("bcryptjs");
const { HttpError, signToken, logger, metrics } = require("@parking/common");

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function createAuthService(pool) {
  async function registerFailure(user) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await pool.query(
      `UPDATE users SET failed_attempts = $1,
              locked_until = CASE WHEN $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
       WHERE id = $4`,
      [lock ? 0 : attempts, lock, LOCK_MINUTES, user.id],
    );
    metrics.count("login_failed");
    logger.warn("login_failed", { login: user.login, attempt: attempts });
    if (lock) {
      metrics.count("account_locked");
      logger.warn("account_locked", {
        login: user.login,
        minutes: LOCK_MINUTES,
      });
    }
  }

  async function login(login, password) {
    const { rows } = await pool.query("SELECT * FROM users WHERE login = $1", [
      login,
    ]);
    const user = rows[0];
    if (!user) {
      metrics.count("login_failed");
      logger.warn("login_failed", { login, reason: "unknown_login" });
      throw new HttpError(401, "Неверный логин или пароль");
    }
    if (user.is_blocked)
      throw new HttpError(403, "Учётная запись заблокирована администратором");
    if (user.locked_until && user.locked_until > new Date()) {
      throw new HttpError(
        423,
        `Учётная запись временно заблокирована до ${user.locked_until.toISOString()}`,
      );
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      await registerFailure(user);
      throw new HttpError(401, "Неверный логин или пароль");
    }
    await pool.query(
      "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1",
      [user.id],
    );
    metrics.count("login_success");
    logger.info("login_success", { login: user.login, role: user.role });
    return {
      token: signToken(user),
      user: {
        id: user.id,
        full_name: user.full_name,
        login: user.login,
        role: user.role,
      },
    };
  }

  const hashPassword = (password) => bcrypt.hash(password, 10);

  return { login, hashPassword };
}

module.exports = { createAuthService, MAX_FAILED_ATTEMPTS, LOCK_MINUTES };
