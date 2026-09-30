/**
 * Leituras de cotações do COTAHIST (tabelas da fatia C). Preço CRU (sem ajuste por proventos).
 */
import type { AssetQuoteDaily, PrismaClient } from '@prisma/client';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import type { CotacaoDia, ResumoCotacao } from '@/services/analiseAtivos/tipos';

const DIA_MS = 24 * 60 * 60 * 1000;

function paraCotacao(l: AssetQuoteDaily): CotacaoDia {
  return {
    symbol: l.symbol,
    date: paraData(l.date),
    closeRaw: paraNumero(l.closeRaw) ?? 0,
    volumeFin: paraNumero(l.volumeFin) ?? 0,
    negocios: l.negocios,
    codBdi: l.codBdi,
  };
}

export async function cotacoesEntre(
  prisma: PrismaClient,
  symbols: string[],
  de: string,
  ate: string,
): Promise<CotacaoDia[]> {
  if (symbols.length === 0) return [];
  const linhas = await prisma.assetQuoteDaily.findMany({
    where: { symbol: { in: symbols }, date: { gte: deData(de), lte: deData(ate) } },
    orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
  });
  return linhas.map(paraCotacao);
}

/**
 * Último pregão ≤ dtFim e ≥ dtFim − janelaDias para cada par (regra 5). Chave `${symbol}|${dtFim}`;
 * sem cotação na janela ⇒ null.
 */
export async function cotacaoFimDePeriodo(
  prisma: PrismaClient,
  pares: Array<{ symbol: string; dtFim: string }>,
  janelaDias: number,
): Promise<Map<string, CotacaoDia | null>> {
  const out = new Map<string, CotacaoDia | null>();
  const porDtFim = new Map<string, Set<string>>();
  for (const p of pares) {
    out.set(`${p.symbol}|${p.dtFim}`, null);
    porDtFim.set(p.dtFim, (porDtFim.get(p.dtFim) ?? new Set()).add(p.symbol));
  }
  for (const [dtFim, symbols] of porDtFim) {
    const fim = deData(dtFim);
    const linhas = await prisma.assetQuoteDaily.findMany({
      where: {
        symbol: { in: [...symbols] },
        date: { gte: new Date(fim.getTime() - janelaDias * DIA_MS), lte: fim },
      },
      orderBy: [{ symbol: 'asc' }, { date: 'desc' }],
    });
    for (const l of linhas) {
      const k = `${l.symbol}|${dtFim}`;
      if (out.get(k) === null) out.set(k, paraCotacao(l));
    }
  }
  return out;
}

export async function resumoCotacoes(
  prisma: PrismaClient,
  symbols?: string[],
): Promise<ResumoCotacao[]> {
  const linhas = await prisma.assetQuoteResumo.findMany({
    where: symbols ? { symbol: { in: symbols } } : {},
    orderBy: { symbol: 'asc' },
  });
  return linhas.map((l) => ({
    symbol: l.symbol,
    ultimoPregao: paraData(l.ultimoPregao),
    closeRaw: paraNumero(l.closeRaw) ?? 0,
    volumeMedio21: paraNumero(l.volumeMedio21) ?? 0,
    pregoesComNegocio21: l.pregoesComNegocio21,
    baixaLiquidez: l.baixaLiquidez,
    negociadoUltimos30: l.negociadoUltimos30,
  }));
}
