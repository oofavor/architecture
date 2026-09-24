# Parking System Prototype — Codebase Guide

A walkthrough of what this project is, how the pieces fit together, and why each
design decision was made. Read it top to bottom once; afterwards use the section
headings as a reference.

---

## 1. The 30-second version

This is a prototype of the **«Автостоянка» (car park) information system** from
LR1. It is built as **three small backend services + one web UI + one database
server**, all started by Docker Compose:

```
                 ┌──────────────────────────── docker compose ────────────────────────────┐
 Browser ──HTTP──▶ frontend :8080  (nginx: serves React app, forwards /api/* by path)       │
                 │     │            │                 │                                      │
                 │     ▼            ▼                 ▼                                      │
                 │ auth-service  clients-service ◀── parking-service                        │
                 │   :3001          :3002      REST      :3003                              │
                 │     │              │                  │                                  │
                 │     ▼              ▼                  ▼                                  │
                 │  auth_db       clients_db         parking_db     (one PostgreSQL 15)      │
                 └────────────────────────────────────────────────────────────────────────┘
```

| Piece | What it owns | LR1 classes it implements |
|---|---|---|
| `auth-service` | user accounts, login, JWT tokens, lockout | Сотрудник, Оператор, Администратор |
| `clients-service` | clients, their cars, discounts | Клиент, Автомобиль, Скидка |
| `parking-service` | spots, tariffs, parking sessions, payments, debt | ПарковочноеМесто, Тариф, Стоянка, Оплата |
| `common` | shared library used by all three services (not a service) | — |
| `frontend` | React UI + nginx reverse proxy | — |

Everything talks **REST + JSON over HTTP**. Authentication is a **JWT** token that
every service can verify on its own.

The core business flow (from LR1's use-case "Регистрация выезда"): a car
**enters** → gets a spot → later **exits** → cost is calculated with the
tariff, discount and old debt → the operator takes **payment** → any unpaid
remainder becomes **debt**.

---

## 2. Running it

```bash
cd parking-system
docker compose up -d --build     # db + 3 services + frontend
# UI:        http://localhost:8080   (admin/admin123, operator/operator123, petrov/client123)
# APIs:      http://localhost:3001, :3002, :3003
# Postgres:  localhost:5433 (user parking / pass parking)

npm install && npm test          # unit tests for the pricing formula
npm run demo                     # 42-step API scenario with assertions (needs a FRESH db)
docker compose down -v           # stop and wipe the database volume
```

Why "fresh db" for the demo: the demo reproduces the exact LR1 example (client
Petrov already owes 150 ₽, car А123ВС777 is not parked). Running it twice fails
because the car's session and payments already exist. `down -v` deletes the
Postgres volume, so the next `up` re-runs the seed scripts.

Frontend dev mode with hot reload: `cd frontend && npm install && npm run dev`
→ http://localhost:5173 (Vite proxies `/api` to ports 3001–3003, the same routing
as nginx).

---

## 3. Repository map

```
parking-system/
├── package.json              npm workspaces root: common + services/*; scripts test/demo
├── Dockerfile                ONE image for all 3 backend services (arg SERVICE picks which)
├── docker-compose.yml        db, auth-service, clients-service, parking-service, frontend
├── db/init/                  SQL run by Postgres on first start (alphabetical order)
│   ├── 01-databases.sql      CREATE DATABASE auth_db / clients_db / parking_db
│   ├── 02-auth_db.sql        users table + 4 seeded accounts
│   ├── 03-clients_db.sql     discounts, clients, cars + seed data
│   └── 04-parking_db.sql     spots, tariffs, sessions, payments, session_balances view + seed
├── common/src/               shared library "@parking/common"
│   ├── auth.js               JWT sign/verify, authenticate & authorize middleware, roles
│   ├── crud.js               crudRouter() — generates GET/POST/PUT/DELETE for a table
│   ├── db.js                 pg Pool factory, withTransaction()
│   ├── errors.js             HttpError class, global error handler (maps PG errors)
│   ├── server.js             startService() — Express bootstrap used by every service
│   ├── validate.js           tiny schema validator for request bodies
│   └── index.js              re-exports everything
├── services/
│   ├── auth-service/src/
│   │   ├── index.js          routes: /api/auth/login, /api/auth/me, /api/users (CRUD)
│   │   └── authService.js    login logic: bcrypt check, failed-attempt counter, lockout
│   ├── clients-service/src/
│   │   ├── index.js          CRUD for discounts, clients, cars + /api/cars/by-plate/:plate
│   │   └── carLookup.js      SQL join car+owner+discount; plate normalisation
│   └── parking-service/
│       ├── src/index.js      wiring: CRUD spots/tariffs, sessions, payments, debt, cabinet
│       ├── src/clientsApi.js HTTP client that calls clients-service
│       ├── src/domain/pricing.js      pure function: the LR1 cost formula
│       ├── src/services/sessionService.js  entry & exit business logic
│       ├── src/services/paymentService.js  payment allocation logic
│       ├── src/services/debtService.js     "how much does client X owe"
│       ├── src/routes/sessions.js  HTTP layer for sessions (search, entry, exit)
│       ├── src/routes/payments.js  HTTP layer for payments
│       └── test/pricing.test.js    unit tests (node:test)
├── frontend/
│   ├── Dockerfile            multi-stage: node builds React → nginx serves dist/
│   ├── nginx.conf            static files + path-based proxy to the 3 services
│   ├── vite.config.js        dev server with the same proxy table
│   └── src/                  React app (see §10)
└── scripts/demo.mjs          end-to-end API scenario used in the report
```

About 2,600 lines total. The backend proper is about 700 lines.

---

## 4. Follow one request end to end

The most instructive path is **"operator registers a car's exit"**, because it
touches every layer.

**Step 0: login.** Browser → `POST /api/auth/login` → nginx forwards to
`auth-service` → `authService.login()` checks the bcrypt hash → returns
`{ token, user }`. The frontend stores this in `sessionStorage`.

**Step 1: the click.** In `ExitDialog.jsx` the operator presses "Зарегистрировать
выезд" → `api('/api/sessions/6/exit', { method: 'POST', body: { exit_time } })`.
`api.js` adds `Authorization: Bearer <token>`.

**Step 2: routing.** nginx sees `/api/sessions...` → `proxy_pass
http://parking-service:3003`.

**Step 3: middleware chain in parking-service** (`src/index.js`):

1. `express.json()` parses the body (from `startService` in `common/server.js`).
2. The request logger records method, URL and status.
3. `app.use('/api', authenticate)`: `common/auth.js` verifies the JWT signature
   and expiry with `JWT_SECRET` and puts the decoded payload in `req.user`
   (`{ sub, login, role, clientId }`). A bad or missing token gets **401**.
4. `sessionsRouter` → `router.use(authorize(...STAFF))`: the role must be
   OPERATOR or ADMIN, otherwise **403**.
5. The route handler `POST /:id/exit` validates the body with `validate()`
   and calls `sessions.registerExit(id, data, req.token)`.

**Step 4: business logic** (`services/sessionService.js → registerExit`):

1. Reads the session's plate (outside any transaction).
2. **Calls clients-service** via `clientsApi.findCarByPlate(plate, token)`
   → `GET http://clients-service:3002/api/cars/by-plate/А123ВС777`, **forwarding
   the user's own token**. This returns the car, owner and **current discount**.
3. Opens a transaction (`withTransaction`) and locks the session row
   (`SELECT ... FOR UPDATE OF s`), joined with its tariff.
4. Rejects the request if the car already exited (409) or if exit time < entry time (400).
5. `calculateCost()` (pure function) computes minutes, billable hours, and cost with discount.
6. `getDebt()` reads the client's existing debt from the `session_balances`
   view. This runs *before* this session gets a cost, so it only counts old debt.
7. `UPDATE parking_sessions` sets exit time, cost, discount and status; `UPDATE
   parking_spots` sets the spot back to FREE.
8. Commits and returns `{ session, calculation: { ..., previous_debt, amount_due } }`.

**Step 5: errors.** Anything thrown (an `HttpError`, a Postgres error, or a crash)
bubbles to the global `errorHandler` in `common/errors.js`, which turns it into
`{ error: "..." }` with the right status code. Express 5 forwards rejected
promises from async handlers automatically, so no `try/catch` or `asyncHandler`
wrapper is needed.

**Step 6: payment.** `POST /api/payments { session_id, amount: 500, method }`
→ `paymentService.pay()` spreads the 500 ₽ over the client's unpaid sessions,
oldest first (§8.3).

---

## 5. The shared library `common/` (where most of the "cleverness" lives)

All three services `require('@parking/common')`. npm **workspaces** make that
work: the root `package.json` declares `"workspaces": ["common", "services/*"]`,
so `@parking/common` is symlinked into `node_modules` instead of being published.

### 5.1 `server.js`: `startService(name, configure)`
Every service's `index.js` is just `startService('x-service', (app) => { ...routes... })`.
The function does the boilerplate once:
JSON body parsing, a one-line access log, `GET /health`, a 404 fallback, the
error handler, and `listen(PORT)`. Without it that code would be copied three times.

### 5.2 `auth.js`: authentication and authorization
- `signToken(user)` creates a JWT with `{ sub: id, login, role, clientId }`,
  valid for **8 hours** (one shift).
- `authenticate` middleware parses `Authorization: Bearer ...` and runs
  `jwt.verify`. On success it sets `req.user` and `req.token`; otherwise **401**.
- `authorize(...roles)` is a middleware factory: it lets the request through if
  `req.user.role` is in the list, otherwise **403**.
- `ROLES` and `STAFF = [OPERATOR, ADMIN]` are constants so roles are never typed as strings.

**401 vs 403:** 401 means "I don't know who you are" (no or bad token). 403
means "I know who you are, and you're not allowed".

### 5.3 `crud.js`: `crudRouter(pool, config)` (the big DRY win)
One function generates the five standard REST endpoints for any table:

| Endpoint | SQL |
|---|---|
| `GET /` (+ query filters) | `SELECT cols FROM table WHERE ... ORDER BY id` |
| `GET /:id` | `SELECT ... WHERE id = $1` → 404 if none |
| `POST /` | `INSERT ... RETURNING cols` → 201 |
| `PUT /:id` | `UPDATE ... SET only-the-sent-fields ... RETURNING` → partial update |
| `DELETE /:id` | `DELETE ... WHERE id = $1` → 204 / 404 |

Config options:
- `table`: the table name.
- `schema`: which body fields are allowed and their types (passed to `validate`).
- `access: { read, write, remove }`: roles allowed for each kind of operation.
- `filters: { column: 'eq' | 'like' }`: which query params become `WHERE` clauses.
  `like` uses `ILIKE '%value%'` (case-insensitive substring; works with Cyrillic).
- `columns`: which columns to return. Used to **hide `password_hash`** in `/api/users`.
- `prepare(data)`: an async hook that transforms data before writing. Used for
  **hashing passwords** (auth) and **normalising plates** (clients: `"о777оо 77"`
  becomes `"О777ОО77"`).

It is used 6 times: users, discounts, clients, cars, spots, tariffs.

**SQL injection safety:** all *values* are passed as `$1, $2, ...` parameters.
Table and column names are interpolated into the SQL string, but they come only
from code (config and `schema` keys), never from the request. `validate()` drops
any body field not in the schema, so a user can't inject a column name.

### 5.4 `validate.js`: request validation without a library
`validate(body, schema, { partial })`:
- keeps only the fields declared in `schema` (a whitelist);
- checks types: `string` (non-empty), `integer`, `number`, `boolean`, `datetime`;
- checks `required` (skipped when `partial: true`, i.e. for PUT), `nullable` and `enum`;
- throws `HttpError(400, 'Поле «phone» обязательно')` etc.;
- throws 400 if nothing valid remains ("Нет данных для сохранения").

About 40 lines, instead of pulling in Joi, Zod or express-validator (KISS).

### 5.5 `errors.js`: one error format everywhere
- `HttpError(status, message)`: throw it anywhere and it becomes that HTTP response.
- `errorHandler` also translates **Postgres error codes** into client errors:

| PG code | Meaning | HTTP |
|---|---|---|
| `23505` | unique violation (duplicate plate/login) | 409 |
| `23503` | foreign key violation | 409 |
| `23514` | CHECK constraint failed (e.g. percent > 100) | 400 |
| `22P02` | invalid input syntax (e.g. `/clients/abc`) | 400 |

  So many rules are enforced **by the database**, and the code doesn't repeat
  them (e.g. there is no "is this plate taken?" query; the UNIQUE constraint does it).
- Unknown errors → 500 with a generic message. The real error is logged, not
  leaked to the client.

### 5.6 `db.js`
- `createPool()` builds a `pg.Pool` from `DATABASE_URL`.
- `types.setTypeParser(NUMERIC, parseFloat)`: by default `pg` returns NUMERIC as
  **strings** (to avoid precision loss). The prototype converts them to JS numbers
  for convenience. Amounts are rounded to kopecks with `round2()` wherever math
  happens. This is a conscious prototype shortcut (see §13).
- `withTransaction(pool, fn)` does BEGIN → `fn(client)` → COMMIT, or ROLLBACK on
  throw, and always releases the connection. Everything inside `fn` must use the
  passed `client` (named `db` in the code), not the pool, or it runs outside the
  transaction.

---

## 6. The three services

### 6.1 auth-service (`services/auth-service`)
- **`POST /api/auth/login`** (public) → `authService.login(login, password)`:
  1. Finds the user by login; if none → 401 "Неверный логин или пароль". The
     message is the same as for a wrong password, so it doesn't reveal which logins exist.
  2. `is_blocked` (set by the admin) → 403.
  3. `locked_until` in the future → **423 Locked** (requirement ФТ-3).
  4. `bcrypt.compare` fails → `registerFailure`: increments `failed_attempts`. On the
     5th failure it sets `locked_until = now() + 15 min` and resets the counter.
  5. Success → resets the counter and lock, returns a JWT.
- **`GET /api/auth/me`** returns the decoded token (useful for debugging).
- **`/api/users`**: a `crudRouter` restricted to ADMIN. The `password` field is
  virtual: `prepare` turns it into `password_hash` with bcrypt (cost 10). On PUT
  without a password, the hash is untouched.

### 6.2 clients-service (`services/clients-service`)
- Plain CRUD for `discounts` (write = ADMIN), `clients` and `cars` (write =
  OPERATOR+ADMIN, delete = ADMIN only).
- **`GET /api/cars/by-plate/:plate`** is the one custom endpoint. It is a single
  SQL query that joins car + client + discount and builds nested JSON with
  `json_build_object`. It serves two consumers:
  - the UI's **autofill** when typing a plate (ФТ-7);
  - **parking-service**, which needs the car id, client id and discount percent.
- **Route order matters:** `/api/cars/by-plate/:plate` is registered *before*
  `app.use('/api/cars', crudRouter(...))`; otherwise `GET /:id` would match
  `by-plate` first.
- Plates are normalised (spaces removed, uppercase) on write and on lookup, so
  `"а123вс 777"` finds `А123ВС777`.

### 6.3 parking-service (`services/parking-service`)
This is the service with real business logic, so it is layered:

```
routes/        HTTP only: parse, validate, call a service, send JSON
services/      business rules; receive dependencies as parameters
domain/        pure calculation, no I/O at all
clientsApi.js  the only code that knows clients-service exists
index.js       "composition root": creates the pool and API client, injects them into services
```

Endpoints:
- CRUD `/api/spots`, `/api/tariffs` (read = staff, write = admin).
- `GET /api/sessions`: search with a dictionary of filters (`SEARCH` in
  `routes/sessions.js`): `plate` (ILIKE), `client_id`, `payment_status`, `from`,
  `to`, `active=true|false`, and `page` (20 rows per page, LIMIT/OFFSET).
- `GET /api/sessions/:id` returns the session plus its payments.
- `POST /api/sessions/entry`, `POST /api/sessions/:id/exit`: §8.
- `GET/POST /api/payments`: §8.3.
- `GET /api/clients/:id/debt`: the debt number. It lives here, not in
  clients-service, because debt is computed from sessions and payments.
- `GET /api/my/sessions`: **CLIENT role only**; the personal cabinet.

---

## 7. Data storage

### 7.1 Database-per-service
One Postgres **server**, three separate **databases**. Each service's
`DATABASE_URL` points only to its own database, so a service *cannot* query
another service's tables. If parking-service needs client data, it has to ask
clients-service over HTTP.

Consequence: **no foreign keys across services.** `parking_sessions.car_id`,
`client_id` and `operator_id` are plain integers. Integrity is enforced by the
service logic (you can only enter a car that clients-service returns). The
trade-off is explained in the report.

Why one server instead of three: KISS. The isolation that matters (separate
schemas and credentials in principle) exists, and running one container is cheaper.
Splitting into three servers later means changing `DATABASE_URL` only.

### 7.2 Tables and deviations from the LR1 class diagram

| Table | Notes |
|---|---|
| `auth_db.users` | Сотрудник/Оператор/Администратор collapsed into **one table with a `role` column** (single-table inheritance); the subclasses had no own fields besides `shift_number`. Added role `CLIENT` + `client_id` for the car owner's cabinet (ФТ-20), and `failed_attempts`, `locked_until`, `is_blocked` for ФТ-3/ФТ-18. |
| `clients_db.discounts` | `percent NUMERIC(5,2) CHECK 0..100`. |
| `clients_db.clients` | `discount_id` FK nullable (0..1 discount), `ON DELETE SET NULL`. |
| `clients_db.cars` | `plate UNIQUE` (ФТ-5), `client_id` FK `ON DELETE CASCADE`. |
| `parking_db.parking_spots` | `status CHECK IN ('FREE','OCCUPIED')`. |
| `parking_db.tariffs` | Added `valid_from` + `is_active` (ФТ-17: a new tariff applies only to sessions *started* after it takes effect). |
| `parking_db.parking_sessions` | Stores `tariff_id` chosen at entry (that's how ФТ-17 works). Stores a **copy of `plate`** so search doesn't need an HTTP call. Stores `discount_percent` actually applied. |
| `parking_db.payments` | One row per (session, amount). `amount > 0`. |
| `parking_db.session_balances` | **View**, not a table: cost − sum(payments) per closed session. |

### 7.3 Clever bits in the schema
- **Partial unique index** (ФТ-8, "a car can't be parked twice"):
  ```sql
  CREATE UNIQUE INDEX uq_sessions_active_car ON parking_sessions(car_id) WHERE exit_time IS NULL;
  ```
  Only *open* sessions must be unique per car; closed sessions can repeat. The
  service checks this too (for a friendly message), but the index guarantees it
  even under concurrent requests.
- **Debt is never stored**, as in LR1 ("задолженность — вычисляемая величина").
  `session_balances` computes `balance = cost − paid`. A client's debt is
  `SUM(balance) WHERE balance > 0`. It can't get out of sync because there is
  nothing to sync.
- **Money is `NUMERIC(10,2)`**, as the LR1 system requirements say.
- `CHECK (exit_time IS NULL OR exit_time >= entry_time)`.

### 7.4 Seed data (chosen on purpose)
- Petrov (client 1, 10% discount, car А123ВС777) has an old session: cost 288 ₽,
  paid 138 ₽, so the debt is **150 ₽**. This is exactly the starting state of LR1's
  example table 10.
- Two cars are currently parked (spots 1 and 15), so the map isn't empty.
- The seed passwords are **bcrypt hashes** generated once and pasted into the SQL.
- `docker-entrypoint-initdb.d` runs these files **only when the data volume is
  empty**. Changing the SQL requires `docker compose down -v`.

---

## 8. Business logic in detail

### 8.1 Cost formula (`domain/pricing.js`)
LR1 formulas (1)–(2):
```
N = ceil((t − free_minutes) / 60),  min 0      t = parking time in minutes
C = N · price_per_hour · (1 − d/100)           d = discount %
```
`calculateCost()` is a **pure function** (dates and numbers in, object out; no
DB, no HTTP), which is why it's trivial to unit-test. Tests check the LR1 example
(265 min, 10% → 360 ₽), the free 15 minutes, and rounding a partial hour up.

### 8.2 Entry (`sessionService.registerEntry`)
1. Ask clients-service for the car (404 if unknown). This happens **before** the
   transaction, so no DB locks are held during an HTTP call.
2. In a transaction:
   - reject if the car has an open session (409);
   - **take a spot**: either the requested one (`FOR UPDATE`, must be FREE) or the
     first free one:
     ```sql
     SELECT * FROM parking_spots WHERE status='FREE' ORDER BY number LIMIT 1 FOR UPDATE SKIP LOCKED
     ```
     `FOR UPDATE` locks the row. `SKIP LOCKED` means two operators registering
     entries at the same moment get *different* spots instead of one waiting or
     both getting the same spot;
   - mark the spot OCCUPIED;
   - pick the tariff valid at the entry moment (`valid_from <= entry ORDER BY valid_from DESC LIMIT 1`);
   - insert the session with `operator_id = req.user.sub` (who did it).
3. Optional `entry_time` in the body exists so the LR1 example can be reproduced
   with fixed times. Without it, the current time is used.

### 8.3 Exit and payment
- **Exit** is described in §4. The discount is taken **at exit time**, from
  clients-service. Previous debt is added: `S = C + D` (formula 3).
- **Payment** (`paymentService.pay`), in a transaction:
  1. Find the session's client and **lock all that client's sessions**
     (`FOR UPDATE`), so two simultaneous payments can't both spend the same debt.
  2. Load unpaid balances, oldest first.
  3. If the amount exceeds the total owed → 400.
  4. Walk through the balances: each gets `min(rest, balance)`; insert a `payments`
     row per session and set its status to `PAID` (fully covered) or `PARTIAL`.
  5. Return a "receipt" with the allocations and `debt_after`.

  LR1 example: balances `[old session: 150, new session: 360]`, pay 500 →
  150 goes to the old session (PAID), 350 to the new one (PARTIAL, 10 left), so the
  debt is **10 ₽**. This matches LR1 exactly.

---

## 9. Inter-service communication

Only one service-to-service call exists: **parking-service → clients-service**
`GET /api/cars/by-plate/:plate` (`clientsApi.js`).

Decisions:
- **Synchronous REST**, not a message queue or gRPC. Parking *needs the answer
  now* (which car, whose, what discount) to continue the request. A queue suits
  fire-and-forget events. REST is also what LR1's non-functional requirements
  asked for.
- **Token forwarding:** parking passes the *user's* JWT along. clients-service
  applies its normal rules to it. So there's no special "service account" or
  internal trust. The downside: a CLIENT-role user couldn't trigger that call
  (they can't do entry/exit anyway).
- **Timeout 2 s** (`AbortSignal.timeout(2000)`, from the NFR "response ≤ 2 s").
- **Error mapping:** network failure or timeout → **502** "Сервис клиентов
  недоступен"; an error response from clients-service (e.g. 404 unknown plate) is
  **re-thrown with the same status and message**, so the user sees the real reason.
- Service discovery is just Docker Compose DNS: `CLIENTS_SERVICE_URL=http://clients-service:3002`.

JWT verification needs **no call to auth-service**: all services share
`JWT_SECRET` and verify signatures locally, so auth-service isn't a bottleneck or
single point of failure for every request.

---

## 10. Frontend (`frontend/`)

### 10.1 How it's served
- **Production (Docker):** a multi-stage `Dockerfile`. Stage 1 (`node:24-alpine`)
  runs `npm ci && vite build`. Stage 2 (`nginx:1.25-alpine`) copies `dist/` and
  `nginx.conf`.
- **nginx.conf** does two jobs:
  1. serves static files, with `try_files ... /index.html` (SPA fallback);
  2. acts as a **path-based reverse proxy**: `/api/auth`, `/api/users` → auth;
     `/api/clients|cars|discounts` → clients; `/api/spots|tariffs|sessions|payments|my` → parking.
     One gotcha: `/api/clients/:id/debt` belongs to **parking**, so a regex
     `location ~ ^/api/clients/\d+/debt$` is placed first. In nginx, regex
     locations win over plain prefix locations.
  Because the browser only ever talks to `:8080`, there is **no CORS** to configure.
  3. **Re-resolves service names at runtime.** Upstreams are written as variables
     (`set $auth http://auth-service:3001; proxy_pass $auth;`) with
     `resolver 127.0.0.11 valid=10s` (Docker's built-in DNS). With a plain
     `proxy_pass http://auth-service:3001`, nginx resolves the name **once at
     startup** and caches the IP forever. After a backend container is rebuilt or
     recreated it gets a new IP, and nginx keeps hitting the old one, so every
     request returns **502** (this actually happened during development). With variables, nginx
     looks the name up again (at most every 10 s), so backends can be restarted
     independently of the frontend.
- **Dev:** `vite.config.js` has the same proxy table pointing at `localhost:3001-3003`.

### 10.2 Code structure (React 19, plain JSX, no router, no state library)
```
src/
├── main.jsx            mounts <App/> inside <ToastProvider/>
├── App.jsx             login gate + role-based tabs (plain state, no react-router)
├── api.js              fetch wrapper: adds token, parses JSON, throws ApiError(status,msg),
│                       on 401 calls the logout handler; qs() builds query strings
├── hooks.js            useApi(path) → { data, error, loading, reload }
├── format.js           ru-RU dates/money, labels for enums, datetime-local ⇄ ISO
├── components/
│   ├── Toasts.jsx      context + useNotify(): ok(text), error(err) shows "403 Недостаточно прав"
│   ├── Dialog.jsx      wraps native <dialog> + showModal() (focus trap, Esc, backdrop for free)
│   ├── FormDialog.jsx  form generated from a field spec (text/number/integer/checkbox/select/datetime/password)
│   ├── DataTable.jsx   columns spec → table, optional row click and action buttons
│   ├── Load.jsx        loading / error (403 shown as a red "access denied" box) / render data
│   └── CrudPanel.jsx   list + add/edit/delete for one resource = frontend twin of crudRouter
└── pages/
    ├── LoginPage.jsx       form + clickable demo accounts
    ├── ParkingPage.jsx     entry form (debounced plate autofill), spot map, "now parked" table
    ├── ExitDialog.jsx      exit → formula breakdown → payment → receipt (the LR1 scenario)
    ├── SessionsPage.jsx    search filters + pagination + session details with payments
    ├── ClientsPage.jsx     client list/search, create; client card with cars, debt, edit/delete
    ├── ReferencePage.jsx   3 × CrudPanel (tariffs, discounts, spots)
    ├── UsersPage.jsx       1 × CrudPanel (accounts)
    └── CabinetPage.jsx     CLIENT role: own debt + history
```

### 10.3 Design decisions worth knowing
- **The UI has zero business logic.** It never computes a price or decides
  permissions; it shows what the API returns. The cost breakdown in `ExitDialog`
  displays the server's `calculation` object.
- **Buttons are deliberately *not* hidden by role** for staff. An operator can
  press "Добавить тариф" or open "Пользователи", and the **server** answers 403,
  which the UI displays. This proves security lives on the backend. Hiding buttons
  is cosmetic; it's not protection. The CLIENT role gets only the cabinet tab, since
  its whole UI is different.
- `CrudPanel` + `FormDialog` repeat the backend's DRY idea: tariffs, discounts,
  spots and users screens are each ~20 lines of *configuration*.
- The token lives in **`sessionStorage`** (gone when the tab closes).
- Plate autofill: `useEffect` with a 400 ms `setTimeout` debounce, cancelled on
  every keystroke by the cleanup function.
- `<main key={tab}>` remounts the page on tab switch, so each page loads fresh data.

---

## 11. Security summary

| Mechanism | Where |
|---|---|
| Passwords hashed with **bcrypt** (cost 10), never returned by the API | `authService.js`, `columns` option in `/api/users` |
| **JWT HS256**, 8 h expiry, payload `{sub, login, role, clientId}` | `common/auth.js` |
| Every `/api/*` route requires a token (401), except login and `/health` | `app.use('/api', authenticate)` in each service |
| **RBAC**: `authorize(...roles)` per route or per CRUD operation (403) | `crudRouter` `access`, routers |
| **Row-level restriction** for CLIENT: `/api/my/sessions` uses `req.user.clientId` **from the token**, not a query param, so an owner can't view someone else's data | `parking-service/src/index.js` |
| Lockout after 5 failed logins for 15 min (423); admin block flag (403) | `authService.js` |
| Parameterised SQL everywhere; body whitelist via `validate` | `crud.js`, `validate.js` |
| Secret from env var `JWT_SECRET` (compose default for demo only) | `docker-compose.yml` |
| Containers run as non-root user `node` | `Dockerfile` |
| 500 errors don't leak internals | `errors.js` |

Access matrix:

| Operation | no token | CLIENT | OPERATOR | ADMIN |
|---|---|---|---|---|
| login, /health | ✓ | ✓ | ✓ | ✓ |
| users CRUD | 401 | 403 | 403 | ✓ |
| read clients/cars/discounts/spots/tariffs | 401 | 403 | ✓ | ✓ |
| create/update clients & cars | 401 | 403 | ✓ | ✓ |
| delete clients & cars | 401 | 403 | 403 | ✓ |
| write discounts/tariffs/spots | 401 | 403 | 403 | ✓ |
| entry/exit/payments/search/debt | 401 | 403 | ✓ | ✓ |
| personal cabinet | 401 | ✓ | 403 | 403 |

---

## 12. Infrastructure details (the non-obvious parts)

- **One backend Dockerfile for three services.** They share `common` and the
  dependencies, so the image is identical. `ARG SERVICE` picks the entry point:
  `CMD ["sh","-c","exec node services/$SERVICE/src/index.js"]`. `exec` makes Node
  PID 1, so `docker stop` signals reach it.
- **Layer caching:** package.json files are copied and `npm ci` runs *before* the
  source is copied, so code edits don't reinstall dependencies.
- **Postgres healthcheck uses TCP** (`pg_isready -h 127.0.0.1`). During the first
  start, the entrypoint runs a temporary server that listens *only on a Unix
  socket* while executing `db/init/*.sql`. A socket-based check would report
  "ready" too early and the services would connect to a half-initialised DB. The
  TCP check turns green only when the real server is up. Services use
  `depends_on: condition: service_healthy`.
- **YAML anchors** (`x-service`, `x-env`) share `restart`, `depends_on` and
  `JWT_SECRET` across services (DRY in config).
- **`build: network: host`**: on this machine, Docker's default build network
  couldn't reach the npm registry (timeouts). Building on the host network fixed
  it. On a normal machine it's harmless and can be removed.
- Postgres is exposed on **5433** (not 5432) to avoid clashing with a local Postgres.

---

## 13. Tests and verification

| What | How | Result |
|---|---|---|
| Pricing formula | `npm test` → `node --test "services/*/test/*.test.js"` (built-in runner) | 3/3 |
| Whole API | `npm run demo` → `scripts/demo.mjs`: 42 real HTTP calls; each asserts the expected status; money values are checked with `check()`; exit code ≠ 0 on any mismatch | 42/42 on fresh DB |
| UI | headless Chromium via puppeteer-core (script kept outside the repo): login, entry, 409, exit, payment, search, client+car create, 403 cases, cabinet | passed, no JS errors |

The demo is also the source of the results table in the report (the report
generator parses its log).

---

## 14. SOLID / DRY / KISS: where exactly

- **S (single responsibility):** each service owns one bounded context and one
  database. Inside parking-service: routes = HTTP, services = rules, domain = math,
  clientsApi = integration. In `common`, each file does one thing.
- **O (open/closed):** `crudRouter` is extended through config (`prepare`,
  `filters`, `columns`, `access`) without editing it. That's how password hashing
  and plate normalisation were added. A new search filter = one line in `SEARCH`.
- **L (Liskov substitution):** anything with `findCarByPlate(plate, token)` can
  replace `clientsApi` (e.g. a stub in tests) without touching `sessionService`.
- **I (interface segregation):** small independent exports (`authenticate`,
  `authorize`, `validate`, `withTransaction`); `clientsApi` exposes only the one
  method parking needs.
- **D (dependency inversion):** factories take dependencies as arguments:
  `createSessionService(pool, clientsApi)`, `createPaymentService(pool)`,
  `createAuthService(pool)`. Only `index.js` knows the concrete URL or pool.
- **DRY:** one CRUD factory for 6 resources; shared auth, validation, errors and
  bootstrap; one debt definition (the view plus `getDebt`); one backend Dockerfile;
  YAML anchors; on the frontend `CrudPanel`, `FormDialog`, `DataTable`, `useApi`.
- **KISS:** REST instead of a broker; one Postgres server; no ORM (readable SQL);
  hand-written validator; no API gateway, no Redux, no router; the whole system
  starts with one command.

---

## 15. Known shortcuts and limitations (know these before a defence)

These are deliberate prototype trade-offs, each with the "real system" answer:

1. **Tokens can't be revoked.** If the admin blocks a user, their existing JWT
   keeps working until it expires (≤ 8 h). Real system: short-lived access
   tokens + refresh tokens, or a denylist.
2. **Shared symmetric secret** (HS256) across services: any service could
   *issue* tokens. Real system: RS256, where auth-service signs with a private key
   and the others verify with the public key.
3. **No HTTPS** inside the prototype. In production, TLS would terminate at nginx
   or a load balancer.
4. **NUMERIC → JS float.** Fine for these amounts with `round2`, but a real
   billing system would keep decimals as strings or integers in kopecks.
5. **No cross-service consistency on delete.** Deleting a client in
   clients-service leaves their sessions in parking_db pointing at a
   non-existent id. Real system: soft deletes, or domain events ("ClientDeleted")
   via a message broker.
6. **Exit looks the car up by plate.** If someone edits the car's plate while it's
   parked, exit returns 404. A `by-id` lookup would be more robust.
7. **Login timing**: an unknown login returns without running bcrypt, so it
   answers slightly faster than a wrong password. That's theoretical user
   enumeration; the fix is a dummy bcrypt compare.
8. **Token in `sessionStorage`**: readable by JavaScript, so an XSS bug could steal
   it. The alternative is an httpOnly cookie (then you need CSRF protection).
9. **Not implemented** (out of the prototype's scope): revenue reports, charts,
   XLSX/PDF export (ФТ-16, ФТ-19), the audit log (ФТ-21), multiple car parks.
10. The demo script needs a fresh DB (`docker compose down -v` first).

---

## 16. Likely defence questions — short answers

- **Why microservices and not a monolith?** LR1 asked for modularity and
  scaling to 5 sites. The subsystems have different load (entry/exit is constant,
  client records rarely change) and can scale separately. The honest counterpoint:
  for one small car park a modular monolith would be simpler.
- **Why a separate DB per service?** Loose coupling: a service can change its
  schema without breaking others. The cost is no cross-DB foreign keys and no
  cross-service transactions.
- **Why REST, not gRPC or a queue?** The call needs an immediate answer; REST is
  simple, debuggable with curl, and required by LR1's NFR.
- **How does parking-service know the user is allowed?** It verifies the JWT
  locally with the shared secret, then checks the role with `authorize`.
- **What if clients-service is down?** Entry/exit returns 502 after at most 2 s.
  Everything else (search, payments, spots) keeps working. That's the partial
  failure isolation you get from microservices.
- **How is "car parked twice" prevented under concurrency?** A service check plus
  the partial UNIQUE index on open sessions. The index is the real guarantee.
- **Two operators, one free spot?** `FOR UPDATE SKIP LOCKED` means each
  transaction locks a different spot; if none are free, 409.
- **Where is debt stored?** Nowhere. It's computed from sessions − payments (view
  `session_balances`), exactly like the LR1 model.
- **What did you change vs the LR1 ER model and why?** Section 7.2.

---

## 17. Where the report comes from

`../Лабораторная_работа_2_Автостоянка.docx` was generated by a Node script (using
the `docx` npm package) that is **not part of this repo**. It read the source
files for the code listings and the `demo.mjs` log for the results table, and
embedded Graphviz diagrams and UI screenshots. Edit the .docx in Word directly
from now on; the title page placeholders (`[ФИО]`, `[группа]`, the university)
still need to be filled in.

---

## 18. LR3 additions: tests, observability, performance

**Tests** (`node:test`, no extra libraries):
- Unit tests (`common/test`, `services/*/test`, 49 tests) replace every dependency with a fake: a fake `pg` pool that records SQL, and an injected `fetchImpl` in `clientsApi`. The payment allocation rule was moved into the pure function `domain/allocation.js` so it can be tested without a database. `tests/setup-unit.mjs` silences the log and sets `JWT_SECRET`.
- Integration tests (`tests/integration`, 53 tests) hit the running containers and create their own random data, so they can be re-run without resetting the DB. They also stop `clients-service` and pause `db` through `docker compose` to test failure behaviour. Run them with `--test-concurrency=1`, because they share the car park's spots.

**Observability** (everything lives in `common/`, and `startService` wires it up):
- `context.js`: AsyncLocalStorage holding `{ requestId }`. The ID comes from `X-Request-Id`, which nginx sets to `$request_id`, or is generated if missing. `clientsApi` forwards it, so a single ID finds the matching lines in nginx, parking-service and clients-service logs.
- `logger.js`: one JSON line per event on stdout. It adds the service name, `requestId` and user automatically. `LOG_LEVEL` controls verbosity (`silent` in unit tests).
- `metrics.js`: in-process counters served at `GET /metrics`:
  - per-route latency (p50/p95/p99), labelled by route template;
  - in-flight requests (current and max);
  - RSS memory and its peak;
  - event-loop delay;
  - pool waiting;
  - DB query timings labelled "OP table";
  - external call timings;
  - business event counters.
  `POST /metrics/reset` starts a new measurement window.
- `db.js` wraps `client.query` on every pooled connection. It handles both the promise and the callback form, because `pool.query` uses callbacks internally. Queries slower than `SLOW_QUERY_MS` (200 ms) are logged as `slow_query`.
- `/health/live` means the process is up. `/health/ready` means the process is up and `SELECT 1` succeeds within 1 s; otherwise it returns 503. Compose healthchecks call `/health/ready`. SIGTERM triggers a graceful shutdown.

**Load test** (`scripts/load.mjs` plus `scripts/volume/*.sql`, which generate 500k sessions). A closed-loop set of virtual users sends an operator-like mix of requests through nginx: average (10 users), peak (100 users) and a login burst. Server metrics and `docker stats` are recorded alongside.

Findings:
- On the LR2 schema the DB was the bottleneck: sequential scans on `parking_sessions` for ILIKE search, and on `payments` because `payments.session_id` had no index. `session_balances` read the whole payments table on every debt calculation.
- `db/init/05-performance.sql` adds pg_trgm indexes, an `entry_time` index and a `payments.session_id` index. Peak throughput went from 113 to 908 req/s, and p95 from about 2.5 s to about 0.2 s.
- After that, the next limit is a single Node thread in parking-service (about 100% of one core), which is why horizontal scaling is proposed.
- Login is capped at about 11 per second, because bcryptjs runs on the main thread and every successful login updates the same `users` row.
