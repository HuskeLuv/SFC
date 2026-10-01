import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { lerCotahistZip, novaEstatistica } from '@/services/analiseAtivos/b3/cotahistStream';
import { ErroFonte, ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import type { RegistroCotahist } from '@/services/analiseAtivos/regras/b3/cotahist';
import { LINHAS_AMOSTRA, dados, zipCotahist } from './helpers';

const dir = mkdtempSync(path.join(os.tmpdir(), 'cotahist-stream-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
function arquivo(buf: Buffer): string {
  const p = path.join(dir, `z${n++}.zip`);
  writeFileSync(p, buf);
  return p;
}

async function coletar(caminho: string, aceitar?: (d: string) => boolean) {
  const estat = novaEstatistica();
  const regs: RegistroCotahist[] = [];
  for await (const r of lerCotahistZip(caminho, {
    arquivo: 'teste',
    aceitarDataBruta: aceitar,
    estat,
  })) {
    regs.push(r);
  }
  return { regs, estat };
}

const LINHAS = dados(LINHAS_AMOSTRA);

describe('lerCotahistZip', () => {
  it('emite só 010 + BDI 02/12, com estatística e trailer conferido', async () => {
    const { regs, estat } = await coletar(arquivo(zipCotahist(LINHAS)));
    const symbols = new Set(regs.map((r) => r.symbol));
    expect(symbols.has('WEGE3')).toBe(true);
    expect(symbols.has('HGLG11')).toBe(true);
    expect(symbols.has('CBEE3')).toBe(true);
    expect(symbols.has('WEGE3F')).toBe(false);
    expect(symbols.has('BOVA11')).toBe(false);
    expect(symbols.has('RZAG11')).toBe(false);
    expect(estat).toMatchObject({
      linhas: LINHAS.length + 2,
      totalDeclarado: LINHAS.length + 2,
      dataGeracao: '2016-12-29',
      rejeitados: 0,
      emitidos: regs.length,
      primeiraData: '2016-01-04',
      ultimaData: '2026-08-03',
    });
  });

  it('filtro de data na linha crua (perfil dev: fim de período)', async () => {
    const { regs } = await coletar(arquivo(zipCotahist(LINHAS)), (d) => d === '20161229');
    expect(regs.map((r) => r.symbol).sort()).toEqual(
      ['HGLG11', 'ITUB4', 'MGLU3', 'MXRF11', 'PETR4', 'WEGE3'].sort(),
    );
  });

  it('linha 010/BDI 02 com campo inválido conta como rejeitada e não é emitida', async () => {
    const ruim = LINHAS[1].slice(0, 108) + 'XXXXXXXXXXXXX' + LINHAS[1].slice(121);
    const { regs, estat } = await coletar(arquivo(zipCotahist([ruim, LINHAS[2]])));
    expect(estat.rejeitados).toBe(1);
    expect(regs).toHaveLength(1);
  });

  it('header diferente ⇒ ErroLayoutFonte', async () => {
    const z = zipCotahist(LINHAS, { header: 'CNPJ_CIA;DT_REFER;VERSAO'.padEnd(245, ' ') });
    await expect(coletar(arquivo(z))).rejects.toBeInstanceOf(ErroLayoutFonte);
  });

  it('trailer contando só os registros 01 (convenção do COTAHIST_A2025) também é aceito', async () => {
    const { estat } = await coletar(arquivo(zipCotahist(LINHAS, { totalTrailer: LINHAS.length })));
    expect(estat.totalDeclarado).toBe(LINHAS.length);
  });

  it('trailer com total diferente ⇒ ErroFonte zip_corrompido; sem trailer ⇒ zip_truncado', async () => {
    const e1 = await coletar(arquivo(zipCotahist(LINHAS, { totalTrailer: 999 }))).catch((e) => e);
    expect(e1).toBeInstanceOf(ErroFonte);
    expect((e1 as ErroFonte).codigo).toBe('zip_corrompido');
    const e2 = await coletar(arquivo(zipCotahist(LINHAS, { totalTrailer: null }))).catch((e) => e);
    expect((e2 as ErroFonte).codigo).toBe('zip_truncado');
  });

  it('zip com mais de uma entrada ⇒ ErroLayoutFonte', async () => {
    const z = zipCotahist(LINHAS, { entradasExtras: ['LEIAME.TXT'] });
    await expect(coletar(arquivo(z))).rejects.toBeInstanceOf(ErroLayoutFonte);
  });
});
