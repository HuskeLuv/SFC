/**
 * Estrutura das subcategorias no Orçamento v2 (R-12, desenho técnico §6.2/§6.3): adicionar,
 * renomear e excluir. Complementa `useOrcamentoV2` (orçado, fixa, prefs, copiar).
 *
 * - Adicionar e renomear usam as MESMAS rotas da Planilha (D11): `POST /api/cashflow/items` (o
 *   `createCashflowItem` do `useCashflowMutations`) e `PUT /api/cashflow/batch-update` com
 *   `updates[].name`. As guardas da PR 6 rodam lá (nome único/1–60 na categoria, Geral não
 *   renomeia, sub nova antes da Geral); a recusa parcial do batch-update vira erro aqui.
 *   Chamadas diretas, sem o `useCashflowMutations`, para não carregar a árvore da Planilha (e os
 *   investimentos) só para abrir o Orçamento.
 * - Excluir: `GET .../subcategorias/[itemId]/impacto` para a confirmação e
 *   `DELETE .../subcategorias/[itemId]` (fusão na Geral, 409 `cores_divergentes` com `meses`).
 *
 * No sucesso, o v2 é recarregado (e aguardado, para a linha nova aparecer antes de fechar o campo)
 * e a árvore da Planilha do ano é invalidada (mesmo item, D11).
 */
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { createCashflowItem } from '@/utils/cashflowUpdate';
import { ErroOrcamentoV2 } from '@/hooks/useOrcamentoV2';
import type { AnoMes } from '@/types/orcamentoV2';

/** Resposta do `GET .../impacto` (meses 1–12). */
export interface ImpactoExclusaoV2 {
  itemId: string;
  nome: string;
  /** Células do Fluxo (lançamentos) que passam para a Geral. */
  celulas: number;
  /** Transações do banco reatribuídas à Geral. */
  transacoes: number;
  /** Meses com orçado na subcategoria (fechados somam na Geral; corrente e futuros saem). */
  mesesComOrcado: number;
  /** Meses em que a célula da sub e a da Geral têm cores diferentes: a exclusão é recusada (Q5). */
  coresDivergentes: AnoMes[];
}

/** Resposta do `DELETE .../subcategorias/[itemId]`. */
export interface ExclusaoV2Resposta {
  celulasMovidas: number;
  celulasSomadas: number;
  transacoesMovidas: number;
}

export interface CriarSubcategoriaEntrada {
  categoriaId: string;
  nome: string;
}

export interface RenomearSubcategoriaEntrada {
  categoriaId: string;
  itemId: string;
  nome: string;
}

/** Erro da exclusão com os meses de cores divergentes (1–12), quando houver. */
export class ErroExclusaoV2 extends ErroOrcamentoV2 {
  constructor(
    message: string,
    status: number,
    codigo: string | undefined,
    public meses: AnoMes[],
  ) {
    super(message, status, codigo);
    this.name = 'ErroExclusaoV2';
  }
}

const BASE = '/api/cashflow/orcamento/v2/subcategorias';

/** `createCashflowItem` lança `Error(<corpo da resposta>)`: extrai o `error` do JSON, se houver. */
function mensagemDoCorpo(texto: string, padrao: string): string {
  try {
    const corpo = JSON.parse(texto) as { error?: unknown };
    if (typeof corpo?.error === 'string' && corpo.error) return corpo.error;
  } catch {
    // corpo não-JSON: usa o texto se for curto
  }
  return texto && texto.length <= 200 ? texto : padrao;
}

export function useOrcamentoV2Estrutura(ano: number) {
  const queryClient = useQueryClient();
  const { csrfFetch } = useCsrf();

  const recarregar = useCallback(async () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.year(ano) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.orcamento(ano) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.orcamentoV2Todos() });
  }, [queryClient, ano]);

  const buscarImpacto = useCallback(
    async (itemId: string, signal?: AbortSignal): Promise<ImpactoExclusaoV2> => {
      const res = await fetch(`${BASE}/${encodeURIComponent(itemId)}/impacto`, {
        credentials: 'include',
        signal,
      });
      const corpo = (await res.json().catch(() => null)) as
        | (ImpactoExclusaoV2 & { error?: string; codigo?: string })
        | null;
      if (!res.ok || !corpo) {
        throw new ErroOrcamentoV2(
          corpo?.error ?? 'Erro ao consultar a subcategoria',
          res.status,
          corpo?.codigo,
        );
      }
      return corpo;
    },
    [],
  );

  const criar = useMutation<{ id: string }, Error, CriarSubcategoriaEntrada>({
    mutationFn: async ({ categoriaId, nome }) => {
      try {
        return await createCashflowItem(categoriaId, nome);
      } catch (error: unknown) {
        const texto = error instanceof Error ? error.message : '';
        throw new Error(mensagemDoCorpo(texto, 'Erro ao adicionar a subcategoria'));
      }
    },
    onSuccess: recarregar,
  });

  const renomear = useMutation<void, Error, RenomearSubcategoriaEntrada>({
    mutationFn: async ({ categoriaId, itemId, nome }) => {
      const res = await csrfFetch('/api/cashflow/batch-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: categoriaId,
          year: ano,
          updates: [{ itemId, name: nome }],
          deletes: [],
        }),
      });
      const corpo = (await res.json().catch(() => null)) as {
        error?: string;
        results?: { success: boolean; error?: string }[];
      } | null;
      if (!res.ok) throw new Error(corpo?.error ?? 'Erro ao renomear a subcategoria');
      const recusa = corpo?.results?.find((r) => r.success === false);
      if (recusa) throw new Error(recusa.error ?? 'Não foi possível renomear a subcategoria');
    },
    onSuccess: recarregar,
  });

  const excluir = useMutation<ExclusaoV2Resposta, ErroExclusaoV2, { itemId: string }>({
    mutationFn: async ({ itemId }) => {
      const res = await csrfFetch(`${BASE}/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
      const corpo = (await res.json().catch(() => null)) as
        | (ExclusaoV2Resposta & { error?: string; codigo?: string; meses?: AnoMes[] })
        | null;
      if (!res.ok || !corpo) {
        throw new ErroExclusaoV2(
          corpo?.error ?? 'Erro ao excluir a subcategoria',
          res.status,
          corpo?.codigo,
          corpo?.meses ?? [],
        );
      }
      return corpo;
    },
    // A fusão move células de TODOS os anos da sub: o Fluxo inteiro (e o v2) recarrega.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all }),
  });

  return { buscarImpacto, criar, renomear, excluir };
}

export type UseOrcamentoV2Estrutura = ReturnType<typeof useOrcamentoV2Estrutura>;
