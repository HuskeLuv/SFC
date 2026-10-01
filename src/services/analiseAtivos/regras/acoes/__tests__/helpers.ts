/**
 * Leitura dos recortes reais da CVM usados nos testes das regras de ações. Os CSVs de fixtures/ têm o
 * cabeçalho original da CVM precedido da coluna ARQUIVO (entrada do zip de origem), em UTF-8.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { dividirLinhaCsv } from '@/services/analiseAtivos/fontes/csvStream';
import type {
  Demonstrativo,
  LinhaDemonstrativo,
} from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';

export const P = SCORING_PARAMS_V1;

export const CNPJ = {
  WEGE3: '84.429.695/0001-11',
  PETR4: '33.000.167/0001-01',
  VALE3: '33.592.510/0001-54',
  ITUB4: '60.872.504/0001-23',
  BBAS3: '00.000.000/0001-91',
  EGIE3: '02.474.103/0001-19',
  UGPA3: '33.256.439/0001-39',
  KLBN11: '89.637.490/0001-45',
  BBSE3: '17.344.597/0001-94',
  ITSA4: '61.532.644/0001-15',
  CAML3: '64.904.295/0001-03',
} as const;

export interface LinhaFixture extends LinhaDemonstrativo {
  arquivo: string;
  cnpj: string;
  dtRefer: string;
  escopo: 'con' | 'ind';
  dtIni: string | null;
  dtFim: string;
}

export function lerFixture(nome: string): LinhaFixture[] {
  const texto = readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8');
  const [cab, ...linhas] = texto.split('\n').filter((l) => l.length > 0);
  const h = new Map(dividirLinhaCsv(cab).map((c, i) => [c, i]));
  const col = (c: string[], k: string) => (h.has(k) ? (c[h.get(k)!] ?? '') : '');
  return linhas.map((l) => {
    const c = dividirLinhaCsv(l);
    const arquivo = col(c, 'ARQUIVO');
    const m = /_(BPA|BPP|DRE|DFC_MI|DMPL)_(con|ind)_/.exec(arquivo);
    if (!m) throw new Error(`arquivo de fixture sem demonstrativo: ${arquivo}`);
    const cd = col(c, 'CD_CONTA');
    const bruto = Number(col(c, 'VL_CONTA'));
    const mil = col(c, 'ESCALA_MOEDA') === 'MIL' && !cd.startsWith('3.99');
    return {
      arquivo,
      cnpj: col(c, 'CNPJ_CIA'),
      dtRefer: col(c, 'DT_REFER'),
      escopo: m[2] as 'con' | 'ind',
      dtIni: col(c, 'DT_INI_EXERC') || null,
      dtFim: col(c, 'DT_FIM_EXERC') || col(c, 'DT_REFER'),
      demonstrativo: m[1] as Demonstrativo,
      cdConta: cd,
      dsConta: col(c, 'DS_CONTA'),
      valor: mil ? bruto * 1000 : bruto,
      contaFixa: col(c, 'ST_CONTA_FIXA') === 'S',
      colunaDf: col(c, 'COLUNA_DF') || null,
    };
  });
}

export function filtrar(
  linhas: LinhaFixture[],
  f: { cnpj: string; dtFim?: string; dtIni?: string; escopo?: 'con' | 'ind'; ano?: number },
): LinhaFixture[] {
  return linhas.filter(
    (l) =>
      l.cnpj === f.cnpj &&
      (f.dtFim === undefined || l.dtFim === f.dtFim) &&
      (f.dtIni === undefined || l.dtIni === null || l.dtIni === f.dtIni) &&
      (f.escopo === undefined || l.escopo === f.escopo) &&
      (f.ano === undefined || l.dtFim.startsWith(String(f.ano))),
  );
}

export const mi = (x: number | null | undefined) =>
  x === null || x === undefined ? null : Math.round(x / 1e5) / 10;
