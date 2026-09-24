import CrudPanel from '../components/CrudPanel';
import { dateTime, money, SPOT_LABELS } from '../format';

// Справочники: читают сотрудники, изменяет только администратор (ФТ-17)
export default function ReferencePage() {
  return (
    <>
      <CrudPanel
        title="Тарифы"
        entity="Тариф"
        path="/api/tariffs"
        columns={[
          { key: 'name', label: 'Название' },
          { key: 'price_per_hour', label: 'Цена часа', num: true, render: (r) => money(r.price_per_hour) },
          { key: 'free_minutes', label: 'Бесплатно, мин', num: true },
          { key: 'valid_from', label: 'Действует с', render: (r) => dateTime(r.valid_from) },
          { key: 'is_active', label: 'Активен', render: (r) => (r.is_active ? 'да' : 'нет') },
        ]}
        fields={[
          { name: 'name', label: 'Название', required: true },
          { name: 'price_per_hour', label: 'Цена часа, ₽', type: 'number', required: true },
          { name: 'free_minutes', label: 'Бесплатные минуты', type: 'integer' },
          { name: 'valid_from', label: 'Действует с (новые стоянки)', type: 'datetime' },
          { name: 'is_active', label: 'Активен', type: 'checkbox' },
        ]}
      />
      <CrudPanel
        title="Скидки"
        entity="Скидка"
        path="/api/discounts"
        columns={[
          { key: 'name', label: 'Название' },
          { key: 'percent', label: 'Процент', num: true, render: (r) => `${r.percent} %` },
          { key: 'condition', label: 'Условие' },
        ]}
        fields={[
          { name: 'name', label: 'Название', required: true },
          { name: 'percent', label: 'Процент', type: 'number', required: true },
          { name: 'condition', label: 'Условие', nullable: true },
        ]}
      />
      <CrudPanel
        title="Парковочные места"
        entity="Место"
        path="/api/spots"
        columns={[
          { key: 'number', label: 'Номер' },
          { key: 'zone', label: 'Зона' },
          { key: 'status', label: 'Статус', render: (r) => <span className={`badge ${r.status}`}>{SPOT_LABELS[r.status]}</span> },
        ]}
        fields={[
          { name: 'number', label: 'Номер', type: 'integer', required: true },
          { name: 'zone', label: 'Зона', required: true },
        ]}
      />
    </>
  );
}
