/**
 * Classificação setorial da B3 (ClassifSetorial.xlsx) — função pura sobre as linhas da planilha
 * (`XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })`).
 *
 * Formato medido em 30/09/2026 (uma aba "Planilha", B2:G371): blocos por setor, cada um com uma
 * linha de cabeçalho (o 1º em duas linhas mescladas: "SETOR | SUBSETOR | SEGMENTO | EMISSOR" e
 * "NOME DE PREGÃO | CÓDIGO | SEGMENTO DE NEGOCIAÇÃO"; os seguintes em uma: "SETOR ECONÔMICO | … |
 * CÓDIGO | SEGMENTO DE NEGOCIAÇÃO"). Setor, subsetor e segmento vêm só na 1ª linha do grupo (células
 * mescladas) e são herdados pelas seguintes. Código = raiz de 4 caracteres (WEGE, B100).
 *
 * Texto preservado como no arquivo (ex.: 'Outros Intermediarios Financeiros' sem acento — é a chave
 * de params.financeiras); só espaços são normalizados ('Motores , Compressores' → 'Motores,
 * Compressores'). Cabeçalho ausente ⇒ ErroLayoutFonte.
 */
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';

export interface SetorB3 {
  raiz: string;
  nomePregao: string;
  setor: string;
  subsetor: string;
  segmento: string;
  segmentoListagem: string | null;
}

const RE_CODIGO_HDR = /^C[ÓO]DIGO$/i;
const RE_RAIZ = /^[A-Z0-9]{4}$/;

function texto(v: unknown): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .replace(/ ([,.;])/g, '$1')
    .trim();
}

export function parseClassifSetorial(
  linhas: unknown[][],
  arquivo = 'ClassifSetorial.xlsx',
): SetorB3[] {
  let iCod = -1;
  let viuCabecalhoSetor = false;
  let setor = '';
  let subsetor = '';
  let segmento = '';
  const porRaiz = new Map<string, SetorB3>();

  for (const bruta of linhas) {
    if (!Array.isArray(bruta)) continue;
    const r = bruta.map(texto);
    if (r.some((c) => /^SETOR( ECON[ÔO]MICO)?$/i.test(c))) viuCabecalhoSetor = true;
    const iHdr = r.findIndex((c) => RE_CODIGO_HDR.test(c));
    if (iHdr >= 0) {
      if (iHdr < 4)
        throw new ErroLayoutFonte(arquivo, [
          'colunas SETOR/SUBSETOR/SEGMENTO/NOME antes de CÓDIGO',
        ]);
      iCod = iHdr;
      continue;
    }
    if (iCod < 0) {
      // dado antes do 1º cabeçalho = layout desconhecido (não adivinhar colunas)
      if (!viuCabecalhoSetor && r.some((c) => RE_RAIZ.test(c))) {
        throw new ErroLayoutFonte(arquivo, ['cabeçalho SETOR/CÓDIGO antes dos dados']);
      }
      continue;
    }
    const [a, b, c, nome, cod, listagem] = r.slice(iCod - 4, iCod + 2);
    if (/^SETOR/i.test(a)) continue;
    // mudança de setor sem subsetor/segmento: filhos não herdam do setor anterior
    if (a) {
      setor = a;
      subsetor = '';
      segmento = '';
    }
    if (b) {
      subsetor = b;
      segmento = '';
    }
    if (c) segmento = c;
    if (!cod || !RE_RAIZ.test(cod)) continue;
    if (!setor || !subsetor || !segmento) {
      throw new ErroLayoutFonte(arquivo, [`setor/subsetor/segmento da raiz ${cod}`]);
    }
    porRaiz.set(cod, {
      raiz: cod,
      nomePregao: nome ?? '',
      setor,
      subsetor,
      segmento,
      segmentoListagem: listagem ? listagem : null,
    });
  }

  if (!viuCabecalhoSetor || iCod < 0) {
    throw new ErroLayoutFonte(arquivo, ['SETOR', 'SUBSETOR', 'SEGMENTO', 'CÓDIGO']);
  }
  return [...porRaiz.values()];
}

/** Diferença entre o cadastro gravado e o arquivo novo (alertas de raiz nova/sumida). */
export function diffRaizes(
  gravadasPresentes: Iterable<string>,
  novas: Iterable<string>,
): { novas: string[]; sumidas: string[] } {
  const antes = new Set(gravadasPresentes);
  const agora = new Set(novas);
  return {
    novas: [...agora].filter((r) => !antes.has(r)).sort(),
    sumidas: [...antes].filter((r) => !agora.has(r)).sort(),
  };
}
