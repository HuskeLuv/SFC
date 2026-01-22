import { useCallback, useEffect, useRef, useState } from "react";

export interface InstituicaoDistribuicaoItem {
  total: number;
  count: number;
  items: [];
}

export type InstituicaoDistribuicaoGrouped = Record<string, InstituicaoDistribuicaoItem>;

interface UseInstituicaoDistribuicaoResult {
  grouped: InstituicaoDistribuicaoGrouped;
  loading: boolean;
  error: string | null;
}

interface TipoResponse {
  success: boolean;
  tipos: Array<{ value: string; label: string }>;
}

interface InstituicaoResponse {
  success: boolean;
  instituicoes: Array<{ value: string; label: string }>;
}

interface AtivosResponse {
  success: boolean;
  assets: Array<{ totalInvested?: number | null }>;
}

export const useInstituicaoDistribuicao = (): UseInstituicaoDistribuicaoResult => {
  const [grouped, setGrouped] = useState<InstituicaoDistribuicaoGrouped>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchDistribuicao = useCallback(async () => {
    if (hasFetchedRef.current) {
      return;
    }

    setLoading(true);
    setError(null);
    hasFetchedRef.current = true;

    try {
      const tiposResponse = await fetch("/api/carteira/resgate/tipos");
      if (!tiposResponse.ok) {
        throw new Error("Erro ao buscar tipos de ativos");
      }

      const tiposData = (await tiposResponse.json()) as TipoResponse;
      const tipos = tiposData?.tipos || [];

      if (tipos.length === 0) {
        setGrouped({});
        setLoading(false);
        return;
      }

      const totalsByInstitution = new Map<string, number>();

      await Promise.all(
        tipos.map(async (tipo) => {
          const instResponse = await fetch(
            `/api/carteira/resgate/instituicoes?tipo=${encodeURIComponent(tipo.value)}&limit=200`
          );

          if (!instResponse.ok) {
            return;
          }

          const instData = (await instResponse.json()) as InstituicaoResponse;
          const instituicoes = instData?.instituicoes || [];

          await Promise.all(
            instituicoes.map(async (instituicao) => {
              const ativosResponse = await fetch(
                `/api/carteira/resgate/ativos?tipo=${encodeURIComponent(tipo.value)}&instituicaoId=${encodeURIComponent(
                  instituicao.value
                )}&limit=500`
              );

              if (!ativosResponse.ok) {
                return;
              }

              const ativosData = (await ativosResponse.json()) as AtivosResponse;
              const total = (ativosData.assets || []).reduce((sum, asset) => {
                return sum + (asset.totalInvested || 0);
              }, 0);

              if (total <= 0) {
                return;
              }

              totalsByInstitution.set(
                instituicao.label,
                (totalsByInstitution.get(instituicao.label) || 0) + total
              );
            })
          );
        })
      );

      const sortedEntries = Array.from(totalsByInstitution.entries()).sort((a, b) => b[1] - a[1]);
      const groupedData = sortedEntries.reduce<InstituicaoDistribuicaoGrouped>((acc, [label, total]) => {
        acc[label] = {
          total,
          count: 0,
          items: [],
        };
        return acc;
      }, {});

      setGrouped(groupedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar instituições");
      setGrouped({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDistribuicao();
  }, [fetchDistribuicao]);

  return { grouped, loading, error };
};
