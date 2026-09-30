import AdmZip from 'adm-zip';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import {
  conferirTetosDescompressao,
  linhasDaEntrada,
  listarEntradasZip,
} from '@/services/analiseAtivos/fontes/zipStream';

const dir = mkdtempSync(path.join(os.tmpdir(), 'zipstream-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// linha longa pouco compressível (texto real da CVM comprime ≤ 36×; teto de razão = 200)
const LINHA_LONGA = Array.from({ length: 70 * 1024 }, (_, i) =>
  String.fromCharCode(65 + (((i * 7919) % 9973) % 26)),
).join('');
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

  describe('zip bomb (achado qa-seguranca 30/09)', () => {
    /** Zip de ~1 MB que infla 8 MB mas declara `tamanhoOriginal` pequeno no diretório central. */
    function bomba(nome: string, declarado: number): string {
      const zip = new AdmZip();
      zip.addFile('bomba.csv', Buffer.from('A;B\n'.repeat(2 * 1024 * 1024), 'latin1'));
      const caminho = path.join(dir, nome);
      zip.writeZip(caminho);
      const buf = readFileSync(caminho);
      const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      buf.writeUInt32LE(declarado, cd + 24);
      writeFileSync(caminho, buf);
      return caminho;
    }

    it('para ASSIM que passa do tamanho declarado, sem entregar o resto das linhas', async () => {
      const caminho = bomba('bomba.zip', 10);
      const [e] = await listarEntradasZip(caminho);
      expect(e.tamanhoOriginal).toBe(10);
      let entregues = 0;
      const erro = await (async () => {
        for await (const _l of linhasDaEntrada(caminho, e, { maxRazaoCompressao: 1e9 })) {
          entregues++;
        }
      })().catch((x: unknown) => x);
      expect(erro).toMatchObject({ codigo: 'zip_corrompido' });
      // antes: 2.097.152 linhas entregues e o erro só no fim
      expect(entregues).toBe(0);
    });

    it('razão de compressão acima do teto ⇒ recusa antes de inflar', async () => {
      const caminho = bomba('razao.zip', 8 * 1024 * 1024);
      const [e] = await listarEntradasZip(caminho);
      await expect(coletar(linhasDaEntrada(caminho, e))).rejects.toMatchObject({
        codigo: 'zip_corrompido',
      });
      // mesma entrada passa com teto folgado (a razão real é ~1000×)
      const n = (await coletar(linhasDaEntrada(caminho, e, { maxRazaoCompressao: 1e6 }))).length;
      expect(n).toBe(2 * 1024 * 1024);
    });

    it('tamanho declarado acima do teto ⇒ recusa; conferirTetosDescompressao soma as entradas', async () => {
      const caminho = criarZip('teto.zip');
      const entradas = await listarEntradasZip(caminho);
      await expect(
        coletar(linhasDaEntrada(caminho, entradas[0], { maxDescomprimido: 100 })),
      ).rejects.toMatchObject({ codigo: 'zip_corrompido' });
      expect(() =>
        conferirTetosDescompressao(entradas, 'teto.zip', { maxTotal: 1e6 }),
      ).not.toThrow();
      expect(() => conferirTetosDescompressao(entradas, 'teto.zip', { maxTotal: 100 })).toThrow(
        ErroFonte,
      );
    });
  });
});
