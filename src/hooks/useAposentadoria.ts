'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { logger } from '@/lib/logger';
import type {
  AposentadoriaPlanoDTO,
  AposentadoriaEntryDTO,
  AposentadoriaEvento,
} from '@/app/api/aposentadoria/_lib/serializer';
import type { DerivedAcompanhamentoEntry } from '@/services/planejamento/acompanhamentoAuto';

const QUERY_KEY = ['aposentadoria'] as const;
const DEFAULTS_KEY = ['aposentadoria', 'defaults'] as const;
const AUTO_KEY = ['aposentadoria', 'entries', 'auto'] as const;
const BASE_URL = '/api/aposentadoria';

export type { AposentadoriaPlanoDTO, AposentadoriaEntryDTO, AposentadoriaEvento };
export type { DerivedAcompanhamentoEntry };

/** Parâmetros do plano enviados no PUT (tudo menos id/entries/timestamps). */
export interface PlanoUpsertPayload {
  idade: number;
  apos: number;
  vida: number;
  rentNom: number;
  inflacao: number;
  rentNomRetiro: number | null;
  patrimonio: number;
  aporteM: number;
  renda: number;
  trackStartMonth: number;
  trackStartYear: number;
  eventos: AposentadoriaEvento[];
  /** Campos travados manualmente (override) — não re-sincronizam do contexto. */
  fieldLocks: string[];
}

export interface EntryUpsertPayload {
  off: number;
  aporteReal: number;
  patFinal: number;
}

interface PlanoResponse {
  plano: AposentadoriaPlanoDTO | null;
}

/**
 * Plano de aposentadoria do usuário (com entries). Retorna `null` quando o
 * user ainda não salvou nenhum plano — a UI então usa defaults.
 */
export function usePlanoAposentadoria() {
  const query = useQuery<AposentadoriaPlanoDTO | null, Error>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(BASE_URL, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 404 || res.status >= 500) {
          logger.warn(`Aposentadoria: endpoint indisponível (${res.status})`);
          return null;
        }
        throw new Error(`Erro ao carregar plano (${res.status})`);
      }
      const data = (await res.json()) as PlanoResponse;
      return data.plano;
    },
  });

  return {
    plano: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Salva os parâmetros do plano (PUT). Atualiza o cache otimisticamente pra que
 * a projeção não pisque enquanto a request roda — a UI já reflete o estado.
 */
export function useSavePlano() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<AposentadoriaPlanoDTO, Error, PlanoUpsertPayload>({
    mutationFn: async (payload) => {
      const res = await csrfFetch(BASE_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erro ao salvar plano (${res.status})`);
      }
      const data = (await res.json()) as { plano: AposentadoriaPlanoDTO };
      return data.plano;
    },
    onSuccess: (plano) => {
      queryClient.setQueryData(QUERY_KEY, plano);
    },
  });
}

export function useUpsertEntry() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<AposentadoriaPlanoDTO, Error, EntryUpsertPayload>({
    mutationFn: async (payload) => {
      const res = await csrfFetch(`${BASE_URL}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erro ao registrar mês (${res.status})`);
      }
      const data = (await res.json()) as { plano: AposentadoriaPlanoDTO };
      return data.plano;
    },
    onSuccess: (plano) => {
      queryClient.setQueryData(QUERY_KEY, plano);
    },
  });
}

export function useDeleteEntry() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<AposentadoriaPlanoDTO, Error, number>({
    mutationFn: async (off) => {
      const res = await csrfFetch(`${BASE_URL}/entries/${off}`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erro ao remover registro (${res.status})`);
      }
      const data = (await res.json()) as { plano: AposentadoriaPlanoDTO };
      return data.plano;
    },
    onSuccess: (plano) => {
      queryClient.setQueryData(QUERY_KEY, plano);
    },
  });
}

export interface AposentadoriaDefaults {
  patrimonio: number;
  rentNom: number; // % a.a.
  inflacao: number; // % a.a.
}

/** Defaults pra pré-popular o simulador na primeira vez (CDI + carteira). */
export function useAposentadoriaDefaults(enabled = true) {
  return useQuery<AposentadoriaDefaults, Error>({
    queryKey: DEFAULTS_KEY,
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/defaults`, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Erro ao carregar defaults (${res.status})`);
      }
      return (await res.json()) as AposentadoriaDefaults;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ── Acompanhamento mensal automático ──────────────────────────────────────

interface AutoPreview {
  asOf: string;
  derived: DerivedAcompanhamentoEntry[];
  fillable: number;
}

/**
 * Preview dos valores de acompanhamento derivados da carteira (aporte líquido +
 * patrimônio de snapshot) por mês. `fillable` = meses com snapshot ainda sem
 * registro. Retorna null se o plano ainda não existe (404).
 */
export function useAcompanhamentoAuto(enabled = true) {
  const query = useQuery<AutoPreview | null, Error>({
    queryKey: AUTO_KEY,
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${BASE_URL}/entries/auto`, { credentials: 'include', signal });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Erro ao carregar sugestões (${res.status})`);
      }
      return (await res.json()) as AutoPreview;
    },
  });
  return {
    preview: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}

/**
 * Preenche automaticamente os meses sem registro com os valores derivados da
 * carteira. Não sobrescreve registros manuais. Atualiza o cache do plano.
 */
export function useAutoFillEntries() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<{ plano: AposentadoriaPlanoDTO; filled: number }, Error, void>({
    mutationFn: async () => {
      const res = await csrfFetch(`${BASE_URL}/entries/auto`, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erro ao preencher meses (${res.status})`);
      }
      return (await res.json()) as { plano: AposentadoriaPlanoDTO; filled: number };
    },
    onSuccess: ({ plano }) => {
      queryClient.setQueryData(QUERY_KEY, plano);
      void queryClient.invalidateQueries({ queryKey: AUTO_KEY });
    },
  });
}

export { QUERY_KEY as APOSENTADORIA_QUERY_KEY };
