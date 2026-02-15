import { useState, useEffect } from 'react';
import { IndexData } from './useIndices';

interface UseCarteiraHistoricoResult {
  data: IndexData[];
  loading: boolean;
  error: string | null;
}

export const useCarteiraHistorico = (
  startDate?: number,
  options?: { enabled?: boolean }
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

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        let url = '/api/analises/carteira-historico';
        if (startDate) {
          url += `?startDate=${startDate}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error('Erro ao buscar histórico da carteira');
        }

        const result = await response.json();
        setData(result.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [startDate, enabled]);

  return { data, loading, error };
};
