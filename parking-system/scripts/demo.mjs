// Демонстрация прототипа (ЛР № 2) на чистой базе:
//   docker compose down -v && docker compose up -d --build && npm run demo
const AUTH = 'http://localhost:3001';
const CLIENTS = 'http://localhost:3002';
const PARKING = 'http://localhost:3003';
let step = 0;
let failed = 0;

async function call(title, method, url, { token, body, expect }) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  if (res.status !== expect) failed += 1;
  console.log(`\n${++step}. ${title}\n   ${method} ${url.replace('http://localhost', '')} → ${res.status}${res.status === expect ? '' : ` (ожидалось ${expect})`}`);
  if (data) console.log(`   ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const login = (l, p, expect = 200) => call(`Вход «${l}»`, 'POST', `${AUTH}/api/auth/login`, { body: { login: l, password: p }, expect });

console.log('=== Авторизация ===');
await login('operator', 'wrong', 401);
const admin = (await login('admin', 'admin123')).token;
const op = (await login('operator', 'operator123')).token;
await call('Запрос без токена', 'GET', `${CLIENTS}/api/clients`, { expect: 401 });
await call('Оператор: список пользователей (только администратор)', 'GET', `${AUTH}/api/users`, { token: op, expect: 403 });
await call('Оператор: создание тарифа (только администратор)', 'POST', `${PARKING}/api/tariffs`, { token: op, body: { name: 'x', price_per_hour: 1 }, expect: 403 });

console.log('\n=== CRUD (clients-service) ===');
const client = await call('Создание клиента', 'POST', `${CLIENTS}/api/clients`, { token: op, body: { full_name: 'Николаев Сергей', phone: '+79990001122' }, expect: 201 });
await call('Чтение клиента', 'GET', `${CLIENTS}/api/clients/${client.id}`, { token: op, expect: 200 });
await call('Изменение клиента: скидка 5 %', 'PUT', `${CLIENTS}/api/clients/${client.id}`, { token: op, body: { discount_percent: 5 }, expect: 200 });
await call('Регистрация автомобиля', 'POST', `${CLIENTS}/api/cars`, { token: op, body: { plate: 'о777оо77', brand: 'Mazda 6', client_id: client.id }, expect: 201 });
await call('Повторный госномер', 'POST', `${CLIENTS}/api/cars`, { token: op, body: { plate: 'О777ОО77', brand: 'Mazda', client_id: client.id }, expect: 409 });
await call('Администратор: создание пользователя', 'POST', `${AUTH}/api/users`, { token: admin, body: { full_name: 'Лебедев Олег', login: 'operator2', password: 'secret', role: 'OPERATOR' }, expect: 201 });

console.log('\n=== Сценарий ЛР № 1: въезд → выезд → оплата (parking-service → clients-service) ===');
const entry = await call('Въезд А123ВС777 в 08:40', 'POST', `${PARKING}/api/sessions/entry`, { token: op, body: { plate: 'А123ВС777', entry_time: '2026-09-23T08:40:00+03:00' }, expect: 201 });
await call('Повторный въезд той же машины', 'POST', `${PARKING}/api/sessions/entry`, { token: op, body: { plate: 'А123ВС777' }, expect: 409 });
const exit = await call('Выезд в 13:05', 'POST', `${PARKING}/api/sessions/${entry.session.id}/exit`, { token: op, body: { exit_time: '2026-09-23T13:05:00+03:00' }, expect: 200 });
const pay = await call('Оплата 500 руб.', 'POST', `${PARKING}/api/payments`, { token: op, body: { session_id: entry.session.id, amount: 500, method: 'CASH' }, expect: 201 });

const c = exit.calculation;
console.log(`\nРасчёт: ${c.minutes} мин → ${c.hours} ч → ${c.base_cost} → со скидкой ${c.cost}; долг ${c.previous_debt}; к оплате ${c.amount_due}; после оплаты 500 долг ${pay.debt_after}`);
if (c.amount_due !== 510 || pay.debt_after !== 10) failed += 1;
console.log(`\nИТОГ: шагов ${step}, ошибок ${failed}`);
process.exit(failed ? 1 : 0);
