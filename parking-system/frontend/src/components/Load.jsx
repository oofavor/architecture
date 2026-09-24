// Отображение состояния загрузки: ожидание, ошибка (в т. ч. 403) или данные
export default function Load({ state, children }) {
  if (state.error) {
    return (
      <div className="denied">
        <b>{state.error.status}</b> {state.error.message}
        {state.error.status === 403 && <div className="muted">Сервер отклонил запрос: у вашей роли нет доступа к этой операции.</div>}
      </div>
    );
  }
  if (!state.data) return <div className="empty">Загрузка…</div>;
  return children(state.data);
}
