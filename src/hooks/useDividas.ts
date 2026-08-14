'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import type {
  DividaDTO,
  DividaPagamentoDTO,
  DividaModalidade,
  DividaSistema,
  DividaIndexador,
  DividaStatus,
  DividaTipo,
  DividaPagamentoTipo,
} from '@/app/api/dividas/_lib/serializer';
import type { ParcelaCronograma, SaldoFinanciamentoResult } from '@/services/dividas/amortizacao';

const BASE_URL = '/api/dividas';

export type {
  DividaDTO,
  DividaPagamentoDTO,
  DividaModalidade,
  DividaSistema,
  DividaIndexador,
  DividaStatus,
  DividaTipo,
  DividaPagamentoTipo,
  ParcelaCronograma,
};

/**
 * Invalida os caches derivados de dívidas. Criar/editar/excluir uma dívida
 * mexe na linha-espelho do fluxo de caixa (parcelas do cronograma) e no
 * resumo da carteira (totalDividas/patrimonioLiquido) — ambos refazem junto.
 */
function invalidateDividaCaches(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.dividas.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.carteira.resumo() });
  queryClient.invalidateQueries({ queryKey: queryKeys.saudeFinanceira.all });
}

/** Payload de criação — discriminated union espelhando dividaCreateSchema. */
export type DividaCreatePayload =
  | {
      modalidade: 'financiamento';
      nome: string;
      instituicao?: string | null;
      tipo: DividaTipo;
      status?: DividaStatus;
      notes?: string | null;
      principal: number;
      taxaAm: number;
      taxaUnidadeEntrada?: 'am' | 'aa';
      prazoMeses: number;
      sistema: DividaSistema;
      indexador?: DividaIndexador;
      primeiroVencimento: string; // YYYY-MM
    }
  | {
      modalidade: 'rotativa';
      nome: string;
      instituicao?: string | null;
      tipo: DividaTipo;
      status?: DividaStatus;
      notes?: string | null;
      saldoInicial: number;
      dataSaldoInicial: string; // YYYY-MM
      /** CET informativo (fração a.m.) — não acrui no saldo. */
      taxaAm?: number | null;
      taxaUnidadeEntrada?: 'am' | 'aa';
    };

export type DividaPatchPayload = Partial<Omit<DividaCreatePayload, 'modalidade'>> & {
  status?: DividaStatus;
};

export interface DividaPagamentoPayload {
  month: string; // YYYY-MM
  valor: number;
  parcelaNumero?: number | null;
  tipo?: DividaPagamentoTipo;
  notes?: string | null;
}

export interface CronogramaResponse {
  cronograma: ParcelaCronograma[];
  saldo: SaldoFinanciamentoResult;
  indexador: DividaIndexador;
  fatorIndexacao: number;
  saldoCorrigido: number;
}

interface ListResponse {
  dividas: DividaDTO[];
}

interface SingleResponse {
  divida: DividaDTO;
}

async function throwResponseError(res: Response, fallback: string): Promise<never> {
  const text = await res.text().catch(() => '');
  let message = text;
  try {
    message = (JSON.parse(text) as { error?: string }).error ?? text;
  } catch {}
  throw new Error(message || `${fallback} (${res.status})`);
}

/** Lista de dívidas do usuário com resumo computado (saldo, progresso). */
export function useDividas() {
  const query = useQuery<DividaDTO[], Error>({
    queryKey: queryKeys.dividas.all,
    queryFn: async () => {
      const res = await fetch(BASE_URL, { credentials: 'include' });
      if (!res.ok) throw new Error(`Erro ao carregar dívidas (${res.status})`);
      const data = (await res.json()) as ListResponse;
      return data.dividas ?? [];
    },
  });

  return {
    dividas: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/** Detalhe de uma dívida (com pagamentos). */
export function useDivida(id: string | null) {
  const query = useQuery<DividaDTO, Error>({
    queryKey: queryKeys.dividas.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Erro ao carregar dívida (${res.status})`);
      return ((await res.json()) as SingleResponse).divida;
    },
  });

  return {
    divida: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/** Cronograma SAC/Price de um financiamento (400 pra rotativa → error). */
export function useDividaCronograma(id: string | null, enabled = true) {
  const query = useQuery<CronogramaResponse, Error>({
    queryKey: queryKeys.dividas.cronograma(id ?? ''),
    enabled: Boolean(id) && enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/${id}/cronograma`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Erro ao carregar cronograma (${res.status})`);
      return (await res.json()) as CronogramaResponse;
    },
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}

export function useCreateDivida() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<DividaDTO, Error, DividaCreatePayload>({
    mutationFn: async (payload) => {
      const res = await csrfFetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) await throwResponseError(res, 'Erro ao cadastrar dívida');
      return ((await res.json()) as SingleResponse).divida;
    },
    onSuccess: () => {
      invalidateDividaCaches(queryClient);
    },
  });
}

export function useUpdateDivida() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<DividaDTO, Error, { id: string; payload: DividaPatchPayload }>({
    mutationFn: async ({ id, payload }) => {
      const res = await csrfFetch(`${BASE_URL}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) await throwResponseError(res, 'Erro ao atualizar dívida');
      return ((await res.json()) as SingleResponse).divida;
    },
    onSuccess: () => {
      invalidateDividaCaches(queryClient);
    },
  });
}

export function useDeleteDivida() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await csrfFetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
      if (!res.ok) await throwResponseError(res, 'Erro ao excluir dívida');
    },
    onSuccess: () => {
      invalidateDividaCaches(queryClient);
    },
  });
}

export function useRegistrarPagamento(dividaId: string) {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<DividaDTO, Error, DividaPagamentoPayload>({
    mutationFn: async (payload) => {
      const res = await csrfFetch(`${BASE_URL}/${dividaId}/pagamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) await throwResponseError(res, 'Erro ao registrar pagamento');
      return ((await res.json()) as SingleResponse).divida;
    },
    onSuccess: () => {
      invalidateDividaCaches(queryClient);
    },
  });
}

export function useDeletePagamento(dividaId: string) {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (pagamentoId) => {
      const res = await csrfFetch(`${BASE_URL}/${dividaId}/pagamentos/${pagamentoId}`, {
        method: 'DELETE',
      });
      if (!res.ok) await throwResponseError(res, 'Erro ao remover pagamento');
    },
    onSuccess: () => {
      invalidateDividaCaches(queryClient);
    },
  });
}

/** Dívida selecionada, derivada do cache da lista (evita prop drilling). */
export function useDividaFromList(id: string | null) {
  const { dividas } = useDividas();
  return useMemo(() => {
    if (!id) return null;
    return dividas.find((d) => d.id === id) ?? null;
  }, [dividas, id]);
}
