import { useState, useEffect, useCallback, useRef } from 'react';

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

export const useIndices = (
  range: '1d' | '1mo' | '1y' | '2y' = '1y',
  startDate?: number,
): UseIndicesResult => {
  const [indices, setIndices] = useState<IndexResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchIndices = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      let url = `/api/analises/indices?range=${range}`;
      if (startDate) {
        url += `&startDate=${startDate}`;
      }

      const response = await fetch(url, { signal: controller.signal });

      if (controller.signal.aborted) return;

      if (!response.ok) {
        throw new Error('Erro ao buscar dados de índices');
      }

      const data = await response.json();
      if (controller.signal.aborted) return;
      setIndices(data.indices || []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setIndices([]);
    } finally {
      setLoading(false);
    }
  }, [range, startDate]);

  useEffect(() => {
    void fetchIndices();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchIndices]);

  return {
    indices,
    loading,
    error,
    refetch: fetchIndices,
  };
};
