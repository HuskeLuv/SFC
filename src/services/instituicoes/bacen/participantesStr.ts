/**
 * Lista de participantes do STR (Bacen): ISPB (= raiz do CNPJ), código COMPE, nome reduzido e
 * nome extenso. Complementa o IF.data no import do catálogo (ClickUp 86e2xqh69): o COMPE casa as
 * linhas antigas do catálogo (codigo '643'), o nome reduzido vira apelido de busca e o nome
 * extenso é o nome da linha nova.
 */

export const PARTICIPANTES_STR_URL =
  'https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.csv';

export interface ParticipanteStr {
  /** COMPE de 3 dígitos; null quando 'n/a'. */
  compe: string | null;
  nomeReduzido: string;
  nomeExtenso: string;
}

/** Linhas de um CSV com aspas (RFC 4180: "a,b" e "" dentro de aspas). */
export function lerCsv(conteudo: string): string[][] {
  const texto = conteudo.replace(/^﻿/, '');
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          aspas = false;
        }
      } else {
        campo += ch;
      }
      continue;
    }
    if (ch === '"') aspas = true;
    else if (ch === ',') {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      campo = '';
      if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
      linha = [];
    } else {
      campo += ch;
    }
  }
  linha.push(campo);
  if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
  return linhas;
}

const chaveCabecalho = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/**
 * CSV do STR → Map raiz → participante. Procura as colunas pelo nome (ISPB, Nome_Reduzido,
 * Número_Código, Nome_Extenso), sem depender de acento nem da ordem.
 */
export function parseParticipantesStr(csv: string): Map<string, ParticipanteStr> {
  const [cabecalho, ...linhas] = lerCsv(csv);
  if (!cabecalho) return new Map();
  const indice = (nome: string) => cabecalho.findIndex((c) => chaveCabecalho(c) === nome);
  const iIspb = indice('ispb');
  const iReduzido = indice('nomereduzido');
  const iCodigo = indice('numerocodigo');
  const iExtenso = indice('nomeextenso');
  if (iIspb < 0 || iReduzido < 0 || iCodigo < 0 || iExtenso < 0) {
    throw new Error(`STR: cabeçalho inesperado (${cabecalho.join(', ')})`);
  }
  const mapa = new Map<string, ParticipanteStr>();
  for (const l of linhas) {
    const raiz = (l[iIspb] ?? '').trim();
    if (!/^\d{8}$/.test(raiz) || mapa.has(raiz)) continue;
    const codigo = (l[iCodigo] ?? '').trim();
    mapa.set(raiz, {
      compe: /^\d{3}$/.test(codigo) ? codigo : null,
      nomeReduzido: (l[iReduzido] ?? '').trim(),
      nomeExtenso: (l[iExtenso] ?? '').trim(),
    });
  }
  return mapa;
}

/** Bytes do CSV → texto: UTF-8 (o arquivo atual tem BOM); se não for UTF-8 válido, Latin-1. */
export function decodificarCsv(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export async function baixarParticipantesStr(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<{ csv: string; participantes: Map<string, ParticipanteStr> }> {
  const resp = await fetchImpl(PARTICIPANTES_STR_URL);
  if (!resp.ok) throw new Error(`STR: HTTP ${resp.status}`);
  const csv = decodificarCsv(await resp.arrayBuffer());
  return { csv, participantes: parseParticipantesStr(csv) };
}
