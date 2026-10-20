/**
 * Parser em STREAMING do Formulário de Referência (CVM dados abertos) para o job
 * 'cvm-fre-societario' (A6, item 6; fatia D). Lê linha a linha (nunca o CSV inteiro), com filtro
 * barato pelo CNPJ da companhia na linha crua (só emissores do universo), e guarda por companhia só a
 * MAIOR versão do documento.
 *
 *  - índice (fre_cia_aberta_AAAA.csv): versão, ID_DOC, DT_RECEB e LINK_DOC (texto; nunca baixado);
 *  - posicao_acionaria: só os acionistas DIRETOS (ID_Acionista_Relacionado vazio) e as linhas
 *    'Outros'/'Ações Tesouraria' com id fixo. As colunas CPF_CNPJ_* NUNCA são lidas (decisão 5);
 *  - distribuicao_capital: ações em circulação (definição CVM) e nº de acionistas PF/PJ/inst.;
 *  - direito_acao (só o FRE 2022): tag along declarado, Direito_Dividendo (texto literal + % por
 *    regex), voto e conversibilidade. classePn vazio = '' (ON e PN sem classe).
 */
import { cnpjDoInicioDaLinha, cnpjOuOriginal } from '@/services/analiseAtivos/regras/comum/cnpj';
import { lerCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { linhasDaEntrada, type EntradaZip } from '@/services/analiseAtivos/fontes/zipStream';
import {
  COLUNAS_FRE_DIREITO,
  COLUNAS_FRE_DISTRIBUICAO,
  COLUNAS_FRE_INDICE,
  COLUNAS_FRE_POSICAO,
  MAX_TEXTO_DIREITO,
  entradaFre,
  linkFreSeguro,
  type EntradaFre,
} from '@/services/analiseAtivos/acoes/freArquivos';
import { ehLinhaDireta, idSintetico } from '@/services/analiseAtivos/regras/acoes/acionistas';
import { extrairPctDividendoMinimo } from '@/services/analiseAtivos/regras/acoes/dividendoMinimo';

export interface OpcoesParserFre {
  /** CNPJs (14 dígitos) do universo; ausente = todos */
  cnpjs?: Set<string>;
}

// ---------------------------------------------------------------- utilitários

function numeroOuNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function inteiroOuNull(s: string): number | null {
  const n = numeroOuNull(s);
  return n === null ? null : Math.round(n);
}

function dataOuNull(s: string): string | null {
  const t = s.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

const sim = (s: string) => s.trim().toUpperCase() === 'S';

function preFiltro(opts: OpcoesParserFre): ((bruta: string) => boolean) | undefined {
  const { cnpjs } = opts;
  return cnpjs ? (b) => cnpjs.has(cnpjDoInicioDaLinha(b) ?? '') : undefined;
}

/** Guarda só a maior versão por companhia (versão nova descarta as linhas da anterior). */
function porMaiorVersao<T extends { versao: number }>(
  mapa: Map<string, T>,
  cnpj: string,
  versao: number,
  novo: () => T,
): T | null {
  const atual = mapa.get(cnpj);
  if (atual && atual.versao > versao) return null;
  if (!atual || versao > atual.versao) {
    const n = novo();
    mapa.set(cnpj, n);
    return n;
  }
  return atual;
}

// ---------------------------------------------------------------- índice

export interface DocumentoFre {
  versao: number;
  idDoc: string;
  dtReceb: string | null;
  dataReferencia: string | null;
  /** LINK_DOC já saneado (https, só rad.cvm.gov.br); texto, nunca baixado */
  linkDoc: string | null;
}

/** cnpj → versão → documento. */
export async function lerIndiceFre(
  linhas: AsyncIterable<string>,
  arquivo: string,
  opts: OpcoesParserFre = {},
): Promise<Map<string, Map<number, DocumentoFre>>> {
  const out = new Map<string, Map<number, DocumentoFre>>();
  for await (const l of lerCsv(linhas, {
    separador: ';',
    obrigatorias: COLUNAS_FRE_INDICE,
    arquivo,
    preFiltro: preFiltro(opts),
  })) {
    const versao = inteiroOuNull(l.get('VERSAO'));
    if (versao === null) continue;
    const cnpj = cnpjOuOriginal(l.get('CNPJ_CIA'));
    const docs = out.get(cnpj) ?? new Map<number, DocumentoFre>();
    docs.set(versao, {
      versao,
      idDoc: l.get('ID_DOC'),
      dtReceb: dataOuNull(l.get('DT_RECEB')),
      dataReferencia: dataOuNull(l.get('DT_REFER')),
      linkDoc: linkFreSeguro(l.get('LINK_DOC')),
    });
    out.set(cnpj, docs);
  }
  return out;
}

/** Documento da versão pedida; sem ela, o de maior versão. */
export function documentoDaVersao(
  docs: Map<number, DocumentoFre> | undefined,
  versao: number | null,
): DocumentoFre | null {
  if (!docs || docs.size === 0) return null;
  if (versao !== null && docs.has(versao)) return docs.get(versao)!;
  return [...docs.values()].reduce((m, d) => (d.versao > m.versao ? d : m));
}

// ---------------------------------------------------------------- posição acionária

/** Acionista direto (ou sintético) SEM documento: o CPF/CNPJ nunca entra aqui. */
export interface AcionistaFre {
  idAcionista: string;
  nome: string;
  tipoPessoa: string | null;
  pctOn: number | null;
  pctPn: number | null;
  pctTotal: number | null;
  controlador: boolean;
  acordoAcionistas: boolean;
  sintetica: boolean;
  dataUltimaAlteracao: string | null;
}

export interface PosicaoFre {
  versao: number;
  dataReferencia: string | null;
  acionistas: AcionistaFre[];
  /** linhas indiretas descartadas (contagem) */
  indiretas: number;
}

const somaN = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

export async function lerPosicaoAcionaria(
  linhas: AsyncIterable<string>,
  arquivo: string,
  opts: OpcoesParserFre = {},
): Promise<Map<string, PosicaoFre>> {
  const out = new Map<string, PosicaoFre>();
  const ids = new Map<string, Map<string, AcionistaFre>>();
  for await (const l of lerCsv(linhas, {
    separador: ';',
    obrigatorias: COLUNAS_FRE_POSICAO,
    arquivo,
    preFiltro: preFiltro(opts),
  })) {
    const versao = inteiroOuNull(l.get('Versao'));
    if (versao === null) continue;
    const cnpj = cnpjOuOriginal(l.get('CNPJ_Companhia'));
    const pos = porMaiorVersao(out, cnpj, versao, () => {
      ids.set(cnpj, new Map());
      return {
        versao,
        dataReferencia: dataOuNull(l.get('Data_Referencia')),
        acionistas: [],
        indiretas: 0,
      };
    });
    if (!pos) continue;
    if (!ehLinhaDireta(l.get('ID_Acionista_Relacionado'))) {
      pos.indiretas++;
      continue;
    }
    const nome = l.get('Acionista');
    const tipo = l.get('Tipo_Pessoa_Acionista');
    const sintetico = idSintetico(nome, tipo);
    const idAcionista = sintetico ?? l.get('ID_Acionista');
    if (!idAcionista || !nome) continue;
    const a: AcionistaFre = {
      idAcionista,
      nome,
      tipoPessoa: tipo || null,
      pctOn: numeroOuNull(l.get('Percentual_Acao_Ordinaria_Circulacao')),
      pctPn: numeroOuNull(l.get('Percentual_Acao_Preferencial_Circulacao')),
      pctTotal: numeroOuNull(l.get('Percentual_Total_Acoes_Circulacao')),
      controlador: sim(l.get('Acionista_Controlador')),
      acordoAcionistas: sim(l.get('Participante_Acordo_Acionistas')),
      sintetica: sintetico !== null,
      dataUltimaAlteracao: dataOuNull(l.get('Data_Ultima_Alteracao')),
    };
    const vistos = ids.get(cnpj)!;
    const repetido = vistos.get(idAcionista);
    if (repetido) {
      // PK (cnpj, anoFre, idAcionista) sem duplicata: sintéticas somam; direto repetido fica o 1º
      if (repetido.sintetica) {
        repetido.pctOn = somaN(repetido.pctOn, a.pctOn);
        repetido.pctPn = somaN(repetido.pctPn, a.pctPn);
        repetido.pctTotal = somaN(repetido.pctTotal, a.pctTotal);
      }
      continue;
    }
    vistos.set(idAcionista, a);
    pos.acionistas.push(a);
  }
  return out;
}

// ---------------------------------------------------------------- distribuição do capital

export interface DistribuicaoFre {
  versao: number;
  dataReferencia: string | null;
  nAcionistasPf: number | null;
  nAcionistasPj: number | null;
  nAcionistasInst: number | null;
  pctCirculacaoOn: number | null;
  pctCirculacaoPn: number | null;
  pctCirculacaoTotal: number | null;
}

export async function lerDistribuicaoCapital(
  linhas: AsyncIterable<string>,
  arquivo: string,
  opts: OpcoesParserFre = {},
): Promise<Map<string, DistribuicaoFre>> {
  const out = new Map<string, DistribuicaoFre>();
  for await (const l of lerCsv(linhas, {
    separador: ';',
    obrigatorias: COLUNAS_FRE_DISTRIBUICAO,
    arquivo,
    preFiltro: preFiltro(opts),
  })) {
    const versao = inteiroOuNull(l.get('Versao'));
    if (versao === null) continue;
    const cnpj = cnpjOuOriginal(l.get('CNPJ_Companhia'));
    const atual = out.get(cnpj);
    if (atual && atual.versao >= versao) continue;
    out.set(cnpj, {
      versao,
      dataReferencia: dataOuNull(l.get('Data_Referencia')),
      nAcionistasPf: inteiroOuNull(l.get('Quantidade_Acionistas_PF')),
      nAcionistasPj: inteiroOuNull(l.get('Quantidade_Acionistas_PJ')),
      nAcionistasInst: inteiroOuNull(l.get('Quantidade_Acionistas_Investidores_Institucionais')),
      pctCirculacaoOn: numeroOuNull(l.get('Percentual_Acoes_Ordinarias_Circulacao')),
      pctCirculacaoPn: numeroOuNull(l.get('Percentual_Acoes_Preferenciais_Circulacao')),
      pctCirculacaoTotal: numeroOuNull(l.get('Percentual_Total_Acoes_Circulacao')),
    });
  }
  return out;
}

// ---------------------------------------------------------------- direitos por espécie (FRE 2022)

export interface DireitoAcaoFre {
  especie: 'ON' | 'PN';
  classePn: string;
  pctTagAlong: number | null;
  direitoDividendoTexto: string | null;
  pctDividendoMinimo: number | null;
  direitoVoto: string | null;
  conversibilidade: string | null;
}

export interface DireitosFre {
  versao: number;
  dataReferencia: string | null;
  direitos: DireitoAcaoFre[];
}

/** 'Ordinária' ⇒ ON; 'Preferencial' ⇒ PN; certificados e vazio ⇒ null (fora). */
export function especieDoFre(s: string): 'ON' | 'PN' | null {
  const t = s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (t.startsWith('ordinaria')) return 'ON';
  if (t.startsWith('preferencial')) return 'PN';
  return null;
}

/** 'Preferencial Classe A' ⇒ 'A'; vazio ⇒ ''. A ON é sempre ''. */
export function classePnDoFre(especie: 'ON' | 'PN', s: string): string {
  if (especie === 'ON') return '';
  const t = s.trim();
  if (!t) return '';
  const m = /classe\s+([A-Z0-9]{1,3})\s*$/i.exec(t);
  return (m ? m[1] : t).toUpperCase().slice(0, 20);
}

function textoOuNull(s: string, max = MAX_TEXTO_DIREITO): string | null {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export async function lerDireitoAcao(
  linhas: AsyncIterable<string>,
  arquivo: string,
  opts: OpcoesParserFre = {},
): Promise<Map<string, DireitosFre>> {
  const out = new Map<string, DireitosFre>();
  const chaves = new Map<string, Set<string>>();
  for await (const l of lerCsv(linhas, {
    separador: ';',
    obrigatorias: COLUNAS_FRE_DIREITO,
    arquivo,
    preFiltro: preFiltro(opts),
  })) {
    const versao = inteiroOuNull(l.get('Versao'));
    if (versao === null) continue;
    const especie = especieDoFre(l.get('Especie_Acao'));
    if (!especie) continue;
    const cnpj = cnpjOuOriginal(l.get('CNPJ_Companhia'));
    const doc = porMaiorVersao(out, cnpj, versao, () => {
      chaves.set(cnpj, new Set());
      return { versao, dataReferencia: dataOuNull(l.get('Data_Referencia')), direitos: [] };
    });
    if (!doc) continue;
    const classePn = classePnDoFre(especie, l.get('Classe_Acao_Preferencial'));
    const chave = `${especie}|${classePn}`;
    if (chaves.get(cnpj)!.has(chave)) continue;
    chaves.get(cnpj)!.add(chave);
    const texto = textoOuNull(l.get('Direito_Dividendo'));
    doc.direitos.push({
      especie,
      classePn,
      pctTagAlong: numeroOuNull(l.get('Percentual_Tag_Along')),
      direitoDividendoTexto: texto,
      pctDividendoMinimo: extrairPctDividendoMinimo(texto),
      direitoVoto: textoOuNull(l.get('Direito_Voto'), 200),
      conversibilidade: textoOuNull(l.get('Conversibilidade'), 200),
    });
  }
  return out;
}

// ---------------------------------------------------------------- zip

/** Linhas de uma entrada do zip do FRE; null se a entrada não existe no zip. */
export function linhasEntradaFre(
  caminho: string,
  entradas: EntradaZip[],
  parte: EntradaFre,
  ano: number,
): { nome: string; linhas: AsyncIterable<string> } | null {
  const nome = entradaFre(parte, ano);
  const entrada = entradas.find((e) => e.nome === nome);
  return entrada ? { nome, linhas: linhasDaEntrada(caminho, entrada) } : null;
}
