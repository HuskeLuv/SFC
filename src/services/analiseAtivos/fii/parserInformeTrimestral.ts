/**
 * Parser do Informe Trimestral de FII (inf_trimestral_fii_AAAA.zip) em streaming: `imovel`,
 * `ativo`, `complemento` e `resultado_contabil_financeiro`. Por (CNPJ, trimestre) fica a MAIOR
 * Versao de cada entrada. Data_Referencia é normalizada para o último dia do trimestre (há
 * '2026-03-30' no arquivo). Percentuais do `imovel` e do `complemento` (frações) viram p.p.
 */
import { lerCsv, type EspecCsv, type LinhaCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { linhasDaEntrada } from '@/services/analiseAtivos/fontes/zipStream';
import {
  entradasObrigatorias,
  fimDoTrimestre,
  fracaoParaPct,
  numeroCvm,
  preFiltroCnpj,
} from '@/services/analiseAtivos/fii/fiiArquivos';
import type { LinhaAtivoFii } from '@/services/analiseAtivos/regras/fii/cris';
import {
  FAIXAS_VENCIMENTO,
  type ImovelTrimestral,
} from '@/services/analiseAtivos/regras/fii/imoveis';

const ALIASES = { CNPJ_Fundo: 'CNPJ_Fundo_Classe', Nome_Fundo: 'Nome_Fundo_Classe' };
const COL_FAIXA = (fx: string) => `Percentual_Vencimento_Receita_FII_Faixa_${fx}`;

export const COLUNAS_TRIMESTRAL = {
  imovel: [
    'CNPJ_Fundo_Classe',
    'Data_Referencia',
    'Versao',
    'Classe',
    'Area',
    'Percentual_Vacancia',
    'Percentual_Inadimplencia',
    'Percentual_Receitas_FII',
  ],
  ativo: [
    'CNPJ_Fundo_Classe',
    'Data_Referencia',
    'Versao',
    'Tipo',
    'Emissor',
    'Emissao',
    'Serie',
    'Codigo_Acao',
    'Nome_Ativo',
    'Valor',
  ],
  complemento: [
    'CNPJ_Fundo_Classe',
    'Data_Referencia',
    'Versao',
    ...FAIXAS_VENCIMENTO.map(([fx]) => COL_FAIXA(fx)),
    'Percentual_Indexador_Receita_FII_IPCA',
    'Percentual_Indexador_Receita_FII_IGPM',
  ],
  resultado: [
    'CNPJ_Fundo_Classe',
    'Data_Referencia',
    'Versao',
    'Receita_Aluguel_Investimento_Financeiro',
    'Resultado_Trimestral_Liquido_Financeiro',
    'Rendimentos_Declarados',
    'Taxa_Desempenho_Financeiro',
  ],
} as const;

export interface AtivoTrimestral extends LinhaAtivoFii {
  codigo: string;
}

export interface FiiTrimestreBruto {
  cnpj: string;
  refQuarter: string;
  versao: number;
  imoveis: ImovelTrimestral[];
  ativos: AtivoTrimestral[];
  faixas: Record<string, number | null> | null;
  idxIpcaPct: number | null;
  idxIgpmPct: number | null;
  receitaAluguel: number | null;
  resultadoTrimestral: number | null;
  rendimentosDeclarados: number | null;
  taxaPerformance: number | null;
}

interface Contadores {
  lidas: number;
  rejeitadas: number;
}

export interface OpcoesParserTrimestral {
  cnpjs?: Set<string>;
  arquivo: string;
}

export interface ResultadoParserTrimestral {
  trimestres: FiiTrimestreBruto[];
  linhasLidas: number;
  rejeitadas: number;
}

/** Linhas por (cnpj|ref) agrupadas por versão; no fim fica só a maior. */
class PorVersao<T> {
  private readonly m = new Map<string, { versao: number; itens: T[] }>();
  add(k: string, versao: number, item: T): void {
    const atual = this.m.get(k);
    if (!atual || versao > atual.versao) this.m.set(k, { versao, itens: [item] });
    else if (versao === atual.versao) atual.itens.push(item);
  }
  entries() {
    return this.m.entries();
  }
  get(k: string) {
    return this.m.get(k);
  }
}

function chaveDaLinha(l: LinhaCsv, c: Contadores): { k: string; versao: number } | null {
  c.lidas++;
  const cnpj = l.get('CNPJ_Fundo_Classe');
  const data = l.get('Data_Referencia');
  if (!cnpj || !/^\d{4}-\d{2}-\d{2}/.test(data)) {
    c.rejeitadas++;
    return null;
  }
  return { k: `${cnpj}|${fimDoTrimestre(data)}`, versao: numeroCvm(l.get('Versao')) ?? 0 };
}

function spec(cols: readonly string[], opts: OpcoesParserTrimestral, entrada: string): EspecCsv {
  return {
    separador: ';',
    obrigatorias: [...cols],
    aliases: ALIASES,
    preFiltro: preFiltroCnpj(opts.cnpjs),
    arquivo: `${opts.arquivo}:${entrada}`,
  };
}

export interface EntradasTrimestral {
  imovel: AsyncIterable<string>;
  ativo: AsyncIterable<string>;
  complemento: AsyncIterable<string>;
  resultado: AsyncIterable<string>;
}

/** Entradas podem ser consumidas uma a uma (fábricas) para nunca abrir duas ao mesmo tempo. */
export async function lerInformeTrimestralLinhas(
  entradas: { [K in keyof EntradasTrimestral]: () => AsyncIterable<string> },
  opts: OpcoesParserTrimestral,
): Promise<ResultadoParserTrimestral> {
  const c: Contadores = { lidas: 0, rejeitadas: 0 };

  const imoveis = new PorVersao<ImovelTrimestral>();
  for await (const l of lerCsv(
    entradas.imovel(),
    spec(COLUNAS_TRIMESTRAL.imovel, opts, 'imovel'),
  )) {
    const k = chaveDaLinha(l, c);
    if (!k) continue;
    imoveis.add(k.k, k.versao, {
      classe: l.get('Classe'),
      area: numeroCvm(l.get('Area')),
      vacanciaPct: fracaoParaPct(numeroCvm(l.get('Percentual_Vacancia'))),
      inadimplenciaPct: fracaoParaPct(numeroCvm(l.get('Percentual_Inadimplencia'))),
      receitaPct: fracaoParaPct(numeroCvm(l.get('Percentual_Receitas_FII'))),
    });
  }

  const ativos = new PorVersao<AtivoTrimestral>();
  for await (const l of lerCsv(entradas.ativo(), spec(COLUNAS_TRIMESTRAL.ativo, opts, 'ativo'))) {
    const k = chaveDaLinha(l, c);
    if (!k) continue;
    ativos.add(k.k, k.versao, {
      tipo: l.get('Tipo'),
      emissor: l.get('Emissor'),
      nomeAtivo: l.get('Nome_Ativo'),
      emissao: l.get('Emissao'),
      serie: l.get('Serie'),
      codigo: l.get('Codigo_Acao'),
      valor: numeroCvm(l.get('Valor')),
    });
  }

  type Comp = { faixas: Record<string, number | null>; ipca: number | null; igpm: number | null };
  const comp = new PorVersao<Comp>();
  for await (const l of lerCsv(
    entradas.complemento(),
    spec(COLUNAS_TRIMESTRAL.complemento, opts, 'complemento'),
  )) {
    const k = chaveDaLinha(l, c);
    if (!k) continue;
    const faixas: Record<string, number | null> = {};
    for (const [fx] of FAIXAS_VENCIMENTO) faixas[fx] = numeroCvm(l.get(COL_FAIXA(fx)));
    comp.add(k.k, k.versao, {
      faixas,
      ipca: fracaoParaPct(numeroCvm(l.get('Percentual_Indexador_Receita_FII_IPCA'))),
      igpm: fracaoParaPct(numeroCvm(l.get('Percentual_Indexador_Receita_FII_IGPM'))),
    });
  }

  type Res = Pick<
    FiiTrimestreBruto,
    'receitaAluguel' | 'resultadoTrimestral' | 'rendimentosDeclarados' | 'taxaPerformance'
  >;
  const res = new PorVersao<Res>();
  for await (const l of lerCsv(
    entradas.resultado(),
    spec(COLUNAS_TRIMESTRAL.resultado, opts, 'resultado_contabil_financeiro'),
  )) {
    const k = chaveDaLinha(l, c);
    if (!k) continue;
    res.add(k.k, k.versao, {
      receitaAluguel: numeroCvm(l.get('Receita_Aluguel_Investimento_Financeiro')),
      resultadoTrimestral: numeroCvm(l.get('Resultado_Trimestral_Liquido_Financeiro')),
      rendimentosDeclarados: numeroCvm(l.get('Rendimentos_Declarados')),
      taxaPerformance: numeroCvm(l.get('Taxa_Desempenho_Financeiro')),
    });
  }

  const chaves = new Set<string>();
  for (const m of [imoveis, ativos, comp, res] as Array<PorVersao<unknown>>) {
    for (const [k] of m.entries()) chaves.add(k);
  }
  const trimestres: FiiTrimestreBruto[] = [];
  for (const k of [...chaves].sort()) {
    const [cnpj, refQuarter] = k.split('|');
    const im = imoveis.get(k);
    const at = ativos.get(k);
    const co = comp.get(k);
    const re = res.get(k);
    trimestres.push({
      cnpj,
      refQuarter,
      versao: Math.max(im?.versao ?? 0, at?.versao ?? 0, co?.versao ?? 0, re?.versao ?? 0),
      imoveis: im?.itens ?? [],
      ativos: at?.itens ?? [],
      faixas: co?.itens[0]?.faixas ?? null,
      idxIpcaPct: co?.itens[0]?.ipca ?? null,
      idxIgpmPct: co?.itens[0]?.igpm ?? null,
      receitaAluguel: re?.itens[0]?.receitaAluguel ?? null,
      resultadoTrimestral: re?.itens[0]?.resultadoTrimestral ?? null,
      rendimentosDeclarados: re?.itens[0]?.rendimentosDeclarados ?? null,
      taxaPerformance: re?.itens[0]?.taxaPerformance ?? null,
    });
  }
  return { trimestres, linhasLidas: c.lidas, rejeitadas: c.rejeitadas };
}

export async function lerInformeTrimestralZip(
  caminho: string,
  opts: OpcoesParserTrimestral,
): Promise<ResultadoParserTrimestral> {
  const e = await entradasObrigatorias(caminho, opts.arquivo, {
    imovel: /^inf_trimestral_fii_imovel_\d{4}\.csv$/,
    ativo: /^inf_trimestral_fii_ativo_\d{4}\.csv$/,
    complemento: /^inf_trimestral_fii_complemento_\d{4}\.csv$/,
    resultado: /^inf_trimestral_fii_resultado_contabil_financeiro_\d{4}\.csv$/,
  });
  return lerInformeTrimestralLinhas(
    {
      imovel: () => linhasDaEntrada(caminho, e.imovel),
      ativo: () => linhasDaEntrada(caminho, e.ativo),
      complemento: () => linhasDaEntrada(caminho, e.complemento),
      resultado: () => linhasDaEntrada(caminho, e.resultado),
    },
    opts,
  );
}
