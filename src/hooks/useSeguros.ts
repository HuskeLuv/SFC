'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import type {
  SeguroDTO,
  SeguroTipo,
  SeguroCobertura,
  SeguroRisco,
} from '@/app/api/saude-financeira/seguros/_lib/serializer';

const BASE_URL = '/api/saude-financeira/seguros';

export type { SeguroDTO, SeguroTipo, SeguroCobertura, SeguroRisco };

export interface SeguroPayload {
  nome: string;
  tipo: SeguroTipo;
  cobertura: SeguroCobertura;
  risco: SeguroRisco;
  custoAnual: number;
  capitalSegurado?: number | null;
  notes?: string | null;
}

async function throwResponseError(res: Response, fallback: string): Promise<never> {
  const text = await res.text().catch(() => '');
  let message = text;
  try {
    message = (JSON.parse(text) as { error?: string }).error ?? text;
  } catch {}
  throw new Error(message || `${fallback} (${res.status})`);
}

/** Apólices de seguro do bloco Gestão de Risco. */
export function useSeguros() {
  const query = useQuery<SeguroDTO[], Error>({
    queryKey: queryKeys.saudeFinanceira.seguros(),
    queryFn: async () => {
      const res = await fetch(BASE_URL, { credentials: 'include' });
      if (!res.ok) throw new Error(`Erro ao carregar seguros (${res.status})`);
      const data = (await res.json()) as { seguros: SeguroDTO[] };
      return data.seguros ?? [];
    },
  });

  return {
    seguros: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

function useInvalidateSeguros() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.saudeFinanceira.seguros() });
  };
}

export function useCreateSeguro() {
  const { csrfFetch } = useCsrf();
  const invalidate = useInvalidateSeguros();

  return useMutation<SeguroDTO, Error, SeguroPayload>({
    mutationFn: async (payload) => {
      const res = await csrfFetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) await throwResponseError(res, 'Erro ao cadastrar seguro');
      return ((await res.json()) as { seguro: SeguroDTO }).seguro;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateSeguro() {
  const { csrfFetch } = useCsrf();
  const invalidate = useInvalidateSeguros();

  return useMutation<SeguroDTO, Error, { id: string; payload: Partial<SeguroPayload> }>({
    mutationFn: async ({ id, payload }) => {
      const res = await csrfFetch(`${BASE_URL}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) await throwResponseError(res, 'Erro ao atualizar seguro');
      return ((await res.json()) as { seguro: SeguroDTO }).seguro;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSeguro() {
  const { csrfFetch } = useCsrf();
  const invalidate = useInvalidateSeguros();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await csrfFetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
      if (!res.ok) await throwResponseError(res, 'Erro ao excluir seguro');
    },
    onSuccess: invalidate,
  });
}
