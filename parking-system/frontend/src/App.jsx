import { useState } from 'react';
import { session } from './api';
import { ROLE_LABELS } from './format';
import LoginPage from './pages/LoginPage';
import ParkingPage from './pages/ParkingPage';
import ClientsPage from './pages/ClientsPage';
import AdminPage from './pages/AdminPage';

const TABS = [['Стоянка', ParkingPage], ['Клиенты', ClientsPage], ['Администрирование', AdminPage]];

export default function App() {
  const [auth, setAuth] = useState(session.get);
  const [tab, setTab] = useState(0);
  if (!auth) return <LoginPage onLogin={(data) => { session.set(data); setAuth(data); }} />;
  const Page = TABS[tab][1];

  return (
    <>
      <header className="topbar">
        <span className="brand">🅿 Автостоянка</span>
        <nav className="tabs">
          {TABS.map(([label], i) => <button key={label} className={i === tab ? 'active' : undefined} onClick={() => setTab(i)}>{label}</button>)}
        </nav>
        <span>{auth.user.full_name} <span className="badge">{ROLE_LABELS[auth.user.role]}</span></span>
        <button className="ghost" onClick={() => { session.clear(); setAuth(null); }}>Выйти</button>
      </header>
      <main key={tab}><Page /></main>
    </>
  );
}
