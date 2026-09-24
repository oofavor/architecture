import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// Загрузка данных: { data, error, reload }
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null });
  const reload = useCallback(() => {
    api(path).then((data) => setState({ data, error: null }), (error) => setState({ data: null, error }));
  }, [path]);
  useEffect(reload, [reload]);
  return { ...state, reload };
}
