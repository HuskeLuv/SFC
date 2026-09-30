import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  URL_CLASSIF_SETORIAL,
  nomeCotahistDiario,
  obterArquivoB3,
  urlCotahistAnual,
  urlCotahistDiario,
} from '@/services/analiseAtivos/b3/b3Arquivos';
import { GravadorCotacoes, paraLinhaQuote } from '@/services/analiseAtivos/b3/gravarB3';
import { parseLinhaCotahist } from '@/services/analiseAtivos/regras/b3/cotahist';
import { linhaDe, stubFetch } from './helpers';

const dir = mkdtempSync(path.join(os.tmpdir(), 'b3-arquivos-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

describe('URLs da B3 (allowlist)', () => {
  it('COTAHIST diário e anual em bvmf.bmfbovespa.com.br', () => {
    expect(urlCotahistDiario('2026-09-29')).toBe(
      'https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D29092026.ZIP',
    );
    expect(urlCotahistAnual(2016)).toBe(
      'https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2016.ZIP',
    );
    expect(nomeCotahistDiario('2025-01-02')).toBe('COTAHIST_D02012025.ZIP');
  });

  it('ClassifSetorial com payload base64 de {"language":"pt-br"}', () => {
    expect(URL_CLASSIF_SETORIAL).toBe(
      'https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetDownloadIndustryClassification/eyJsYW5ndWFnZSI6InB0LWJyIn0=',
    );
  });
});

describe('obterArquivoB3 com cacheDir', () => {
  it('arquivo no cache não é baixado; ausente é baixado e guardado na 1ª pasta', async () => {
    const cacheA = path.join(dir, 'a');
    const cacheB = path.join(dir, 'b');
    const noB = path.join(cacheB, 'COTAHIST_A2016.ZIP');
    await import('fs/promises').then((f) => f.mkdir(cacheB, { recursive: true }));
    writeFileSync(noB, 'zip antigo');
    const { fn } = stubFetch({ [urlCotahistAnual(2017)]: Buffer.from('zip novo') });

    const r1 = await obterArquivoB3(urlCotahistAnual(2016), {
      maxBytes: 1000,
      timeoutMs: 1000,
      cacheDir: [cacheA, cacheB],
    });
    expect(r1).toMatchObject({ doCache: true, caminho: noB, status: 'baixado' });
    expect(fn).not.toHaveBeenCalled();

    const r2 = await obterArquivoB3(urlCotahistAnual(2017), {
      maxBytes: 1000,
      timeoutMs: 1000,
      cacheDir: [cacheA, cacheB],
    });
    expect(r2.doCache).toBe(false);
    expect(r2.caminho).toBe(path.join(cacheA, 'COTAHIST_A2017.ZIP'));
    await r2.descartar();
    expect(readFileSync(r2.caminho!, 'utf8')).toBe('zip novo');
  });

  it('sem cache: descartar() apaga o temporário', async () => {
    stubFetch({ [urlCotahistAnual(2018)]: Buffer.from('conteudo') });
    const r = await obterArquivoB3(urlCotahistAnual(2018), { maxBytes: 1000, timeoutMs: 1000 });
    expect(existsSync(r.caminho!)).toBe(true);
    await r.descartar();
    expect(existsSync(r.caminho!)).toBe(false);
  });
});

describe('paraLinhaQuote — Decimal exato', () => {
  it('WEGE3 29/12/2016: 15.500000, volume R$ 31.890.961,00, quantidade BigInt', () => {
    const q = paraLinhaQuote(parseLinhaCotahist(linhaDe('WEGE3', '20161229'))!);
    expect(q.closeRaw.toString()).toBe('15.5');
    expect(q.volumeFin.toString()).toBe('31890961');
    expect(q.quantidade).toBe(2080400n);
    expect(q.date).toEqual(new Date('2016-12-29T00:00:00.000Z'));
    expect(q).toMatchObject({ symbol: 'WEGE3', codBdi: '02', fatCot: 1, negocios: 8628 });
  });

  it('CBEE3 FATCOT 1000: 0,87/1000 = 0.00087 sem erro de ponto flutuante', () => {
    const q = paraLinhaQuote(parseLinhaCotahist(linhaDe('CBEE3', '20160104'))!);
    expect(new Prisma.Decimal(q.closeRaw as Prisma.Decimal).equals('0.00087')).toBe(true);
    expect(q.fatCot).toBe(1000);
  });
});

describe('GravadorCotacoes', () => {
  const regs = ['WEGE3', 'HGLG11', 'MGLU3', 'PETR4', 'ITUB4'].map(
    (s) => parseLinhaCotahist(linhaDe(s, '20161229'))!,
  );

  it('grava em lotes com skipDuplicates e conta só o que o banco inseriu', async () => {
    const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length - 1 }));
    const prisma = { assetQuoteDaily: { createMany } } as unknown as PrismaClient;
    const g = new GravadorCotacoes(prisma, true, 2);
    for (const r of regs) await g.adicionar(r);
    await g.descarregar();
    expect(createMany).toHaveBeenCalledTimes(3);
    expect(
      createMany.mock.calls.every(([a]) => (a as { skipDuplicates: boolean }).skipDuplicates),
    ).toBe(true);
    expect(g.enviadas).toBe(5);
    expect(g.gravadas).toBe(2);
  });

  it('dry-run (aplicar=false) não chama o banco', async () => {
    const createMany = vi.fn();
    const g = new GravadorCotacoes(
      { assetQuoteDaily: { createMany } } as unknown as PrismaClient,
      false,
      2,
    );
    for (const r of regs) await g.adicionar(r);
    await g.descarregar();
    expect(createMany).not.toHaveBeenCalled();
    expect(g.enviadas).toBe(5);
  });
});
