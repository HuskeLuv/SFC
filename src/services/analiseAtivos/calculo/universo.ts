/**
 * Universo e dados-base compartilhados pelas etapas do cálculo (fatia D). Tudo o que vem de tabelas
 * de outras fatias chega pelos repositórios da fatia 0.
 */
import type { PrismaClient } from '@prisma/client';
import { contagensAcoes } from '@/services/analiseAtivos/repositorio/acoes';
import { fiiMensalSerie } from '@/services/analiseAtivos/repositorio/fii';
import {
  listarEmissores,
  listarFiisListados,
  listarTickersAcoes,
} from '@/services/analiseAtivos/repositorio/universo';
import type {
  ContagemAcoes,
  EmissorInfo,
  FiiMes,
  ScoringParams,
  TickerAcao,
  TickerFii,
} from '@/services/analiseAtivos/tipos';

export interface Universo {
  acoes: TickerAcao[];
  /** FIIs vigentes (conferidos ou não; o score filtra por params.fii.exigirTickerConferido) */
  fiis: TickerFii[];
  emissores: Map<string, EmissorInfo>;
  classe: Map<string, 'acao' | 'fii'>;
  cnpjDoSimbolo: Map<string, string>;
  /** símbolos extras só para proventos/eventos (script de dev, sem cadastro) */
  extras: string[];
}

/** Só os campos do Informe Mensal que a fatia D usa (a série inteira fica em memória). */
export type FiiMesEnxuto = Pick<
  FiiMes,
  | 'cnpj'
  | 'refMonth'
  | 'vpCota'
  | 'pl'
  | 'cotas'
  | 'obrigacoesPlPct'
  | 'fatorDesdobramento'
  | 'tipoVigente'
  | 'reguaVigente'
>;

export interface DadosBase {
  universo: Universo;
  contagensPorCnpj: Map<string, ContagemAcoes[]>;
  fiiMensalPorCnpj: Map<string, FiiMesEnxuto[]>;
}

export function enxugarFiiMes(m: FiiMes): FiiMesEnxuto {
  return {
    cnpj: m.cnpj,
    refMonth: m.refMonth,
    vpCota: m.vpCota,
    pl: m.pl,
    cotas: m.cotas,
    obrigacoesPlPct: m.obrigacoesPlPct,
    fatorDesdobramento: m.fatorDesdobramento,
    tipoVigente: m.tipoVigente,
    reguaVigente: m.reguaVigente,
  };
}

/**
 * Série mensal de FII em lotes de CNPJ, enxugada logo após a leitura: a linha completa do
 * repositório traz ~20 Decimals e a série de ~500 fundos × 120 meses passaria de 300 MB de RSS.
 */
const LOTE_FII_MENSAL = 20;
async function fiiMensalEnxuto(prisma: PrismaClient, cnpjs: string[]): Promise<FiiMesEnxuto[]> {
  const out: FiiMesEnxuto[] = [];
  for (let i = 0; i < cnpjs.length; i += LOTE_FII_MENSAL) {
    const lote = await fiiMensalSerie(prisma, cnpjs.slice(i, i + LOTE_FII_MENSAL), FII_SERIE_DESDE);
    for (const m of lote) out.push(enxugarFiiMes(m));
  }
  return out;
}

export function agrupar<T, K>(itens: T[], chave: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const i of itens) {
    const k = chave(i);
    const lista = m.get(k);
    if (lista) lista.push(i);
    else m.set(k, [i]);
  }
  return m;
}

export function simbolosDoUniverso(u: Universo): string[] {
  return [
    ...new Set([...u.acoes.map((a) => a.symbol), ...u.fiis.map((f) => f.symbol), ...u.extras]),
  ].sort();
}

/** Desde quando ler a série mensal de FII (cotas para eventos; VP/cota anual). */
export const FII_SERIE_DESDE = '2016-01-01';

export async function carregarDadosBase(
  prisma: PrismaClient,
  params: ScoringParams,
  extras?: { acao?: string[]; fii?: string[] },
): Promise<DadosBase> {
  const [acoes, fiis] = await Promise.all([listarTickersAcoes(prisma), listarFiisListados(prisma)]);
  const cnpjsAcoes = [...new Set(acoes.map((a) => a.cnpj))];
  const cnpjsFii = [...new Set(fiis.map((f) => f.cnpj))];
  const [emissores, contagens] = await Promise.all([
    cnpjsAcoes.length ? listarEmissores(prisma, cnpjsAcoes, params) : Promise.resolve([]),
    contagensAcoes(prisma, cnpjsAcoes),
  ]);
  const mensal = await fiiMensalEnxuto(prisma, cnpjsFii);
  const classe = new Map<string, 'acao' | 'fii'>();
  const cnpjDoSimbolo = new Map<string, string>();
  for (const a of acoes) {
    classe.set(a.symbol, 'acao');
    cnpjDoSimbolo.set(a.symbol, a.cnpj);
  }
  for (const f of fiis) {
    classe.set(f.symbol, 'fii');
    cnpjDoSimbolo.set(f.symbol, f.cnpj);
  }
  const extrasLista: string[] = [];
  for (const s of extras?.acao ?? []) {
    if (!classe.has(s)) {
      classe.set(s, 'acao');
      extrasLista.push(s);
    }
  }
  for (const s of extras?.fii ?? []) {
    if (!classe.has(s)) {
      classe.set(s, 'fii');
      extrasLista.push(s);
    }
  }
  return {
    universo: {
      acoes,
      fiis,
      emissores: new Map(emissores.map((e) => [e.cnpj, e])),
      classe,
      cnpjDoSimbolo,
      extras: extrasLista,
    },
    contagensPorCnpj: agrupar(contagens, (c) => c.cnpj),
    fiiMensalPorCnpj: agrupar(mensal, (m) => m.cnpj),
  };
}
