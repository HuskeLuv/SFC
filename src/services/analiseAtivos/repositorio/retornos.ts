/**
 * Repositório dos retornos acumulados da cotação (A6, item 5; fatia C): asset_retornos_cotacao (PK
 * symbol) + as leituras do job (série de fechamento do COTAHIST e eventos de
 * asset_corporate_action_checks). Só banco.
 *
 * `lerRetornosPorSimbolos` é a leitura EM LOTE (uma consulta pela PK) que a fatia F usa no
 * Comparador; a página do ativo lê um símbolo (`lerRetornosSimbolo`).
 */
import type { AssetRetornosCotacao, PrismaClient } from '@prisma/client';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import type {
  EventoRetorno,
  PregaoRetorno,
} from '@/services/analiseAtivos/regras/calculo/retornosCotacao';
import type { EventoCorporativoVerificado } from '@/services/analiseAtivos/tipos';
import { ehClasseBr } from '@/types/analiseAtivosApi';
import {
  FLAGS_RETORNO,
  type FlagRetorno,
  type RetornosCalculados,
} from '@/types/analiseAtivosComplementos';

/** 'AAAA-MM-DD=preço,AAAA-MM-DD=preço,…' (string_agg de lerSerieRetornos) → pregões. */
export function parseSerieRetornos(serie: string | null): PregaoRetorno[] {
  if (!serie) return [];
  const partes = serie.split(',');
  const out: PregaoRetorno[] = new Array(partes.length);
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    out[i] = { date: p.slice(0, 10), closeRaw: Number(p.slice(11)) };
  }
  return out;
}

/**
 * Série de fechamento CRU (só pregões com negócio e fechamento > 0) de [desde, ate] por símbolo.
 * Os símbolos chegam em lotes do job (LOTE_RETORNOS). Uma linha POR SÍMBOLO com a série num texto
 * só (string_agg ordenado): o findMany linha a linha (~146 mil objetos com Decimal por lote de 50)
 * levava o pico do job a ~287 MB no DEV (universo simulado de 1.000 símbolos); arrays (array_agg),
 * a ~200 MB.
 */
export async function lerSerieRetornos(
  prisma: PrismaClient,
  symbols: readonly string[],
  desde: string,
  ate?: string,
): Promise<Map<string, PregaoRetorno[]>> {
  const out = new Map<string, PregaoRetorno[]>();
  if (symbols.length === 0) return out;
  const fim = ate ?? '9999-12-31';
  const linhas = await prisma.$queryRaw<Array<{ symbol: string; serie: string }>>`
    SELECT symbol,
           string_agg(to_char(date, 'YYYY-MM-DD') || '=' || "closeRaw"::text, ',' ORDER BY date)
             AS serie
      FROM asset_quotes_daily
     WHERE symbol = ANY(${[...symbols]}::text[])
       AND date >= ${desde}::date AND date <= ${fim}::date
       AND negocios > 0 AND "closeRaw" > 0
     GROUP BY symbol`;
  for (const l of linhas) out.set(l.symbol, parseSerieRetornos(l.serie));
  return out;
}

/** Eventos verificados (asset_corporate_action_checks) por símbolo. */
export async function lerEventosRetornos(
  prisma: PrismaClient,
  symbols: readonly string[],
): Promise<Map<string, EventoRetorno[]>> {
  const out = new Map<string, EventoRetorno[]>();
  if (symbols.length === 0) return out;
  const linhas = await prisma.assetCorporateActionCheck.findMany({
    where: { symbol: { in: [...symbols] } },
    select: { symbol: true, dataEvento: true, fator: true, status: true },
    orderBy: [{ symbol: 'asc' }, { dataEvento: 'asc' }],
  });
  for (const l of linhas) {
    const ev: EventoRetorno = {
      dataEvento: paraData(l.dataEvento),
      fator: paraNumero(l.fator) ?? 1,
      status: l.status as EventoCorporativoVerificado['status'],
    };
    const lista = out.get(l.symbol);
    if (lista) lista.push(ev);
    else out.set(l.symbol, [ev]);
  }
  return out;
}

/** Upsert por símbolo (idempotente), numa transação por lote. Devolve as linhas gravadas. */
export async function gravarRetornos(
  prisma: PrismaClient,
  linhas: readonly RetornosCalculados[],
  calculadoEm: Date = new Date(),
): Promise<number> {
  if (linhas.length === 0) return 0;
  await prisma.$transaction(
    linhas.map((r) => {
      const dados = {
        classe: r.classe,
        asOf: deData(r.asOf),
        preco: r.preco,
        ret1mPct: r.ret1mPct,
        ret12mPct: r.ret12mPct,
        ret5aAaPct: r.ret5aAaPct,
        ret10aAaPct: r.ret10aAaPct,
        precoMaxAjustado: r.precoMaxAjustado,
        distMaxPct: r.distMaxPct,
        dataMax: r.dataMax ? deData(r.dataMax) : null,
        inicioSerie: r.inicioSerie ? deData(r.inicioSerie) : null,
        pregoes: r.pregoes,
        flags: [...r.flags],
        calculadoEm,
      };
      return prisma.assetRetornosCotacao.upsert({
        where: { symbol: r.symbol },
        create: { symbol: r.symbol, ...dados },
        update: dados,
      });
    }),
  );
  return linhas.length;
}

const ehFlag = (f: string): f is FlagRetorno => (FLAGS_RETORNO as readonly string[]).includes(f);

/** Linha do banco → RetornosCalculados (classe desconhecida ⇒ null; flags desconhecidas fora). */
export function paraRetornosCalculados(l: AssetRetornosCotacao): RetornosCalculados | null {
  if (!ehClasseBr(l.classe)) return null;
  return {
    symbol: l.symbol,
    classe: l.classe,
    asOf: paraData(l.asOf),
    preco: paraNumero(l.preco),
    ret1mPct: l.ret1mPct,
    ret12mPct: l.ret12mPct,
    ret5aAaPct: l.ret5aAaPct,
    ret10aAaPct: l.ret10aAaPct,
    precoMaxAjustado: l.precoMaxAjustado,
    distMaxPct: l.distMaxPct,
    dataMax: l.dataMax ? paraData(l.dataMax) : null,
    inicioSerie: l.inicioSerie ? paraData(l.inicioSerie) : null,
    pregoes: l.pregoes ?? 0,
    flags: (l.flags ?? []).filter(ehFlag),
  };
}

/** Leitura EM LOTE pela PK (fatia F: Comparador). Símbolos sem linha ficam fora do Map. */
export async function lerRetornosPorSimbolos(
  prisma: PrismaClient,
  symbols: readonly string[],
): Promise<Map<string, RetornosCalculados>> {
  const out = new Map<string, RetornosCalculados>();
  const unicos = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (unicos.length === 0) return out;
  const linhas = await prisma.assetRetornosCotacao.findMany({ where: { symbol: { in: unicos } } });
  for (const l of linhas) {
    const r = paraRetornosCalculados(l);
    if (r) out.set(r.symbol, r);
  }
  return out;
}

/** Um símbolo pela PK (página do ativo); null = sem linha. */
export async function lerRetornosSimbolo(
  prisma: PrismaClient,
  symbol: string,
): Promise<RetornosCalculados | null> {
  const l = await prisma.assetRetornosCotacao.findUnique({
    where: { symbol: symbol.toUpperCase() },
  });
  return l ? paraRetornosCalculados(l) : null;
}
