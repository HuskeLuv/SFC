/**
 * Parser do Informe Trimestral de FII (inf_trimestral_fii_AAAA.zip) em streaming: `imovel`,
 * `ativo`, `complemento` e `resultado_contabil_financeiro`. Por (CNPJ, trimestre) fica a MAIOR
 * Versao de cada entrada. Data_Referencia é normalizada para o último dia do trimestre (há
 * '2026-03-30' no arquivo). Percentuais do `imovel` e do `complemento` (frações) viram p.p.
 *
 * A6 (fatia A): do `imovel` também Nome_Imovel, Endereco e Numero_Unidades (opcionais: o layout
 * 2019 com CNPJ_Fundo também os tem; '' e '-' viram null) e, quando a entrada existe, o CSV
 * `imovel_renda_acabado_inquilino` (setor do locatário), agregado em streaming num Map por
 * (fundo, trimestre, setor) — nunca guarda a linha. Setor vazio vira '' (normalizarSetor).
 */
import { cnpjOuOriginal } from '@/services/analiseAtivos/regras/comum/cnpj';
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
import { normalizarSetor, textoOpcional } from '@/services/analiseAtivos/regras/fii/listaImoveis';
import { listarEntradasZip } from '@/services/analiseAtivos/fontes/zipStream';
import path from 'path';

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
  /** entrada opcional (A6, fatia A) */
  inquilino: [
    'CNPJ_Fundo_Classe',
    'Data_Referencia',
    'Versao',
    'Setor_Atuacao',
    'Percentual_Receitas_FII',
  ],
} as const;

/** Colunas opcionais do `imovel` (A6, fatia A): lidas só quando existem no cabeçalho. */
export const COLUNAS_IMOVEL_OPCIONAIS = ['Nome_Imovel', 'Endereco', 'Numero_Unidades'] as const;

/** Setor do locatário agregado por (fundo, trimestre): soma do % da receita do FII (p.p.). */
export interface SetorInquilinoBruto {
  /** como informado; vazio = '' */
  setor: string;
  /** Σ Percentual_Receitas_FII das linhas do setor (p.p.); null = nenhuma linha com número */
  pctReceitaFii: number | null;
  nLinhas: number;
}

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
  /** maior Versao da entrada `imovel` (null = o fundo não tem linha de imóvel no trimestre) */
  versaoImovel: number | null;
  /** setores do CSV de inquilino; null = sem linha (ou a entrada não existe no zip) */
  setoresInquilino: SetorInquilinoBruto[] | null;
  versaoInquilino: number | null;
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
  const cnpj = cnpjOuOriginal(l.get('CNPJ_Fundo_Classe'));
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
  /** opcional (A6): ausente = sem setores de locatário */
  inquilino?: AsyncIterable<string>;
}

type FabricasTrimestral = {
  [K in keyof EntradasTrimestral]-?: () => AsyncIterable<string>;
};

function numeroInteiro(s: string): number | null {
  const n = numeroCvm(s);
  return n !== null && Number.isFinite(n) && Math.abs(n) < 2 ** 31 ? Math.round(n) : null;
}

/** Agregado por (cnpj|ref) na maior versão: setor → soma do % e nº de linhas. */
type AgregadoSetores = Map<string, { versao: number; setores: Map<string, SetorInquilinoBruto> }>;

async function lerInquilinos(
  linhas: AsyncIterable<string>,
  opts: OpcoesParserTrimestral,
  c: Contadores,
): Promise<AgregadoSetores> {
  const m: AgregadoSetores = new Map();
  for await (const l of lerCsv(
    linhas,
    spec(COLUNAS_TRIMESTRAL.inquilino, opts, 'imovel_renda_acabado_inquilino'),
  )) {
    const k = chaveDaLinha(l, c);
    if (!k) continue;
    let atual = m.get(k.k);
    if (!atual || k.versao > atual.versao) {
      atual = { versao: k.versao, setores: new Map() };
      m.set(k.k, atual);
    } else if (k.versao < atual.versao) continue;
    const setor = normalizarSetor(l.get('Setor_Atuacao'));
    const pct = fracaoParaPct(numeroCvm(l.get('Percentual_Receitas_FII')));
    const s = atual.setores.get(setor) ?? { setor, pctReceitaFii: null, nLinhas: 0 };
    s.nLinhas++;
    if (pct !== null && Number.isFinite(pct)) s.pctReceitaFii = (s.pctReceitaFii ?? 0) + pct;
    atual.setores.set(setor, s);
  }
  return m;
}

/** Entradas podem ser consumidas uma a uma (fábricas) para nunca abrir duas ao mesmo tempo. */
export async function lerInformeTrimestralLinhas(
  entradas: Omit<FabricasTrimestral, 'inquilino'> & Partial<Pick<FabricasTrimestral, 'inquilino'>>,
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
      nome: l.tem('Nome_Imovel') ? textoOpcional(l.get('Nome_Imovel')) : null,
      endereco: l.tem('Endereco') ? textoOpcional(l.get('Endereco')) : null,
      unidades: l.tem('Numero_Unidades') ? numeroInteiro(l.get('Numero_Unidades')) : null,
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

  const inquilinos = entradas.inquilino
    ? await lerInquilinos(entradas.inquilino(), opts, c)
    : (new Map() as AgregadoSetores);

  const chaves = new Set<string>();
  for (const m of [imoveis, ativos, comp, res] as Array<PorVersao<unknown>>) {
    for (const [k] of m.entries()) chaves.add(k);
  }
  for (const k of inquilinos.keys()) chaves.add(k);
  const trimestres: FiiTrimestreBruto[] = [];
  for (const k of [...chaves].sort()) {
    const [cnpj, refQuarter] = k.split('|');
    const im = imoveis.get(k);
    const at = ativos.get(k);
    const co = comp.get(k);
    const re = res.get(k);
    const iq = inquilinos.get(k);
    trimestres.push({
      cnpj,
      refQuarter,
      versao: Math.max(
        im?.versao ?? 0,
        at?.versao ?? 0,
        co?.versao ?? 0,
        re?.versao ?? 0,
        iq?.versao ?? 0,
      ),
      imoveis: im?.itens ?? [],
      ativos: at?.itens ?? [],
      faixas: co?.itens[0]?.faixas ?? null,
      idxIpcaPct: co?.itens[0]?.ipca ?? null,
      idxIgpmPct: co?.itens[0]?.igpm ?? null,
      receitaAluguel: re?.itens[0]?.receitaAluguel ?? null,
      resultadoTrimestral: re?.itens[0]?.resultadoTrimestral ?? null,
      rendimentosDeclarados: re?.itens[0]?.rendimentosDeclarados ?? null,
      taxaPerformance: re?.itens[0]?.taxaPerformance ?? null,
      versaoImovel: im?.versao ?? null,
      setoresInquilino: iq ? [...iq.setores.values()] : null,
      versaoInquilino: iq?.versao ?? null,
    });
  }
  return { trimestres, linhasLidas: c.lidas, rejeitadas: c.rejeitadas };
}

const RE_ENTRADA_INQUILINO = /^inf_trimestral_fii_imovel_renda_acabado_inquilino_\d{4}\.csv$/;

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
  // opcional: zips antigos podem não ter o CSV de inquilino (sem setores, sem erro de layout)
  const inquilino = (await listarEntradasZip(caminho)).find((x) =>
    RE_ENTRADA_INQUILINO.test(path.basename(x.nome)),
  );
  return lerInformeTrimestralLinhas(
    {
      imovel: () => linhasDaEntrada(caminho, e.imovel),
      ativo: () => linhasDaEntrada(caminho, e.ativo),
      complemento: () => linhasDaEntrada(caminho, e.complemento),
      resultado: () => linhasDaEntrada(caminho, e.resultado),
      ...(inquilino ? { inquilino: () => linhasDaEntrada(caminho, inquilino) } : {}),
    },
    opts,
  );
}
