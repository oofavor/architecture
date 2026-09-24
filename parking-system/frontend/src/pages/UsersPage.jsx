import CrudPanel from '../components/CrudPanel';
import { dateTime, ROLE_LABELS } from '../format';

// Учётные записи (ФТ-18) — доступно только администратору; оператор увидит ответ 403
export default function UsersPage() {
  return (
    <CrudPanel
      title="Учётные записи"
      entity="Пользователь"
      path="/api/users"
      columns={[
        { key: 'login', label: 'Логин' },
        { key: 'full_name', label: 'ФИО' },
        { key: 'role', label: 'Роль', render: (r) => ROLE_LABELS[r.role] },
        { key: 'shift_number', label: 'Смена' },
        { key: 'is_blocked', label: 'Заблокирован', render: (r) => (r.is_blocked ? 'да' : 'нет') },
        { key: 'created_at', label: 'Создан', render: (r) => dateTime(r.created_at) },
      ]}
      fields={[
        { name: 'full_name', label: 'ФИО', required: true },
        { name: 'login', label: 'Логин', required: true },
        { name: 'password', label: 'Пароль', type: 'password', required: true },
        {
          name: 'role', label: 'Роль', type: 'select', required: true,
          options: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
        },
        { name: 'shift_number', label: 'Номер смены', type: 'integer', nullable: true },
        { name: 'client_id', label: 'ID клиента (для роли «Владелец»)', type: 'integer', nullable: true },
        { name: 'is_blocked', label: 'Заблокирован', type: 'checkbox' },
      ]}
    />
  );
}
