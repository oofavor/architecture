// Общие функции интеграционных тестов (требуют запущенных контейнеров)
import { execSync } from 'node:child_process';

export const AUTH = 'http://localhost:3001';
export const CLIENTS = 'http://localhost:3002';
export const PARKING = 'http://localhost:3003';

export async function call(method, url, { token, body, headers } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

export const login = async (login, password) => (await call('POST', `${AUTH}/api/auth/login`, { body: { login, password } })).body.token;
export const operator = () => login('operator', 'operator123');
export const admin = () => login('admin', 'admin123');

// Случайные данные — тесты можно запускать многократно на одной базе
export const uid = () => Math.random().toString(36).slice(2, 8);
export function randomPlate() {
  const L = 'АВЕКМНОРСТУХ';
  const l = () => L[Math.floor(Math.random() * L.length)];
  return `${l()}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}${l()}${l()}${Math.floor(100 + Math.random() * 900)}`;
}

export async function newClientWithCar(discount = 0) {
  const token = await operator();
  const client = (await call('POST', `${CLIENTS}/api/clients`, { token, body: { full_name: `Тест ${uid()}`, phone: '+70000000000', discount_percent: discount } })).body;
  const car = (await call('POST', `${CLIENTS}/api/cars`, { token, body: { plate: randomPlate(), brand: 'Test', client_id: client.id } })).body;
  return { token, client, car };
}

export const compose = (args) => execSync(`docker compose ${args}`, { cwd: new URL('../..', import.meta.url).pathname, maxBuffer: 1e8 }).toString();
