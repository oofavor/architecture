import test from "node:test";
import assert from "node:assert/strict";
import { AUTH, CLIENTS, PARKING, call, token, uid } from "./helpers.mjs";

test("вход трёх ролей возвращает токен и данные пользователя без хеша пароля", async () => {
  for (const [login, password, role] of [
    ["admin", "admin123", "ADMIN"],
    ["operator", "operator123", "OPERATOR"],
    ["petrov", "client123", "CLIENT"],
  ]) {
    const res = await call("POST", `${AUTH}/api/auth/login`, {
      body: { login, password },
    });
    assert.equal(res.status, 200, login);
    assert.equal(res.body.user.role, role);
    assert.equal(res.body.user.password_hash, undefined);
    assert.equal(res.body.token.split(".").length, 3);
  }
});

test("неверный пароль и неизвестный логин — 401 с одинаковым сообщением", async () => {
  const a = await call("POST", `${AUTH}/api/auth/login`, {
    body: { login: "operator", password: "nope" },
  });
  const b = await call("POST", `${AUTH}/api/auth/login`, {
    body: { login: `ghost_${uid()}`, password: "nope" },
  });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error, b.body.error);
  await token("operator"); // успешный вход сбрасывает счётчик неудач оператора
});

test("вход без обязательных полей — 400", async () => {
  assert.equal(
    (await call("POST", `${AUTH}/api/auth/login`, { body: { login: "admin" } }))
      .status,
    400,
  );
  assert.equal(
    (await call("POST", `${AUTH}/api/auth/login`, { raw: "{плохой json" }))
      .status,
    400,
  );
});

test("токен, выданный auth-service, принимают clients-service и parking-service", async () => {
  const op = await token("operator");
  assert.equal(
    (await call("GET", `${CLIENTS}/api/clients`, { token: op })).status,
    200,
  );
  assert.equal(
    (await call("GET", `${PARKING}/api/spots`, { token: op })).status,
    200,
  );
  const me = await call("GET", `${AUTH}/api/auth/me`, { token: op });
  assert.equal(me.body.login, "operator");
});

test("без токена и с поддельным токеном — 401 во всех сервисах", async () => {
  const forged = `${(await token("operator")).slice(0, -3)}abc`;
  for (const url of [
    `${AUTH}/api/users`,
    `${CLIENTS}/api/clients`,
    `${PARKING}/api/sessions`,
  ]) {
    assert.equal((await call("GET", url)).status, 401, url);
    assert.equal((await call("GET", url, { token: forged })).status, 401, url);
  }
});

test("блокировка после 5 неудачных попыток (ФТ-3) и блокировка администратором (ФТ-18)", async () => {
  const admin = await token("admin");
  const login = `lock_${uid()}`;
  const created = await call("POST", `${AUTH}/api/users`, {
    token: admin,
    body: {
      full_name: "Проверка блокировки",
      login,
      password: "right-pass",
      role: "OPERATOR",
    },
  });
  assert.equal(created.status, 201);

  for (let i = 0; i < 5; i += 1) {
    assert.equal(
      (
        await call("POST", `${AUTH}/api/auth/login`, {
          body: { login, password: "wrong" },
        })
      ).status,
      401,
    );
  }
  const locked = await call("POST", `${AUTH}/api/auth/login`, {
    body: { login, password: "right-pass" },
  });
  assert.equal(locked.status, 423);

  await call("PUT", `${AUTH}/api/users/${created.body.id}`, {
    token: admin,
    body: { is_blocked: true },
  });
  const blocked = await call("POST", `${AUTH}/api/auth/login`, {
    body: { login, password: "right-pass" },
  });
  assert.equal(blocked.status, 403);

  assert.equal(
    (
      await call("DELETE", `${AUTH}/api/users/${created.body.id}`, {
        token: admin,
      })
    ).status,
    204,
  );
});
