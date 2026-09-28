/**
 * Contrato do lançamento rápido do Fluxo (PWA fase 2): POST /api/cashflow/lancamento-rapido.
 * Isomórfico (cliente e servidor), sem next/server.
 *
 * Sem campo `modo`: o lançamento único SOMA ao valor do mês; o recorrente DEFINE o valor de `mes`
 * até `mesFim` (padrão dezembro) — a mesma regra do assistente. `confirmar: false` = só prévia.
 */
import { z } from 'zod';

export const lancamentoRapidoSchema = z
  .object({
    itemId: z.string().trim().min(1).max(255),
    valor: z.number().finite().positive().max(1e10),
    ano: z.number().int().min(2000).max(2100),
    mes: z.number().int().min(0).max(11),
    recorrente: z.boolean().default(false),
    mesFim: z.number().int().min(0).max(11).optional(),
    descricao: z.string().max(200).optional(),
    confirmar: z.boolean().default(false),
    aceitaReducao: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.mesFim === undefined || (v.recorrente && v.mesFim >= v.mes), {
    message: 'mesFim só com recorrente e a partir do mês inicial',
    path: ['mesFim'],
  });

export type LancamentoRapidoInput = z.input<typeof lancamentoRapidoSchema>;

export interface CelulaPrevia {
  /** 0 = janeiro. */
  mes: number;
  valorAtual: number;
  valorNovo: number;
  /** O valor do mês fica menor (só no recorrente, que troca o valor). */
  diminui: boolean;
  /** A célula tinha fórmula — o lançamento troca por valor fixo. */
  temFormula: boolean;
}

export interface PreviaLancamento {
  itemId: string;
  itemNome: string;
  /** Trilha do grupo, ex.: "Despesas > Habitação". */
  trilha: string;
  tipo: 'despesa' | 'entrada';
  ano: number;
  valor: number;
  modo: 'somar' | 'definir';
  celulas: CelulaPrevia[];
}

export interface ResultadoLancamentoRapido {
  /** Id da linha depois da personalização (clone-on-write) — o que o Recentes deve guardar. */
  itemId: string;
  grupoNome: string;
  celulas: Array<{ mes: number; valorAnterior: number; valorNovo: number }>;
}

export type LancamentoRapidoResposta =
  | { ok: true; previa: PreviaLancamento }
  | {
      ok: true;
      previa: PreviaLancamento;
      resultado: ResultadoLancamentoRapido;
      /** Entrada do histórico (Desfazer); null quando nada mudou. */
      changeLogId: string | null;
    };

export const MSG_REDUCAO_SEM_CONFIRMACAO = 'Alguns meses vão diminuir. Confirme para continuar.';
