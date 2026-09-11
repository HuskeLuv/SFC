'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import type { EventoAgenda, Periodo, TipoEvento } from '@/services/calendario/types';
import type { EventoManualDto } from '@/services/calendario/eventoManual';

export type { EventoAgenda, Periodo, TipoEvento, EventoManualDto };

export interface AgendaResposta {
  eventos: EventoAgenda[];
  periodo: Periodo;
  fontesComErro: TipoEvento[];
}

export interface EventoManualPayload {
  titulo: string;
  descricao?: string | null;
  data: string;
  dataFim?: string | null;
  hora?: string | null;
  categoria?: string;
  recorrencia?: string;
  lembrete?: boolean;
}

const BASE_URL = '/api/calendar';

async function throwResponseError(res: Response, fallback: string): Promise<never> {
  const text = await res.text().catch(() => '');
  let message = text;
  try {
    message = (JSON.parse(text) as { error?: string }).error ?? text;
  } catch {}
  throw new Error(message || `${fallback} (${res.status})`);
}

function invalidarAgenda(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.historicoAlteracoes.all });
}

/** Eventos de todas as fontes no período visível (null = ainda sem período). */
export function useAgenda(periodo: Periodo | null) {
  return useQuery<AgendaResposta, Error>({
    queryKey: periodo
      ? queryKeys.agenda.periodo(periodo.de, periodo.ate)
      : [...queryKeys.agenda.all, 'vazio'],
    enabled: periodo !== null,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({ de: periodo!.de, ate: periodo!.ate });
      const res = await fetch(`${BASE_URL}?${qs.toString()}`, { credentials: 'include', signal });
      if (!res.ok) await throwResponseError(res, 'Erro ao carregar a agenda');
      return (await res.json()) as AgendaResposta;
    },
  });
}

export function useCriarEvento() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<EventoManualDto, Error, EventoManualPayload>({
    mutationFn: async (payload) => {
      const res = await csrfFetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) await throwResponseError(res, 'Erro ao criar o evento');
      return ((await res.json()) as { evento: EventoManualDto }).evento;
    },
    onSuccess: () => invalidarAgenda(queryClient),
  });
}

export function useEditarEvento() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<EventoManualDto, Error, { id: string; payload: Partial<EventoManualPayload> }>(
    {
      mutationFn: async ({ id, payload }) => {
        const res = await csrfFetch(`${BASE_URL}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) await throwResponseError(res, 'Erro ao salvar o evento');
        return ((await res.json()) as { evento: EventoManualDto }).evento;
      },
      onSuccess: () => invalidarAgenda(queryClient),
    },
  );
}

export function useExcluirEvento() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await csrfFetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
      if (!res.ok) await throwResponseError(res, 'Erro ao excluir o evento');
    },
    onSuccess: () => invalidarAgenda(queryClient),
  });
}
