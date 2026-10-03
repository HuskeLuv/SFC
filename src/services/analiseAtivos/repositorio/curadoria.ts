/**
 * Leitura (SOMENTE LEITURA) dos casos de curadoria pelo motor de sanidade (fatia A): 1 query por run,
 * sem escrita.
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

/** 'pvp_minimo' ou 'acoes_escala:pvp_minimo' (aceita as duas grafias de regraCodigo). */
function codigoDaRegra(regraCodigo: string): string {
  const i = regraCodigo.lastIndexOf(':');
  return i >= 0 ? regraCodigo.slice(i + 1) : regraCodigo;
}

/**
 * Liberações vigentes (casos fechados como dado confirmado com 'liberar o valor'). UMA query por
 * run, somente leitura; caso sem regraCodigo/chaveDeteccao (relato puro) não libera regra nenhuma.
 */
export async function liberacoes(prisma: PrismaClient): Promise<LiberacaoConferencia[]> {
  const casos = await prisma.analiseCasoDado.findMany({
    where: {
      status: 'rejeitado',
      resolucao: 'dado_confirmado',
      efeitoTela: 'liberar_valor',
      regraCodigo: { not: null },
      chaveDeteccao: { not: null },
    },
    select: { symbol: true, regraCodigo: true, chaveDeteccao: true },
  });
  const out: LiberacaoConferencia[] = [];
  for (const c of casos) {
    if (!c.regraCodigo || !c.chaveDeteccao) continue;
    out.push({
      symbol: c.symbol.trim().toUpperCase(),
      regraCodigo: codigoDaRegra(c.regraCodigo),
      chaveDeteccao: c.chaveDeteccao,
    });
  }
  return out;
}

/** Conjunto 'SYMBOL|regra|chave' para o filtro do motor (aplicarConferencia.deteccaoLiberada). */
export async function conjuntoLiberacoes(prisma: PrismaClient): Promise<Set<string>> {
  return new Set((await liberacoes(prisma)).map(chaveLiberacao));
}
