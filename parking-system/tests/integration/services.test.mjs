import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH,
  CLIENTS,
  PARKING,
  call,
  compose,
  uid,
  waitReady,
  createClientWithCar,
  enter,
  leave,
} from "./helpers.mjs";

test("проверки доступности: /health/live и /health/ready всех сервисов", async () => {
  for (const url of [AUTH, CLIENTS, PARKING]) {
    assert.equal((await call("GET", `${url}/health/live`)).status, 200);
    const ready = await call("GET", `${url}/health/ready`);
    assert.equal(ready.status, 200);
    assert.equal(ready.body.checks.database.status, "ok");
  }
});

test("метрики: время ответа по маршрутам, одновременные запросы, память, запросы к БД", async () => {
  await call("GET", `${PARKING}/api/spots`, {
    token: (
      await call("POST", `${AUTH}/api/auth/login`, {
        body: { login: "operator", password: "operator123" },
      })
    ).body.token,
  });
  const m = (await call("GET", `${PARKING}/metrics`)).body;
  assert.ok(m.http["GET /api/spots"].count >= 1);
  assert.ok(m.http["GET /api/spots"].p95_ms >= 0);
  assert.ok(m.memory_mb.rss > 0);
  assert.ok(m.in_flight.max >= 1);
  assert.ok(m.db["SELECT parking_spots"].count >= 1);
  assert.ok(m.db_pool.max >= 1);
});

test("сквозной идентификатор запроса: parking-service передаёт его в clients-service, оба пишут в журнал", async () => {
  const { car } = await createClientWithCar();
  const requestId = `itest-${uid()}`;
  const token = (
    await call("POST", `${AUTH}/api/auth/login`, {
      body: { login: "operator", password: "operator123" },
    })
  ).body.token;
  const entry = await call("POST", `${PARKING}/api/sessions/entry`, {
    token,
    body: { plate: car.plate },
    headers: { "X-Request-Id": requestId },
  });
  assert.equal(entry.status, 201);
  assert.equal(entry.headers.get("x-request-id"), requestId);

  const logs = compose(
    "logs --no-log-prefix --since 30s clients-service parking-service",
  )
    .split("\n")
    .filter((l) => l.includes(requestId))
    .map((l) => JSON.parse(l));
  assert.ok(
    logs.some(
      (r) =>
        r.service === "clients-service" &&
        r.route === "GET /api/cars/by-plate/:plate",
    ),
  );
  assert.ok(
    logs.some(
      (r) => r.service === "parking-service" && r.event === "car_entry",
    ),
  );
  await leave(entry.body.session.id);
});

test("отказ clients-service: въезд — 502 не дольше 3 с, остальные функции parking-service работают", async () => {
  const { car } = await createClientWithCar();
  const token = (
    await call("POST", `${AUTH}/api/auth/login`, {
      body: { login: "operator", password: "operator123" },
    })
  ).body.token;
  compose("stop clients-service");
  try {
    const started = Date.now();
    const res = await call("POST", `${PARKING}/api/sessions/entry`, {
      token,
      body: { plate: car.plate },
    });
    assert.equal(res.status, 502);
    assert.ok(
      Date.now() - started < 3000,
      `ответ за ${Date.now() - started} мс`,
    );
    assert.equal(
      (await call("GET", `${PARKING}/api/sessions?active=true`, { token }))
        .status,
      200,
    );
    assert.equal(
      (await call("GET", `${PARKING}/api/spots`, { token })).status,
      200,
    );
  } finally {
    compose("start clients-service");
    await waitReady(CLIENTS);
  }
  const retry = await enter(car.plate);
  assert.equal(retry.status, 201); // после восстановления всё работает
  await leave(retry.body.session.id);
});

test("недоступность базы данных: /health/ready — 503, /health/live — 200; после восстановления — 200", async () => {
  compose("pause db");
  try {
    const ready = await call("GET", `${CLIENTS}/health/ready`);
    assert.equal(ready.status, 503);
    assert.equal(ready.body.checks.database.status, "fail");
    assert.equal((await call("GET", `${CLIENTS}/health/live`)).status, 200);
  } finally {
    compose("unpause db");
  }
  await waitReady(CLIENTS, 10000);
});
