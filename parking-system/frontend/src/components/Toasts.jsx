import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((text, kind = 'ok', status) => {
    const id = Math.random();
    setToasts((list) => [...list, { id, text, kind, status }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.status && <b>{t.status}</b>}{t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// notify('текст') — успех; notify.error(err) — ошибка API с кодом ответа
export function useNotify() {
  const notify = useContext(ToastContext);
  return {
    ok: (text) => notify(text, 'ok'),
    error: (err) => notify(err.message, 'error', err.status),
  };
}
