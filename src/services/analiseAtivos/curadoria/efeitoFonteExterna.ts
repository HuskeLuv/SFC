/**
 * Efeito da resolução de um caso do grupo 'fonte_externa' (v2.5, desenho final.camada_fontes §7):
 * o caso em /admin/curadoria é o ÚNICO caminho de aprovação de um ponto de provedor 'pending'.
 *
 *  - fechar com efeito 'liberar_valor' (rejeitado / dado_confirmado: o alarme não procede, o valor
 *    do provedor vale) → aprovarPonto (reviewStatus 'approved', reviewedBy = o admin, reviewedAt);
 *  - fechar com qualquer outro efeito (ex.: corrigido / corrigido_fonte + manter_conferencia: o
 *    alarme procede) → rejeitarPonto (nunca aparece; vale a CVM ou a versão aprovada anterior).
 * Tudo dentro da MESMA transação da decisão (acoesCuradoria.aplicarAcaoCaso). A casca de CLI
 * (scripts/analise-ativos/revisar-fonte.ts) passa pela mesma aplicarAcaoCaso com corpoDecisaoFonte.
 */
import type { Prisma } from '@prisma/client';
import type { EfeitoTela } from '@/services/analiseAtivos/curadoria/contrato';
import {
  aprovarPonto,
  rejeitarPonto,
} from '@/services/analiseAtivos/repositorio/fontesFundamentosEscrita';
import type {
  CasoPatchBody,
  ContextoCasoFonteExterna,
  ReferenciaPontoFonte,
} from '@/types/analiseAtivosCuradoria';
import { GRUPO_CURADORIA_FONTE_EXTERNA } from '@/types/analiseAtivosFontes';

export type DecisaoFonte = 'aprovar' | 'rejeitar';

/** O caso é de ponto de provedor? */
export function ehCasoFonteExterna(grupo: string | null | undefined): boolean {
  return grupo === GRUPO_CURADORIA_FONTE_EXTERNA;
}

/** Referência {tabela, id} do contexto do caso (null = contexto sem referência válida). */
export function referenciaDoContexto(contexto: unknown): ReferenciaPontoFonte | null {
  if (!contexto || typeof contexto !== 'object') return null;
  const ref = (contexto as Partial<ContextoCasoFonteExterna>).referencia;
  if (
    !ref ||
    typeof ref.id !== 'string' ||
    (ref.tabela !== 'asset_fundamentals_serie' && ref.tabela !== 'fii_property_quality')
  ) {
    return null;
  }
  return { tabela: ref.tabela, id: ref.id };
}

/** Decisão sobre o ponto a partir do efeito na tela do fechamento. */
export function decisaoDoEfeito(efeito: EfeitoTela): DecisaoFonte {
  return efeito === 'liberar_valor' ? 'aprovar' : 'rejeitar';
}

/**
 * Aplica a decisão ao ponto do caso (na transação da decisão). Devolve a decisão e quantas linhas
 * mudaram (0 = o ponto já não estava pendente). Contexto sem referência = nada a fazer.
 */
export async function aplicarEfeitoFonteExterna(
  tx: Pick<Prisma.TransactionClient, 'assetFundamentalsSerie' | 'fiiPropertyQuality'>,
  contexto: unknown,
  efeito: EfeitoTela,
  revisorId: string,
  agora: Date,
): Promise<{ decisao: DecisaoFonte; alteradas: number } | null> {
  const ref = referenciaDoContexto(contexto);
  if (!ref) return null;
  const decisao = decisaoDoEfeito(efeito);
  const alteradas =
    decisao === 'aprovar'
      ? await aprovarPonto(tx, ref, revisorId, agora)
      : await rejeitarPonto(tx, ref, revisorId, agora);
  return { decisao, alteradas };
}

/** Corpo do PATCH do caso para a decisão (o que a tela e o CLI mandam). */
export function corpoDecisaoFonte(
  decisao: DecisaoFonte,
  atualizadoEmEsperado: string,
  notaCurador?: string,
): CasoPatchBody {
  return decisao === 'aprovar'
    ? {
        acao: 'decidir',
        status: 'rejeitado',
        resolucao: 'dado_confirmado',
        efeitoTela: 'liberar_valor',
        atualizadoEmEsperado,
        ...(notaCurador ? { notaCurador } : {}),
      }
    : {
        acao: 'decidir',
        status: 'corrigido',
        resolucao: 'corrigido_fonte',
        efeitoTela: 'manter_conferencia',
        atualizadoEmEsperado,
        ...(notaCurador ? { notaCurador } : {}),
      };
}
