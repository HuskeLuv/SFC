/**
 * Helpers compartilhados para instrumentar as rotas de mutação da CARTEIRA
 * com o histórico de alterações. As 9 rotas-template (acoes/etf/fii/...)
 * fazem chamadas idênticas — aqui vira 1 linha por rota.
 */

import type { NextRequest } from 'next/server';
import { recordChange, type RecordChangeParams } from './recordChange';
import { diffFields } from './diffFields';
import {
  CAIXA_INVESTIR_FIELD_LABELS,
  CAIXA_RESERVAS_FIELD_LABELS,
  OBJETIVO_CLASSE_FIELD_LABELS,
  RESUMO_FIELD_LABELS,
} from './labels';
import { buildCaixaDistribuicaoSnapshot, buildDashboardMetricSnapshot } from './snapshots';
import type { CaixaAbaKey } from '@/lib/caixaParaInvestirPlano';

type CarteiraAuth = RecordChangeParams['auth'];

/**
 * Rótulo legível de um Asset para `entityLabel`: ticker para ativos de
 * catálogo ("PETR4"), nome descritivo para assets manuais (cujo symbol é
 * um identificador gerado tipo "RENDA-FIXA-1699999-abc123").
 */
export function assetEntityLabel(
  asset:
    | { symbol?: string | null; name?: string | null; source?: string | null }
    | null
    | undefined,
): string | undefined {
  if (!asset) return undefined;
  if (asset.source === 'manual') return asset.name ?? asset.symbol ?? undefined;
  return asset.symbol ?? asset.name ?? undefined;
}

/**
 * Upsert do "caixa para investir" de uma classe de ativo (POST das rotas
 * carteira/{acoes,etf,fii,...} e branch consolidado). `valorAnterior` vem do
 * findFirst que a rota já faz para decidir entre update/create — sem query
 * extra. Quando o valor não mudou, diffFields devolve [] e nada é gravado.
 */
export async function recordCaixaParaInvestirAtualizado(
  request: NextRequest,
  auth: CarteiraAuth,
  params: {
    classe: string;
    /** Chave da métrica no DashboardData (ex. 'caixa_para_investir_acoes') — locator do undo. */
    metric: string;
    valorAnterior: number | null | undefined;
    valor: number;
  },
): Promise<void> {
  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'caixa-investir.atualizar',
    entity: 'caixa-investir',
    entityId: params.metric,
    entityLabel: params.classe,
    changes: diffFields(
      { value: params.valorAnterior ?? null },
      { value: params.valor },
      CAIXA_INVESTIR_FIELD_LABELS,
    ),
    snapshot: buildDashboardMetricSnapshot(params.metric, params.valorAnterior),
  });
}

/**
 * Bolso total do "caixa para investir" (métrica consolidada). Mesma
 * action/entity que o POST de /api/carteira/resumo sempre gravou — o undo
 * (`resumo.atualizar`) e o render do histórico continuam valendo.
 */
export async function recordCaixaTotalAtualizado(
  request: NextRequest,
  auth: CarteiraAuth,
  params: { valorAnterior: number | null | undefined; valor: number },
): Promise<void> {
  const metric = 'caixa_para_investir_consolidado';
  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'resumo.atualizar',
    entity: 'resumo',
    entityId: metric,
    changes: diffFields(
      { caixaParaInvestir: params.valorAnterior ?? null },
      { caixaParaInvestir: params.valor },
      RESUMO_FIELD_LABELS,
    ),
    snapshot: buildDashboardMetricSnapshot(metric, params.valorAnterior),
  });
}

/**
 * Distribuição do caixa livre pelo alvo da Alocação: uma entrada só, com o
 * antes/depois de cada reserva que recebeu dinheiro.
 */
export async function recordCaixaDistribuido(
  request: NextRequest,
  auth: CarteiraAuth,
  params: {
    anterior: Partial<Record<CaixaAbaKey, number>>;
    porAba: Partial<Record<CaixaAbaKey, number>>;
  },
): Promise<void> {
  const depois = Object.fromEntries(
    Object.entries(params.porAba).map(([aba, valor]) => [
      aba,
      Math.round(((params.anterior[aba as CaixaAbaKey] ?? 0) + (valor ?? 0)) * 100) / 100,
    ]),
  );
  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'caixa-investir.distribuir',
    entity: 'caixa-investir',
    entityId: 'distribuicao',
    changes: diffFields(params.anterior, depois, CAIXA_RESERVAS_FIELD_LABELS),
    snapshot: buildCaixaDistribuicaoSnapshot(params.porAba),
  });
}

/**
 * Definição do objetivo (%) de um ativo dentro de uma classe (POST das rotas
 * carteira/{classe}/objetivo). Quando a rota carrega o estado anterior e o
 * ticker, a entrada ganha before/after e um label "PETR4 (Ações)"; sem eles,
 * registra só a ação (compatível com call sites antigos).
 */
export async function recordObjetivoClasseDefinido(
  request: NextRequest,
  auth: CarteiraAuth,
  params: {
    classe: string;
    ativoId: string;
    ticker?: string;
    objetivoAnterior?: number;
    objetivo?: number;
  },
): Promise<void> {
  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'objetivo-classe.definir',
    entity: 'objetivo-classe',
    entityId: params.ativoId,
    entityLabel: params.ticker ? `${params.ticker} (${params.classe})` : params.classe,
    changes:
      params.objetivo !== undefined
        ? diffFields(
            { objetivo: params.objetivoAnterior ?? null },
            { objetivo: params.objetivo },
            OBJETIVO_CLASSE_FIELD_LABELS,
          )
        : undefined,
  });
}
