import { useState } from 'react';
import Dialog from './Dialog';
import { useNotify } from './Toasts';

/**
 * Форма по описанию полей: [{ name, label, type: 'text'|'number'|'password'|'select', options?, required? }].
 * При изменении записи пустые поля не отправляются (например, пароль).
 */
export default function FormDialog({ title, fields, initial = {}, onSubmit, onClose }) {
  const notify = useNotify();
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [
    f.name,
    f.type === 'password' ? '' : String(initial[f.name] ?? f.options?.[0] ?? ''),
  ])));

  async function submit(e) {
    e.preventDefault();
    const body = {};
    for (const f of fields) {
      if (values[f.name] === '') continue;
      body[f.name] = f.type === 'number' ? Number(values[f.name]) : values[f.name];
    }
    try {
      await onSubmit(body);
      onClose();
    } catch (err) {
      notify.error(err);
    }
  }

  const editing = initial.id !== undefined;
  return (
    <Dialog title={title} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.type === 'select' ? (
              <select value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.type ?? 'text'}
                step={f.type === 'number' ? 'any' : undefined}
                value={values[f.name]}
                required={f.required && !(editing && f.type === 'password')}
                placeholder={editing && f.type === 'password' ? 'не менять' : undefined}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              />
            )}
          </label>
        ))}
        <div className="actions">
          <button type="button" onClick={onClose}>Отмена</button>
          <button className="primary">{editing ? 'Сохранить' : 'Создать'}</button>
        </div>
      </form>
    </Dialog>
  );
}
