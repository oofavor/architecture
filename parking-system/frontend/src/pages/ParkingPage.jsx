import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import { dateTime, localToIso, money } from '../format';
import Dialog from '../components/Dialog';
import Load from '../components/Load';
import Table from '../components/Table';
import { useNotify } from '../components/Toasts';

// Рабочее место оператора: въезд, план стоянки, выезд с расчётом и оплатой
export default function ParkingPage() {
  const spots = useApi('/api/spots');
  const active = useApi('/api/sessions?active=true');
  const [exiting, setExiting] = useState(null);
  const reload = () => { spots.reload(); active.reload(); };
  const plateBySpot = Object.fromEntries((active.data ?? []).map((s) => [s.spot_id, s.plate]));

  return (
    <>
      <div className="grid-2">
        <EntryForm onDone={reload} />
        <section className="card">
          <h2>План стоянки</h2>
          <Load state={spots}>
            {(list) => (
              <div className="spots">
                {list.map((s) => (
                  <div key={s.id} className={`spot ${s.status === 'OCCUPIED' ? 'busy' : ''}`}>
                    {s.number}<small>{plateBySpot[s.id] ?? (s.status === 'OCCUPIED' ? 'занято' : 'свободно')}</small>
                  </div>
                ))}
              </div>
            )}
          </Load>
        </section>
      </div>
      <section className="card">
        <h2>Сейчас на стоянке</h2>
        <Load state={active}>
          {(rows) => (
            <Table
              rows={rows}
              columns={[['plate', 'Госномер'], ['entry_time', 'Въезд', (r) => dateTime(r.entry_time)]]}
              actions={(row) => <button className="primary" onClick={() => setExiting(row)}>Выезд</button>}
            />
          )}
        </Load>
      </section>
      {exiting && <ExitDialog session={exiting} onClose={() => { setExiting(null); reload(); }} />}
    </>
  );
}

function EntryForm({ onDone }) {
  const notify = useNotify();
  const [plate, setPlate] = useState('');
  const [entryTime, setEntryTime] = useState('');
  const [car, setCar] = useState(null);

  // Автозаполнение по госномеру (запрос к clients-service)
  useEffect(() => {
    setCar(null);
    if (plate.length < 6) return undefined;
    const timer = setTimeout(() => api(`/api/cars/by-plate/${encodeURIComponent(plate)}`).then(setCar, (error) => setCar({ error })), 400);
    return () => clearTimeout(timer);
  }, [plate]);

  async function submit(e) {
    e.preventDefault();
    try {
      const r = await api('/api/sessions/entry', { method: 'POST', body: { plate, entry_time: localToIso(entryTime) } });
      notify.ok(`Въезд ${r.car.plate}: место №${r.spot.number}`);
      setPlate('');
      onDone();
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Регистрация въезда</h2>
      <label>Госномер<input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="А123ВС777" required /></label>
      {car && (car.error
        ? <div className="owner error">{car.error.message}</div>
        : <div className="owner"><b>{car.brand}</b><br />Владелец: {car.full_name}<br />Скидка: {car.discount_percent} %</div>)}
      <label>Время въезда (пусто — текущее)<input type="datetime-local" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} /></label>
      <button className="primary">Зарегистрировать въезд</button>
    </form>
  );
}

// Сценарий ЛР № 1: выезд → расчёт по формулам → оплата → остаток долга
function ExitDialog({ session, onClose }) {
  const notify = useNotify();
  const [exitTime, setExitTime] = useState('');
  const [result, setResult] = useState(null);
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState(null);

  async function registerExit() {
    try {
      const r = await api(`/api/sessions/${session.id}/exit`, { method: 'POST', body: { exit_time: localToIso(exitTime) } });
      setResult(r.calculation);
      setAmount(String(r.calculation.amount_due));
    } catch (err) {
      notify.error(err);
    }
  }

  async function pay() {
    try {
      setReceipt(await api('/api/payments', { method: 'POST', body: { session_id: session.id, amount: Number(amount), method: 'CASH' } }));
    } catch (err) {
      notify.error(err);
    }
  }

  const c = result;
  return (
    <Dialog title={`Выезд ${session.plate}`} onClose={onClose}>
      {!c && (
        <>
          <label>Время выезда (пусто — текущее)<input type="datetime-local" value={exitTime} onChange={(e) => setExitTime(e.target.value)} /></label>
          <button className="primary" onClick={registerExit}>Рассчитать</button>
        </>
      )}
      {c && (
        <table className="calc">
          <tbody>
            <tr><td>Время на стоянке t</td><td>{c.minutes} мин</td></tr>
            <tr><td>Оплачиваемых часов N (первые 15 мин бесплатно)</td><td>{c.hours}</td></tr>
            <tr><td>N · {money(c.price_per_hour)}</td><td>{money(c.base_cost)}</td></tr>
            <tr><td>Со скидкой {c.discount_percent} % (C)</td><td>{money(c.cost)}</td></tr>
            <tr><td>Прежний долг D</td><td>{money(c.previous_debt)}</td></tr>
            <tr className="total"><td>К оплате S = C + D</td><td>{money(c.amount_due)}</td></tr>
          </tbody>
        </table>
      )}
      {c && c.amount_due > 0 && !receipt && (
        <div className="row">
          <label>Сумма, ₽<input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button className="primary" onClick={pay}>Принять оплату</button>
          <button onClick={onClose}>В долг</button>
        </div>
      )}
      {receipt && <div className="owner">Принято {money(receipt.paid)}. Долг после оплаты: <b>{money(receipt.debt_after)}</b></div>}
      {(receipt || (c && c.amount_due === 0)) && <button className="primary" onClick={onClose}>Закрыть</button>}
    </Dialog>
  );
}
