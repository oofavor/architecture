// Таблица: columns = [[ключ, заголовок, render?]]
export default function Table({ columns, rows, actions, onRowClick }) {
  if (!rows.length) return <div className="empty">Нет данных</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}{actions && <th />}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={onRowClick ? 'clickable' : undefined} onClick={() => onRowClick?.(row)}>
              {columns.map(([key, , render]) => <td key={key}>{render ? render(row) : String(row[key] ?? '—')}</td>)}
              {actions && <td className="actions-cell" onClick={(e) => e.stopPropagation()}>{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
