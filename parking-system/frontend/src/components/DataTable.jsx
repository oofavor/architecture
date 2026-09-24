// Таблица: columns = [{ key, label, num?, render?(row) }]
export default function DataTable({ columns, rows, onRowClick, actions, empty = 'Нет данных' }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} className={c.num ? 'num' : undefined}>{c.label}</th>)}
            {actions && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={onRowClick ? 'clickable' : undefined} onClick={onRowClick && (() => onRowClick(row))}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : undefined}>
                  {c.render ? c.render(row) : String(row[c.key] ?? '—')}
                </td>
              ))}
              {actions && <td className="actions-cell" onClick={(e) => e.stopPropagation()}>{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
