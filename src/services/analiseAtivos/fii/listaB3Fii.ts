/**
 * Lista pública de FIIs listados na B3 (endpoint do site, payload JSON em base64, não documentado):
 * - GetListFunds (paginado, 300 ms entre páginas) ⇒ sigla + razão social + nome de pregão. Uma lista
 *   por typeFund: 'FII' (~6 páginas de 100), 'FIAGRO' (~50 fundos) e 'FI-INFRA' (~40 fundos) — os
 *   dois últimos são analisados como FII de papel (decisão de produto de 04/11/2026);
 * - GetDetailFund (por fundo, com o MESMO typeFund da lista: Fiagro consultado como 'FII' volta sem
 *   código de negociação) ⇒ CNPJ, códigos de negociação e tipo. É caro (~0,5 s por fundo), então
 *   o cron só consulta os fundos novos/sem casamento e um lote rolante; o backfill consulta todos.
 *   Na lista FI-INFRA o `id` é o código do tipo (27, igual em todos): o detalhe sai pela sigla.
 * Download via baixarParaArquivo (allowlist, timeout, limite de bytes) e leitura do JSON do disco.
 * Resposta fora do formato esperado ⇒ ErroLayoutFonte (a B3 mudou o endpoint: falha alto).
 */
import { readFile } from 'fs/promises';
import { baixarParaArquivo } from '@/services/analiseAtivos/fontes/download';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import type { ItemListaB3 } from '@/services/analiseAtivos/regras/fii/tickerCnpj';

const BASE = 'https://sistemaswebb3-listados.b3.com.br/fundsListedProxy/Search/';
export const LIMITES_B3 = { maxBytes: 5_000_000, timeoutMs: 30_000, pausaMs: 300 } as const;

/** typeFund das listas da B3 que entram no mapa ticker ↔ CNPJ (FiiTickerMap.tipoFundo). */
export const TIPOS_FUNDO_B3 = ['FII', 'FIAGRO', 'FI-INFRA'] as const;
export type TipoFundoB3 = (typeof TIPOS_FUNDO_B3)[number];

export interface ItemListaB3Bruto {
  id: number;
  acronym: string;
  fundName: string;
  tradingName: string;
  typeName: string | null;
  /** lista de origem (typeFund do GetListFunds); ausente = 'FII' (listas gravadas antes) */
  tipoFundo?: TipoFundoB3;
}

export interface DetalheFundoB3 {
  cnpj: string | null;
  tradingCode: string | null;
  typeName: string | null;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function urlListaFundos(pagina: number, tamanho = 100, tipo: TipoFundoB3 = 'FII'): string {
  return `${BASE}GetListFunds/${b64({
    language: 'pt-br',
    pageNumber: pagina,
    pageSize: tamanho,
    keyword: '',
    typeFund: tipo,
  })}`;
}

/** typeFund do detalhe: o da lista, ou o typeName da lista FII quando ele diz FIAGRO/FI-INFRA. */
export function tipoDoDetalhe(item: Pick<ItemListaB3Bruto, 'tipoFundo' | 'typeName'>): TipoFundoB3 {
  if (item.tipoFundo && item.tipoFundo !== 'FII') return item.tipoFundo;
  const t = (item.typeName ?? '').trim().toUpperCase();
  return t === 'FIAGRO' || t === 'FI-INFRA' ? t : 'FII';
}

export function urlDetalheFundo(
  item: Pick<ItemListaB3Bruto, 'id' | 'acronym'> &
    Partial<Pick<ItemListaB3Bruto, 'tipoFundo' | 'typeName'>>,
): string {
  return `${BASE}GetDetailFund/${b64({
    language: 'pt-br',
    idFNET: String(item.id),
    idCEM: item.acronym,
    typeFund: tipoDoDetalhe({ tipoFundo: item.tipoFundo, typeName: item.typeName ?? null }),
  })}`;
}

async function baixarJson(url: string, timeoutMs: number): Promise<string> {
  const r = await baixarParaArquivo(url, { maxBytes: LIMITES_B3.maxBytes, timeoutMs });
  try {
    return r.caminho ? await readFile(r.caminho, 'utf8') : '';
  } finally {
    await r.descartar();
  }
}

/** Valida e normaliza uma página de GetListFunds (`tipo` = typeFund pedido). */
export function lerPaginaLista(
  texto: string,
  tipo: TipoFundoB3 = 'FII',
): { totalPaginas: number; itens: ItemListaB3Bruto[] } {
  let j: unknown;
  try {
    j = JSON.parse(texto);
  } catch {
    throw new ErroLayoutFonte('b3:GetListFunds', ['json']);
  }
  const o = j as { page?: { totalPages?: unknown }; results?: unknown };
  if (!o || typeof o.page?.totalPages !== 'number' || !Array.isArray(o.results)) {
    throw new ErroLayoutFonte('b3:GetListFunds', ['page.totalPages', 'results']);
  }
  const itens: ItemListaB3Bruto[] = [];
  for (const r of o.results as Array<Record<string, unknown>>) {
    if (typeof r.acronym !== 'string' || typeof r.fundName !== 'string') {
      throw new ErroLayoutFonte('b3:GetListFunds', ['acronym', 'fundName']);
    }
    itens.push({
      id: Number(r.id),
      acronym: r.acronym.trim().toUpperCase(),
      fundName: r.fundName.trim(),
      tradingName: typeof r.tradingName === 'string' ? r.tradingName.trim() : '',
      typeName: typeof r.typeName === 'string' ? r.typeName.trim() : null,
      tipoFundo: tipo,
    });
  }
  return { totalPaginas: o.page.totalPages, itens };
}

/**
 * Junta as listas: a mesma sigla repetida (entre páginas ou entre listas) fica uma só — a 1ª, mas a
 * de uma lista FIAGRO/FI-INFRA vence a da lista FII (o tipo específico é o certo).
 */
export function juntarListas(itens: ItemListaB3Bruto[]): ItemListaB3Bruto[] {
  const porSigla = new Map<string, ItemListaB3Bruto>();
  for (const i of itens) {
    const atual = porSigla.get(i.acronym);
    const especifico = (x: ItemListaB3Bruto) => (x.tipoFundo ?? 'FII') !== 'FII';
    if (!atual || (!especifico(atual) && especifico(i))) porSigla.set(i.acronym, i);
  }
  return [...porSigla.values()];
}

export async function baixarListaB3Fii(
  opts: {
    timeoutMs?: number;
    pausaMs?: number;
    maxPaginas?: number;
    tipos?: readonly TipoFundoB3[];
  } = {},
): Promise<ItemListaB3Bruto[]> {
  const todos: ItemListaB3Bruto[] = [];
  const maxPaginas = opts.maxPaginas ?? 30;
  for (const tipo of opts.tipos ?? TIPOS_FUNDO_B3) {
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const texto = await baixarJson(
        urlListaFundos(pagina, 100, tipo),
        opts.timeoutMs ?? LIMITES_B3.timeoutMs,
      );
      const p = lerPaginaLista(texto, tipo);
      todos.push(...p.itens);
      if (pagina >= p.totalPaginas) break;
      await dormir(opts.pausaMs ?? LIMITES_B3.pausaMs);
    }
  }
  return juntarListas(todos);
}

/** Resposta vazia = fundo sem detalhe (null); JSON sem campos esperados ⇒ layout. */
export function lerDetalheFundo(texto: string): DetalheFundoB3 | null {
  if (texto.trim() === '') return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    throw new ErroLayoutFonte('b3:GetDetailFund', ['json']);
  }
  if (!j || typeof j !== 'object' || !('cnpj' in j) || !('tradingCode' in j)) {
    throw new ErroLayoutFonte('b3:GetDetailFund', ['cnpj', 'tradingCode']);
  }
  return {
    cnpj: typeof j.cnpj === 'string' && j.cnpj.trim() ? j.cnpj.trim() : null,
    tradingCode: typeof j.tradingCode === 'string' ? j.tradingCode.trim() : null,
    typeName: typeof j.typeName === 'string' ? j.typeName.trim() : null,
  };
}

export async function baixarDetalheFundo(
  item: Pick<ItemListaB3Bruto, 'id' | 'acronym'> &
    Partial<Pick<ItemListaB3Bruto, 'tipoFundo' | 'typeName'>>,
  opts: { timeoutMs?: number } = {},
): Promise<DetalheFundoB3 | null> {
  return lerDetalheFundo(
    await baixarJson(urlDetalheFundo(item), opts.timeoutMs ?? LIMITES_B3.timeoutMs),
  );
}

/**
 * Junta item da lista + detalhe no formato das regras. Item de lista FIAGRO/FI-INFRA mantém o tipo
 * da lista (o detalhe só repete o typeFund pedido); na lista FII o tipo do detalhe prevalece.
 */
export function paraItemRegra(b: ItemListaB3Bruto, d: DetalheFundoB3 | null): ItemListaB3 {
  const tipoLista = b.tipoFundo ?? 'FII';
  return {
    acronym: b.acronym,
    fundName: b.fundName,
    tradingName: b.tradingName,
    isin: null, // a lista da B3 não traz ISIN (ver pendências)
    cnpjB3: d?.cnpj ?? null,
    tradingCode: d?.tradingCode ?? null,
    typeName: tipoLista !== 'FII' ? tipoLista : (d?.typeName ?? b.typeName),
    tipoLista,
  };
}
