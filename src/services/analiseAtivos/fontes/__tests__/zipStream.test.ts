import AdmZip from 'adm-zip';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import { linhasDaEntrada, listarEntradasZip } from '@/services/analiseAtivos/fontes/zipStream';

const dir = mkdtempSync(path.join(os.tmpdir(), 'zipstream-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const LINHA_LONGA = 'X'.repeat(70 * 1024);
const TEXTO_A = `CNPJ;VALOR\r\n11;1\r\n22;${LINHA_LONGA}\r\n33;Patrimônio Líquido`;
const TEXTO_B = 'a\nb\nc\n';

function criarZip(nome: string): string {
  const zip = new AdmZip();
  zip.addFile('deflate.csv', Buffer.from(TEXTO_A, 'latin1'));
  zip.addFile('stored.csv', Buffer.from(TEXTO_B, 'latin1'));
  zip.getEntry('stored.csv')!.header.method = 0;
  const caminho = path.join(dir, nome);
  zip.writeZip(caminho);
  return caminho;
}

async function coletar(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const l of it) out.push(l);
  return out;
}

describe('zipStream', () => {
  it('lista as entradas pelo diretório central (deflate e stored)', async () => {
    const caminho = criarZip('ok.zip');
    const entradas = await listarEntradasZip(caminho);
    expect(entradas.map((e) => [e.nome, e.metodo])).toEqual([
      ['deflate.csv', 8],
      ['stored.csv', 0],
    ]);
  });

  it('lê linha a linha as duas entradas, com linha > 64 KB, removendo \\r e decodificando latin1', async () => {
    const caminho = criarZip('linhas.zip');
    const [a, b] = await listarEntradasZip(caminho);
    const la = await coletar(linhasDaEntrada(caminho, a));
    expect(la).toHaveLength(4);
    expect(la[0]).toBe('CNPJ;VALOR');
    expect(la[2]).toBe(`22;${LINHA_LONGA}`);
    expect(la[3]).toBe('33;Patrimônio Líquido');
    expect(await coletar(linhasDaEntrada(caminho, b))).toEqual(['a', 'b', 'c']);
  });

  it('consumidor pode parar no meio (break) sem erro', async () => {
    const caminho = criarZip('break.zip');
    const [a] = await listarEntradasZip(caminho);
    let n = 0;
    for await (const _l of linhasDaEntrada(caminho, a)) {
      if (++n === 2) break;
    }
    expect(n).toBe(2);
  });

  it('linha maior que maxLinha ⇒ ErroFonte linha_muito_longa', async () => {
    const caminho = criarZip('max.zip');
    const [a] = await listarEntradasZip(caminho);
    await expect(coletar(linhasDaEntrada(caminho, a, { maxLinha: 1024 }))).rejects.toMatchObject({
      codigo: 'linha_muito_longa',
    });
  });

  it('zip truncado ⇒ ErroFonte', async () => {
    const caminho = criarZip('inteiro.zip');
    const truncado = path.join(dir, 'truncado.zip');
    const buf = readFileSync(caminho);
    writeFileSync(truncado, buf.subarray(0, Math.floor(buf.length / 2)));
    const erro = await listarEntradasZip(truncado).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroFonte);
    expect((erro as ErroFonte).codigo).toBe('zip_truncado');
  });

  it('dados da entrada corrompidos ⇒ ErroFonte zip_corrompido', async () => {
    const caminho = criarZip('corrompido.zip');
    const [a] = await listarEntradasZip(caminho);
    const buf = readFileSync(caminho);
    const inicio = a.offsetCabecalhoLocal + 30 + 'deflate.csv'.length;
    buf.fill(0xff, inicio + 5, inicio + 40);
    writeFileSync(caminho, buf);
    await expect(coletar(linhasDaEntrada(caminho, a))).rejects.toMatchObject({
      codigo: 'zip_corrompido',
    });
  });

  it("zip64 ⇒ ErroFonte('zip64_nao_suportado')", async () => {
    const caminho = criarZip('zip64.zip');
    const buf = readFileSync(caminho);
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    buf.writeUInt32LE(0xffffffff, eocd + 16); // offset do diretório central marcado como zip64
    writeFileSync(caminho, buf);
    await expect(listarEntradasZip(caminho)).rejects.toMatchObject({
      codigo: 'zip64_nao_suportado',
    });
  });
});
