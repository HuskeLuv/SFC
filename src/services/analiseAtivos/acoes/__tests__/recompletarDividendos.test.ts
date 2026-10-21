/**
 * fundamentei-regras (F2, A4.a) — modo --recompletar-campos=dividendosJcpPagos: relê a DFC dos
 * documentos JÁ gravados e corrige os proventos pagos pela regra ampliada (chave de ingestão
 * ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO). Recortes da CVM das fixtures A6; o valor "errado" é plantado.
 */
import { rmSync } from 'fs';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { urlArquivoCvm } from '@/services/analiseAtivos/acoes/cvmArquivos';
import { dividendosMudaram } from '@/services/analiseAtivos/acoes/sincronizarCvmCias';
import {
  CNPJ,
  dirZips,
  guardarEnv,
  linhaFund,
  num,
  rodarFin,
  setoresFixtures,
  zipDfpFin,
} from '@/services/analiseAtivos/acoes/__tests__/financeirasFixtures';
import { criarPrismaFake } from '@/services/analiseAtivos/acoes/__tests__/prismaFake';

afterAll(() => rmSync(dirZips, { recursive: true, force: true }));
let restaurar: () => void;
beforeEach(() => {
  restaurar = guardarEnv(['ANALISE_ATIVOS_CVM_DVA', 'ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO']);
  delete process.env.ANALISE_ATIVOS_CVM_DVA;
  delete process.env.ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO;
});
afterEach(() => restaurar());

async function ingestao() {
  const fake = criarPrismaFake();
  const zips = { [urlArquivoCvm('dfp', 2025)]: zipDfpFin(2025) };
  await rodarFin(fake.prisma, zips, { doc: 'dfp', anos: [2025] });
  fake.tabelas.assetSetorB3.push(...setoresFixtures());
  return { ...fake, zips };
}

describe('dividendosMudaram', () => {
  it('nulo → valor e diferença de centavo contam; novo nulo nunca apaga', () => {
    expect(dividendosMudaram(null, 10)).toBe(true);
    expect(dividendosMudaram(10, 10.004)).toBe(false);
    expect(dividendosMudaram(10, 10.01)).toBe(true);
    expect(dividendosMudaram(10, null)).toBe(false);
  });
});

describe('--recompletar-campos=dividendosJcpPagos', () => {
  it('sem a chave de ingestão ligada, recusa', async () => {
    const { prisma, zips } = await ingestao();
    await expect(
      rodarFin(prisma, zips, {
        doc: 'dfp',
        anos: [2025],
        recompletarCampos: ['dividendosJcpPagos'],
      }),
    ).rejects.toThrow(/ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO/);
  });

  it('dry-run lista antes/depois e não escreve; o apply corrige só o que mudou', async () => {
    const { prisma, tabelas, escritas, zips } = await ingestao();
    // ITUB 2025 (recorte da CVM): a regra de hoje soma os pagos a não controladores
    const itub = () => linhaFund(tabelas, CNPJ.ITUB, 'con', 'FY', '2025-12-31')!;
    expect(num(itub().dividendosJcpPagos)).toBe((48_299_000 + 633_000) * 1000);
    // e um valor plantado errado (regra antiga que perdeu a linha) em outra companhia
    const outra = tabelas.assetFundamentalsPeriod.find(
      (l) => l.emissorId === '17344597000194' && l.tipoPeriodo === 'FY' && l.escopo === 'con',
    );
    if (outra) {
      await prisma.assetFundamentalsPeriod.updateMany({
        where: { id: String(outra.id) },
        data: { dividendosJcpPagos: '1.00' },
      });
    }
    process.env.ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO = 'true';

    const n = escritas.n;
    const seco = await rodarFin(
      prisma,
      zips,
      { doc: 'dfp', anos: [2025], recompletarCampos: ['dividendosJcpPagos'] },
      { aplicar: false },
    );
    expect(escritas.n).toBe(n);
    const r = seco.arquivos[0].recompletar!;
    expect(r.gravadas).toBe(0);
    const item = r.dividendos!.find(
      (d) => d.emissorId === CNPJ.ITUB && d.tipoPeriodo === 'FY' && d.escopo === 'con',
    );
    expect(item).toMatchObject({ antes: 48_932_000_000, depois: 48_299_000_000 });
    if (outra) {
      expect(r.dividendos!.some((d) => d.emissorId === '17344597000194' && d.antes === 1)).toBe(
        true,
      );
    }
    expect(num(itub().dividendosJcpPagos)).toBe(48_932_000_000);

    const { arquivos } = await rodarFin(prisma, zips, {
      doc: 'dfp',
      anos: [2025],
      recompletarCampos: ['dividendosJcpPagos'],
    });
    expect(num(itub().dividendosJcpPagos)).toBe(48_299_000_000);
    expect(arquivos[0].recompletar!.porCampo.dividendosJcpPagos).toBeGreaterThanOrEqual(1);
  });

  it('rodar de novo não muda nada (idempotente)', async () => {
    const { prisma, zips } = await ingestao();
    process.env.ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO = 'true';
    await rodarFin(prisma, zips, {
      doc: 'dfp',
      anos: [2025],
      recompletarCampos: ['dividendosJcpPagos'],
    });
    const { arquivos } = await rodarFin(prisma, zips, {
      doc: 'dfp',
      anos: [2025],
      recompletarCampos: ['dividendosJcpPagos'],
    });
    expect(arquivos[0].recompletar!.porCampo.dividendosJcpPagos ?? 0).toBe(0);
    expect(arquivos[0].recompletar!.dividendos).toEqual([]);
  });
});
