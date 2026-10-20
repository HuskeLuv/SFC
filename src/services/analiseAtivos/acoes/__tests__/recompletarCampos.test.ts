/**
 * A6, fatia B — modo --recompletar-campos (pdd | seguradora | layout): relê os documentos JÁ
 * gravados e faz UPDATE só das colunas novas e nulas; 'layout' só mexe em ebit/D&A de BBSE/IRB
 * 2016–2022. Recortes reais da CVM (financeirasFixtures).
 */
import { rmSync } from 'fs';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { urlArquivoCvm } from '@/services/analiseAtivos/acoes/cvmArquivos';
import { CAMPOS_FINANCEIRAS } from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
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
  restaurar = guardarEnv(['ANALISE_ATIVOS_CVM_DVA']);
  delete process.env.ANALISE_ATIVOS_CVM_DVA;
});
afterEach(() => restaurar());

type Linha = Record<string, unknown>;
const NOVAS = new Set<string>(CAMPOS_FINANCEIRAS);
const LAYOUT = new Set(['ebit', 'depreciacaoAmortizacao', 'naoSeAplica']);

/** Retrato das linhas (id → colunas normalizadas), para comparar antes/depois. */
function retrato(linhas: Linha[]): Map<string, Record<string, unknown>> {
  return new Map(
    linhas.map((l) => [
      String(l.id),
      Object.fromEntries(
        Object.entries(l).map(([k, v]) => [
          k,
          v instanceof Date ? v.getTime() : v === null || v === undefined ? null : String(v),
        ]),
      ),
    ]),
  );
}

/**
 * Ingestão "de antes" (sem DVA nem Set de seguradoras: as colunas novas ficam nulas), e depois o
 * cadastro B3 chega (Set conhecido) para o recompletar.
 */
async function ingestaoAntiga(ano: 2025 | 2022) {
  const fake = criarPrismaFake();
  const zips = { [urlArquivoCvm('dfp', ano)]: zipDfpFin(ano) };
  await rodarFin(fake.prisma, zips, { doc: 'dfp', anos: [ano] });
  fake.tabelas.assetSetorB3.push(...setoresFixtures());
  return { ...fake, zips };
}

describe('--recompletar-campos=pdd', () => {
  it('documento já gravado ganha a PDD por UPDATE, sem duplicar linha (mesmo sem a chave da DVA)', async () => {
    const { prisma, tabelas, zips } = await ingestaoAntiga(2025);
    const antes = tabelas.assetFundamentalsPeriod.length;
    expect(num(linhaFund(tabelas, CNPJ.ITUB, 'con', 'FY', '2025-12-31')!.pdd)).toBeNull();
    const { arquivos } = await rodarFin(prisma, zips, {
      doc: 'dfp',
      anos: [2025],
      recompletarCampos: ['pdd'],
    });
    expect(tabelas.assetFundamentalsPeriod.length).toBe(antes);
    expect(num(linhaFund(tabelas, CNPJ.ITUB, 'con', 'FY', '2025-12-31')!.pdd)).toBe(
      -28_833_000_000,
    );
    expect(num(linhaFund(tabelas, CNPJ.BBAS, 'ind', 'FY', '2025-12-31')!.pdd)).toBe(
      -65_649_161_000,
    );
    // indústria não ganha nada
    expect(num(linhaFund(tabelas, CNPJ.WEGE, 'con', 'FY', '2025-12-31')!.pdd)).toBeNull();
    const r = arquivos[0].recompletar!;
    expect(r.porCampo.pdd).toBeGreaterThan(0);
    expect(r.porEmissor[CNPJ.ITUB]?.pdd).toBeGreaterThan(0);
    expect(r.layout).toHaveLength(0);
  });

  it('coluna já preenchida não é sobrescrita', async () => {
    const { prisma, tabelas, zips } = await ingestaoAntiga(2025);
    const bb = linhaFund(tabelas, CNPJ.BBAS, 'ind', 'FY', '2025-12-31')!;
    await prisma.assetFundamentalsPeriod.updateMany({
      where: { id: String(bb.id) },
      data: { pdd: '-1.00' },
    });
    const { arquivos } = await rodarFin(prisma, zips, {
      doc: 'dfp',
      anos: [2025],
      recompletarCampos: ['pdd'],
    });
    expect(num(linhaFund(tabelas, CNPJ.BBAS, 'ind', 'FY', '2025-12-31')!.pdd)).toBe(-1);
    expect(arquivos[0].recompletar!.jaPreenchidas).toBeGreaterThanOrEqual(1);
  });

  it('dry-run lista por campo e por emissor e não escreve nada', async () => {
    const { prisma, tabelas, escritas, zips } = await ingestaoAntiga(2025);
    const antes = retrato(tabelas.assetFundamentalsPeriod);
    const n = escritas.n;
    const { arquivos } = await rodarFin(
      prisma,
      zips,
      { doc: 'dfp', anos: [2025], recompletarCampos: ['pdd', 'seguradora'] },
      { aplicar: false },
    );
    expect(escritas.n).toBe(n);
    expect(retrato(tabelas.assetFundamentalsPeriod)).toEqual(antes);
    const r = arquivos[0].recompletar!;
    expect(r.gravadas).toBe(0);
    expect(r.porCampo.pdd).toBeGreaterThan(0);
    expect(r.porCampo.receitaComissoesServicos).toBeGreaterThan(0);
    expect(Object.keys(r.porEmissor)).toContain(CNPJ.BBSE);
  });
});

describe('--recompletar-campos=seguradora', () => {
  it('preenche só as colunas novas de seguradora: nenhuma coluna existente muda', async () => {
    const { prisma, tabelas, zips } = await ingestaoAntiga(2025);
    const antes = retrato(tabelas.assetFundamentalsPeriod);
    await rodarFin(prisma, zips, { doc: 'dfp', anos: [2025], recompletarCampos: ['seguradora'] });
    const depois = retrato(tabelas.assetFundamentalsPeriod);
    let mudou = 0;
    for (const [id, a] of antes) {
      const d = depois.get(id)!;
      for (const k of Object.keys({ ...a, ...d })) {
        if (NOVAS.has(k)) continue;
        // a linha TTM é derivada: o recálculo (gravarTtm) só renova o fetchedAt dela
        if (a.tipoPeriodo === 'TTM' && k === 'fetchedAt') continue;
        expect([id, k, d[k] ?? null]).toEqual([id, k, a[k] ?? null]);
      }
      if (CAMPOS_FINANCEIRAS.some((c) => (d[c] ?? null) !== (a[c] ?? null))) mudou++;
    }
    expect(mudou).toBeGreaterThan(0);
    expect(num(linhaFund(tabelas, CNPJ.PSSA, 'con', 'FY', '2025-12-31')!.despesaSeguro)).toBe(
      -25_361_238_000,
    );
    expect(
      num(linhaFund(tabelas, CNPJ.BBSE, 'con', 'FY', '2025-12-31')!.receitaComissoesServicos),
    ).toBe(4_994_545_000);
  });
});

describe('--recompletar-campos=layout', () => {
  it('só BBSE/IRB 2016–2022: ebit/D&A → não se aplica com antes/depois; as outras colunas e as outras companhias não mudam', async () => {
    const { prisma, tabelas, zips } = await ingestaoAntiga(2022);
    const bbseAntes = linhaFund(tabelas, CNPJ.BBSE, 'con', 'FY', '2022-12-31')!;
    expect(num(bbseAntes.ebit)).toBe(3_681_904_000);
    const antes = retrato(tabelas.assetFundamentalsPeriod);
    const { arquivos } = await rodarFin(prisma, zips, {
      doc: 'dfp',
      anos: [2022],
      recompletarCampos: ['layout'],
    });
    const r = arquivos[0].recompletar!;
    const tocados = new Set(r.layout.map((l) => l.emissorId));
    expect([...tocados].sort()).toEqual([CNPJ.BBSE, CNPJ.IRBR].sort());
    const b = r.layout.find((l) => l.emissorId === CNPJ.BBSE && l.tipoPeriodo === 'FY')!;
    expect(b.antes.ebit).toBe(3_681_904_000);
    expect(b.depois.ebit).toBeNull();
    expect(b.depois.naoSeAplica).toContain('ebit');

    const bbse = linhaFund(tabelas, CNPJ.BBSE, 'con', 'FY', '2022-12-31')!;
    expect(bbse.ebit ?? null).toBeNull();
    expect(bbse.naoSeAplica).toContain('depreciacaoAmortizacao');
    const depois = retrato(tabelas.assetFundamentalsPeriod);
    for (const [id, a] of antes) {
      const d = depois.get(id)!;
      const ehLayout = a.emissorId === CNPJ.BBSE || a.emissorId === CNPJ.IRBR;
      for (const k of Object.keys({ ...a, ...d })) {
        if (ehLayout && LAYOUT.has(k)) continue;
        expect([id, k, d[k] ?? null]).toEqual([id, k, a[k] ?? null]);
      }
    }
  });

  it('fora de 2016–2022 (DFP 2025) o layout não toca nada', async () => {
    const { prisma, tabelas, zips } = await ingestaoAntiga(2025);
    const antes = retrato(tabelas.assetFundamentalsPeriod);
    const { arquivos } = await rodarFin(prisma, zips, {
      doc: 'dfp',
      anos: [2025],
      recompletarCampos: ['layout'],
    });
    expect(arquivos[0].recompletar!.layout).toHaveLength(0);
    expect(retrato(tabelas.assetFundamentalsPeriod)).toEqual(antes);
  });
});
