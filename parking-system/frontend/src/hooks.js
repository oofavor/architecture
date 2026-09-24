import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// Загрузка данных с сервера: { data, error, loading, reload }
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const reload = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await api(path), error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
  }, [path]);

  useEffect(() => { reload(); }, [reload]);

  return { ...state, reload };
}
