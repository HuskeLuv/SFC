/**
 * Parser do Informe Mensal de Fiagro (CVM, dados abertos FIAGRO/DOC/INF_MENSAL): um zip por mês
 * (inf_mensal_fiagro_AAAAMM.zip, desde 202505) com inf_mensal_fiagro_AAAAMM.csv (uma linha por
 * classe e versão; ';', latin-1) e o arquivo de subclasses (ignorado). Antes de mai–ago/2025 os
 * Fiagros entregavam o Informe Mensal de FII com o MESMO CNPJ: o histórico vem do parser de FII.
 *
 * Por (CNPJ, mês) fica a MAIOR Versao. Saída no formato do FII (FiiMesBruto), para o mesmo
 * saneamento/tipo/gravação do fii-mensal:
 * - unidades: ao contrário do informe de FII (frações ×100), Dividend_Yield_Mes,
 *   Rentabilidade_Efetiva_Mes e os Percentual_Despesas_* JÁ vêm em pontos percentuais (KNCA11
 *   mai/2025: 1,1485 no informe de FII = fração 0,011485; set/2026 0,93 no de Fiagro) — sem ×100;
 * - taxa de adm. = administração + gestão + distribuição (a CVM 175 separa as três; o informe de FII
 *   traz o total numa coluna só);
 * - papel (cri) = CRA + CRI + CPR + CDCA + Debentures; caixa não recebível (lciLca) = LCA + LCI;
 *   renda fixa = Total_Necessidades_Liquidez; fundos (cotasFii) = FII + FIAGRO; imóveis = Imoveis_Rurais;
 *   ações = Participacoes_Societarias + Titulos_Participacoes_Societarias + FIP. Sem SPE nem
 *   obrigações por securitização (null).
 * Cabeçalho validado: coluna obrigatória sumida ⇒ ErroLayoutFonte.
 */
import path from 'path';
import { cnpjOuOriginal } from '@/services/analiseAtivos/regras/comum/cnpj';
import { lerCsv, type EspecCsv, type LinhaCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { linhasDaEntrada, listarEntradasZip } from '@/services/analiseAtivos/fontes/zipStream';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { inicioDoMes, numeroCvm, preFiltroCnpj } from '@/services/analiseAtivos/fii/fiiArquivos';
import type { FiiMesBruto } from '@/services/analiseAtivos/regras/fii/saneamentoMensal';
import type { FundoCvm } from '@/services/analiseAtivos/regras/fii/tickerCnpj';

const BASE_CVM_FIAGRO = 'https://dados.cvm.gov.br/dados/FIAGRO/DOC/INF_MENSAL/DADOS';
/** 1º mês publicado no dataset de Fiagro (CVM 175). */
export const PRIMEIRO_MES_FIAGRO = '2025-05-01';
/** Segmento gravado em FiiMonthly.segmentoCvm (o informe de Fiagro não tem segmento). */
export const SEGMENTO_FIAGRO = 'Fiagro';

/** 'AAAA-MM-01' ⇒ URL do zip do mês. */
export function urlInformeFiagro(refMonth: string): string {
  const m = /^(\d{4})-(\d{2})-01$/.exec(refMonth);
  if (!m || refMonth < PRIMEIRO_MES_FIAGRO) throw new Error(`mês inválido: ${refMonth}`);
  return `${BASE_CVM_FIAGRO}/inf_mensal_fiagro_${m[1]}${m[2]}.zip`;
}

export const COLUNAS_FIAGRO = [
  'CNPJ_Classe',
  'Nome_Classe',
  'Data_Referencia',
  'Versao',
  'Codigo_ISIN',
  'Mercado_Negociacao',
  'Numero_Cotistas',
  'Valor_Ativo',
  'Patrimonio_Liquido',
  'Cotas_Emitidas',
  'Valor_Patrimonial_Cotas',
  'Percentual_Despesas_Taxa_Administracao',
  'Rentabilidade_Efetiva_Mes',
  'Dividend_Yield_Mes',
  'Total_Necessidades_Liquidez',
  'Imoveis_Rurais',
  'LCA',
  'LCI',
  'CRA',
  'CRI',
  'CPR',
  'CDCA',
  'Debentures',
  'FII',
  'FIAGRO',
  'Rendimentos_Distribuir',
  'Total_Passivo',
] as const;

/** Colunas opcionais (somadas/lidas quando existem). */
const TAXAS_EXTRAS = ['Percentual_Despesas_Taxa_Gestao', 'Percentual_Despesas_Taxa_Distribuicao'];
const ACOES = ['Participacoes_Societarias', 'Titulos_Participacoes_Societarias', 'FIP'];

export interface GeralFiagro {
  cnpj: string;
  refMonth: string;
  nome: string;
  isin: string | null;
  bolsa: boolean;
}

export interface ResultadoParserFiagro {
  meses: FiiMesBruto[];
  geral: GeralFiagro[];
  linhasLidas: number;
  rejeitadas: number;
}

function num(l: LinhaCsv, c: string): number | null {
  return l.tem(c) ? numeroCvm(l.get(c)) : null;
}

/** Soma das colunas presentes com valor; nenhuma ⇒ null. */
function soma(l: LinhaCsv, cols: readonly string[]): number | null {
  let total: number | null = null;
  for (const c of cols) {
    const v = num(l, c);
    if (v !== null) total = (total ?? 0) + v;
  }
  return total;
}

export async function lerInformeFiagroLinhas(
  linhas: AsyncIterable<string>,
  opts: { arquivo: string; cnpjs?: Set<string> },
): Promise<ResultadoParserFiagro> {
  const spec: EspecCsv = {
    separador: ';',
    obrigatorias: [...COLUNAS_FIAGRO],
    preFiltro: preFiltroCnpj(opts.cnpjs),
    arquivo: opts.arquivo,
  };
  const porChave = new Map<string, { versao: number; mes: FiiMesBruto; geral: GeralFiagro }>();
  let lidas = 0;
  let rejeitadas = 0;
  for await (const l of lerCsv(linhas, spec)) {
    lidas++;
    const cnpj = cnpjOuOriginal(l.get('CNPJ_Classe'));
    const data = l.get('Data_Referencia');
    if (!cnpj || !/^\d{4}-\d{2}-\d{2}/.test(data)) {
      rejeitadas++;
      continue;
    }
    const refMonth = inicioDoMes(data);
    const versao = numeroCvm(l.get('Versao')) ?? 0;
    const k = `${cnpj}|${refMonth}`;
    const atual = porChave.get(k);
    if (atual && versao < atual.versao) continue;
    const cotistas = num(l, 'Numero_Cotistas');
    const dtEntrega = l.tem('Data_Entrega') ? l.get('Data_Entrega') : '';
    const taxaAdm = soma(l, ['Percentual_Despesas_Taxa_Administracao', ...TAXAS_EXTRAS]);
    const isin = l.get('Codigo_ISIN').toUpperCase();
    porChave.set(k, {
      versao,
      geral: {
        cnpj,
        refMonth,
        nome: l.get('Nome_Classe'),
        isin: isin || null,
        bolsa: l.get('Mercado_Negociacao').toUpperCase() === 'BOLSA',
      },
      mes: {
        cnpj,
        refMonth,
        versao,
        dtEntrega: /^\d{4}-\d{2}-\d{2}$/.test(dtEntrega) ? dtEntrega : null,
        vpCota: num(l, 'Valor_Patrimonial_Cotas'),
        pl: num(l, 'Patrimonio_Liquido'),
        cotas: num(l, 'Cotas_Emitidas'),
        cotistas: cotistas === null ? null : Math.round(cotistas),
        // já em p.p. (ver cabeçalho)
        dyMesCvmPct: num(l, 'Dividend_Yield_Mes'),
        rentEfetivaMesPct: num(l, 'Rentabilidade_Efetiva_Mes'),
        taxaAdmPct: taxaAdm,
        ativoTotal: num(l, 'Valor_Ativo'),
        passivoTotal: num(l, 'Total_Passivo'),
        rendDistribuir: num(l, 'Rendimentos_Distribuir'),
        obrigAquisicao: num(l, 'Obrigacoes_Aquisicao_Ativos'),
        obrigSecuritizacao: null,
        outrosValoresPagar: num(l, 'Outros_Valores_Pagar'),
        valoresReceber: num(l, 'Valores_Receber'),
        imoveis: num(l, 'Imoveis_Rurais'),
        spe: null,
        cri: soma(l, ['CRA', 'CRI', 'CPR', 'CDCA', 'Debentures']),
        lciLca: soma(l, ['LCA', 'LCI']),
        cotasFii: soma(l, ['FII', 'FIAGRO']),
        rendaFixa: num(l, 'Total_Necessidades_Liquidez'),
        acoes: soma(l, ACOES),
        segmentoCvm: SEGMENTO_FIAGRO,
        temComposicao: true,
      },
    });
  }
  const valores = [...porChave.values()];
  return {
    meses: valores
      .map((v) => v.mes)
      .sort((a, b) => a.cnpj.localeCompare(b.cnpj) || a.refMonth.localeCompare(b.refMonth)),
    geral: valores.map((v) => v.geral),
    linhasLidas: lidas,
    rejeitadas,
  };
}

/** Lê o zip mensal em streaming (só a entrada inf_mensal_fiagro_AAAAMM.csv). */
export async function lerInformeFiagroZip(
  caminho: string,
  opts: { arquivo: string; cnpjs?: Set<string> },
): Promise<ResultadoParserFiagro> {
  const entradas = await listarEntradasZip(caminho);
  const e = entradas.find((x) => /^inf_mensal_fiagro_\d{6}\.csv$/.test(path.basename(x.nome)));
  if (!e) throw new ErroLayoutFonte(opts.arquivo, ['entrada inf_mensal_fiagro_AAAAMM.csv']);
  return lerInformeFiagroLinhas(linhasDaEntrada(caminho, e), opts);
}

/** Candidatos do cadastro (1 por CNPJ, o mês mais recente) a partir de um ou mais meses lidos. */
export function candidatosFiagro(lidos: ResultadoParserFiagro[]): FundoCvm[] {
  const porCnpj = new Map<string, { g: GeralFiagro; m: FiiMesBruto; nomes: Set<string> }>();
  for (const r of lidos) {
    const meses = new Map(r.meses.map((m) => [`${m.cnpj}|${m.refMonth}`, m]));
    for (const g of r.geral) {
      const m = meses.get(`${g.cnpj}|${g.refMonth}`);
      if (!m) continue;
      const atual = porCnpj.get(g.cnpj);
      if (!atual) porCnpj.set(g.cnpj, { g, m, nomes: new Set([g.nome]) });
      else {
        atual.nomes.add(g.nome);
        if (g.refMonth > atual.g.refMonth) Object.assign(atual, { g, m });
      }
    }
  }
  return [...porCnpj.values()]
    .map(({ g, m, nomes }) => ({
      cnpj: g.cnpj,
      nomes: [g.nome, ...[...nomes].filter((n) => n !== g.nome)],
      isin: g.isin,
      ultimoMes: g.refMonth,
      bolsa: g.bolsa,
      pl: m.pl,
      cotas: m.cotas,
    }))
    .sort((a, b) => a.cnpj.localeCompare(b.cnpj));
}
