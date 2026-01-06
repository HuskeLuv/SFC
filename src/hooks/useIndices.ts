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

export const useIndices = (range: '1d' | '1mo' | '1y' = '1y'): UseIndicesResult => {
  const [indices, setIndices] = useState<IndexResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIndices = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/analises/indices?range=${range}`);
      
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
  }, [range]);

  return {
    indices,
    loading,
    error,
    refetch: fetchIndices,
  };
};


