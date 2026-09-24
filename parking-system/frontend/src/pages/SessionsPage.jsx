import { useState } from 'react';
import { qs } from '../api';
import { useApi } from '../hooks';
import { dateTime, localToIso, METHOD_LABELS, money, PAYMENT_LABELS } from '../format';
import DataTable from '../components/DataTable';
import Dialog from '../components/Dialog';
import Load from '../components/Load';

const EMPTY = { plate: '', payment_status: '', active: '', from: '', to: '' };

// Поиск стоянок по комбинации критериев (ФТ-13, ФТ-14), по 20 строк на странице
export default function SessionsPage() {
  const [filters, setFilters] = useState(EMPTY);
  const [query, setQuery] = useState({ ...EMPTY, page: 1 });
  const [opened, setOpened] = useState(null);
  const state = useApi(`/api/sessions${qs({ ...query, from: localToIso(query.from), to: localToIso(query.to) })}`);

  const set = (name) => (e) => setFilters({ ...filters, [name]: e.target.value });
  const search = (e) => { e.preventDefault(); setQuery({ ...filters, page: 1 }); };

  return (
    <section className="card">
      <h2>Поиск стоянок</h2>
      <form className="row" onSubmit={search} style={{ marginBottom: 12 }}>
        <label>Госномер или его часть<input value={filters.plate} onChange={set('plate')} placeholder="а123" /></label>
        <label>Статус оплаты
          <select value={filters.payment_status} onChange={set('payment_status')}>
            <option value="">Любой</option>
            {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Состояние
          <select value={filters.active} onChange={set('active')}>
            <option value="">Все</option>
            <option value="true">На стоянке</option>
            <option value="false">Завершённые</option>
          </select>
        </label>
        <label>Въезд с<input type="datetime-local" value={filters.from} onChange={set('from')} /></label>
        <label>Въезд по<input type="datetime-local" value={filters.to} onChange={set('to')} /></label>
        <button className="primary">Найти</button>
        <button type="button" onClick={() => { setFilters(EMPTY); setQuery({ ...EMPTY, page: 1 }); }}>Сбросить</button>
      </form>

      <Load state={state}>
        {(rows) => (
          <>
            <DataTable
              rows={rows}
              onRowClick={setOpened}
              empty="Ничего не найдено"
              columns={[
                { key: 'id', label: '№' },
                { key: 'plate', label: 'Госномер' },
                { key: 'entry_time', label: 'Въезд', render: (r) => dateTime(r.entry_time) },
                { key: 'exit_time', label: 'Выезд', render: (r) => (r.exit_time ? dateTime(r.exit_time) : <span className="badge">на стоянке</span>) },
                { key: 'discount_percent', label: 'Скидка', num: true, render: (r) => `${r.discount_percent} %` },
                { key: 'cost', label: 'Стоимость', num: true, render: (r) => money(r.cost) },
                { key: 'payment_status', label: 'Оплата', render: (r) => <span className={`badge ${r.payment_status}`}>{PAYMENT_LABELS[r.payment_status]}</span> },
              ]}
            />
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button disabled={query.page === 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>← Назад</button>
              <span className="muted">Страница {query.page}</span>
              <button disabled={rows.length < 20} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Вперёд →</button>
            </div>
          </>
        )}
      </Load>

      {opened && <SessionDialog id={opened.id} onClose={() => setOpened(null)} />}
    </section>
  );
}

function SessionDialog({ id, onClose }) {
  const state = useApi(`/api/sessions/${id}`);
  return (
    <Dialog title={`Стоянка № ${id}`} onClose={onClose}>
      <Load state={state}>
        {(s) => (
          <>
            <table className="calc">
              <tbody>
                <tr><td>Госномер</td><td>{s.plate}</td></tr>
                <tr><td>Въезд / выезд</td><td>{dateTime(s.entry_time)} — {dateTime(s.exit_time)}</td></tr>
                <tr><td>Стоимость (скидка {s.discount_percent} %)</td><td>{money(s.cost)}</td></tr>
                <tr><td>Статус оплаты</td><td><span className={`badge ${s.payment_status}`}>{PAYMENT_LABELS[s.payment_status]}</span></td></tr>
              </tbody>
            </table>
            <h3>Оплаты</h3>
            <DataTable
              rows={s.payments}
              empty="Оплат нет"
              columns={[
                { key: 'paid_at', label: 'Дата', render: (p) => dateTime(p.paid_at) },
                { key: 'amount', label: 'Сумма', num: true, render: (p) => money(p.amount) },
                { key: 'method', label: 'Способ', render: (p) => METHOD_LABELS[p.method] },
              ]}
            />
          </>
        )}
      </Load>
    </Dialog>
  );
}
