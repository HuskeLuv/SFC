/**
 * Helpers compartilhados para instrumentar as rotas de mutação da CARTEIRA
 * com o histórico de alterações. As 9 rotas-template (acoes/etf/fii/...)
 * fazem chamadas idênticas — aqui vira 1 linha por rota.
 */

import type { NextRequest } from 'next/server';
import { recordChange, type RecordChangeParams } from './recordChange';
import { diffFields } from './diffFields';
import { CAIXA_INVESTIR_FIELD_LABELS } from './labels';

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
  params: { classe: string; valorAnterior: number | null | undefined; valor: number },
): Promise<void> {
  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'caixa-investir.atualizar',
    entity: 'caixa-investir',
    entityLabel: params.classe,
    changes: diffFields(
      { value: params.valorAnterior ?? null },
      { value: params.valor },
      CAIXA_INVESTIR_FIELD_LABELS,
    ),
  });
}

/**
 * Definição do objetivo (%) de um ativo dentro de uma classe (POST das rotas
 * carteira/{classe}/objetivo). A rota usa updateMany sem carregar o estado
 * anterior nem o ticker, então registra a ação sem pares before/after.
 */
export async function recordObjetivoClasseDefinido(
  request: NextRequest,
  auth: CarteiraAuth,
  params: { classe: string; ativoId: string },
): Promise<void> {
  await recordChange({
    request,
    auth,
    section: 'carteira',
    action: 'objetivo-classe.definir',
    entity: 'objetivo-classe',
    entityId: params.ativoId,
    entityLabel: params.classe,
  });
}
