import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const AUTH = process.env.AUTH_URL ?? "http://localhost:3001";
export const CLIENTS = process.env.CLIENTS_URL ?? "http://localhost:3002";
export const PARKING = process.env.PARKING_URL ?? "http://localhost:3003";
export const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export async function call(
  method,
  url,
  { token, body, headers = {}, raw } = {},
) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    body: text ? JSON.parse(text) : null,
  };
}

const ACCOUNTS = {
  admin: "admin123",
  operator: "operator123",
  petrov: "client123",
};
const tokens = {};

export async function token(login) {
  if (!tokens[login]) {
    const res = await call("POST", `${AUTH}/api/auth/login`, {
      body: { login, password: ACCOUNTS[login] },
    });
    if (res.status !== 200)
      throw new Error(`Не удалось войти как ${login}: ${res.status}`);
    tokens[login] = res.body.token;
  }
  return tokens[login];
}

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Случайный госномер формата А123ВС777 (буквы, совпадающие с латиницей по начертанию)
export function randomPlate() {
  const L = "АВЕКМНОРСТУХ";
  const letter = () => L[Math.floor(Math.random() * L.length)];
  const digits = (n) =>
    String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
  return `${letter()}${digits(3)}${letter()}${letter()}${digits(3)}`;
}

// Новый клиент с автомобилем (через API, как это делает оператор)
export async function createClientWithCar({ discountId = null } = {}) {
  const op = await token("operator");
  const client = await call("POST", `${CLIENTS}/api/clients`, {
    token: op,
    body: {
      full_name: `Тестовый клиент ${uid()}`,
      phone: "+79000000000",
      discount_id: discountId,
    },
  });
  if (client.status !== 201) throw new Error(`клиент: ${client.status}`);
  const car = await call("POST", `${CLIENTS}/api/cars`, {
    token: op,
    body: { plate: randomPlate(), brand: "Test", client_id: client.body.id },
  });
  if (car.status !== 201) throw new Error(`автомобиль: ${car.status}`);
  return { client: client.body, car: car.body };
}

export async function enter(plate, extra = {}) {
  return call("POST", `${PARKING}/api/sessions/entry`, {
    token: await token("operator"),
    body: { plate, ...extra },
  });
}

export async function leave(sessionId, extra = {}) {
  return call("POST", `${PARKING}/api/sessions/${sessionId}/exit`, {
    token: await token("operator"),
    body: extra,
  });
}

export function compose(args) {
  // Журнал после нагрузочного теста может занимать десятки мегабайт (буфер по умолчанию — 1 МБ)
  return execSync(`docker compose ${args}`, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
}

export async function waitReady(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/health/ready`)).status === 200) return;
    } catch {
      /* ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} не стал доступен за ${timeoutMs} мс`);
}
