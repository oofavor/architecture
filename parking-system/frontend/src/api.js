// Обращение к REST API сервисов через прокси (nginx в Docker, Vite при разработке)
const KEY = 'parking.session';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const session = {
  get: () => JSON.parse(sessionStorage.getItem(KEY) ?? 'null'),
  set: (value) => sessionStorage.setItem(KEY, JSON.stringify(value)),
  clear: () => sessionStorage.removeItem(KEY),
};

export async function api(path, { method = 'GET', body } = {}) {
  const token = session.get()?.token;
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && token) {
    session.clear(); // токен истёк — на экран входа
    location.reload();
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText);
  return data;
}
