import { logger } from '@/lib/logger';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { formatBRL, formatPctSigned } from '@/utils/format';
import {
  postCaixaParaInvestir,
  postDistribuirCaixa,
  type CaixaSaveOptions,
  type DistribuirCaixaFn,
} from '@/lib/caixaParaInvestirClient';

export interface CarteiraResumo {
  saldoBruto: number;
  valorAplicado: number;
  rentabilidade: number;
  metaPatrimonio: number;
  /** Bolso TOTAL do caixa para investir (as reservas por aba são fatias dele). */
  caixaParaInvestir: number;
  /** Detalhe do bolso: reservado = Σ reservas das abas; livre = total − reservado. */
  caixa?: {
    total: number;
    reservado: number;
    livre: number;
    porAba: Record<string, number>;
    /** 'YYYY-MM-DD' desde quando os proventos pagos entram no caixa; null = desligado. */
    proventosDesde?: string | null;
  };
  /**
   * Denominadores únicos calculados no backend (dinheiro exclui imóveis).
   * dividas/patrimonioLiquido: passivo das dívidas ativas (saldo corrigido
   * pelo índice realizado) e patrimônio líquido = dinheiroMaisBens − dividas.
   */
  totais?: {
    dinheiro: number;
    dinheiroMaisBens: number;
    dividas?: number;
    patrimonioLiquido?: number;
  };
  historicoPatrimonio: Array<{
    data: number;
    valorAplicado: number;
    saldoBruto: number;
  }>;
  historicoTWR?: Array<{ data: number; value: number }>;
  historicoMWR?: Array<{ data: number; value: number }>;
  historicoTWRPeriodo?: Array<{ data: number; value: number }>;
  historicoMWRPeriodo?: Array<{ data: number; value: number }>;
  distribuicao: {
    reservaEmergencia: { valor: number; percentual: number };
    reservaOportunidade: { valor: number; percentual: number };
    rendaFixaFundos: { valor: number; percentual: number };
    fimFia: { valor: number; percentual: number };
    fiis: { valor: number; percentual: number };
    acoes: { valor: number; percentual: number };
    stocks: { valor: number; percentual: number };
    reits: { valor: number; percentual: number };
    etfs: { valor: number; percentual: number };
    moedasCriptos: { valor: number; percentual: number };
    previdenciaSeguros: { valor: number; percentual: number };
    opcoes: { valor: number; percentual: number };
    imoveisBens: { valor: number; percentual: number };
  };
  portfolioDetalhes: {
    totalAcoes: number;
    totalInvestimentos: number;
    stocksTotalInvested: number;
    stocksCurrentValue: number;
    otherInvestmentsTotalInvested: number;
    otherInvestmentsCurrentValue: number;
  };
}

export const useCarteira = () => {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.carteira.resumo();

  const {
    data: resumo = null,
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<CarteiraResumo>({
    queryKey,
    queryFn: async ({ signal }) => {
      // Progressive loading: fast summary first, then full data with history
      const responseFast = await fetch('/api/carteira/resumo?includeHistorico=false', {
        method: 'GET',
        credentials: 'include',
        signal,
      });

      if (!responseFast.ok) throw new Error('Erro ao carregar dados da carteira');

      const dataFast = await responseFast.json();

      // Set fast data immediately via cache, then fetch full data
      queryClient.setQueryData<CarteiraResumo>(queryKey, dataFast);

      // Background: full data with history
      const responseFull = await fetch('/api/carteira/resumo', {
        method: 'GET',
        credentials: 'include',
        signal,
      });

      if (responseFull.ok) {
        return responseFull.json();
      }

      return dataFast;
    },
  });

  const error = queryError ? (queryError as Error).message : null;

  const updateMeta = useCallback(
    async (novaMetaPatrimonio: number) => {
      try {
        const response = await csrfFetch('/api/carteira/resumo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metaPatrimonio: novaMetaPatrimonio }),
        });

        if (!response.ok) throw new Error('Erro ao atualizar meta de patrimônio');

        await queryClient.invalidateQueries({ queryKey });
        invalidatePortfolioDerivedQueries(queryClient);
        return true;
      } catch (err) {
        logger.error('Erro ao atualizar meta:', err);
        return false;
      }
    },
    [csrfFetch, queryClient, queryKey],
  );

  const updateCaixaParaInvestir = useCallback(
    async (novoCaixa: number, opts?: CaixaSaveOptions) => {
      if (!resumo) return false;

      const previousResumo = resumo;

      // Optimistic update
      queryClient.setQueryData<CarteiraResumo>(queryKey, {
        ...resumo,
        caixaParaInvestir: novoCaixa,
        caixa: resumo.caixa
          ? { ...resumo.caixa, total: novoCaixa, livre: novoCaixa - resumo.caixa.reservado }
          : resumo.caixa,
      });

      try {
        const result = await postCaixaParaInvestir(
          csrfFetch,
          '/api/carteira/resumo',
          novoCaixa,
          opts,
        );
        if (result !== true) {
          // Recusa por regra (ex.: total abaixo das reservas) — desfaz o otimista.
          queryClient.setQueryData<CarteiraResumo>(queryKey, previousResumo);
        }
        return result;
      } catch (err) {
        // Rollback
        queryClient.setQueryData<CarteiraResumo>(queryKey, previousResumo);
        logger.error('Erro ao atualizar caixa para investir:', err);
        return false;
      }
    },
    [resumo, csrfFetch, queryClient, queryKey],
  );

  const distribuirCaixaLivre = useCallback<DistribuirCaixaFn>(
    async (porAba) => {
      try {
        const result = await postDistribuirCaixa(csrfFetch, porAba);
        if (result === true) {
          // As reservas aparecem no card de cada aba e na alocação.
          await queryClient.invalidateQueries({ queryKey });
          invalidatePortfolioDerivedQueries(queryClient);
        }
        return result;
      } catch (err) {
        logger.error('Erro ao distribuir caixa livre:', err);
        return { ok: false, message: 'Não foi possível distribuir o caixa.' };
      }
    },
    [csrfFetch, queryClient, queryKey],
  );

  const definirCaixaProventos = useCallback(
    async (ativo: boolean): Promise<boolean> => {
      try {
        const response = await csrfFetch('/api/carteira/caixa/proventos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ativo }),
        });
        if (!response.ok) return false;
        await queryClient.invalidateQueries({ queryKey });
        return true;
      } catch (err) {
        logger.error('Erro ao alterar proventos no caixa:', err);
        return false;
      }
    },
    [csrfFetch, queryClient, queryKey],
  );

  const formatCurrency = (value: number | undefined | null): string => formatBRL(value);

  // Único consumidor real hoje: RentabilidadeResumo (via CarteiraResumoContext),
  // que exibe deltas de rentabilidade — sinal "+" é a convenção correta ali.
  // TODO: se um consumidor novo for percentual não-delta (alocação/risco), use
  // formatPct direto em vez desta função.
  const formatPercentage = (value: number | undefined | null): string => formatPctSigned(value);

  const refetch = useCallback(() => {
    return queryRefetch().then(() => undefined);
  }, [queryRefetch]);

  return {
    resumo,
    loading,
    error,
    refetch,
    updateMeta,
    updateCaixaParaInvestir,
    distribuirCaixaLivre,
    definirCaixaProventos,
    formatCurrency,
    formatPercentage,
  };
};
