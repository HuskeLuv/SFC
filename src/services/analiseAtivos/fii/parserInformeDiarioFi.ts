/**
 * Informe diário de fundos (CVM, FI/DOC/INF_DIARIO: inf_diario_fi_AAAAMM.zip, ~11 MB zipado e
 * ~55 MB de texto por mês; ';', latin-1) ⇒ fechamento do MÊS dos FI-Infra listados ("FI-Infra
 * leve"): PL, valor da cota, cotas (= PL ÷ cota) e cotistas do ÚLTIMO dia informado no mês.
 * Composição da carteira NÃO vem daqui (fica "sem dado"; a CDA das debêntures está fora do escopo).
 *
 * Streaming com pré-filtro pelos CNPJs pedidos (nunca carrega o arquivo). Só a linha da CLASSE
 * (ID_SUBCLASSE vazio) conta; layout antigo (CNPJ_FUNDO, sem ID_SUBCLASSE) é aceito por alias.
 */
import path from 'path';
import { cnpjOuOriginal } from '@/services/analiseAtivos/regras/comum/cnpj';
import { lerCsv, type EspecCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { linhasDaEntrada, listarEntradasZip } from '@/services/analiseAtivos/fontes/zipStream';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { inicioDoMes, numeroCvm, preFiltroCnpj } from '@/services/analiseAtivos/fii/fiiArquivos';
import type { FiiMesBruto } from '@/services/analiseAtivos/regras/fii/saneamentoMensal';
import type { FundoCvm } from '@/services/analiseAtivos/regras/fii/tickerCnpj';

const BASE_CVM_FI_DIARIO = 'https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS';
/** 1º mês com arquivo mensal (antes: zips anuais em HIST/, fora deste leitor). */
export const PRIMEIRO_MES_DIARIO = '2021-01-01';
/** Segmento gravado em FiiMonthly.segmentoCvm para FI-Infra. */
export const SEGMENTO_FI_INFRA = 'FI-Infra';

export function urlInformeDiarioFi(refMonth: string): string {
  const m = /^(\d{4})-(\d{2})-01$/.exec(refMonth);
  if (!m || refMonth < PRIMEIRO_MES_DIARIO) throw new Error(`mês inválido: ${refMonth}`);
  return `${BASE_CVM_FI_DIARIO}/inf_diario_fi_${m[1]}${m[2]}.zip`;
}

export const COLUNAS_DIARIO = [
  'CNPJ_FUNDO_CLASSE',
  'DT_COMPTC',
  'VL_QUOTA',
  'VL_PATRIM_LIQ',
  'NR_COTST',
] as const;

export interface FechamentoDiario {
  cnpj: string;
  /** último DT_COMPTC do mês com linha da classe */
  data: string;
  vlQuota: number | null;
  pl: number | null;
  cotistas: number | null;
}

export interface ResultadoDiario {
  /** cnpj|AAAA-MM-01 ⇒ fechamento */
  fechamentos: Map<string, FechamentoDiario>;
  linhasLidas: number;
  rejeitadas: number;
}

export async function lerInformeDiarioLinhas(
  linhas: AsyncIterable<string>,
  opts: { arquivo: string; cnpjs: Set<string> },
): Promise<ResultadoDiario> {
  const spec: EspecCsv = {
    separador: ';',
    obrigatorias: [...COLUNAS_DIARIO],
    aliases: { CNPJ_FUNDO: 'CNPJ_FUNDO_CLASSE' },
    preFiltro: preFiltroCnpj(opts.cnpjs),
    arquivo: opts.arquivo,
  };
  const fechamentos = new Map<string, FechamentoDiario>();
  let lidas = 0;
  let rejeitadas = 0;
  for await (const l of lerCsv(linhas, spec)) {
    lidas++;
    if (l.tem('ID_SUBCLASSE') && l.get('ID_SUBCLASSE') !== '') continue;
    const cnpj = cnpjOuOriginal(l.get('CNPJ_FUNDO_CLASSE'));
    const data = l.get('DT_COMPTC');
    if (!cnpj || !opts.cnpjs.has(cnpj) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      rejeitadas++;
      continue;
    }
    const k = `${cnpj}|${inicioDoMes(data)}`;
    const atual = fechamentos.get(k);
    if (atual && atual.data >= data) continue;
    const lido = numeroCvm(l.get('NR_COTST'));
    // alguns fundos informam 0 cotistas em dias soltos: fica o último número positivo do mês
    const cotistas =
      lido !== null && lido > 0
        ? Math.round(lido)
        : (atual?.cotistas ?? (lido === null ? null : 0));
    fechamentos.set(k, {
      cnpj,
      data,
      vlQuota: numeroCvm(l.get('VL_QUOTA')),
      pl: numeroCvm(l.get('VL_PATRIM_LIQ')),
      cotistas,
    });
  }
  return { fechamentos, linhasLidas: lidas, rejeitadas };
}

export async function lerInformeDiarioZip(
  caminho: string,
  opts: { arquivo: string; cnpjs: Set<string> },
): Promise<ResultadoDiario> {
  const entradas = await listarEntradasZip(caminho);
  const e = entradas.find((x) => /^inf_diario_fi_\d{6}\.csv$/.test(path.basename(x.nome)));
  if (!e) throw new ErroLayoutFonte(opts.arquivo, ['entrada inf_diario_fi_AAAAMM.csv']);
  return lerInformeDiarioLinhas(linhasDaEntrada(caminho, e), opts);
}

/** cotas = PL ÷ valor da cota (o informe diário não traz a quantidade); inválido ⇒ null. */
export function cotasDoFechamento(f: Pick<FechamentoDiario, 'pl' | 'vlQuota'>): number | null {
  if (f.pl === null || f.vlQuota === null || !(f.pl > 0) || !(f.vlQuota > 0)) return null;
  return Math.round((f.pl / f.vlQuota) * 10_000) / 10_000;
}

/** Fechamento ⇒ mês no formato do FII, sem composição (temComposicao false). */
export function mesDoFechamento(f: FechamentoDiario): FiiMesBruto {
  return {
    cnpj: f.cnpj,
    refMonth: inicioDoMes(f.data),
    versao: 1,
    dtEntrega: null,
    vpCota: f.vlQuota,
    pl: f.pl,
    cotas: cotasDoFechamento(f),
    cotistas: f.cotistas,
    dyMesCvmPct: null,
    rentEfetivaMesPct: null,
    taxaAdmPct: null,
    ativoTotal: null,
    passivoTotal: null,
    rendDistribuir: null,
    obrigAquisicao: null,
    obrigSecuritizacao: null,
    outrosValoresPagar: null,
    valoresReceber: null,
    imoveis: null,
    spe: null,
    cri: null,
    lciLca: null,
    cotasFii: null,
    rendaFixa: null,
    acoes: null,
    segmentoCvm: SEGMENTO_FI_INFRA,
    temComposicao: false,
  };
}

/** Candidatos do cadastro (FI-Infra): 1 por CNPJ, o fechamento mais recente. Sem nome nem ISIN. */
export function candidatosDiario(r: ResultadoDiario): FundoCvm[] {
  const porCnpj = new Map<string, FechamentoDiario>();
  for (const f of r.fechamentos.values()) {
    const a = porCnpj.get(f.cnpj);
    if (!a || f.data > a.data) porCnpj.set(f.cnpj, f);
  }
  return [...porCnpj.values()]
    .map((f) => ({
      cnpj: f.cnpj,
      nomes: [],
      isin: null,
      ultimoMes: inicioDoMes(f.data),
      bolsa: true,
      pl: f.pl,
      cotas: cotasDoFechamento(f),
    }))
    .sort((a, b) => a.cnpj.localeCompare(b.cnpj));
}
