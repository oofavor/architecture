// Демонстрационный сценарий прототипа АИС «Автостоянка».
// Запуск на «чистой» базе: docker compose down -v && docker compose up -d --build && npm run demo
// Каждый шаг проверяет ожидаемый HTTP-статус; при расхождении скрипт завершается с ошибкой.

const AUTH = process.env.AUTH_URL ?? 'http://localhost:3001';
const CLIENTS = process.env.CLIENTS_URL ?? 'http://localhost:3002';
const PARKING = process.env.PARKING_URL ?? 'http://localhost:3003';

let step = 0;
let failed = 0;

function show(value, maxLines = 14) {
  const lines = JSON.stringify(value, null, 2).split('\n');
  return lines.length > maxLines ? [...lines.slice(0, maxLines), '  ...'].join('\n') : lines.join('\n');
}

async function call(title, method, url, { token, body, expect }) {
  step += 1;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: body && JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json();
  const ok = res.status === expect;
  if (!ok) failed += 1;

  console.log(`\n=== ${step}. ${title}`);
  console.log(`${method} ${url.replace(/^http:\/\/localhost/, '')}${token ? '  [Bearer]' : ''}`);
  if (body) console.log(`Тело: ${JSON.stringify(body)}`);
  console.log(`Ответ: ${res.status} ${ok ? '(ожидалось)' : `(ОЖИДАЛОСЬ ${expect})`}`);
  if (data !== null) console.log(show(data));
  return data;
}

function check(title, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✔' : '✘'} ${title}: ${actual}${ok ? '' : ` (ожидалось ${expected})`}`);
}

const login = (l, p, expect = 200) =>
  call(`Вход пользователя «${l}»`, 'POST', `${AUTH}/api/auth/login`, { body: { login: l, password: p }, expect });

// ---------- 1. Безопасность: аутентификация и авторизация ----------
console.log('\n##### 1. АУТЕНТИФИКАЦИЯ И АВТОРИЗАЦИЯ #####');
await call('Проверка работоспособности (открытый ресурс)', 'GET', `${PARKING}/health`, { expect: 200 });
await call('Запрос без токена', 'GET', `${CLIENTS}/api/clients`, { expect: 401 });
await call('Запрос с поддельным токеном', 'GET', `${CLIENTS}/api/clients`, { token: 'abc.def.ghi', expect: 401 });
await login('operator', 'wrong-password', 401);

const admin = (await login('admin', 'admin123')).token;
const operator = (await login('operator', 'operator123')).token;
const owner = (await login('petrov', 'client123')).token;

await call('Текущий пользователь по токену', 'GET', `${AUTH}/api/auth/me`, { token: operator, expect: 200 });
await call('Оператор: список учётных записей (только админ)', 'GET', `${AUTH}/api/users`, { token: operator, expect: 403 });
await call('Оператор: создание тарифа (только админ)', 'POST', `${PARKING}/api/tariffs`, {
  token: operator, body: { name: 'Хакерский', price_per_hour: 1 }, expect: 403,
});
await call('Оператор: удаление клиента (только админ)', 'DELETE', `${CLIENTS}/api/clients/2`, { token: operator, expect: 403 });
await call('Владелец автомобиля: список всех клиентов', 'GET', `${CLIENTS}/api/clients`, { token: owner, expect: 403 });
await call('Владелец автомобиля: чужие стоянки', 'GET', `${PARKING}/api/sessions`, { token: owner, expect: 403 });

// ---------- 2. CRUD: clients-service ----------
console.log('\n##### 2. CRUD-ОПЕРАЦИИ #####');
await call('Список скидок', 'GET', `${CLIENTS}/api/discounts`, { token: operator, expect: 200 });
const client = await call('Создание клиента (оператор)', 'POST', `${CLIENTS}/api/clients`, {
  token: operator, body: { full_name: 'Николаев Сергей Олегович', phone: '+79990001122', document: '4520 000111' }, expect: 201,
});
await call('Чтение клиента по id', 'GET', `${CLIENTS}/api/clients/${client.id}`, { token: operator, expect: 200 });
await call('Обновление клиента: постоянный, скидка 10 %', 'PUT', `${CLIENTS}/api/clients/${client.id}`, {
  token: operator, body: { is_regular: true, discount_id: 1 }, expect: 200,
});
await call('Создание клиента без обязательного поля', 'POST', `${CLIENTS}/api/clients`, {
  token: operator, body: { full_name: 'Без телефона' }, expect: 400,
});
await call('Регистрация автомобиля (госномер нормализуется)', 'POST', `${CLIENTS}/api/cars`, {
  token: operator, body: { plate: 'о777оо 77', brand: 'Mazda', model: '6', color: 'Серый', client_id: client.id }, expect: 201,
});
await call('Повторная регистрация того же госномера (ФТ-5)', 'POST', `${CLIENTS}/api/cars`, {
  token: operator, body: { plate: 'О777ОО77', brand: 'Mazda', client_id: client.id }, expect: 409,
});
await call('Поиск автомобилей по части госномера', 'GET', `${CLIENTS}/api/cars?plate=${encodeURIComponent('777')}`, { token: operator, expect: 200 });
await call('Автозаполнение по госномеру: владелец и скидка (ФТ-7)', 'GET',
  `${CLIENTS}/api/cars/by-plate/${encodeURIComponent('А123ВС777')}`, { token: operator, expect: 200 });
await call('Поиск клиентов по фрагменту ФИО', 'GET', `${CLIENTS}/api/clients?full_name=${encodeURIComponent('петров')}`, { token: operator, expect: 200 });

// ---------- CRUD администратора ----------
const discount = await call('Администратор: создание скидки', 'POST', `${CLIENTS}/api/discounts`, {
  token: admin, body: { name: 'Акция выходного дня', percent: 5, condition: 'Сб–Вс' }, expect: 201,
});
await call('Администратор: удаление скидки', 'DELETE', `${CLIENTS}/api/discounts/${discount.id}`, { token: admin, expect: 204 });
const tariff = await call('Администратор: новый тариф с 01.01.2027 (ФТ-17)', 'POST', `${PARKING}/api/tariffs`, {
  token: admin, body: { name: 'Стандартный-2027', price_per_hour: 90, free_minutes: 15, valid_from: '2027-01-01T00:00:00+03:00' }, expect: 201,
});
await call('Администратор: изменение тарифа', 'PUT', `${PARKING}/api/tariffs/${tariff.id}`, {
  token: admin, body: { price_per_hour: 95 }, expect: 200,
});
await call('Администратор: создание учётной записи оператора', 'POST', `${AUTH}/api/users`, {
  token: admin, body: { full_name: 'Лебедев Олег Ильич', login: 'operator3', password: 'secret123', role: 'OPERATOR', shift_number: 3 }, expect: 201,
});
await call('Новый оператор входит в систему', 'POST', `${AUTH}/api/auth/login`, {
  body: { login: 'operator3', password: 'secret123' }, expect: 200,
});

// ---------- 3. Сценарий «Регистрация выезда» из ЛР №1 (межсервисное взаимодействие) ----------
console.log('\n##### 3. СЦЕНАРИЙ ИЗ ЛР №1: ВЪЕЗД — ВЫЕЗД — ОПЛАТА #####');
await call('Задолженность клиента 1 до въезда', 'GET', `${PARKING}/api/clients/1/debt`, { token: operator, expect: 200 });
const entry = await call('Въезд А123ВС777 в 08:40 (parking → clients)', 'POST', `${PARKING}/api/sessions/entry`, {
  token: operator, body: { plate: 'А123ВС777', entry_time: '2026-09-23T08:40:00+03:00' }, expect: 201,
});
await call('Повторный въезд того же автомобиля (ФТ-8)', 'POST', `${PARKING}/api/sessions/entry`, {
  token: operator, body: { plate: 'А123ВС777' }, expect: 409,
});
await call('Въезд незарегистрированного автомобиля', 'POST', `${PARKING}/api/sessions/entry`, {
  token: operator, body: { plate: 'Х000ХХ00' }, expect: 404,
});
await call('Занятые места', 'GET', `${PARKING}/api/spots?status=OCCUPIED`, { token: operator, expect: 200 });

const exit = await call('Выезд в 13:05 — расчёт стоимости', 'POST', `${PARKING}/api/sessions/${entry.session.id}/exit`, {
  token: operator, body: { exit_time: '2026-09-23T13:05:00+03:00' }, expect: 200,
});
check('Продолжительность, мин', exit.calculation.minutes, 265);
check('Оплачиваемых часов N', exit.calculation.hours, 5);
check('Стоимость со скидкой C, руб.', exit.calculation.cost, 360);
check('Прежняя задолженность D, руб.', exit.calculation.previous_debt, 150);
check('Сумма к оплате S, руб.', exit.calculation.amount_due, 510);

const receipt = await call('Оплата 500 руб. наличными (квитанция)', 'POST', `${PARKING}/api/payments`, {
  token: operator, body: { session_id: entry.session.id, amount: 500, method: 'CASH' }, expect: 201,
});
check('Новая задолженность, руб.', receipt.debt_after, 10);
await call('Оплата сверх задолженности', 'POST', `${PARKING}/api/payments`, {
  token: operator, body: { session_id: entry.session.id, amount: 1000, method: 'CARD' }, expect: 400,
});
await call('Стоянка с оплатами', 'GET', `${PARKING}/api/sessions/${entry.session.id}`, { token: operator, expect: 200 });
await call('Поиск стоянок по фрагменту номера и статусу оплаты (ФТ-13)', 'GET',
  `${PARKING}/api/sessions?plate=${encodeURIComponent('а123')}&payment_status=PARTIAL`, { token: operator, expect: 200 });
await call('Въезд нового автомобиля О777ОО77 (место и время — автоматически)', 'POST', `${PARKING}/api/sessions/entry`, {
  token: operator, body: { plate: 'О777ОО77' }, expect: 201,
});
const cabinet = await call('Личный кабинет владельца: свои стоянки и долг (ФТ-20)', 'GET', `${PARKING}/api/my/sessions`, {
  token: owner, expect: 200,
});
check('Долг в личном кабинете, руб.', cabinet.debt, 10);
check('Все стоянки принадлежат владельцу', cabinet.sessions.every((s) => s.client_id === 1), true);

// ---------- 4. Блокировка после 5 неудачных попыток (ФТ-3) ----------
console.log('\n##### 4. БЛОКИРОВКА УЧЁТНОЙ ЗАПИСИ #####');
for (let i = 1; i <= 5; i += 1) {
  await fetch(`${AUTH}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'operator2', password: `bad${i}` }),
  });
}
console.log('\n(выполнено 5 входов «operator2» с неверным паролем)');
await login('operator2', 'operator123', 423);

console.log(`\n##### ИТОГ: шагов ${step}, ошибок ${failed} #####`);
process.exit(failed ? 1 : 0);
