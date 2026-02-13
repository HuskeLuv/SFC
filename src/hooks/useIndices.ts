import { useState, useEffect } from 'react';

export interface IndexData {
  date: number;
  value: number;
}

export interface IndexResponse {
  symbol: string;
  name: string;
  data: IndexData[];
}

interface UseIndicesResult {
  indices: IndexResponse[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useIndices = (range: '1d' | '1mo' | '1y' | '2y' = '1y', startDate?: number): UseIndicesResult => {
  const [indices, setIndices] = useState<IndexResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIndices = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let url = `/api/analises/indices?range=${range}`;
      if (startDate) {
        url += `&startDate=${startDate}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Erro ao buscar dados de índices');
      }
      
      const data = await response.json();
      setIndices(data.indices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setIndices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchIndices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, startDate]);

  return {
    indices,
    loading,
    error,
    refetch: fetchIndices,
  };
};


