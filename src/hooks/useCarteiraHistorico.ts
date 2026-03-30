import { useState, useEffect } from 'react';
import { IndexData } from './useIndices';

interface UseCarteiraHistoricoResult {
  data: IndexData[];
  loading: boolean;
  error: string | null;
}

export const useCarteiraHistorico = (
  startDate?: number,
  options?: { enabled?: boolean },
): UseCarteiraHistoricoResult => {
  const enabled = options?.enabled !== false;
  const [data, setData] = useState<IndexData[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setData([]);
      setError(null);
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        let url = '/api/analises/carteira-historico';
        if (startDate) {
          url += `?startDate=${startDate}`;
        }

        const response = await fetch(url, { signal: controller.signal });

        if (controller.signal.aborted) return;

        if (!response.ok) {
          throw new Error('Erro ao buscar histórico da carteira');
        }

        const result = await response.json();
        if (controller.signal.aborted) return;
        setData(result.data || []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
        setData([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      controller.abort();
    };
  }, [startDate, enabled]);

  return { data, loading, error };
};
