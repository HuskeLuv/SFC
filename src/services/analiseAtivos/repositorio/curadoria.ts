/**
 * Leitura (SOMENTE LEITURA) dos casos de curadoria pelo motor de sanidade — STUB da fatia 0 com a
 * assinatura FINAL; a fatia A implementa (1 query por run, sem escrita).
 *
 * Contrato entre C (quem grava a decisão do curador em analise_casos_dado) e A (quem lê no cálculo):
 *  - liberação = caso fechado com status 'rejeitado', resolucao 'dado_confirmado' e efeitoTela
 *    'liberar_valor' (curadoria/contrato.ehLiberacao). Vale no PRÓXIMO cálculo diário (decisão 15);
 *  - a regra NÃO marca de novo o mesmo (symbol, regraCodigo, chaveDeteccao); chave nova (outra data,
 *    outro ano) marca de novo;
 *  - decisão 16: NÃO há "conferência manual" (sem conferenciasManuais(); a coluna fica false).
 */
import type { PrismaClient } from '@prisma/client';

export interface LiberacaoConferencia {
  symbol: string;
  /** código da regra (DEF_GRUPO[grupo].regras ou REGRAS_REVISAO) */
  regraCodigo: string;
  /** chave da detecção liberada (a mesma da flag conf:/rev:) */
  chaveDeteccao: string;
}

/** Chave de busca rápida: 'SYMBOL|regra|chave'. */
export function chaveLiberacao(l: LiberacaoConferencia): string {
  return `${l.symbol.toUpperCase()}|${l.regraCodigo}|${l.chaveDeteccao}`;
}

/**
 * Liberações vigentes (casos fechados como dado confirmado com 'liberar o valor').
 * STUB: devolve [] (nenhuma liberação) até a fatia A.
 */
export async function liberacoes(_prisma: PrismaClient): Promise<LiberacaoConferencia[]> {
  return [];
}
