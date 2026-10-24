/**
 * Modo --recompletar-campos=depreciacaoAmortizacao: relê a DFC dos documentos JÁ gravados e corrige a
 * D&A pela regra de hoje (linha própria de direito de uso / arrendamento fora, como o Fundamentei).
 * Recortes da CVM das fixtures A6; o valor "errado" é plantado na WEGE.
 */
import { rmSync } from 'fs';
import { afterAll, describe, expect, it } from 'vitest';
import { urlArquivoCvm } from '@/services/analiseAtivos/acoes/cvmArquivos';
import {
  CNPJ,
  dirZips,
  linhaFund,
  num,
  rodarFin,
  setoresFixtures,
  zipDfpFin,
} from '@/services/analiseAtivos/acoes/__tests__/financeirasFixtures';
import { criarPrismaFake } from '@/services/analiseAtivos/acoes/__tests__/prismaFake';

afterAll(() => rmSync(dirZips, { recursive: true, force: true }));

// DFC sintética da WEGE (as fixtures das financeiras não têm): depreciação + direito de uso em linha própria
const DFC_WEGE = [
  ['6.01', 'Caixa Líquido Atividades Operacionais', 6000000],
  ['6.01.01', 'Caixa Gerado nas Operações', 7000000],
  ['6.01.01.02', 'Depreciações', 900000],
  ['6.01.01.03', 'Amortização de direito de uso', 100000],
]
  .map(
    ([cd, ds, v]) =>
      `84.429.695/0001-11;2025-12-31;1;WEG S.A.;005410;;REAL;MIL;ÚLTIMO;2025-01-01;2025-12-31;${cd};${ds};${v}.0000000000;S`,
  )
  .join('\n');
const comDfcWege = (entrada: string, t: string) =>
  entrada.includes('DFC_MI_con') ? `${t.replace(/\n$/, '')}\n${DFC_WEGE}\n` : t;

async function ingestao() {
  const fake = criarPrismaFake();
  const zips = { [urlArquivoCvm('dfp', 2025)]: zipDfpFin(2025, { ajustar: comDfcWege }) };
  await rodarFin(fake.prisma, zips, { doc: 'dfp', anos: [2025] });
  fake.tabelas.assetSetorB3.push(...setoresFixtures());
  return { ...fake, zips };
}

const MODO = {
  doc: 'dfp' as const,
  anos: [2025],
  recompletarCampos: ['depreciacaoAmortizacao' as const],
};

describe('--recompletar-campos=depreciacaoAmortizacao', () => {
  it('dry-run lista antes/depois sem escrever; o apply corrige; banco fica fora', async () => {
    const { prisma, tabelas, escritas, zips } = await ingestao();
    const wege = () => linhaFund(tabelas, CNPJ.WEGE, 'con', 'FY', '2025-12-31')!;
    // a ingestão de hoje já deixa o direito de uso fora: 900 mi
    const certo = 900_000_000;
    expect(num(wege().depreciacaoAmortizacao)).toBe(certo);
    // valor da regra antiga (com o direito de uso): 1.000 mi
    await prisma.assetFundamentalsPeriod.updateMany({
      where: { id: String(wege().id) },
      data: { depreciacaoAmortizacao: '1000000000.00' },
    });

    const n = escritas.n;
    const seco = await rodarFin(prisma, zips, MODO, { aplicar: false });
    expect(escritas.n).toBe(n);
    const r = seco.arquivos[0].recompletar!;
    const item = r.depreciacao!.find(
      (d) => d.emissorId === CNPJ.WEGE && d.tipoPeriodo === 'FY' && d.escopo === 'con',
    );
    expect(item).toMatchObject({ antes: 1_000_000_000, depois: certo });
    expect(r.depreciacao!.some((d) => d.emissorId === CNPJ.ITUB)).toBe(false);

    await rodarFin(prisma, zips, MODO);
    expect(num(wege().depreciacaoAmortizacao)).toBe(certo);
  });

  it('rodar de novo não muda nada (idempotente)', async () => {
    const { prisma, zips } = await ingestao();
    const { arquivos } = await rodarFin(prisma, zips, MODO);
    expect(arquivos[0].recompletar!.porCampo.depreciacaoAmortizacao ?? 0).toBe(0);
    expect(arquivos[0].recompletar!.depreciacao).toEqual([]);
  });
});
