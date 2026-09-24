// Нагрузочный тест (ЛР № 3). Перед запуском загрузить объём: см. scripts/volume.sql
// Запуск: npm run load  →  сводка в консоли и results/load.json
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:8080'; // через nginx, как из браузера
const SERVICES = { 'auth-service': 3001, 'clients-service': 3002, 'parking-service': 3003 };
const PHASES = [
  { name: 'Средняя нагрузка', users: 10, pauseMs: 300, seconds: 20 },
  { name: 'Пиковая нагрузка', users: 50, pauseMs: 0, seconds: 20 },
];

const rnd = (n) => Math.floor(Math.random() * n);
const plate = (n) => `${'ВЕКМНОРСТУ'[n % 10]}${String(n).padStart(4, '0')}ОР99`; // как в volume.sql
const token = (await (await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'operator', password: 'operator123' }),
})).json()).token;

async function request(stats, name, method, path, body) {
  const started = performance.now();
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  (stats[name] ??= { times: [], errors: 0 }).times.push(performance.now() - started);
  if (res.status >= 500) stats[name].errors += 1;
  return { status: res.status, data };
}

// Смесь операций оператора (доля, %)
const OPERATIONS = [
  [25, (s) => request(s, 'Поиск стоянок по номеру', 'GET', `/api/sessions?plate=${String(rnd(1000)).padStart(3, '0')}`)],
  [20, (s) => request(s, 'Автомобили на стоянке', 'GET', '/api/sessions?active=true')],
  [20, (s) => request(s, 'План стоянки', 'GET', '/api/spots')],
  [15, (s) => request(s, 'Поиск владельца по номеру', 'GET', `/api/cars/by-plate/${encodeURIComponent(plate(1 + rnd(6000)))}`)],
  [10, (s) => request(s, 'Задолженность клиента', 'GET', `/api/clients/${100001 + rnd(5000)}/debt`)],
  [10, async (s) => {
    const entry = await request(s, 'Въезд', 'POST', '/api/sessions/entry', { plate: plate(1 + rnd(6000)), entry_time: new Date(Date.now() - 3600000).toISOString() });
    if (entry.status !== 201) return;
    const exit = await request(s, 'Выезд с расчётом', 'POST', `/api/sessions/${entry.data.session.id}/exit`, {});
    await request(s, 'Оплата', 'POST', '/api/payments', { session_id: entry.data.session.id, amount: exit.data.calculation.amount_due, method: 'CARD' });
  }],
];

function pick() {
  let x = rnd(100);
  for (const [share, op] of OPERATIONS) { if (x < share) return op; x -= share; }
  return OPERATIONS[0][1];
}

// Загрузка процессора контейнеров (асинхронно — не блокирует генератор нагрузки)
const cpu = async () => Object.fromEntries((await promisify(exec)("docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}'")).stdout.trim().split('\n')
  .map((l) => l.split(' ')).filter(([n]) => n.startsWith('parking-system-')).map(([n, p]) => [n.replace('parking-system-', '').replace('-1', ''), parseFloat(p)]));

const results = [];
for (const phase of PHASES) {
  for (const port of Object.values(SERVICES)) await fetch(`http://localhost:${port}/metrics/reset`, { method: 'POST' });
  const stats = {};
  const deadline = Date.now() + phase.seconds * 1000;
  const cpuSamples = [];
  const sampler = setInterval(async () => cpuSamples.push(await cpu()), 2000);
  await Promise.all(Array.from({ length: phase.users }, async () => {
    while (Date.now() < deadline) {
      await pick()(stats);
      if (phase.pauseMs) await new Promise((r) => setTimeout(r, phase.pauseMs));
    }
  }));
  clearInterval(sampler);

  const ops = {};
  let total = 0;
  for (const [name, { times, errors }] of Object.entries(stats)) {
    times.sort((a, b) => a - b);
    total += times.length;
    ops[name] = { count: times.length, avg_ms: Math.round(times.reduce((a, b) => a + b, 0) / times.length), p95_ms: Math.round(times[Math.ceil(times.length * 0.95) - 1]), errors };
  }
  const server = {};
  for (const [name, port] of Object.entries(SERVICES)) server[name] = await (await fetch(`http://localhost:${port}/metrics`)).json();
  const cpuAvg = {};
  for (const sample of cpuSamples) for (const [k, v] of Object.entries(sample)) cpuAvg[k] = (cpuAvg[k] ?? 0) + v / cpuSamples.length;

  const result = { ...phase, rps: Math.round(total / phase.seconds), operations: ops, cpu_avg_pct: cpuAvg, server };
  results.push(result);
  console.log(`\n${phase.name}: ${phase.users} пользователей, ${result.rps} запр/с`);
  console.table(Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, { 'кол-во': v.count, 'ср., мс': v.avg_ms, 'p95, мс': v.p95_ms, 'ошибки': v.errors }])));
  console.table(Object.fromEntries(Object.entries(server).map(([k, m]) => [k, {
    'одновр. макс.': m.in_flight.max, 'память пик, МБ': m.memory_mb.rss_peak, 'CPU ср., %': Math.round(cpuAvg[k] ?? 0),
  }])));
  console.log(`CPU PostgreSQL: ${Math.round(cpuAvg.db ?? 0)} %`);
  console.table(Object.fromEntries(Object.entries(server['parking-service'].db).sort((a, b) => b[1].total_ms - a[1].total_ms).slice(0, 5)
    .map(([k, v]) => [k, { 'кол-во': v.count, 'ср., мс': v.avg_ms, 'всего, с': Math.round(v.total_ms / 1000) }])));
}

mkdirSync('results', { recursive: true });
writeFileSync('results/load.json', JSON.stringify(results, null, 2));
