import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(() => {});

// Всплывающие уведомления; ошибки API показываются с кодом ответа (например, 403)
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((text, error) => {
    const id = Math.random();
    setToasts((list) => [...list, { id, text, error }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>
            {t.error && <b>{t.error.status}</b>}{t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useNotify() {
  const notify = useContext(ToastContext);
  return { ok: (text) => notify(text), error: (err) => notify(err.message, err) };
}
