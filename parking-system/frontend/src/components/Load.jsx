// Загрузка, ошибка (403 — отказ сервера в доступе) или данные
export default function Load({ state, children }) {
  if (state.error) return <div className="denied"><b>{state.error.status}</b> {state.error.message}</div>;
  if (!state.data) return <div className="empty">Загрузка…</div>;
  return children(state.data);
}
