import { useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import DataTable from './DataTable';
import FormDialog from './FormDialog';
import Load from './Load';
import { useNotify } from './Toasts';

/**
 * Типовой CRUD-раздел: список, создание, изменение, удаление.
 * Кнопки показываются всем сотрудникам — права проверяет сервер,
 * поэтому попытка оператора изменить справочник завершится ответом 403.
 */
export default function CrudPanel({ title, path, columns, fields, entity }) {
  const state = useApi(path);
  const notify = useNotify();
  const [editing, setEditing] = useState(null); // {} — создание, запись — изменение

  async function save(body) {
    if (editing.id === undefined) await api(path, { method: 'POST', body });
    else await api(`${path}/${editing.id}`, { method: 'PUT', body });
    notify.ok(editing.id === undefined ? `${entity}: запись создана` : `${entity}: изменения сохранены`);
    state.reload();
  }

  async function remove(row) {
    if (!confirm(`Удалить запись «${row.name ?? row.full_name ?? row.number ?? row.id}»?`)) return;
    try {
      await api(`${path}/${row.id}`, { method: 'DELETE' });
      notify.ok(`${entity}: запись удалена`);
      state.reload();
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <section className="card">
      <div className="head">
        <h2>{title}</h2>
        <button className="primary" onClick={() => setEditing({})}>Добавить</button>
      </div>
      <Load state={state}>
        {(rows) => (
          <DataTable
            columns={columns}
            rows={rows}
            actions={(row) => (
              <>
                <button onClick={() => setEditing(row)}>Изменить</button>
                <button className="danger" onClick={() => remove(row)}>Удалить</button>
              </>
            )}
          />
        )}
      </Load>
      {editing && (
        <FormDialog
          title={editing.id === undefined ? `${entity}: создание` : `${entity}: изменение`}
          fields={fields}
          initial={editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
