import { useApi } from '../hooks';
import { dateTime, money, PAYMENT_LABELS } from '../format';
import DataTable from '../components/DataTable';
import Load from '../components/Load';

// Личный кабинет владельца автомобиля (ФТ-20): сервер возвращает только его собственные данные
export default function CabinetPage() {
  const state = useApi('/api/my/sessions');
  return (
    <Load state={state}>
      {({ debt, sessions }) => (
        <>
          <section className="card stat">
            <div><div className="muted">Текущая задолженность</div><div className="big" style={{ color: debt > 0 ? 'var(--busy)' : 'var(--free)' }}>{money(debt)}</div></div>
            <div><div className="muted">Всего стоянок</div><div className="big">{sessions.length}</div></div>
          </section>
          <section className="card">
            <h2>История стоянок</h2>
            <DataTable
              rows={sessions}
              empty="Стоянок пока нет"
              columns={[
                { key: 'plate', label: 'Госномер' },
                { key: 'entry_time', label: 'Въезд', render: (r) => dateTime(r.entry_time) },
                { key: 'exit_time', label: 'Выезд', render: (r) => (r.exit_time ? dateTime(r.exit_time) : <span className="badge">на стоянке</span>) },
                { key: 'discount_percent', label: 'Скидка', num: true, render: (r) => `${r.discount_percent} %` },
                { key: 'cost', label: 'Стоимость', num: true, render: (r) => money(r.cost) },
                { key: 'payment_status', label: 'Оплата', render: (r) => <span className={`badge ${r.payment_status}`}>{PAYMENT_LABELS[r.payment_status]}</span> },
              ]}
            />
          </section>
        </>
      )}
    </Load>
  );
}
