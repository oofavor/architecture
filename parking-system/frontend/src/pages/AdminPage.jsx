import CrudPanel from '../components/CrudPanel';
import { money, ROLE_LABELS } from '../format';

// Справочники и пользователи. Раздел виден и оператору: изменения запрещает сервер (403)
export default function AdminPage() {
  return (
    <>
      <CrudPanel
        title="Тарифы"
        path="/api/tariffs"
        columns={[['name', 'Название'], ['price_per_hour', 'Цена часа', (r) => money(r.price_per_hour)], ['free_minutes', 'Бесплатно, мин']]}
        fields={[
          { name: 'name', label: 'Название', required: true },
          { name: 'price_per_hour', label: 'Цена часа, ₽', type: 'number', required: true },
          { name: 'free_minutes', label: 'Бесплатные минуты', type: 'number' },
        ]}
      />
      <CrudPanel
        title="Пользователи"
        path="/api/users"
        columns={[['login', 'Логин'], ['full_name', 'ФИО'], ['role', 'Роль', (r) => ROLE_LABELS[r.role]]]}
        fields={[
          { name: 'full_name', label: 'ФИО', required: true },
          { name: 'login', label: 'Логин', required: true },
          { name: 'password', label: 'Пароль', type: 'password', required: true },
          { name: 'role', label: 'Роль', type: 'select', options: ['OPERATOR', 'ADMIN'] },
        ]}
      />
    </>
  );
}
