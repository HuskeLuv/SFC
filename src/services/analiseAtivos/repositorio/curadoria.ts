/**
 * Leitura (SOMENTE LEITURA) dos casos de curadoria pelo motor de sanidade (fatia A): 1 query por run,
 * sem escrita.
 *
 * Contrato entre C (quem grava a decisão do curador em analise_casos_dado) e A (quem lê no cálculo):
 *  - liberação = caso fechado com status 'rejeitado', resolucao 'dado_confirmado' e efeitoTela
 *    'liberar_valor' (curadoria/contrato.ehLiberacao). Vale no PRÓXIMO cálculo diário (decisão 15);
 *  - a regra NÃO marca de novo o mesmo (symbol, regraCodigo, chaveDeteccao); chave nova (outra data,
 *    outro ano) marca de novo;
 *  - grupo de escopo 'empresa' (acoes_escala, fundamentos_escala, historico, proventos): a detecção é
 *    da EMPRESA e se repete em cada ticker dela; liberar o caso de um ticker libera a mesma
 *    (regra, chave) em todos os tickers do CNPJ (expandirLiberacoesEmpresa) — senão a flag de um
 *    irmão continuaria pondo o Índice da empresa em conferência;
 *  - decisão 16: NÃO há "conferência manual" (sem conferenciasManuais(); a coluna fica false).
 */
import type { PrismaClient } from '@prisma/client';
import { DEF_GRUPO } from '@/services/analiseAtivos/regras/comum/conferencia';

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

/**
 * Símbolos com liberação decidida desde `desde` (último scores OK). O run diário recalcula os
 * derivados desses emissores: a flag 'conf:historico:escala_ano@<ano>' mora em
 * asset_multiples_yearly e só é refeita na etapa derivados (incremental), então sem isso o ano
 * liberado seguiria fora da média até o emissor publicar um documento novo (decisão 15: vale no
 * PRÓXIMO cálculo diário). Somente leitura, 1 query.
 */
export async function simbolosLiberadosDesde(prisma: PrismaClient, desde: Date): Promise<string[]> {
  const casos = await prisma.analiseCasoDado.findMany({
    where: {
      status: 'rejeitado',
      resolucao: 'dado_confirmado',
      efeitoTela: 'liberar_valor',
      regraCodigo: { not: null },
      chaveDeteccao: { not: null },
      resolvidoEm: { gte: desde },
    },
    select: { symbol: true },
  });
  return [...new Set(casos.map((c) => c.symbol.trim().toUpperCase()))];
}

/** Códigos das regras dos grupos de escopo 'empresa' (a detecção vale para todos os tickers). */
export const REGRAS_ESCOPO_EMPRESA: ReadonlySet<string> = new Set(
  Object.values(DEF_GRUPO)
    .filter((g) => g.escopo === 'empresa')
    .flatMap((g) => g.regras),
);

/**
 * Liberações de regras de escopo 'empresa' repetidas para os tickers irmãos (mesmo CNPJ). Puro; as
 * demais (escopo 'ticker', revisão) ficam como estão. Símbolo sem CNPJ conhecido não expande.
 */
export function expandirLiberacoesEmpresa(
  libs: readonly LiberacaoConferencia[],
  cnpjDoSimbolo: ReadonlyMap<string, string>,
): LiberacaoConferencia[] {
  const simbolosPorCnpj = new Map<string, string[]>();
  for (const [symbol, cnpj] of cnpjDoSimbolo) {
    const lista = simbolosPorCnpj.get(cnpj) ?? [];
    lista.push(symbol.trim().toUpperCase());
    simbolosPorCnpj.set(cnpj, lista);
  }
  const out: LiberacaoConferencia[] = [];
  const vistos = new Set<string>();
  const add = (l: LiberacaoConferencia) => {
    const k = chaveLiberacao(l);
    if (vistos.has(k)) return;
    vistos.add(k);
    out.push(l);
  };
  for (const l of libs) {
    add(l);
    if (!REGRAS_ESCOPO_EMPRESA.has(l.regraCodigo)) continue;
    const cnpj = cnpjDoSimbolo.get(l.symbol);
    for (const irmao of cnpj ? (simbolosPorCnpj.get(cnpj) ?? []) : []) {
      add({ ...l, symbol: irmao });
    }
  }
  return out;
}

/**
 * Conjunto 'SYMBOL|regra|chave' para o filtro do motor (aplicarConferencia.deteccaoLiberada). Com
 * `cnpjDoSimbolo`, as liberações de escopo 'empresa' valem para os tickers irmãos.
 */
export async function conjuntoLiberacoes(
  prisma: PrismaClient,
  cnpjDoSimbolo?: ReadonlyMap<string, string>,
): Promise<Set<string>> {
  const libs = await liberacoes(prisma);
  return new Set(
    (cnpjDoSimbolo ? expandirLiberacoesEmpresa(libs, cnpjDoSimbolo) : libs).map(chaveLiberacao),
  );
}
