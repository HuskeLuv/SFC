/**
 * FRE 3.1 informacao_financeira — item f "Número de Ações, Ex-Tesouraria" do fim do exercício (regra
 * 10). Existe até o FRE entregue em 2022 (FY2021); depois a seção sumiu.
 *
 * Usa o FRE entregue no ano SEGUINTE ao exercício (valor "da época"), maior Versao por companhia.
 * NUNCA lê `capital_social`: é o capital da data da versão, reexpresso depois de splits (WEGE3 2019
 * daria 4.197 mi em vez de 2.098,66 mi). Só no backfill (o cron não lê FRE).
 */
import { lerCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { linhasDaEntrada, type EntradaZip } from '@/services/analiseAtivos/fontes/zipStream';
import {
  COLUNAS_FRE_INFORMACAO_FINANCEIRA,
  entradaFreInformacaoFinanceira,
} from '@/services/analiseAtivos/acoes/cvmArquivos';

export interface AcoesFre {
  cnpj: string;
  anoFiscal: number;
  acoes: number;
  dataReferencia: string;
  versao: number;
}

/** cnpj → anoFiscal → item f. Só o exercício anoFre − 1. */
export async function lerFreAcoes(
  caminho: string,
  entradas: EntradaZip[],
  anoFre: number,
  opts: { cnpjs?: Set<string> } = {},
): Promise<Map<string, AcoesFre>> {
  const nome = entradaFreInformacaoFinanceira(anoFre);
  const entrada = entradas.find((e) => e.nome === nome);
  const out = new Map<string, AcoesFre>();
  if (!entrada) return out; // FRE 2023+ não tem a seção
  const alvo = String(anoFre - 1);
  for await (const l of lerCsv(linhasDaEntrada(caminho, entrada), {
    separador: ';',
    obrigatorias: COLUNAS_FRE_INFORMACAO_FINANCEIRA,
    arquivo: nome,
    preFiltro: opts.cnpjs ? (b) => opts.cnpjs!.has(b.slice(0, 18)) : undefined,
  })) {
    if (l.get('Codigo_Conta') !== 'f') continue;
    if (!l.get('Data_Fim_Exercicio_Social').startsWith(alvo)) continue;
    const acoes = Number(l.get('Valor'));
    const versao = Number(l.get('Versao'));
    if (!Number.isFinite(acoes) || acoes <= 0) continue;
    const cnpj = l.get('CNPJ_Companhia');
    const dataReferencia = l.get('Data_Referencia');
    const atual = out.get(cnpj);
    // documento mais recente do ano (Data_Referencia) e, nele, a maior versão
    const maisNovo =
      !atual ||
      dataReferencia > atual.dataReferencia ||
      (dataReferencia === atual.dataReferencia && versao > atual.versao);
    if (maisNovo) out.set(cnpj, { cnpj, anoFiscal: anoFre - 1, acoes, dataReferencia, versao });
  }
  return out;
}
