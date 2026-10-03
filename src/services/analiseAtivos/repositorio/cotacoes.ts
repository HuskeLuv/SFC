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

/** Pregão enxuto da série recente (motor de sanidade do bloco C: precoBase e precoEsporadico). */
export interface PregaoRecente {
  date: string;
  closeRaw: number;
  negocios: number;
}

const LOTE_SERIE = 50;

/**
 * Símbolos com ao menos um salto de fechamento > `salto` entre pregões COM negócio consecutivos desde
 * `desde`, com ≥ `negociosMin` negócios no pregão do salto — o pré-filtro de R3 (precoBase) feito no
 * banco (uma query, janela LAG), para só esses símbolos lerem a série inteira. Mesmo critério de
 * entrada de regras/calculo/sanidade/precoBase (o resto da regra roda em memória).
 */
export async function simbolosComSaltoDePreco(
  prisma: PrismaClient,
  desde: string,
  salto: number,
  negociosMin: number,
): Promise<Set<string>> {
  const linhas = await prisma.$queryRaw<Array<{ symbol: string }>>`
    SELECT DISTINCT symbol FROM (
      SELECT symbol, negocios, "closeRaw",
             LAG("closeRaw") OVER (PARTITION BY symbol ORDER BY date) AS anterior
        FROM asset_quotes_daily
       WHERE date >= ${deData(desde)} AND negocios > 0 AND "closeRaw" > 0
    ) t
    WHERE anterior > 0 AND negocios >= ${negociosMin}
      AND ABS("closeRaw" / anterior - 1) > ${salto}`;
  return new Set(linhas.map((l) => l.symbol));
}

/**
 * Série recente de cotações (date, closeRaw, negocios) de `desde` em diante, por símbolo, em lotes de
 * LOTE_SERIE símbolos e só com as 3 colunas (≈ 250 pregões por símbolo). Só banco.
 */
export async function serieRecenteCotacoes(
  prisma: PrismaClient,
  symbols: string[],
  desde: string,
): Promise<Map<string, PregaoRecente[]>> {
  const out = new Map<string, PregaoRecente[]>();
  const unicos = [...new Set(symbols)];
  for (let i = 0; i < unicos.length; i += LOTE_SERIE) {
    const lote = unicos.slice(i, i + LOTE_SERIE);
    const linhas = await prisma.assetQuoteDaily.findMany({
      where: { symbol: { in: lote }, date: { gte: deData(desde) } },
      select: { symbol: true, date: true, closeRaw: true, negocios: true },
      orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
    });
    for (const l of linhas) {
      const p: PregaoRecente = {
        date: paraData(l.date),
        closeRaw: paraNumero(l.closeRaw) ?? 0,
        negocios: l.negocios,
      };
      const lista = out.get(l.symbol);
      if (lista) lista.push(p);
      else out.set(l.symbol, [p]);
    }
  }
  return out;
}
