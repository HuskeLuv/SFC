/**
 * Leitura em streaming dos zips DFP/ITR da CVM (índice + demonstrativos), sem carregar o arquivo:
 * zip → linhas (zipStream) → CSV validado (csvStream) → filtro barato pelo prefixo do CNPJ na linha crua.
 *
 * Regras de leitura (relatório §4.1 regra 2/3):
 *  - índice: MAIOR VERSAO por (CNPJ, DT_REFER); dtEntregaOriginal = MENOR DT_RECEB entre as versões;
 *  - demonstrativos: só ORDEM_EXERC = ÚLTIMO e só a versão aceita do documento;
 *  - ESCALA_MOEDA = MIL ⇒ ×1000, exceto LPA (3.99.*), que é R$/ação;
 *  - cabeçalho sem coluna obrigatória ⇒ ErroLayoutFonte (falha alto).
 */
import { lerCsv, type LinhaCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import { linhasDaEntrada, type EntradaZip } from '@/services/analiseAtivos/fontes/zipStream';
import {
  COLUNAS_DEMONSTRATIVO,
  COLUNAS_INDICE,
  entradaIndice,
  type EntradaDemonstrativo,
} from '@/services/analiseAtivos/acoes/cvmArquivos';
import type { LinhaDemonstrativo } from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
import type { Escopo } from '@/services/analiseAtivos/tipos';

export interface DocIndice {
  cnpj: string;
  dtRefer: string;
  versao: number;
  idDoc: string | null;
  cdCvm: string;
  denominacao: string;
  /** DT_RECEB desta versão */
  dtReceb: string;
  /** menor DT_RECEB do (cnpj, DT_REFER) */
  dtEntregaOriginal: string;
}

export interface LinhaLida extends LinhaDemonstrativo {
  cnpj: string;
  dtRefer: string;
  versao: number;
  escopo: Escopo;
  dtIni: string | null;
  dtFim: string;
  escala: 'MIL' | 'UNIDADE';
}

export interface Contadores {
  lidas?: (n: number) => void;
  rejeitada?: (motivo: string) => void;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export const chaveDoc = (cnpj: string, dtRefer: string) => `${cnpj}|${dtRefer}`;

export function acharEntrada(entradas: EntradaZip[], nome: string): EntradaZip | null {
  return entradas.find((e) => e.nome === nome) ?? null;
}

function exigirEntrada(entradas: EntradaZip[], nome: string): EntradaZip {
  const e = acharEntrada(entradas, nome);
  if (!e) throw new ErroFonte('layout_mudou', `entrada ${nome} ausente no zip`);
  return e;
}

/** Índice do DFP/ITR: maior versão por documento e data da 1ª entrega. */
export async function lerIndice(
  caminho: string,
  entradas: EntradaZip[],
  doc: 'dfp' | 'itr',
  ano: number,
  opts: { cnpjs?: Set<string> } = {},
): Promise<Map<string, DocIndice>> {
  const nome = entradaIndice(doc, ano);
  const entrada = exigirEntrada(entradas, nome);
  const out = new Map<string, DocIndice>();
  const csv = lerCsv(linhasDaEntrada(caminho, entrada), {
    separador: ';',
    obrigatorias: COLUNAS_INDICE,
    arquivo: nome,
    preFiltro: opts.cnpjs ? (l) => opts.cnpjs!.has(l.slice(0, 18)) : undefined,
  });
  for await (const l of csv) {
    const cnpj = l.get('CNPJ_CIA');
    const dtRefer = l.get('DT_REFER');
    const versao = Number(l.get('VERSAO'));
    const dtReceb = l.get('DT_RECEB');
    if (!RE_DATA.test(dtRefer) || !RE_DATA.test(dtReceb) || !Number.isInteger(versao)) continue;
    const k = chaveDoc(cnpj, dtRefer);
    const atual = out.get(k);
    const menorEntrega =
      atual && atual.dtEntregaOriginal < dtReceb ? atual.dtEntregaOriginal : dtReceb;
    if (!atual || versao > atual.versao) {
      out.set(k, {
        cnpj,
        dtRefer,
        versao,
        idDoc: l.get('ID_DOC') || null,
        cdCvm: l.get('CD_CVM'),
        denominacao: l.tem('DENOM_CIA') ? l.get('DENOM_CIA') : '',
        dtReceb,
        dtEntregaOriginal: menorEntrega,
      });
    } else {
      atual.dtEntregaOriginal = menorEntrega;
    }
  }
  return out;
}

/** Valor em R$: ESCALA_MOEDA=MIL ⇒ ×1000, exceto LPA (3.99.*). */
export function valorEmReais(vl: string, escala: string, cdConta: string): number {
  const v = Number(vl);
  if (!Number.isFinite(v) || vl.trim() === '') return Number.NaN;
  return escala === 'MIL' && !cdConta.startsWith('3.99') ? v * 1000 : v;
}

function ehUltimo(ordem: string): boolean {
  return /^[ÚU]LTIMO$/i.test(ordem.trim());
}

/**
 * Linhas de um demonstrativo (entrada `<doc>_cia_aberta_<DEM>_<escopo>_<ano>.csv`) só dos documentos
 * aceitos (`docs`: chave cnpj|DT_REFER → versão), ORDEM_EXERC = ÚLTIMO.
 */
export async function* lerLinhasDemonstrativo(
  caminho: string,
  entrada: EntradaZip,
  spec: {
    dem: EntradaDemonstrativo;
    escopo: Escopo;
    docs: Map<string, number>;
    contadores?: Contadores;
  },
): AsyncIterable<LinhaLida> {
  const cnpjs = new Set([...spec.docs.keys()].map((k) => k.slice(0, k.indexOf('|'))));
  if (cnpjs.size === 0) return;
  const csv = lerCsv(linhasDaEntrada(caminho, entrada), {
    separador: ';',
    obrigatorias: COLUNAS_DEMONSTRATIVO[spec.dem],
    arquivo: entrada.nome,
    preFiltro: (l) => cnpjs.has(l.slice(0, 18)),
  });
  let lidas = 0;
  for await (const l of csv) {
    lidas++;
    if (lidas % 10_000 === 0) spec.contadores?.lidas?.(10_000);
    const linha = paraLinhaLida(l, spec.dem, spec.escopo, spec.docs, spec.contadores);
    if (linha) yield linha;
  }
  spec.contadores?.lidas?.(lidas % 10_000);
}

function paraLinhaLida(
  l: LinhaCsv,
  dem: EntradaDemonstrativo,
  escopo: Escopo,
  docs: Map<string, number>,
  contadores?: Contadores,
): LinhaLida | null {
  const cnpj = l.get('CNPJ_CIA');
  const dtRefer = l.get('DT_REFER');
  const aceita = docs.get(chaveDoc(cnpj, dtRefer));
  if (aceita === undefined || Number(l.get('VERSAO')) !== aceita) return null;
  if (!ehUltimo(l.get('ORDEM_EXERC'))) return null;
  const cdConta = l.get('CD_CONTA');
  const escala = l.get('ESCALA_MOEDA') === 'MIL' ? 'MIL' : 'UNIDADE';
  const valor = valorEmReais(l.get('VL_CONTA'), escala, cdConta);
  const dtFim = l.get('DT_FIM_EXERC');
  if (!Number.isFinite(valor) || !RE_DATA.test(dtFim) || !cdConta) {
    contadores?.rejeitada?.(`${dem}_${escopo}: linha inválida ${cnpj} ${dtRefer} ${cdConta}`);
    return null;
  }
  const dtIni = l.tem('DT_INI_EXERC') ? l.get('DT_INI_EXERC') || null : null;
  return {
    cnpj,
    dtRefer,
    versao: aceita,
    escopo,
    demonstrativo: dem,
    dtIni: dtIni && RE_DATA.test(dtIni) ? dtIni : null,
    dtFim,
    cdConta,
    dsConta: l.get('DS_CONTA'),
    valor,
    escala,
    contaFixa: l.get('ST_CONTA_FIXA') === 'S',
    colunaDf: l.tem('COLUNA_DF') ? l.get('COLUNA_DF') || null : null,
  };
}
