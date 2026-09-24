import { useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import { money } from '../format';
import Dialog from '../components/Dialog';
import FormDialog from '../components/FormDialog';
import Load from '../components/Load';
import Table from '../components/Table';
import { useNotify } from '../components/Toasts';

const CLIENT_FIELDS = [
  { name: 'full_name', label: 'ФИО', required: true },
  { name: 'phone', label: 'Телефон', required: true },
  { name: 'discount_percent', label: 'Скидка, %', type: 'number' },
];

// Клиенты и их автомобили (данные clients-service)
export default function ClientsPage() {
  const [query, setQuery] = useState('');
  const clients = useApi(`/api/clients?full_name=${encodeURIComponent(query)}`);
  const [editing, setEditing] = useState(null);
  const [opened, setOpened] = useState(null);

  async function save(body) {
    await api(editing.id ? `/api/clients/${editing.id}` : '/api/clients', { method: editing.id ? 'PUT' : 'POST', body });
    clients.reload();
  }

  return (
    <section className="card">
      <div className="head">
        <h2>Клиенты</h2>
        <button className="primary" onClick={() => setEditing({})}>Новый клиент</button>
      </div>
      <input placeholder="Поиск по ФИО" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
      <Load state={clients}>
        {(rows) => (
          <Table
            rows={rows}
            onRowClick={setOpened}
            columns={[['full_name', 'ФИО'], ['phone', 'Телефон'], ['discount_percent', 'Скидка', (r) => `${r.discount_percent} %`]]}
            actions={(row) => <button onClick={() => setEditing(row)}>Изменить</button>}
          />
        )}
      </Load>
      {editing && <FormDialog title="Клиент" fields={CLIENT_FIELDS} initial={editing} onSubmit={save} onClose={() => setEditing(null)} />}
      {opened && <CarsDialog client={opened} onClose={() => setOpened(null)} />}
    </section>
  );
}

function CarsDialog({ client, onClose }) {
  const notify = useNotify();
  const cars = useApi(`/api/cars?client_id=${client.id}`);
  const debt = useApi(`/api/clients/${client.id}/debt`);
  const [form, setForm] = useState({ plate: '', brand: '' });

  async function addCar(e) {
    e.preventDefault();
    try {
      await api('/api/cars', { method: 'POST', body: { ...form, client_id: client.id } });
      setForm({ plate: '', brand: '' });
      cars.reload();
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <Dialog title={client.full_name} onClose={onClose}>
      <div>Задолженность: <Load state={debt}>{(d) => <b>{money(d.debt)}</b>}</Load></div>
      <Load state={cars}>{(rows) => <Table rows={rows} columns={[['plate', 'Госномер'], ['brand', 'Марка']]} />}</Load>
      <form className="row" onSubmit={addCar}>
        <label>Госномер<input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} required /></label>
        <label>Марка<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required /></label>
        <button className="primary">Добавить</button>
      </form>
    </Dialog>
  );
}
