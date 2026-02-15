import { useState, useEffect } from "react";
import { IndexData } from "./useIndices";

interface UseRentabilidadePeriodoResult {
  data: IndexData[];
  loading: boolean;
  error: string | null;
}

/**
 * Busca TWR recalculado para o período (primeiro ponto = 0%).
 * Usa /api/carteira/resumo?twrStartDate=X que recalcula desde o início do período.
 */
export const useRentabilidadePeriodo = (
  startDate: number | undefined,
  options?: { enabled?: boolean }
): UseRentabilidadePeriodoResult => {
  const enabled = options?.enabled !== false && Number.isFinite(startDate) && (startDate ?? 0) > 0;
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
        const url = `/api/carteira/resumo?twrStartDate=${startDate}`;
        const response = await fetch(url, { credentials: "include" });

        if (!response.ok) {
          throw new Error("Erro ao buscar rentabilidade do período");
        }

        const result = await response.json();
        const twr = result.historicoTWRPeriodo;
        setData(
          Array.isArray(twr)
            ? twr.map((t: { data: number; value: number }) => ({ date: t.data, value: t.value }))
            : []
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [startDate, enabled]);

  return { data, loading, error };
};
