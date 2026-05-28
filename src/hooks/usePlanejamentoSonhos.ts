'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { logger } from '@/lib/logger';
import type {
  PlanejamentoObjetivoDTO,
  PlanejamentoEntryDTO,
  PlanejamentoPriority,
  PlanejamentoCategory,
  PlanejamentoStatus,
} from '@/app/api/planejamento-sonhos/_lib/serializer';

const QUERY_KEY = ['planejamento-sonhos'] as const;
const BASE_URL = '/api/planejamento-sonhos';

export type {
  PlanejamentoObjetivoDTO,
  PlanejamentoEntryDTO,
  PlanejamentoPriority,
  PlanejamentoCategory,
  PlanejamentoStatus,
};

/**
 * Payload pra criar/editar um objetivo. Todos os campos pré-calculados (pmt, etc.)
 * ficam no client; o backend persiste tal qual.
 */
export interface ObjetivoUpsertPayload {
  name: string;
  target: number;
  months: number;
  startDate: string | null; // YYYY-MM ou null
  available: number;
  rate: number; // mensal decimal (0.01 = 1%/mês)
  priority: PlanejamentoPriority;
  category: PlanejamentoCategory;
  status: PlanejamentoStatus;
  notes: string | null;
}

export interface EntryUpsertPayload {
  month: string; // YYYY-MM
  aporte: number;
  balance: number;
}

interface ListResponse {
  objetivos: PlanejamentoObjetivoDTO[];
}

interface SingleResponse {
  objetivo: PlanejamentoObjetivoDTO;
}

/**
 * Lista de objetivos do usuário com entries embutidos.
 *
 * O endpoint ainda não está implementado (F3.2 paralelo) — o hook tolera
 * erro de rede / 404 e devolve lista vazia pra UI não quebrar no primeiro
 * carregamento.
 */
export function useObjetivos() {
  const query = useQuery<PlanejamentoObjetivoDTO[], Error>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(BASE_URL, { credentials: 'include' });
      if (!res.ok) {
        // 401/403 → deixa cair; 404/500 enquanto F3.2 ainda não pronto: lista vazia
        if (res.status === 404 || res.status >= 500) {
          logger.warn(`Planejamento Sonhos: endpoint indisponível (${res.status})`);
          return [];
        }
        throw new Error(`Erro ao carregar objetivos (${res.status})`);
      }
      const data = (await res.json()) as ListResponse;
      return data.objetivos ?? [];
    },
  });

  return {
    objetivos: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

export function useCreateObjetivo() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<PlanejamentoObjetivoDTO, Error, ObjetivoUpsertPayload>({
    mutationFn: async (payload) => {
      const res = await csrfFetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erro ao criar objetivo (${res.status})`);
      }
      const data = (await res.json()) as SingleResponse;
      return data.objetivo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useUpdateObjetivo() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<
    PlanejamentoObjetivoDTO,
    Error,
    { id: string; payload: ObjetivoUpsertPayload }
  >({
    mutationFn: async ({ id, payload }) => {
      const res = await csrfFetch(`${BASE_URL}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erro ao atualizar objetivo (${res.status})`);
      }
      const data = (await res.json()) as SingleResponse;
      return data.objetivo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteObjetivo() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await csrfFetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erro ao excluir objetivo (${res.status})`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useCreateEntry(objetivoId: string) {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<PlanejamentoObjetivoDTO, Error, EntryUpsertPayload>({
    mutationFn: async (payload) => {
      const res = await csrfFetch(`${BASE_URL}/${objetivoId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erro ao registrar mês (${res.status})`);
      }
      const data = (await res.json()) as SingleResponse;
      return data.objetivo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteEntry(objetivoId: string) {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (month) => {
      const res = await csrfFetch(
        `${BASE_URL}/${objetivoId}/entries/${encodeURIComponent(month)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erro ao remover registro (${res.status})`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Conveniente quando o componente precisa só do objetivo selecionado.
 * Evita prop drilling — derivado do cache.
 */
export function useObjetivo(id: string | null) {
  const { objetivos } = useObjetivos();
  return useMemo(() => {
    if (!id) return null;
    return objetivos.find((g) => g.id === id) ?? null;
  }, [objetivos, id]);
}

export { QUERY_KEY as PLANEJAMENTO_SONHOS_QUERY_KEY };
