/**
 * composicao_capital do DFP/ITR: ações integralizadas e em tesouraria por classe, na data de
 * referência do documento. SEM coluna de unidade — 598 company-years do DFP vêm em MILHARES sem aviso
 * (VALE3 2024 = "4.539.008"): a escolha unidade × ×1000 é da regra 10 (resolverAcoesExercicio).
 */
import { lerCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { linhasDaEntrada, type EntradaZip } from '@/services/analiseAtivos/fontes/zipStream';
import { COLUNAS_COMPOSICAO } from '@/services/analiseAtivos/acoes/cvmArquivos';
import { chaveDoc } from '@/services/analiseAtivos/acoes/parserDemonstrativos';
import type { ComposicaoCapital } from '@/services/analiseAtivos/regras/acoes/acoesEmitidas';

export interface ComposicaoLida extends ComposicaoCapital {
  cnpj: string;
  dtRefer: string;
  versao: number;
}

const inteiro = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Composição dos documentos aceitos (`docs`: cnpj|DT_REFER → versão). */
export async function lerComposicao(
  caminho: string,
  entrada: EntradaZip,
  docs: Map<string, number>,
): Promise<Map<string, ComposicaoLida>> {
  const out = new Map<string, ComposicaoLida>();
  const cnpjs = new Set([...docs.keys()].map((k) => k.slice(0, k.indexOf('|'))));
  if (cnpjs.size === 0) return out;
  const csv = lerCsv(linhasDaEntrada(caminho, entrada), {
    separador: ';',
    obrigatorias: COLUNAS_COMPOSICAO,
    arquivo: entrada.nome,
    preFiltro: (l) => cnpjs.has(l.slice(0, 18)),
  });
  for await (const l of csv) {
    const cnpj = l.get('CNPJ_CIA');
    const dtRefer = l.get('DT_REFER');
    const k = chaveDoc(cnpj, dtRefer);
    const versao = Number(l.get('VERSAO'));
    if (docs.get(k) !== versao) continue;
    out.set(k, {
      cnpj,
      dtRefer,
      versao,
      on: inteiro(l.get('QT_ACAO_ORDIN_CAP_INTEGR')),
      pn: inteiro(l.get('QT_ACAO_PREF_CAP_INTEGR')),
      tesOn: inteiro(l.get('QT_ACAO_ORDIN_TESOURO')),
      tesPn: inteiro(l.get('QT_ACAO_PREF_TESOURO')),
    });
  }
  return out;
}
