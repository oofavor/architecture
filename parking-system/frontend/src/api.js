// Единая точка обращения к REST API микросервисов (через прокси nginx / Vite)

const STORAGE_KEY = 'parking.session';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const session = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  },
  set(value) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* приватный режим */ }
  },
  clear() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* приватный режим */ }
  },
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body } = {}) {
  const token = session.get()?.token;
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    // Токен истёк или недействителен — возвращаем пользователя на экран входа
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data?.error ?? res.statusText);
  }
  return data;
}

// Строка запроса без пустых параметров
export function qs(params) {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ).toString();
  return search ? `?${search}` : '';
}
