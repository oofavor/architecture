import { useEffect, useState } from 'react';
import { session, setUnauthorizedHandler } from './api';
import { ROLE_LABELS } from './format';
import LoginPage from './pages/LoginPage';
import ParkingPage from './pages/ParkingPage';
import SessionsPage from './pages/SessionsPage';
import ClientsPage from './pages/ClientsPage';
import ReferencePage from './pages/ReferencePage';
import UsersPage from './pages/UsersPage';
import CabinetPage from './pages/CabinetPage';

// Разделы для сотрудников. «Пользователи» видны и оператору — чтобы показать отказ сервера (403)
const STAFF_TABS = [
  ['parking', 'Стоянка', ParkingPage],
  ['sessions', 'Поиск стоянок', SessionsPage],
  ['clients', 'Клиенты', ClientsPage],
  ['reference', 'Справочники', ReferencePage],
  ['users', 'Пользователи', UsersPage],
];
const CLIENT_TABS = [['cabinet', 'Личный кабинет', CabinetPage]];

export default function App() {
  const [auth, setAuth] = useState(session.get);
  const tabs = auth?.user.role === 'CLIENT' ? CLIENT_TABS : STAFF_TABS;
  const [tab, setTab] = useState(null);
  const current = tabs.find(([key]) => key === tab) ?? tabs[0];
  const Page = current[2];

  function logout() {
    session.clear();
    setAuth(null);
    setTab(null);
  }

  useEffect(() => setUnauthorizedHandler(logout), []);

  if (!auth) {
    return <LoginPage onLogin={(data) => { session.set(data); setAuth(data); }} />;
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">🅿 Автостоянка</span>
        <nav className="tabs">
          {tabs.map(([key, label]) => (
            <button key={key} className={key === current[0] ? 'active' : undefined} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>
        <span className="user">{auth.user.full_name} <span className="badge">{ROLE_LABELS[auth.user.role]}</span></span>
        <button className="ghost" onClick={logout}>Выйти</button>
      </header>
      <main key={current[0]}>
        <Page />
      </main>
    </>
  );
}
