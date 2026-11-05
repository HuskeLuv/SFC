'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { IRPlanoPrevidencia } from '@/hooks/useIR';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Simulação da aba PGBL do IR, salva no servidor por ano (ticket 86e2xnyrg): os campos digitados
 * e, por plano de previdência da carteira, o tipo (PGBL × VGBL) e o regime de tributação.
 *
 * A carteira não grava o tipo (o fundo de previdência do catálogo CVM serve aos dois); sem
 * marcação, vale o palpite pelo nome. O cache do React Query é a fonte da verdade na tela (as abas
 * PGBL e Resumo Anual leem o mesmo); cada mudança agenda um PUT com o estado mais recente.
 *
 * Até 05/11/2026 a marcação ficava no localStorage: na primeira carga sem nada salvo no servidor,
 * ela é levada para lá (e a chave local é apagada depois que o servidor confirma).
 */

export type TipoPlanoMarcado = 'pgbl' | 'vgbl';
export type RegimeTributacao = 'progressivo' | 'regressivo';

export interface PlanoMarcado {
  tipo?: TipoPlanoMarcado;
  regime?: RegimeTributacao;
}

export interface SimulacaoPgbl {
  ano: number;
  campos: Record<string, string>;
  planos: Record<string, PlanoMarcado>;
  salvoEm: string | null;
}

const CHAVE_LEGADA = 'mf-ir-pgbl-planos';
const ATRASO_SALVAR_MS = 800;

function lerLegado(): Record<string, PlanoMarcado> {
  try {
    const bruto = window.localStorage.getItem(CHAVE_LEGADA);
    if (!bruto) return {};
    const obj = JSON.parse(bruto) as Record<string, unknown>;
    const out: Record<string, PlanoMarcado> = {};
    for (const [k, v] of Object.entries(obj))
      if (v === 'pgbl' || v === 'vgbl') out[k] = { tipo: v };
    return out;
  } catch {
    return {};
  }
}

function apagarLegado() {
  try {
    window.localStorage.removeItem(CHAVE_LEGADA);
  } catch {
    // sem storage: nada a apagar
  }
}

/** Um timer por ano: várias mudanças seguidas viram um PUT só, com o estado mais recente. */
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export type EstadoSalvamento = 'ocioso' | 'salvando' | 'salvo' | 'erro';

export function useSimulacaoPgbl(ano: number) {
  const queryClient = useQueryClient();
  const { csrfFetch } = useCsrf();
  const key = queryKeys.irSimulacaoPgbl(ano);
  const [estado, setEstado] = useState<EstadoSalvamento>('ocioso');
  const migrou = useRef(false);

  const query = useQuery<SimulacaoPgbl>({
    queryKey: key,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/analises/ir-pgbl/simulacao?ano=${ano}`, {
        credentials: 'include',
        signal,
      });
      if (!res.ok) throw new Error('Erro ao carregar a simulação salva');
      return (await res.json()) as SimulacaoPgbl;
    },
  });

  const salvar = useCallback(
    (qc: QueryClient, apagarLegadoDepois = false) => {
      const atual = timers.get(ano);
      if (atual) clearTimeout(atual);
      timers.set(
        ano,
        setTimeout(async () => {
          timers.delete(ano);
          const dados = qc.getQueryData<SimulacaoPgbl>(queryKeys.irSimulacaoPgbl(ano));
          if (!dados) return;
          setEstado('salvando');
          try {
            const res = await csrfFetch('/api/analises/ir-pgbl/simulacao', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ano, campos: dados.campos, planos: dados.planos }),
            });
            if (!res.ok) throw new Error();
            const { salvoEm } = (await res.json()) as { salvoEm: string };
            qc.setQueryData<SimulacaoPgbl>(queryKeys.irSimulacaoPgbl(ano), (d) =>
              d ? { ...d, salvoEm } : d,
            );
            if (apagarLegadoDepois) apagarLegado();
            setEstado('salvo');
          } catch {
            setEstado('erro');
          }
        }, ATRASO_SALVAR_MS),
      );
    },
    [ano, csrfFetch],
  );

  const atualizar = useCallback(
    (fn: (d: SimulacaoPgbl) => SimulacaoPgbl) => {
      queryClient.setQueryData<SimulacaoPgbl>(key, (d) =>
        fn(d ?? { ano, campos: {}, planos: {}, salvoEm: null }),
      );
      salvar(queryClient);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` deriva de `ano`
    [queryClient, salvar, ano],
  );

  // Migração única do localStorage (marcação antiga) quando o servidor ainda não tem planos.
  useEffect(() => {
    if (migrou.current || !query.data) return;
    migrou.current = true;
    if (Object.keys(query.data.planos).length > 0) return;
    const legado = lerLegado();
    if (Object.keys(legado).length === 0) return;
    queryClient.setQueryData<SimulacaoPgbl>(key, (d) => (d ? { ...d, planos: legado } : d));
    salvar(queryClient, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez por carga
  }, [query.data]);

  const planos = query.data?.planos ?? {};
  const marcas: Record<string, TipoPlanoMarcado> = {};
  for (const [id, p] of Object.entries(planos)) if (p.tipo) marcas[id] = p.tipo;

  return {
    carregando: query.isLoading,
    campos: query.data?.campos ?? {},
    planos,
    marcas,
    salvoEm: query.data?.salvoEm ?? null,
    estado,
    setCampo: (id: string, valor: string) =>
      atualizar((d) => ({ ...d, campos: { ...d.campos, [id]: valor } })),
    setCampos: (parcial: Record<string, string>) =>
      atualizar((d) => ({ ...d, campos: { ...d.campos, ...parcial } })),
    marcar: (assetId: string, tipo: TipoPlanoMarcado) =>
      atualizar((d) => ({
        ...d,
        planos: { ...d.planos, [assetId]: { ...d.planos[assetId], tipo } },
      })),
    marcarRegime: (assetId: string, regime: RegimeTributacao) =>
      atualizar((d) => ({
        ...d,
        planos: { ...d.planos, [assetId]: { ...d.planos[assetId], regime } },
      })),
  };
}

/** Compatível com o uso antigo (Resumo Anual): só o tipo de cada plano. */
export function usePlanosMarcados(ano: number) {
  const { marcas, marcar } = useSimulacaoPgbl(ano);
  return { marcas, marcar };
}

/** Tipo efetivo: a marcação do usuário, senão o palpite pelo nome (null = não sabemos). */
export function tipoDoPlano(
  plano: IRPlanoPrevidencia,
  marcas: Record<string, TipoPlanoMarcado>,
): TipoPlanoMarcado | null {
  return marcas[plano.assetId] ?? plano.tipoSugerido;
}
