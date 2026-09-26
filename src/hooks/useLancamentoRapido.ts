'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import type {
  LancamentoRapidoInput,
  PreviaLancamento,
  ResultadoLancamentoRapido,
} from '@/lib/cashflow/lancamentoRapidoSchema';

export type LancamentoRapidoCampos = Omit<LancamentoRapidoInput, 'confirmar'>;

export interface LancamentoConfirmado {
  previa: PreviaLancamento;
  resultado: ResultadoLancamentoRapido;
  changeLogId: string | null;
}

/** Falha da rota com o status e, no 409 (mês que diminui), a prévia atualizada. */
export class LancamentoRapidoError extends Error {
  constructor(
    message: string,
    public status: number,
    public previa?: PreviaLancamento,
  ) {
    super(message);
    this.name = 'LancamentoRapidoError';
  }
}

export const ERRO_LANCAMENTO_GENERICO =
  'Não foi possível lançar agora. Nada foi gravado; tente de novo.';

/**
 * Lançamento rápido do Fluxo (PWA fase 2) — POST /api/cashflow/lancamento-rapido via csrfFetch.
 * `preview` não grava; `confirmar` grava e invalida o fluxo e o orçamento (queryKeys.cashflow.all).
 * O Desfazer usa `useUndoAlteracao().mutateAsync(changeLogId)`.
 */
export function useLancamentoRapido() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  const enviar = useCallback(
    async (body: LancamentoRapidoInput) => {
      let response: Response;
      try {
        response = await csrfFetch('/api/cashflow/lancamento-rapido', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        throw new LancamentoRapidoError(ERRO_LANCAMENTO_GENERICO, 0);
      }
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const status = response.status;
        const mensagem =
          typeof json.error === 'string' && status !== 500 ? json.error : ERRO_LANCAMENTO_GENERICO;
        throw new LancamentoRapidoError(mensagem, status, json.previa);
      }
      return json;
    },
    [csrfFetch],
  );

  const preview = useCallback(
    async (campos: LancamentoRapidoCampos): Promise<PreviaLancamento> => {
      const json = await enviar({ ...campos, confirmar: false });
      return json.previa as PreviaLancamento;
    },
    [enviar],
  );

  const confirmar = useCallback(
    async (campos: LancamentoRapidoCampos): Promise<LancamentoConfirmado> => {
      const json = await enviar({ ...campos, confirmar: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
      return {
        previa: json.previa,
        resultado: json.resultado,
        changeLogId: typeof json.changeLogId === 'string' ? json.changeLogId : null,
      };
    },
    [enviar, queryClient],
  );

  return { preview, confirmar };
}

export default useLancamentoRapido;
