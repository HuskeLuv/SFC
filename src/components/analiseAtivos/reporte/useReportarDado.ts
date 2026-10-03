'use client';

/**
 * Envio do relato (POST /api/analise-ativos/reportes) por csrfFetch — bloco C, fatia D.
 *
 * Respostas esperadas viram RESULTADO (não erro), para o formulário escolher o estado:
 * 201 'enviado' · 409 'duplicado' (leva ao relato existente) · 429 'limite' (dia, hora no ativo,
 * global ou IP — o 429 do middleware não traz `limite` e conta como 'ip') · 400 'invalido' (erros
 * por campo) · 404 'indisponivel' (flag/acesso). Rede ou 5xx LANÇAM (estado "rede", com "Tentar de
 * novo" mantendo o texto). No envio, invalida as listas de Meus relatos.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { CHAVE_MEUS_REPORTES } from '@/components/analiseAtivos/reporte/useMeusReportes';
import type {
  ReporteConflito409,
  ReporteLimite429,
  ReportePostBody,
  ReportePostResposta,
} from '@/types/analiseAtivosCuradoria';

export type ResultadoEnvioRelato =
  | { tipo: 'enviado'; resposta: ReportePostResposta }
  | { tipo: 'duplicado'; casoId: string; reporteId: string }
  | { tipo: 'limite'; limite: ReporteLimite429['limite']; voltaEm: string | null }
  | { tipo: 'invalido'; erros: Record<string, string[]> }
  | { tipo: 'indisponivel' };

export class ErroEnvioRelato extends Error {
  constructor(public status: number | null) {
    super(status ? `Falha ao enviar o relato (${status})` : 'Falha de rede ao enviar o relato');
  }
}

export const URL_REPORTES = '/api/analise-ativos/reportes';

export function useReportarDado() {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  return useMutation<ResultadoEnvioRelato, ErroEnvioRelato, ReportePostBody>({
    mutationFn: async (body) => {
      let res: Response;
      try {
        res = await csrfFetch(URL_REPORTES, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        throw new ErroEnvioRelato(null);
      }
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 201 && json) {
        return { tipo: 'enviado', resposta: json as unknown as ReportePostResposta };
      }
      if (res.status === 409 && json && typeof json.reporteId === 'string') {
        const c = json as unknown as ReporteConflito409;
        return { tipo: 'duplicado', casoId: c.casoId, reporteId: c.reporteId };
      }
      if (res.status === 429) {
        const l = (json ?? {}) as Partial<ReporteLimite429>;
        return {
          tipo: 'limite',
          limite: l.limite ?? 'ip',
          voltaEm: typeof l.voltaEm === 'string' ? l.voltaEm : null,
        };
      }
      if (res.status === 400) {
        const details = (json?.details ?? {}) as Record<string, string[]>;
        return { tipo: 'invalido', erros: details };
      }
      if (res.status === 404) return { tipo: 'indisponivel' };
      throw new ErroEnvioRelato(res.status);
    },
    onSuccess: (r) => {
      if (r.tipo === 'enviado' || r.tipo === 'duplicado') {
        void qc.invalidateQueries({ queryKey: CHAVE_MEUS_REPORTES });
      }
    },
  });
}
