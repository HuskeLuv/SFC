/**
 * Leituras de proventos e eventos corporativos das tabelas EXISTENTES do app (asset_dividend_history,
 * market_data_coverage, asset_corporate_actions) — SÓ LEITURA, nunca escrita.
 *
 * Convenção de datas por fonte (params.sanidade.proventos.camposPorFonte):
 *  - BRAPI: date = pagamento; dataCom = data EX (bug conhecido: o app grava a ex no campo dataCom)
 *  - YAHOO: date = data EX; dataCom null; sem pagamento
 */
import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { deData, paraData } from '@/services/analiseAtivos/repositorio/conversao';
import type {
  CoberturaProventos,
  EventoCorporativoBruto,
  ProventoBruto,
  ScoringParams,
} from '@/services/analiseAtivos/tipos';

/** Impressão digital das linhas de um símbolo: detecta inclusão, alteração e remoção sem createdAt. */
export interface ImpressaoProventos {
  n: number;
  somaValor: number;
  hash: string;
}

export type ProventosBrutos = ProventoBruto[] & { impressoes: Map<string, ImpressaoProventos> };

interface LinhaDividendo {
  id: string;
  symbol: string;
  date: Date;
  dataCom: Date | null;
  tipo: string;
  valorUnitario: number;
  source: string;
}

export function impressaoDigital(linhas: LinhaDividendo[]): ImpressaoProventos {
  const chaves = linhas
    .map((l) => `${l.id}|${paraData(l.date)}|${paraData(l.dataCom) ?? ''}|${l.valorUnitario}`)
    .sort();
  return {
    n: linhas.length,
    somaValor: linhas.reduce((s, l) => s + l.valorUnitario, 0),
    hash: createHash('sha1').update(chaves.join('\n')).digest('hex'),
  };
}

export function paraProventoBruto(l: LinhaDividendo, params: ScoringParams): ProventoBruto {
  const convencoes = params.sanidade.proventos.camposPorFonte;
  const campos = convencoes[l.source] ?? convencoes[params.sanidade.proventos.fontePreferida];
  const dataEx = campos?.dataEx === 'date' ? l.date : l.dataCom;
  const pagamento = campos?.dataPagamento === 'date' ? l.date : null;
  return {
    id: l.id,
    symbol: l.symbol,
    source: l.source,
    tipo: l.tipo,
    valor: l.valorUnitario,
    dataPagamento: paraData(pagamento),
    dataExGravada: paraData(dataEx),
    dataExOrigem: dataEx ? (campos?.dataEx ?? null) : null,
  };
}

/**
 * Proventos brutos dos símbolos, já na convenção de datas por fonte, + impressão digital por símbolo
 * (`resultado.impressoes`). `desde` filtra por `date` (a impressão cobre só as linhas lidas: para
 * detectar remoções, a D chama sem `desde`).
 */
export async function proventosBrutos(
  prisma: PrismaClient,
  symbols: string[],
  desde?: string,
  params: ScoringParams = SCORING_PARAMS_V1,
): Promise<ProventosBrutos> {
  const linhas: LinhaDividendo[] =
    symbols.length === 0
      ? []
      : await prisma.assetDividendHistory.findMany({
          where: { symbol: { in: symbols }, ...(desde ? { date: { gte: deData(desde) } } : {}) },
          select: {
            id: true,
            symbol: true,
            date: true,
            dataCom: true,
            tipo: true,
            valorUnitario: true,
            source: true,
          },
          orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
        });
  const porSymbol = new Map<string, LinhaDividendo[]>();
  for (const l of linhas) porSymbol.set(l.symbol, [...(porSymbol.get(l.symbol) ?? []), l]);
  const impressoes = new Map<string, ImpressaoProventos>();
  for (const s of symbols) impressoes.set(s, impressaoDigital(porSymbol.get(s) ?? []));
  return Object.assign(
    linhas.map((l) => paraProventoBruto(l, params)),
    { impressoes },
  );
}

/**
 * Status da cobertura por símbolo + `verificadoEm` (lastCheckedAt, 'AAAA-MM-DD'; só símbolos com
 * linha em market_data_coverage) para o frescor da base (motivoProventosDefasados).
 */
export async function coberturaProventos(
  prisma: PrismaClient,
  symbols: string[],
): Promise<Map<string, CoberturaProventos> & { verificadoEm: Map<string, string | null> }> {
  const out = new Map<string, CoberturaProventos>(symbols.map((s) => [s, null]));
  const verificadoEm = new Map<string, string | null>();
  if (symbols.length === 0) return Object.assign(out, { verificadoEm });
  const linhas = await prisma.marketDataCoverage.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, status: true, lastCheckedAt: true },
  });
  const validos = new Set(['OK', 'EMPTY', 'FETCH_FAIL', 'GAP_QUEUED']);
  for (const l of linhas) {
    out.set(l.symbol, validos.has(l.status) ? (l.status as CoberturaProventos) : null);
    verificadoEm.set(l.symbol, l.lastCheckedAt ? l.lastCheckedAt.toISOString().slice(0, 10) : null);
  }
  return Object.assign(out, { verificadoEm });
}

export async function eventosCorporativosBrutos(
  prisma: PrismaClient,
  symbols: string[],
): Promise<EventoCorporativoBruto[]> {
  if (symbols.length === 0) return [];
  const linhas = await prisma.assetCorporateAction.findMany({
    where: { symbol: { in: symbols } },
    select: { id: true, symbol: true, date: true, type: true, factor: true, source: true },
    orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
  });
  return linhas.map((l) => ({
    id: l.id,
    symbol: l.symbol,
    date: paraData(l.date),
    type: l.type,
    factor: l.factor,
    source: l.source,
  }));
}
