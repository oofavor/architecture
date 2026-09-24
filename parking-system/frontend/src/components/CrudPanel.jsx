import { useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import FormDialog from './FormDialog';
import Load from './Load';
import Table from './Table';
import { useNotify } from './Toasts';

// Типовой CRUD-раздел: список, создание, изменение, удаление (аналог crudRouter на сервере)
export default function CrudPanel({ title, path, columns, fields }) {
  const state = useApi(path);
  const notify = useNotify();
  const [editing, setEditing] = useState(null);

  async function save(body) {
    await api(editing.id ? `${path}/${editing.id}` : path, { method: editing.id ? 'PUT' : 'POST', body });
    notify.ok('Сохранено');
    state.reload();
  }

  async function remove(row) {
    if (!confirm('Удалить запись?')) return;
    try {
      await api(`${path}/${row.id}`, { method: 'DELETE' });
      state.reload();
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <section className="card">
      <div className="head"><h2>{title}</h2><button className="primary" onClick={() => setEditing({})}>Добавить</button></div>
      <Load state={state}>
        {(rows) => (
          <Table columns={columns} rows={rows} actions={(row) => (
            <>
              <button onClick={() => setEditing(row)}>Изменить</button>
              <button className="danger" onClick={() => remove(row)}>Удалить</button>
            </>
          )} />
        )}
      </Load>
      {editing && <FormDialog title={title} fields={fields} initial={editing} onSubmit={save} onClose={() => setEditing(null)} />}
    </section>
  );
}
