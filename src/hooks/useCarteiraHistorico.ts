import { useState, useEffect } from 'react';
import { IndexData } from './useIndices';

interface UseCarteiraHistoricoResult {
  data: IndexData[];
  loading: boolean;
  error: string | null;
}

export const useCarteiraHistorico = (startDate?: number): UseCarteiraHistoricoResult => {
  const [data, setData] = useState<IndexData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [startDate]);

  return { data, loading, error };
};
