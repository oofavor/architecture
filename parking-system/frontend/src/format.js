export const ROLE_LABELS = { ADMIN: 'Администратор', OPERATOR: 'Оператор', CLIENT: 'Владелец автомобиля' };
export const PAYMENT_LABELS = { UNPAID: 'Не оплачено', PARTIAL: 'Частично', PAID: 'Оплачено' };
export const METHOD_LABELS = { CASH: 'Наличные', CARD: 'Карта' };
export const SPOT_LABELS = { FREE: 'Свободно', OCCUPIED: 'Занято' };

const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const moneyFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dateTime = (value) => (value ? dateTimeFormat.format(new Date(value)) : '—');
export const money = (value) => (value === null || value === undefined ? '—' : `${moneyFormat.format(value)} ₽`);

export function duration(from, to = new Date()) {
  const minutes = Math.max(0, Math.round((new Date(to) - new Date(from)) / 60000));
  const h = Math.floor(minutes / 60);
  return h ? `${h} ч ${minutes % 60} мин` : `${minutes} мин`;
}

// Значение поля datetime-local -> ISO-строка (с учётом часового пояса браузера)
export const localToIso = (value) => (value ? new Date(value).toISOString() : undefined);

// ISO-строка -> значение поля datetime-local
export function isoToLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
