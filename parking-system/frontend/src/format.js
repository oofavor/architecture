const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const moneyFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dateTime = (value) => (value ? dateTimeFormat.format(new Date(value)) : '—');
export const money = (value) => (value === null || value === undefined ? '—' : `${moneyFormat.format(value)} ₽`);
// Значение поля datetime-local -> ISO-строка
export const localToIso = (value) => (value ? new Date(value).toISOString() : undefined);
export const ROLE_LABELS = { ADMIN: 'Администратор', OPERATOR: 'Оператор' };
