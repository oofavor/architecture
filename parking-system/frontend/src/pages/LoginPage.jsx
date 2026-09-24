import { useState } from 'react';
import { api } from '../api';

const DEMO = [
  ['admin', 'admin123', 'администратор'],
  ['operator', 'operator123', 'оператор'],
  ['petrov', 'client123', 'владелец автомобиля'],
];

export default function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api('/api/auth/login', { method: 'POST', body: form }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1>АИС «Автостоянка»</h1>
        <p className="muted" style={{ margin: 0 }}>Прототип, лабораторная работа № 2</p>
        <label>Логин
          <input value={form.login} autoComplete="username" required onChange={(e) => setForm({ ...form, login: e.target.value })} />
        </label>
        <label>Пароль
          <input type="password" value={form.password} autoComplete="current-password" required
                 onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <div className="denied"><b>{error.status}</b> {error.message}</div>}
        <button className="primary" disabled={busy}>Войти</button>
        <div className="hint">
          <b>Тестовые учётные записи</b>
          {DEMO.map(([login, password, role]) => (
            <div key={login}>
              <button type="button" className="link" onClick={() => setForm({ login, password })}>
                {login} / {password}
              </button> — {role}
            </div>
          ))}
        </div>
      </form>
    </section>
  );
}
