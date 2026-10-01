/**
 * Escrita (e leitura do próprio estado) das tabelas da fatia D: asset_proventos_auditados,
 * asset_corporate_action_checks, asset_per_share_yearly, asset_multiples_yearly,
 * asset_multiples_current e asset_scores. Nenhuma outra tabela é escrita aqui.
 *
 * Padrão: reescrita POR SÍMBOLO numa transação em lote (deleteMany symbol IN … + createMany), em lotes
 * de até 1.000 linhas — idempotente (rodar 2× dá o mesmo estado) e sem órfãos. Em dry-run
 * (ctx.aplicar = false) nada é gravado; as funções devolvem o que gravariam.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import type { EventoVerificadoCompleto } from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import type {
  ProventoAuditadoCompleto,
  ProventoGravadoChave,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import { deData, paraData } from '@/services/analiseAtivos/repositorio/conversao';

export const LOTE_ESCRITA = 1000;

/** Agrupa símbolos em lotes cujo total de linhas não passa de `max` (símbolo nunca é partido). */
export function lotesPorSimbolo<T extends { symbol: string }>(
  simbolos: string[],
  linhas: T[],
  max = LOTE_ESCRITA,
): Array<{ simbolos: string[]; linhas: T[] }> {
  const porSimbolo = new Map<string, T[]>();
  for (const l of linhas) {
    const lista = porSimbolo.get(l.symbol);
    if (lista) lista.push(l);
    else porSimbolo.set(l.symbol, [l]);
  }
  const lotes: Array<{ simbolos: string[]; linhas: T[] }> = [];
  let atual: { simbolos: string[]; linhas: T[] } = { simbolos: [], linhas: [] };
  for (const s of [...new Set(simbolos)]) {
    const ls = porSimbolo.get(s) ?? [];
    if (atual.simbolos.length > 0 && atual.linhas.length + ls.length > max) {
      lotes.push(atual);
      atual = { simbolos: [], linhas: [] };
    }
    atual.simbolos.push(s);
    atual.linhas.push(...ls);
  }
  if (atual.simbolos.length > 0) lotes.push(atual);
  return lotes;
}

type ClienteLote = Pick<PrismaClient, '$transaction'>;

async function reescrever<T extends { symbol: string }>(
  prisma: ClienteLote,
  simbolos: string[],
  linhas: T[],
  ops: (simbolosLote: string[], linhasLote: T[]) => Prisma.PrismaPromise<unknown>[],
): Promise<number> {
  let gravadas = 0;
  for (const lote of lotesPorSimbolo(simbolos, linhas)) {
    await prisma.$transaction(ops(lote.simbolos, lote.linhas));
    gravadas += lote.linhas.length;
  }
  return gravadas;
}

// ---------------------------------------------------------------------------------------------
// Proventos auditados
// ---------------------------------------------------------------------------------------------

export async function lerProventosGravados(
  prisma: PrismaClient,
  simbolos?: string[],
): Promise<ProventoGravadoChave[]> {
  const linhas = await prisma.assetProventoAuditado.findMany({
    where: simbolos ? { symbol: { in: simbolos } } : {},
    select: {
      origemId: true,
      symbol: true,
      source: true,
      tipoOriginal: true,
      tipoNormalizado: true,
      valor: true,
      dataPagamento: true,
      dataExGravada: true,
      dataComReal: true,
      status: true,
      duplicataDe: true,
      fatorAjusteHoje: true,
      flags: true,
    },
  });
  return linhas.map((l) => ({
    ...l,
    tipoNormalizado: l.tipoNormalizado as ProventoGravadoChave['tipoNormalizado'],
    status: l.status as ProventoGravadoChave['status'],
    dataPagamento: paraData(l.dataPagamento),
    dataExGravada: paraData(l.dataExGravada),
    dataComReal: paraData(l.dataComReal),
  }));
}

/** Símbolos com linhas auditadas gravadas (para achar órfãos sem carregar as linhas). */
export async function lerSimbolosProventosGravados(prisma: PrismaClient): Promise<string[]> {
  const linhas = await prisma.assetProventoAuditado.findMany({
    distinct: ['symbol'],
    select: { symbol: true },
  });
  return linhas.map((l) => l.symbol);
}

function dataOuNull(s: string | null): Date | null {
  return s ? deData(s) : null;
}

export function linhaProvento(
  p: ProventoAuditadoCompleto,
  agora: Date,
): Prisma.AssetProventoAuditadoCreateManyInput {
  return {
    origemId: p.origemId,
    symbol: p.symbol,
    source: p.source,
    tipoOriginal: p.tipoOriginal,
    tipoNormalizado: p.tipoNormalizado,
    valor: p.valor,
    dataPagamento: dataOuNull(p.dataPagamento),
    dataExGravada: dataOuNull(p.dataExGravada),
    dataComReal: dataOuNull(p.dataComReal),
    dataExOrigem: p.dataExOrigem,
    status: p.status,
    duplicataDe: p.duplicataDe,
    fatorAjusteHoje: p.fatorAjusteHoje,
    valorAjustadoHoje: p.valorAjustadoHoje,
    flags: p.flags,
    auditadoEm: agora,
  };
}

/** Reescreve os símbolos alterados e apaga os órfãos (símbolos fora do universo). */
export async function gravarProventosAuditados(
  prisma: PrismaClient,
  simbolos: string[],
  linhas: ProventoAuditadoCompleto[],
  orfaos: string[],
): Promise<number> {
  const agora = new Date();
  const dados = linhas.map((l) => linhaProvento(l, agora));
  const n = await reescrever(prisma, simbolos, dados, (ss, ls) => [
    prisma.assetProventoAuditado.deleteMany({ where: { symbol: { in: ss } } }),
    prisma.assetProventoAuditado.createMany({ data: ls }),
  ]);
  if (orfaos.length > 0) {
    await prisma.assetProventoAuditado.deleteMany({ where: { symbol: { in: orfaos } } });
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// Eventos corporativos verificados
// ---------------------------------------------------------------------------------------------

export interface EventoGravado {
  symbol: string;
  cnpj: string | null;
  dataEvento: string;
  fator: number;
  tipo: string;
  anoBase: number;
  status: string;
  razaoCvm: number | null;
  idsOrigem: string[];
}

export async function lerEventosGravados(prisma: PrismaClient): Promise<EventoGravado[]> {
  const linhas = await prisma.assetCorporateActionCheck.findMany({
    select: {
      symbol: true,
      cnpj: true,
      dataEvento: true,
      fator: true,
      tipo: true,
      anoBase: true,
      status: true,
      razaoCvm: true,
      idsOrigem: true,
    },
  });
  return linhas.map((l) => ({
    ...l,
    dataEvento: paraData(l.dataEvento),
    fator: l.fator.toNumber(),
  }));
}

/** Impressão digital do evento gravado; inclui o CNPJ (mudança de formato também regrava). */
export function chaveEvento(e: Omit<EventoGravado, 'cnpj'> & { cnpj?: string | null }): string {
  return [
    e.symbol,
    e.cnpj ?? '',
    e.dataEvento,
    e.fator.toFixed(8),
    e.tipo,
    e.anoBase,
    e.status,
    e.razaoCvm === null ? '' : e.razaoCvm.toFixed(6),
    [...e.idsOrigem].sort().join(','),
  ].join('|');
}

export async function gravarEventosVerificados(
  prisma: PrismaClient,
  simbolos: string[],
  eventos: Array<EventoVerificadoCompleto & { cnpj: string | null }>,
): Promise<number> {
  const agora = new Date();
  const dados: Prisma.AssetCorporateActionCheckCreateManyInput[] = eventos.map((e) => ({
    symbol: e.symbol,
    cnpj: e.cnpj,
    dataEvento: deData(e.dataEvento),
    fator: e.fator.toFixed(8),
    tipo: e.tipo,
    anoBase: e.anoBase,
    status: e.status,
    razaoCvm: e.razaoCvm,
    fatorProdutoAno: e.fatorProdutoAno,
    idsOrigem: e.idsOrigem,
    fontes: e.fontes,
    verificadoEm: agora,
  }));
  return reescrever(prisma, simbolos, dados, (ss, ls) => [
    prisma.assetCorporateActionCheck.deleteMany({ where: { symbol: { in: ss } } }),
    prisma.assetCorporateActionCheck.createMany({ data: ls, skipDuplicates: true }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Per-share e múltiplos anuais
// ---------------------------------------------------------------------------------------------

export async function gravarPerShareAnual(
  prisma: PrismaClient,
  simbolos: string[],
  linhas: Prisma.AssetPerShareYearlyCreateManyInput[],
): Promise<number> {
  return reescrever(prisma, simbolos, linhas, (ss, ls) => [
    prisma.assetPerShareYearly.deleteMany({ where: { symbol: { in: ss } } }),
    prisma.assetPerShareYearly.createMany({ data: ls }),
  ]);
}

export async function gravarMultiplosAnuais(
  prisma: PrismaClient,
  simbolos: string[],
  linhas: Prisma.AssetMultiplesYearlyCreateManyInput[],
): Promise<number> {
  return reescrever(prisma, simbolos, linhas, (ss, ls) => [
    prisma.assetMultiplesYearly.deleteMany({ where: { symbol: { in: ss } } }),
    prisma.assetMultiplesYearly.createMany({ data: ls }),
  ]);
}

/** P/L anual gravado por símbolo (histórico para a média de 10 anos), com os três estados. */
export async function lerPlAnualGravado(
  prisma: PrismaClient,
  simbolos: string[],
): Promise<Map<string, Array<{ anoFiscal: number; pl: number | null; plNaoSeAplica: boolean }>>> {
  const out = new Map<
    string,
    Array<{ anoFiscal: number; pl: number | null; plNaoSeAplica: boolean }>
  >();
  if (simbolos.length === 0) return out;
  const linhas = await prisma.assetMultiplesYearly.findMany({
    where: { symbol: { in: simbolos } },
    select: { symbol: true, anoFiscal: true, pl: true, naoSeAplica: true },
    orderBy: [{ symbol: 'asc' }, { anoFiscal: 'asc' }],
  });
  for (const l of linhas) {
    const lista = out.get(l.symbol) ?? [];
    lista.push({ anoFiscal: l.anoFiscal, pl: l.pl, plNaoSeAplica: l.naoSeAplica.includes('pl') });
    out.set(l.symbol, lista);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Múltiplos atuais e scores
// ---------------------------------------------------------------------------------------------

export async function gravarMultiplosAtuais(
  prisma: PrismaClient,
  linhas: Prisma.AssetMultiplesCurrentCreateManyInput[],
): Promise<number> {
  const simbolos = linhas.map((l) => l.symbol);
  return reescrever(prisma, simbolos, linhas, (ss, ls) => [
    prisma.assetMultiplesCurrent.deleteMany({ where: { symbol: { in: ss } } }),
    prisma.assetMultiplesCurrent.createMany({ data: ls }),
  ]);
}

/** Regrava a chave (symbol, dataRef): 2 runs no mesmo dataRef dão o mesmo estado. */
export async function gravarScores(
  prisma: PrismaClient,
  dataRef: string,
  linhas: Prisma.AssetScoreCreateManyInput[],
): Promise<number> {
  const simbolos = linhas.map((l) => l.symbol);
  const data = deData(dataRef);
  return reescrever(prisma, simbolos, linhas, (ss, ls) => [
    prisma.assetScore.deleteMany({ where: { dataRef: data, symbol: { in: ss } } }),
    prisma.assetScore.createMany({ data: ls }),
  ]);
}

/**
 * Retenção de asset_scores: apaga dataRef < hoje − 40 dias que não seja o ÚLTIMO dataRef do seu mês.
 */
export async function aplicarRetencaoScores(
  prisma: PrismaClient,
  hoje: string,
  diasDiarios = 40,
): Promise<{ apagadas: number; datas: string[] }> {
  const corte = new Date(deData(hoje).getTime() - diasDiarios * 24 * 60 * 60 * 1000);
  const grupos = await prisma.assetScore.groupBy({
    by: ['dataRef'],
    where: { dataRef: { lt: corte } },
  });
  const datas = grupos.map((g) => paraData(g.dataRef)).sort();
  const ultimaDoMes = new Map<string, string>();
  for (const d of datas) ultimaDoMes.set(d.slice(0, 7), d);
  const apagar = datas.filter((d) => ultimaDoMes.get(d.slice(0, 7)) !== d);
  if (apagar.length === 0) return { apagadas: 0, datas: [] };
  const r = await prisma.assetScore.deleteMany({
    where: { dataRef: { in: apagar.map(deData) } },
  });
  return { apagadas: r.count, datas: apagar };
}
