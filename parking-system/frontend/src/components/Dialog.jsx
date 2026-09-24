import { useEffect, useRef } from 'react';

// Модальное окно на основе нативного <dialog>
export default function Dialog({ title, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="dialog-body">
        <div className="head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
