import { useState } from 'react';
import { api } from '../api';
import { dateTime, localToIso, money, METHOD_LABELS } from '../format';
import Dialog from '../components/Dialog';
import { useNotify } from '../components/Toasts';

// Сценарий ЛР № 1 «Регистрация выезда»: выезд → расчёт стоимости → оплата → квитанция
export default function ExitDialog({ session, onClose }) {
  const notify = useNotify();
  const [exitTime, setExitTime] = useState('');
  const [result, setResult] = useState(null);
  const [payment, setPayment] = useState({ amount: '', method: 'CASH' });
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(action) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      notify.error(err);
    } finally {
      setBusy(false);
    }
  }

  const registerExit = () => run(async () => {
    const data = await api(`/api/sessions/${session.id}/exit`, { method: 'POST', body: { exit_time: localToIso(exitTime) } });
    setResult(data);
    setPayment({ amount: String(data.calculation.amount_due), method: 'CASH' });
  });

  const pay = () => run(async () => {
    setReceipt(await api('/api/payments', {
      method: 'POST',
      body: { session_id: session.id, amount: Number(payment.amount), method: payment.method },
    }));
    notify.ok('Оплата принята');
  });

  const c = result?.calculation;

  return (
    <Dialog title={`Выезд ${session.plate}`} onClose={onClose}>
      <div className="muted">Въезд: {dateTime(session.entry_time)}</div>

      {!result && (
        <>
          <label>Время выезда (по умолчанию — текущее)
            <input type="datetime-local" value={exitTime} onChange={(e) => setExitTime(e.target.value)} />
          </label>
          <div className="actions">
            <button onClick={onClose}>Отмена</button>
            <button className="primary" disabled={busy} onClick={registerExit}>Зарегистрировать выезд и рассчитать</button>
          </div>
        </>
      )}

      {c && (
        <table className="calc">
          <tbody>
            <tr><td>Продолжительность t</td><td className="num">{c.minutes} мин</td></tr>
            <tr><td>Оплачиваемых часов N = ⌈(t − tб) / 60⌉</td><td className="num">{c.hours}</td></tr>
            <tr><td>Стоимость часа T</td><td className="num">{money(c.price_per_hour)}</td></tr>
            <tr><td>Без скидки N · T</td><td className="num">{money(c.base_cost)}</td></tr>
            <tr><td>Скидка d</td><td className="num">{c.discount_percent} %</td></tr>
            <tr><td>Со скидкой C</td><td className="num">{money(c.cost)}</td></tr>
            <tr><td>Прежняя задолженность D</td><td className="num">{money(c.previous_debt)}</td></tr>
            <tr className="total"><td>К оплате S = C + D</td><td className="num">{money(c.amount_due)}</td></tr>
          </tbody>
        </table>
      )}

      {c && !receipt && c.amount_due > 0 && (
        <>
          <div className="row">
            <label>Сумма, ₽
              <input type="number" step="0.01" min="0.01" value={payment.amount}
                     onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
            </label>
            <label>Способ
              <select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                <option value="CASH">Наличные</option>
                <option value="CARD">Карта</option>
              </select>
            </label>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Если внести меньше, остаток станет задолженностью клиента.</p>
          <div className="actions">
            <button onClick={onClose}>Без оплаты (в долг)</button>
            <button className="primary" disabled={busy || !(Number(payment.amount) > 0)} onClick={pay}>Принять оплату</button>
          </div>
        </>
      )}

      {c && c.amount_due === 0 && !receipt && (
        <div className="actions"><button className="primary" onClick={onClose}>Готово (бесплатно)</button></div>
      )}

      {receipt && (
        <div className="owner">
          <h3>Квитанция № {receipt.receipt_no}</h3>
          Принято: <b>{money(receipt.paid)}</b> ({METHOD_LABELS[receipt.method]})<br />
          {receipt.payments.map((p) => (
            <div key={p.id} className="muted">— стоянка № {p.session_id}: {money(p.amount)}</div>
          ))}
          Задолженность после оплаты: <b>{money(receipt.debt_after)}</b>
          <div className="actions"><button className="primary" onClick={onClose}>Закрыть</button></div>
        </div>
      )}
    </Dialog>
  );
}
