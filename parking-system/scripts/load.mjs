// Нагрузочное тестирование прототипа.
// Запуск: node scripts/load.mjs <метка> (например, baseline или optimized)
// Требует объёмных данных: см. scripts/volume/*.sql
// Результат: консольная сводка и results/<метка>.json

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const SERVICES = {
  'auth-service': 'http://localhost:3001',
  'clients-service': 'http://localhost:3002',
  'parking-service': 'http://localhost:3003',
};
const LABEL = process.argv[2] ?? 'run';
const DURATION_S = Number(process.env.DURATION_S ?? 30);

const PHASES = [
  { name: 'average', title: 'Средняя нагрузка: 10 операторов, пауза 300 мс', users: 10, thinkMs: 300, mix: 'operator' },
  { name: 'peak', title: 'Пиковая нагрузка: 100 пользователей без пауз', users: 100, thinkMs: 0, mix: 'operator' },
  { name: 'login', title: 'Всплеск входов: 20 пользователей входят одновременно', users: 20, thinkMs: 0, mix: 'login', durationS: 15 },
];

// ---------- вспомогательные функции ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(Math.random() * n);
const LETTERS = ['В', 'Е', 'К', 'М', 'Н', 'О', 'Р', 'С', 'Т', 'У'];
const bulkPlate = (n) => `${LETTERS[n % 10]}${String(n).padStart(4, '0')}ОР99`; // как в scripts/volume
const SURNAMES = ['Смирнов', 'Иванов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов', 'Михайлов', 'Новиков', 'Фёдоров'];
const NAMES = ['Алексей', 'Иван', 'Сергей', 'Андрей', 'Дмитрий', 'Мария', 'Анна', 'Елена', 'Ольга', 'Павел'];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function json(method, url, { token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(loginName, password) {
  const res = await json('POST', `${BASE}/api/auth/login`, { body: { login: loginName, password } });
  if (res.status !== 200) throw new Error(`вход ${loginName}: ${res.status}`);
  return res.body.token;
}

// ---------- сбор статистики на стороне клиента ----------
class Recorder {
  constructor() { this.ops = new Map(); }

  async measure(name, fn, expected = [200, 201]) {
    const started = performance.now();
    let status = 0;
    let result;
    try {
      result = await fn();
      status = result.status;
    } catch {
      status = 0; // сетевая ошибка
    }
    const ms = performance.now() - started;
    if (!this.ops.has(name)) this.ops.set(name, { samples: [], errors: 0, conflicts: 0, statuses: {} });
    const op = this.ops.get(name);
    op.samples.push(ms);
    op.statuses[status] = (op.statuses[status] ?? 0) + 1;
    if (status === 409) op.conflicts += 1; // ожидаемый конфликт (автомобиль уже на стоянке / нет мест)
    else if (!expected.includes(status)) op.errors += 1;
    return result;
  }

  summary(seconds) {
    const rows = {};
    let total = 0;
    let errors = 0;
    for (const [name, op] of this.ops) {
      const sorted = [...op.samples].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      total += sorted.length;
      errors += op.errors;
      rows[name] = {
        count: sorted.length,
        rps: +(sorted.length / seconds).toFixed(1),
        avg_ms: +(sum / sorted.length).toFixed(1),
        p50_ms: +percentile(sorted, 50).toFixed(1),
        p95_ms: +percentile(sorted, 95).toFixed(1),
        p99_ms: +percentile(sorted, 99).toFixed(1),
        max_ms: +sorted[sorted.length - 1].toFixed(1),
        errors: op.errors,
        conflicts: op.conflicts,
        statuses: op.statuses,
      };
    }
    return { total_requests: total, rps: +(total / seconds).toFixed(1), errors, error_rate_pct: +((errors / total) * 100).toFixed(2), operations: rows };
  }
}

// ---------- сценарии пользователей ----------
function operatorScenario(rec, tokens) {
  const t = tokens.operator;
  const ops = [
    [20, 'Поиск стоянок по фрагменту номера', () => json('GET', `${BASE}/api/sessions?plate=${encodeURIComponent(String(rnd(6000)).padStart(4, '0').slice(0, 3))}`, { token: t })],
    [15, 'Список автомобилей на стоянке', () => json('GET', `${BASE}/api/sessions?active=true`, { token: t })],
    [15, 'План стоянки (места)', () => json('GET', `${BASE}/api/spots`, { token: t })],
    [15, 'Автозаполнение по госномеру', () => json('GET', `${BASE}/api/cars/by-plate/${encodeURIComponent(bulkPlate(1 + rnd(6000)))}`, { token: t })],
    [10, 'Поиск клиентов по ФИО', () => json('GET', `${BASE}/api/clients?full_name=${encodeURIComponent(`${SURNAMES[rnd(10)]} ${NAMES[rnd(10)]}`)}`, { token: t })],
    [10, 'Задолженность клиента', () => json('GET', `${BASE}/api/clients/${100001 + rnd(5000)}/debt`, { token: t })],
    [5, 'Личный кабинет владельца', () => json('GET', `${BASE}/api/my/sessions`, { token: tokens.petrov })],
    [10, 'cycle', null],
  ];
  const totalWeight = ops.reduce((s, o) => s + o[0], 0);

  // Цикл «въезд → выезд → оплата» для случайного автомобиля из объёмных данных
  async function cycle() {
    const plate = bulkPlate(1 + rnd(6000));
    const entryTime = new Date(Date.now() - (30 + rnd(270)) * 60000).toISOString();
    const entry = await rec.measure('Въезд (parking → clients)', () => json('POST', `${BASE}/api/sessions/entry`, { token: t, body: { plate, entry_time: entryTime } }));
    if (entry?.status !== 201) return;
    const exit = await rec.measure('Выезд с расчётом стоимости', () => json('POST', `${BASE}/api/sessions/${entry.body.session.id}/exit`, { token: t, body: {} }));
    const due = exit?.body?.calculation?.amount_due;
    if (due > 0) {
      await rec.measure('Оплата с распределением', () => json('POST', `${BASE}/api/payments`, {
        token: t, body: { session_id: entry.body.session.id, amount: due, method: 'CARD' },
      }));
    }
  }

  return async () => {
    let x = rnd(totalWeight);
    for (const [weight, name, fn] of ops) {
      if (x < weight) return name === 'cycle' ? cycle() : rec.measure(name, fn);
      x -= weight;
    }
    return undefined;
  };
}

function loginScenario(rec) {
  return () => rec.measure('Вход в систему (bcrypt)', () => json('POST', `${BASE}/api/auth/login`, { body: { login: 'operator', password: 'operator123' } }));
}

// ---------- загрузка контейнеров (docker stats) ----------
function watchContainers() {
  const samples = {};
  let stopped = false;
  const tick = () => new Promise((resolve) => {
    const p = spawn('docker', ['stats', '--no-stream', '--format', '{{.Name}};{{.CPUPerc}};{{.MemUsage}}']);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => {
      for (const line of out.trim().split('\n')) {
        const [name, cpu, mem] = line.split(';');
        if (!name?.startsWith('parking-system-')) continue;
        const short = name.replace('parking-system-', '').replace(/-1$/, '');
        (samples[short] ??= []).push({ cpu: parseFloat(cpu), memMb: parseMem(mem.split('/')[0]) });
      }
      resolve();
    });
    p.on('error', resolve);
  });
  const loop = (async () => { while (!stopped) { await tick(); await sleep(1000); } })();
  return async () => {
    stopped = true;
    await loop;
    return Object.fromEntries(Object.entries(samples).map(([name, s]) => [name, {
      cpu_avg_pct: +(s.reduce((a, x) => a + x.cpu, 0) / s.length).toFixed(1),
      cpu_max_pct: +Math.max(...s.map((x) => x.cpu)).toFixed(1),
      mem_max_mb: +Math.max(...s.map((x) => x.memMb)).toFixed(1),
    }]));
  };
}

function parseMem(text) {
  const m = text.trim().match(/([\d.]+)\s*([KMG]i?B)/);
  if (!m) return 0;
  const k = { KiB: 1 / 1024, KB: 1 / 1000, MiB: 1, MB: 1, GiB: 1024, GB: 1000 }[m[2]] ?? 1;
  return parseFloat(m[1]) * k;
}

// ---------- проведение фазы ----------
async function runPhase(phase, tokens) {
  const seconds = phase.durationS ?? DURATION_S;
  console.log(`\n▶ ${phase.title} (${seconds} с)`);
  await Promise.all(Object.values(SERVICES).map((url) => fetch(`${url}/metrics/reset`, { method: 'POST' })));

  const rec = new Recorder();
  const next = phase.mix === 'login' ? loginScenario(rec) : operatorScenario(rec, tokens);
  const stopWatching = watchContainers();
  const deadline = Date.now() + seconds * 1000;
  const started = Date.now();
  await Promise.all(Array.from({ length: phase.users }, async () => {
    while (Date.now() < deadline) {
      await next();
      if (phase.thinkMs) await sleep(phase.thinkMs * (0.5 + Math.random()));
    }
  }));
  const elapsed = (Date.now() - started) / 1000;

  const client = rec.summary(elapsed);
  const containers = await stopWatching();
  const server = {};
  for (const [name, url] of Object.entries(SERVICES)) server[name] = await (await fetch(`${url}/metrics`)).json();

  printPhase(client, server, containers);
  return { ...phase, seconds: elapsed, client, server, containers };
}

function printPhase(client, server, containers) {
  console.log(`  Всего запросов: ${client.total_requests}, пропускная способность: ${client.rps} запр/с, ошибок: ${client.errors} (${client.error_rate_pct} %)`);
  console.table(Object.fromEntries(Object.entries(client.operations).map(([k, v]) => [k, {
    'кол-во': v.count, 'ср., мс': v.avg_ms, 'p95, мс': v.p95_ms, 'p99, мс': v.p99_ms, 'макс., мс': v.max_ms, 'ошибки': v.errors, '409': v.conflicts,
  }])));
  const rows = {};
  for (const [name, m] of Object.entries(server)) {
    const topDb = Object.entries(m.db).filter(([k]) => !['BEGIN', 'COMMIT', 'ROLLBACK'].includes(k))[0];
    rows[name] = {
      'одновр. макс.': m.in_flight.max,
      'RSS пик, МБ': m.memory_mb.rss_peak,
      'задержка цикла p99, мс': m.event_loop_delay_ms.p99,
      'ожидание пула, макс.': m.db_pool?.max_waiting ?? '-',
      'самый затратный запрос к БД': topDb ? `${topDb[0]} (ср. ${topDb[1].avg_ms} мс, всего ${Math.round(topDb[1].total_ms / 1000)} с)` : '-',
      'CPU ср./макс., %': containers[name] ? `${containers[name].cpu_avg_pct} / ${containers[name].cpu_max_pct}` : '-',
    };
  }
  rows.db = { 'CPU ср./макс., %': containers.db ? `${containers.db.cpu_avg_pct} / ${containers.db.cpu_max_pct}` : '-', 'RSS пик, МБ': containers.db?.mem_max_mb };
  console.table(rows);
}

// ---------- запуск ----------
const tokens = { operator: await login('operator', 'operator123'), petrov: await login('petrov', 'client123') };
const results = [];
for (const phase of PHASES) results.push(await runPhase(phase, tokens));

mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
const file = new URL(`../results/${LABEL}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ label: LABEL, at: new Date().toISOString(), phases: results }, null, 2));
console.log(`\nРезультаты сохранены: results/${LABEL}.json`);
