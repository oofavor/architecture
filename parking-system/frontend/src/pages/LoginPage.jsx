import { useState } from 'react';
import { api } from '../api';

export default function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      onLogin(await api('/api/auth/login', { method: 'POST', body: form }));
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1>АИС «Автостоянка»</h1>
        <label>Логин<input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required /></label>
        <label>Пароль<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        {error && <div className="denied"><b>{error.status}</b> {error.message}</div>}
        <button className="primary">Войти</button>
        <div className="hint">
          {[['admin', 'admin123', 'администратор'], ['operator', 'operator123', 'оператор']].map(([login, password, role]) => (
            <div key={login}>
              <button type="button" className="link" onClick={() => setForm({ login, password })}>{login} / {password}</button> — {role}
            </div>
          ))}
        </div>
      </form>
    </section>
  );
}
