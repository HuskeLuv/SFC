/**
 * Leitura das fixtures (recortes pequenos de CSV real da CVM, latin1) para os testes da fatia B.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { lerInformeMensalLinhas } from '@/services/analiseAtivos/fii/parserInformeMensal';
import {
  lerInformeTrimestralLinhas,
  type FiiTrimestreBruto,
} from '@/services/analiseAtivos/fii/parserInformeTrimestral';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { FiiMesBruto } from '@/services/analiseAtivos/regras/fii/saneamentoMensal';

export const DIR_FIXTURES = path.join(__dirname, 'fixtures');

export const CNPJ = {
  HGLG: '11.728.688/0001-47',
  KNRI: '12.005.956/0001-65',
  MXRF: '97.521.225/0001-25',
  CPTS: '18.979.895/0001-13',
  KNCR: '16.706.958/0001-32',
  XPML: '28.757.546/0001-00',
  TRXF: '28.548.288/0001-52',
  TRXF_COLISAO: '63.134.454/0001-75',
  HFOF: '18.307.582/0001-19',
  PABY: '00.613.094/0001-74',
  KNIP: '24.960.430/0001-13',
  XPLG: '26.502.794/0001-85',
  RECR: '28.152.272/0001-26',
  BTCI: '09.552.812/0001-14',
  IRIM: '41.076.564/0001-95',
} as const;

export function textoFixture(nome: string): string {
  return readFileSync(path.join(DIR_FIXTURES, nome), 'latin1');
}

export function jsonFixture<T>(nome: string): T {
  return JSON.parse(readFileSync(path.join(DIR_FIXTURES, nome), 'utf8')) as T;
}

export async function* linhasFixture(nome: string): AsyncIterable<string> {
  for (const l of textoFixture(nome).split('\n')) yield l.replace(/\r$/, '');
}

export async function* linhasTexto(texto: string): AsyncIterable<string> {
  for (const l of texto.split('\n')) yield l;
}

/** Informe mensal de uma "safra" de fixtures (sufixo: '2026_amostra', '2025_hfof', …). */
export async function mensalFixture(sufixo: string) {
  return lerInformeMensalLinhas(
    {
      geral: linhasFixture(`inf_mensal_fii_geral_${sufixo}.csv`),
      complemento: linhasFixture(`inf_mensal_fii_complemento_${sufixo}.csv`),
      ativo_passivo: linhasFixture(`inf_mensal_fii_ativo_passivo_${sufixo}.csv`),
    },
    { arquivo: `fixture_${sufixo}`, params: SCORING_PARAMS_V1 },
  );
}

export function mes(meses: FiiMesBruto[], cnpj: string, refMonth: string): FiiMesBruto {
  const m = meses.find((x) => x.cnpj === cnpj && x.refMonth === refMonth);
  if (!m) throw new Error(`fixture sem ${cnpj} ${refMonth}`);
  return m;
}

const VAZIO = 'CNPJ_Fundo_Classe;Data_Referencia;Versao\n';

/** Trimestral a partir das fixtures; entradas ausentes viram CSV só com cabeçalho mínimo. */
export async function trimestralFixture(arquivos: {
  imovel?: string;
  ativo?: string;
  complemento?: string;
  resultado?: string;
}): Promise<FiiTrimestreBruto[]> {
  const cabecalho = (entrada: 'imovel' | 'ativo' | 'complemento' | 'resultado') => {
    // cabeçalho real da entrada (a partir de uma fixture existente) para CSV vazio
    const ref: Record<string, string> = {
      imovel: 'inf_trimestral_fii_imovel_2026_amostra.csv',
      ativo: 'inf_trimestral_fii_ativo_2026_kncr.csv',
      complemento: 'inf_trimestral_fii_complemento_2026_amostra.csv',
      resultado: 'inf_trimestral_fii_resultado_2026_amostra.csv',
    };
    return textoFixture(ref[entrada]).split('\n')[0] + '\n';
  };
  const fonte = (entrada: 'imovel' | 'ativo' | 'complemento' | 'resultado') => () =>
    arquivos[entrada]
      ? linhasFixture(arquivos[entrada]!)
      : linhasTexto(cabecalho(entrada) || VAZIO);
  const r = await lerInformeTrimestralLinhas(
    {
      imovel: fonte('imovel'),
      ativo: fonte('ativo'),
      complemento: fonte('complemento'),
      resultado: fonte('resultado'),
    },
    { arquivo: 'fixture_trimestral' },
  );
  return r.trimestres;
}
