/**
 * Parser do Informe Mensal de FII (inf_mensal_fii_AAAA.zip: geral, complemento, ativo_passivo) em
 * streaming. Por (CNPJ, mês) fica a MAIOR Versao de cada entrada (reenvios).
 *
 * Layouts aceitos (cabeçalho validado; coluna obrigatória sumida ⇒ ErroLayoutFonte):
 * - 2016–2020: CNPJ_Fundo / Nome_Fundo (aliases para CNPJ_Fundo_Classe / Nome_Fundo_Classe); sem
 *   CRI_CRA/LCI_LCA no ativo_passivo (colunas opcionais);
 * - 2021+: CNPJ_Fundo_Classe / Nome_Fundo_Classe; pós-ago/2025 (CVM 175) Mandato vazio e Segmento
 *   com taxonomia nova (o tipo sai da composição, não do segmento).
 * Frações da CVM (DY do mês, rentabilidade, taxa de adm.) são convertidas ×100 aqui (p.p.).
 */
import { cnpjOuOriginal } from '@/services/analiseAtivos/regras/comum/cnpj';
import { lerCsv, type EspecCsv, type LinhaCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { linhasDaEntrada } from '@/services/analiseAtivos/fontes/zipStream';
import {
  entradasObrigatorias,
  fracaoParaPct,
  inicioDoMes,
  numeroCvm,
  preFiltroCnpj,
} from '@/services/analiseAtivos/fii/fiiArquivos';
import type { FiiMesBruto } from '@/services/analiseAtivos/regras/fii/saneamentoMensal';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

const ALIASES = { CNPJ_Fundo: 'CNPJ_Fundo_Classe', Nome_Fundo: 'Nome_Fundo_Classe' };

export const COLUNAS_MENSAL = {
  geral: [
    'CNPJ_Fundo_Classe',
    'Data_Referencia',
    'Versao',
    'Nome_Fundo_Classe',
    'Codigo_ISIN',
    'Segmento_Atuacao',
    'Mercado_Negociacao_Bolsa',
  ],
  complemento: [
    'CNPJ_Fundo_Classe',
    'Data_Referencia',
    'Versao',
    'Total_Numero_Cotistas',
    'Valor_Ativo',
    'Patrimonio_Liquido',
    'Cotas_Emitidas',
    'Valor_Patrimonial_Cotas',
    'Percentual_Despesas_Taxa_Administracao',
    'Percentual_Rentabilidade_Efetiva_Mes',
    'Percentual_Dividend_Yield_Mes',
  ],
  ativo_passivo: [
    'CNPJ_Fundo_Classe',
    'Data_Referencia',
    'Versao',
    'Disponibilidades',
    'Titulos_Publicos',
    'Titulos_Privados',
    'Fundos_Renda_Fixa',
    'Direitos_Bens_Imoveis',
    'Acoes',
    'Debentures',
    'Fundo_Acoes',
    'FIP',
    'FII',
    'Acoes_Sociedades_Atividades_FII',
    'Cotas_Sociedades_Atividades_FII',
    'CRI',
    'Letras_Hipotecarias',
    'LCI',
    'LIG',
    'Rendimentos_Distribuir',
    'Obrigacoes_Aquisicao_Imoveis',
    'Obrigacoes_Securitizacao_Recebiveis',
    'Total_Passivo',
  ],
} as const;

export interface GeralMensal {
  cnpj: string;
  refMonth: string;
  versao: number;
  dtEntrega: string | null;
  nome: string;
  isin: string | null;
  segmento: string | null;
  bolsa: boolean;
}

interface Versionado<T> {
  versao: number;
  dado: T;
}

export interface OpcoesParserMensal {
  /** só estes CNPJs (preFiltro na linha crua) */
  cnpjs?: Set<string>;
  /** nome do arquivo para mensagens de layout */
  arquivo: string;
  params: ScoringParams;
  /** pula ativo_passivo (cadastro só precisa de nome/ISIN/PL/cotas) */
  semComposicao?: boolean;
}

export interface ResultadoParserMensal {
  meses: FiiMesBruto[];
  geral: Map<string, GeralMensal>; // chave cnpj|refMonth
  linhasLidas: number;
  rejeitadas: number;
}

const chave = (cnpj: string, ref: string) => `${cnpj}|${ref}`;

function guardarMaiorVersao<T>(
  mapa: Map<string, Versionado<T>>,
  k: string,
  versao: number,
  dado: T,
): void {
  const atual = mapa.get(k);
  if (!atual || versao >= atual.versao) mapa.set(k, { versao, dado });
}

function soma(l: LinhaCsv, cols: readonly string[]): number | null {
  let total: number | null = null;
  for (const c of cols) {
    if (!l.tem(c)) continue;
    const v = numeroCvm(l.get(c));
    if (v !== null) total = (total ?? 0) + v;
  }
  return total;
}

interface Comp {
  cotistas: number | null;
  ativoTotal: number | null;
  pl: number | null;
  cotas: number | null;
  vpCota: number | null;
  taxaAdmPct: number | null;
  rentEfetivaMesPct: number | null;
  dyMesCvmPct: number | null;
}
type Ap = Pick<
  FiiMesBruto,
  | 'passivoTotal'
  | 'rendDistribuir'
  | 'obrigAquisicao'
  | 'obrigSecuritizacao'
  | 'imoveis'
  | 'spe'
  | 'cri'
  | 'lciLca'
  | 'cotasFii'
  | 'rendaFixa'
  | 'acoes'
>;

interface Contadores {
  lidas: number;
  rejeitadas: number;
}

function chaveDaLinha(
  l: LinhaCsv,
  c: Contadores,
): { cnpj: string; ref: string; versao: number } | null {
  c.lidas++;
  const cnpj = cnpjOuOriginal(l.get('CNPJ_Fundo_Classe'));
  const data = l.get('Data_Referencia');
  if (!cnpj || !/^\d{4}-\d{2}-\d{2}/.test(data)) {
    c.rejeitadas++;
    return null;
  }
  return { cnpj, ref: inicioDoMes(data), versao: numeroCvm(l.get('Versao')) ?? 0 };
}

export async function lerGeralMensal(
  linhas: AsyncIterable<string>,
  opts: Pick<OpcoesParserMensal, 'cnpjs' | 'arquivo'>,
  c: Contadores = { lidas: 0, rejeitadas: 0 },
): Promise<Map<string, GeralMensal>> {
  const spec: EspecCsv = {
    separador: ';',
    obrigatorias: [...COLUNAS_MENSAL.geral],
    aliases: ALIASES,
    preFiltro: preFiltroCnpj(opts.cnpjs),
    arquivo: `${opts.arquivo}:geral`,
  };
  const mapa = new Map<string, Versionado<GeralMensal>>();
  for await (const l of lerCsv(linhas, spec)) {
    const k = chaveDaLinha(l, c);
    if (!k) continue;
    const isin = l.get('Codigo_ISIN').toUpperCase();
    const dtEntrega = l.tem('Data_Entrega') ? l.get('Data_Entrega') : '';
    guardarMaiorVersao(mapa, chave(k.cnpj, k.ref), k.versao, {
      cnpj: k.cnpj,
      refMonth: k.ref,
      versao: k.versao,
      dtEntrega: /^\d{4}-\d{2}-\d{2}$/.test(dtEntrega) ? dtEntrega : null,
      nome: l.get('Nome_Fundo_Classe'),
      isin: isin || null,
      segmento: l.get('Segmento_Atuacao') || null,
      bolsa: l.get('Mercado_Negociacao_Bolsa').toUpperCase() === 'S',
    });
  }
  return new Map([...mapa].map(([k, v]) => [k, v.dado]));
}

async function lerComplemento(
  linhas: AsyncIterable<string>,
  opts: Pick<OpcoesParserMensal, 'cnpjs' | 'arquivo'>,
  c: Contadores,
): Promise<Map<string, Versionado<Comp>>> {
  const spec: EspecCsv = {
    separador: ';',
    obrigatorias: [...COLUNAS_MENSAL.complemento],
    aliases: ALIASES,
    preFiltro: preFiltroCnpj(opts.cnpjs),
    arquivo: `${opts.arquivo}:complemento`,
  };
  const mapa = new Map<string, Versionado<Comp>>();
  for await (const l of lerCsv(linhas, spec)) {
    const k = chaveDaLinha(l, c);
    if (!k) continue;
    const cotistas = numeroCvm(l.get('Total_Numero_Cotistas'));
    guardarMaiorVersao(mapa, chave(k.cnpj, k.ref), k.versao, {
      cotistas: cotistas === null ? null : Math.round(cotistas),
      ativoTotal: numeroCvm(l.get('Valor_Ativo')),
      pl: numeroCvm(l.get('Patrimonio_Liquido')),
      cotas: numeroCvm(l.get('Cotas_Emitidas')),
      vpCota: numeroCvm(l.get('Valor_Patrimonial_Cotas')),
      taxaAdmPct: fracaoParaPct(numeroCvm(l.get('Percentual_Despesas_Taxa_Administracao'))),
      rentEfetivaMesPct: fracaoParaPct(numeroCvm(l.get('Percentual_Rentabilidade_Efetiva_Mes'))),
      dyMesCvmPct: fracaoParaPct(numeroCvm(l.get('Percentual_Dividend_Yield_Mes'))),
    });
  }
  return mapa;
}

async function lerAtivoPassivo(
  linhas: AsyncIterable<string>,
  opts: Pick<OpcoesParserMensal, 'cnpjs' | 'arquivo' | 'params'>,
  c: Contadores,
): Promise<Map<string, Versionado<Ap>>> {
  const spec: EspecCsv = {
    separador: ';',
    obrigatorias: [...COLUNAS_MENSAL.ativo_passivo],
    aliases: ALIASES,
    preFiltro: preFiltroCnpj(opts.cnpjs),
    arquivo: `${opts.arquivo}:ativo_passivo`,
  };
  const t = opts.params.fiiTipo;
  const colImoveis = t.imoveis.filter((x) => x === 'Direitos_Bens_Imoveis');
  const colSpe = t.imoveis.filter((x) => x !== 'Direitos_Bens_Imoveis');
  const mapa = new Map<string, Versionado<Ap>>();
  for await (const l of lerCsv(linhas, spec)) {
    const k = chaveDaLinha(l, c);
    if (!k) continue;
    guardarMaiorVersao(mapa, chave(k.cnpj, k.ref), k.versao, {
      passivoTotal: numeroCvm(l.get('Total_Passivo')),
      rendDistribuir: numeroCvm(l.get('Rendimentos_Distribuir')),
      obrigAquisicao: numeroCvm(l.get('Obrigacoes_Aquisicao_Imoveis')),
      obrigSecuritizacao: numeroCvm(l.get('Obrigacoes_Securitizacao_Recebiveis')),
      imoveis: soma(l, colImoveis),
      spe: soma(l, colSpe),
      cri: soma(l, t.recebiveisPapel),
      lciLca: soma(l, t.caixaNaoRecebivel),
      cotasFii: numeroCvm(l.get('FII')),
      rendaFixa: soma(l, [
        'Disponibilidades',
        'Titulos_Publicos',
        'Titulos_Privados',
        'Fundos_Renda_Fixa',
      ]),
      acoes: soma(l, ['Acoes', 'Debentures', 'FIP', 'Fundo_Acoes']),
    });
  }
  return mapa;
}

const AP_VAZIO: Ap = {
  passivoTotal: null,
  rendDistribuir: null,
  obrigAquisicao: null,
  obrigSecuritizacao: null,
  imoveis: null,
  spe: null,
  cri: null,
  lciLca: null,
  cotasFii: null,
  rendaFixa: null,
  acoes: null,
};

/** Junta as três entradas por (CNPJ, mês). Mês sem complemento não entra (não há PL/cotas). */
export function juntarMensal(
  geral: Map<string, GeralMensal>,
  comp: Map<string, Versionado<Comp>>,
  ap: Map<string, Versionado<Ap>> | null,
): FiiMesBruto[] {
  const out: FiiMesBruto[] = [];
  for (const [k, cv] of comp) {
    const [cnpj, refMonth] = k.split('|');
    const g = geral.get(k);
    const a = ap?.get(k);
    out.push({
      cnpj,
      refMonth,
      versao: Math.max(cv.versao, g?.versao ?? 0, a?.versao ?? 0),
      dtEntrega: g?.dtEntrega ?? null,
      ...cv.dado,
      ...(a ? a.dado : AP_VAZIO),
      segmentoCvm: g?.segmento ?? null,
      temComposicao: a !== undefined,
    });
  }
  return out.sort((x, y) => x.cnpj.localeCompare(y.cnpj) || x.refMonth.localeCompare(y.refMonth));
}

/** Lê o zip anual inteiro em streaming (uma entrada por vez). */
export async function lerInformeMensalZip(
  caminho: string,
  opts: OpcoesParserMensal,
): Promise<ResultadoParserMensal> {
  const e = await entradasObrigatorias(caminho, opts.arquivo, {
    geral: /^inf_mensal_fii_geral_\d{4}\.csv$/,
    complemento: /^inf_mensal_fii_complemento_\d{4}\.csv$/,
    ativo_passivo: /^inf_mensal_fii_ativo_passivo_\d{4}\.csv$/,
  });
  const c: Contadores = { lidas: 0, rejeitadas: 0 };
  const geral = await lerGeralMensal(linhasDaEntrada(caminho, e.geral), opts, c);
  const comp = await lerComplemento(linhasDaEntrada(caminho, e.complemento), opts, c);
  const ap = opts.semComposicao
    ? null
    : await lerAtivoPassivo(linhasDaEntrada(caminho, e.ativo_passivo), opts, c);
  return {
    meses: juntarMensal(geral, comp, ap),
    geral,
    linhasLidas: c.lidas,
    rejeitadas: c.rejeitadas,
  };
}

/** Versão para testes/fixtures: cada entrada vem como iterável de linhas. */
export async function lerInformeMensalLinhas(
  entradas: {
    geral: AsyncIterable<string>;
    complemento: AsyncIterable<string>;
    ativo_passivo: AsyncIterable<string> | null;
  },
  opts: OpcoesParserMensal,
): Promise<ResultadoParserMensal> {
  const c: Contadores = { lidas: 0, rejeitadas: 0 };
  const geral = await lerGeralMensal(entradas.geral, opts, c);
  const comp = await lerComplemento(entradas.complemento, opts, c);
  const ap = entradas.ativo_passivo ? await lerAtivoPassivo(entradas.ativo_passivo, opts, c) : null;
  return {
    meses: juntarMensal(geral, comp, ap),
    geral,
    linhasLidas: c.lidas,
    rejeitadas: c.rejeitadas,
  };
}
