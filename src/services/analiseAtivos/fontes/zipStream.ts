/**
 * Leitura de zip em streaming, sem dependência nova: lê o EOCD + diretório central do arquivo em
 * disco e infla cada entrada com zlib nativo (createInflateRaw), linha a linha. O arquivo nunca é
 * carregado inteiro em memória (limite de ~300 MB de RSS no Lightsail).
 *
 * Não suporta zip64 (os zips da CVM/B3 medidos na Fase A cabem no formato clássico); zip64 ⇒
 * ErroFonte('zip64_nao_suportado') em vez de ler errado.
 */
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { StringDecoder } from 'string_decoder';
import { createInflateRaw } from 'zlib';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';

const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const TAM_EOCD = 22;
const MAX_COMENTARIO = 0xffff;
const MAX_LINHA_PADRAO = 4 * 1024 * 1024;
/**
 * Tetos contra zip bomb (a RAM do Lightsail é compartilhada com o app). Medido em 30/09/2026 nos
 * zips reais: maior entrada = COTAHIST_A2025.TXT com 784 MB; maior razão = DMPL do ITR com ~36×.
 */
export const MAX_DESCOMPRIMIDO_PADRAO = 2_000_000_000;
export const MAX_RAZAO_COMPRESSAO_PADRAO = 200;

export interface EntradaZip {
  nome: string;
  metodo: number;
  tamanhoComprimido: number;
  tamanhoOriginal: number;
  offsetCabecalhoLocal: number;
  criptografada: boolean;
}

async function lerTrecho(caminho: string, inicio: number, tamanho: number): Promise<Buffer> {
  const fh = await open(caminho, 'r');
  try {
    const buf = Buffer.alloc(tamanho);
    const { bytesRead } = await fh.read(buf, 0, tamanho, inicio);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function tamanhoArquivo(caminho: string): Promise<number> {
  const fh = await open(caminho, 'r');
  try {
    return (await fh.stat()).size;
  } finally {
    await fh.close();
  }
}

export async function listarEntradasZip(caminho: string): Promise<EntradaZip[]> {
  const tamanho = await tamanhoArquivo(caminho);
  if (tamanho < TAM_EOCD) throw new ErroFonte('zip_truncado', `zip curto demais: ${caminho}`);

  const cauda = Math.min(tamanho, TAM_EOCD + MAX_COMENTARIO + 20);
  const fim = await lerTrecho(caminho, tamanho - cauda, cauda);
  let pos = -1;
  for (let i = fim.length - TAM_EOCD; i >= 0; i--) {
    if (fim.readUInt32LE(i) === SIG_EOCD) {
      pos = i;
      break;
    }
  }
  if (pos < 0) {
    throw new ErroFonte('zip_truncado', `fim do diretório central não encontrado: ${caminho}`);
  }
  if (pos >= 20 && fim.readUInt32LE(pos - 20) === SIG_ZIP64_LOCATOR) {
    throw new ErroFonte('zip64_nao_suportado', `zip64: ${caminho}`);
  }

  const totalEntradas = fim.readUInt16LE(pos + 10);
  const tamanhoCd = fim.readUInt32LE(pos + 12);
  const offsetCd = fim.readUInt32LE(pos + 16);
  if (totalEntradas === 0xffff || tamanhoCd === 0xffffffff || offsetCd === 0xffffffff) {
    throw new ErroFonte('zip64_nao_suportado', `zip64: ${caminho}`);
  }
  if (offsetCd + tamanhoCd > tamanho) {
    throw new ErroFonte('zip_truncado', `diretório central além do fim do arquivo: ${caminho}`);
  }

  const cd = await lerTrecho(caminho, offsetCd, tamanhoCd);
  const entradas: EntradaZip[] = [];
  let p = 0;
  for (let n = 0; n < totalEntradas; n++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ErroFonte('zip_invalido', `diretório central corrompido: ${caminho}`);
    }
    const flags = cd.readUInt16LE(p + 8);
    const metodo = cd.readUInt16LE(p + 10);
    const tamanhoComprimido = cd.readUInt32LE(p + 20);
    const tamanhoOriginal = cd.readUInt32LE(p + 24);
    const lenNome = cd.readUInt16LE(p + 28);
    const lenExtra = cd.readUInt16LE(p + 30);
    const lenComentario = cd.readUInt16LE(p + 32);
    const offsetCabecalhoLocal = cd.readUInt32LE(p + 42);
    if (
      tamanhoComprimido === 0xffffffff ||
      tamanhoOriginal === 0xffffffff ||
      offsetCabecalhoLocal === 0xffffffff
    ) {
      throw new ErroFonte('zip64_nao_suportado', `entrada zip64 em ${caminho}`);
    }
    const nomeBuf = cd.subarray(p + 46, p + 46 + lenNome);
    // bit 11 = nome em UTF-8; senão CP437 (latin1 é aproximação suficiente para nomes ASCII da CVM)
    const nome = nomeBuf.toString(flags & 0x800 ? 'utf8' : 'latin1');
    entradas.push({
      nome,
      metodo,
      tamanhoComprimido,
      tamanhoOriginal,
      offsetCabecalhoLocal,
      criptografada: (flags & 0x1) !== 0,
    });
    p += 46 + lenNome + lenExtra + lenComentario;
  }
  return entradas;
}

/**
 * Recusa entradas que inflariam além do teto (por entrada e no total) ou com razão de compressão
 * típica de zip bomb. Para quem descomprime o arquivo inteiro em memória (XLSX.read).
 */
export function conferirTetosDescompressao(
  entradas: EntradaZip[],
  nomeArquivo: string,
  opts: { maxTotal: number; maxRazaoCompressao?: number },
): void {
  const maxRazao = opts.maxRazaoCompressao ?? MAX_RAZAO_COMPRESSAO_PADRAO;
  let total = 0;
  for (const e of entradas) {
    total += e.tamanhoOriginal;
    if (e.tamanhoComprimido > 0 && e.tamanhoOriginal / e.tamanhoComprimido > maxRazao) {
      throw new ErroFonte(
        'zip_corrompido',
        `${nomeArquivo}/${e.nome}: razão de compressão > ${maxRazao}`,
      );
    }
  }
  if (total > opts.maxTotal) {
    throw new ErroFonte(
      'zip_corrompido',
      `${nomeArquivo}: ${total} bytes descomprimidos > teto ${opts.maxTotal}`,
    );
  }
}

/**
 * Linhas de uma entrada do zip (sem '\n' e sem '\r' final). `maxLinha` (caracteres) protege a
 * memória contra arquivo sem quebra de linha.
 */
export async function* linhasDaEntrada(
  caminho: string,
  entrada: EntradaZip,
  opts?: {
    encoding?: 'latin1' | 'utf8';
    maxLinha?: number;
    maxDescomprimido?: number;
    maxRazaoCompressao?: number;
  },
): AsyncIterable<string> {
  if (entrada.criptografada) throw new ErroFonte('zip_criptografado', entrada.nome);
  if (entrada.metodo !== 0 && entrada.metodo !== 8) {
    throw new ErroFonte('zip_metodo_nao_suportado', `${entrada.nome}: método ${entrada.metodo}`);
  }
  const maxDescomprimido = opts?.maxDescomprimido ?? MAX_DESCOMPRIMIDO_PADRAO;
  const maxRazao = opts?.maxRazaoCompressao ?? MAX_RAZAO_COMPRESSAO_PADRAO;
  if (entrada.tamanhoOriginal > maxDescomprimido) {
    throw new ErroFonte(
      'zip_corrompido',
      `${entrada.nome}: ${entrada.tamanhoOriginal} bytes descomprimidos > teto ${maxDescomprimido}`,
    );
  }
  if (
    entrada.tamanhoComprimido > 0 &&
    entrada.tamanhoOriginal / entrada.tamanhoComprimido > maxRazao
  ) {
    throw new ErroFonte(
      'zip_corrompido',
      `${entrada.nome}: razão de compressão > ${maxRazao} (${entrada.tamanhoOriginal}/${entrada.tamanhoComprimido})`,
    );
  }
  const tamanho = await tamanhoArquivo(caminho);
  const local = await lerTrecho(caminho, entrada.offsetCabecalhoLocal, 30);
  if (local.length < 30 || local.readUInt32LE(0) !== SIG_LOCAL) {
    throw new ErroFonte('zip_invalido', `cabeçalho local inválido: ${entrada.nome}`);
  }
  const inicio =
    entrada.offsetCabecalhoLocal + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  if (inicio + entrada.tamanhoComprimido > tamanho) {
    throw new ErroFonte('zip_truncado', `dados de ${entrada.nome} além do fim do arquivo`);
  }

  const maxLinha = opts?.maxLinha ?? MAX_LINHA_PADRAO;
  const decoder = new StringDecoder(opts?.encoding ?? 'latin1');
  const bruto =
    entrada.tamanhoComprimido === 0
      ? null
      : createReadStream(caminho, { start: inicio, end: inicio + entrada.tamanhoComprimido - 1 });
  const fluxo = bruto && entrada.metodo === 8 ? bruto.pipe(createInflateRaw()) : bruto;
  if (bruto && fluxo !== bruto) {
    bruto.on('error', (e) => fluxo?.destroy(e));
  }

  let resto = '';
  let lidos = 0;
  try {
    if (fluxo) {
      for await (const chunk of fluxo as AsyncIterable<Buffer>) {
        lidos += chunk.length;
        // aborta ANTES de entregar linhas além do tamanho declarado (zip bomb não infla em memória)
        if (lidos > entrada.tamanhoOriginal) {
          throw new ErroFonte(
            'zip_corrompido',
            `${entrada.nome}: mais de ${entrada.tamanhoOriginal} bytes inflados (declarado)`,
          );
        }
        resto += decoder.write(chunk);
        let ini = 0;
        let i: number;
        while ((i = resto.indexOf('\n', ini)) >= 0) {
          const linha = resto.slice(ini, i);
          ini = i + 1;
          yield linha.endsWith('\r') ? linha.slice(0, -1) : linha;
        }
        resto = resto.slice(ini);
        if (resto.length > maxLinha) {
          throw new ErroFonte('linha_muito_longa', `${entrada.nome}: linha > ${maxLinha}`);
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof ErroFonte) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ErroFonte('zip_corrompido', `${entrada.nome}: ${msg}`);
  } finally {
    bruto?.destroy();
    if (fluxo && fluxo !== bruto) fluxo.destroy();
  }
  if (lidos !== entrada.tamanhoOriginal) {
    throw new ErroFonte(
      'zip_corrompido',
      `${entrada.nome}: ${lidos} bytes inflados, esperado ${entrada.tamanhoOriginal}`,
    );
  }
  resto += decoder.end();
  if (resto.length > 0) yield resto.endsWith('\r') ? resto.slice(0, -1) : resto;
}
