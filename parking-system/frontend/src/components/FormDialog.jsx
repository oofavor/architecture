import { useState } from 'react';
import Dialog from './Dialog';
import { useNotify } from './Toasts';
import { isoToLocal, localToIso } from '../format';

/**
 * Универсальная форма создания/редактирования записи.
 * fields = [{ name, label, type: 'text'|'number'|'integer'|'checkbox'|'select'|'datetime'|'password',
 *             required?, options?: [{ value, label }], nullable? }]
 * При редактировании пустые поля не отправляются (например, пароль).
 */
export default function FormDialog({ title, fields, initial = {}, onSubmit, onClose }) {
  const notify = useNotify();
  const isEdit = initial.id !== undefined;
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, toInput(f, initial[f.name])])));
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const body = {};
    for (const f of fields) {
      const value = fromInput(f, values[f.name]);
      if (value === undefined && !f.nullable) continue;
      body[f.name] = value ?? null;
    }
    setBusy(true);
    try {
      await onSubmit(body);
      onClose();
    } catch (err) {
      notify.error(err);
    } finally {
      setBusy(false);
    }
  }

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  return (
    <Dialog title={title} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {fields.map((f) => (
          f.type === 'checkbox' ? (
            <label key={f.name} className="check">
              <input type="checkbox" checked={values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
              {f.label}
            </label>
          ) : (
            <label key={f.name}>
              {f.label}{f.required && !(isEdit && f.type === 'password') ? ' *' : ''}
              {f.type === 'select' ? (
                <select value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} required={f.required}>
                  {!f.required && <option value="">— не выбрано —</option>}
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  type={{ integer: 'number', datetime: 'datetime-local' }[f.type] ?? f.type ?? 'text'}
                  step={f.type === 'number' ? '0.01' : undefined}
                  value={values[f.name]}
                  required={f.required && !(isEdit && f.type === 'password')}
                  placeholder={isEdit && f.type === 'password' ? 'не менять' : undefined}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
            </label>
          )
        ))}
        <div className="actions">
          <button type="button" onClick={onClose}>Отмена</button>
          <button className="primary" disabled={busy}>{isEdit ? 'Сохранить' : 'Создать'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function toInput(field, value) {
  if (field.type === 'checkbox') return Boolean(value);
  if (field.type === 'datetime') return isoToLocal(value);
  if (field.type === 'password') return '';
  return value === null || value === undefined ? '' : String(value);
}

function fromInput(field, value) {
  if (field.type === 'checkbox') return value;
  if (value === '') return undefined;
  if (field.type === 'number') return Number(value);
  if (field.type === 'integer' || field.valueType === 'integer') return Number.parseInt(value, 10);
  if (field.type === 'datetime') return localToIso(value);
  return value;
}
