import { useState } from 'react';
import { api, qs } from '../api';
import { useApi } from '../hooks';
import { money } from '../format';
import DataTable from '../components/DataTable';
import Dialog from '../components/Dialog';
import FormDialog from '../components/FormDialog';
import Load from '../components/Load';
import { useNotify } from '../components/Toasts';

const carFields = [
  { name: 'plate', label: 'Госномер', required: true },
  { name: 'brand', label: 'Марка', required: true },
  { name: 'model', label: 'Модель', nullable: true },
  { name: 'color', label: 'Цвет', nullable: true },
];

// Учёт клиентов и автомобилей (ФТ-4, ФТ-5) — данные clients-service
export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const clients = useApi(`/api/clients${qs({ full_name: query })}`);
  const discounts = useApi('/api/discounts');
  const notify = useNotify();
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState(null);

  const discountName = Object.fromEntries((discounts.data ?? []).map((d) => [d.id, `${d.name} (${d.percent} %)`]));
  const clientFields = [
    { name: 'full_name', label: 'ФИО', required: true },
    { name: 'phone', label: 'Телефон', required: true },
    { name: 'document', label: 'Документ', nullable: true },
    { name: 'is_regular', label: 'Постоянный клиент', type: 'checkbox' },
    {
      name: 'discount_id', label: 'Скидка', type: 'select', valueType: 'integer', nullable: true,
      options: (discounts.data ?? []).map((d) => ({ value: d.id, label: discountName[d.id] })),
    },
  ];

  async function create(body) {
    const client = await api('/api/clients', { method: 'POST', body });
    notify.ok(`Клиент «${client.full_name}» создан`);
    clients.reload();
    setOpened(client);
  }

  return (
    <section className="card">
      <div className="head">
        <h2>Клиенты</h2>
        <button className="primary" onClick={() => setCreating(true)}>Новый клиент</button>
      </div>
      <form className="row" style={{ marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
        <label>Поиск по ФИО<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="петров" /></label>
        <button className="primary">Найти</button>
      </form>
      <Load state={clients}>
        {(rows) => (
          <DataTable
            rows={rows}
            onRowClick={setOpened}
            empty="Клиенты не найдены"
            columns={[
              { key: 'id', label: '№' },
              { key: 'full_name', label: 'ФИО' },
              { key: 'phone', label: 'Телефон' },
              { key: 'is_regular', label: 'Постоянный', render: (r) => (r.is_regular ? 'да' : 'нет') },
              { key: 'discount_id', label: 'Скидка', render: (r) => discountName[r.discount_id] ?? '—' },
            ]}
          />
        )}
      </Load>

      {creating && <FormDialog title="Новый клиент" fields={clientFields} onSubmit={create} onClose={() => setCreating(false)} />}
      {opened && (
        <ClientDialog
          client={opened}
          fields={clientFields}
          discountName={discountName}
          onChanged={clients.reload}
          onClose={() => setOpened(null)}
        />
      )}
    </section>
  );
}

function ClientDialog({ client: initial, fields, discountName, onChanged, onClose }) {
  const notify = useNotify();
  const [client, setClient] = useState(initial);
  const [form, setForm] = useState(null); // 'client' | 'car'
  const cars = useApi(`/api/cars?client_id=${client.id}`);
  const debt = useApi(`/api/clients/${client.id}/debt`);

  async function update(body) {
    setClient(await api(`/api/clients/${client.id}`, { method: 'PUT', body }));
    notify.ok('Изменения сохранены');
    onChanged();
  }

  async function addCar(body) {
    const car = await api('/api/cars', { method: 'POST', body: { ...body, client_id: client.id } });
    notify.ok(`Автомобиль ${car.plate} зарегистрирован`);
    cars.reload();
  }

  async function remove(path, done) {
    if (!confirm('Удалить запись?')) return;
    try {
      await api(path, { method: 'DELETE' });
      notify.ok('Запись удалена');
      done();
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <Dialog title={client.full_name} onClose={onClose}>
      <table className="calc">
        <tbody>
          <tr><td>Телефон</td><td>{client.phone}</td></tr>
          <tr><td>Документ</td><td>{client.document ?? '—'}</td></tr>
          <tr><td>Постоянный клиент</td><td>{client.is_regular ? 'да' : 'нет'}</td></tr>
          <tr><td>Скидка</td><td>{discountName[client.discount_id] ?? 'нет'}</td></tr>
          <tr><td>Задолженность <span className="muted">(parking-service)</span></td>
              <td><Load state={debt}>{(d) => <b>{money(d.debt)}</b>}</Load></td></tr>
        </tbody>
      </table>
      <div className="actions">
        <button className="danger" onClick={() => remove(`/api/clients/${client.id}`, () => { onChanged(); onClose(); })}>Удалить клиента</button>
        <button onClick={() => setForm('client')}>Изменить</button>
      </div>

      <div className="head" style={{ marginBottom: 0 }}>
        <h3 style={{ margin: 0 }}>Автомобили</h3>
        <button onClick={() => setForm('car')}>Добавить автомобиль</button>
      </div>
      <Load state={cars}>
        {(rows) => (
          <DataTable
            rows={rows}
            empty="Автомобилей нет"
            columns={[
              { key: 'plate', label: 'Госномер' },
              { key: 'brand', label: 'Марка', render: (c) => `${c.brand} ${c.model ?? ''}` },
              { key: 'color', label: 'Цвет' },
            ]}
            actions={(car) => <button className="danger" onClick={() => remove(`/api/cars/${car.id}`, cars.reload)}>Удалить</button>}
          />
        )}
      </Load>

      {form === 'client' && <FormDialog title="Изменение клиента" fields={fields} initial={client} onSubmit={update} onClose={() => setForm(null)} />}
      {form === 'car' && <FormDialog title="Новый автомобиль" fields={carFields} onSubmit={addCar} onClose={() => setForm(null)} />}
    </Dialog>
  );
}
