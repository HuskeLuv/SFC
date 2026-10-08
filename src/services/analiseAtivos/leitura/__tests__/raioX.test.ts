import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  assetPerShareYearly: { findMany: vi.fn() },
  assetMultiplesYearly: { findMany: vi.fn() },
  assetMultiplesCurrent: { findUnique: vi.fn() },
  fiiQuarterly: { findMany: vi.fn() },
  fiiMonthly: { findMany: vi.fn() },
}));
const mockLeitor = vi.hoisted(() => ({ obterLinhaQuadro: vi.fn(), versaoQuadro: vi.fn() }));
const mockAcoes = vi.hoisted(() => ({ fundamentosVigentes: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => mockLeitor);
vi.mock('@/services/analiseAtivos/repositorio/acoes', () => mockAcoes);

import {
  _limparCacheRaioX,
  montarAcao,
  montarFii,
  obterRaioX,
} from '@/services/analiseAtivos/leitura/ativo/raioX';
import { catalogoRaioX } from '@/services/analiseAtivos/regras/raioX/linhasRaioX';
import { MOTIVO_PER_SHARE } from '@/services/analiseAtivos/regras/conferencia/conferenciaAnual';
import {
  ACOES_DEV,
  FIIS_DEV,
  HOJE_DEV,
  dadosAcaoDev,
  dadosFiiDev,
  linhaDev,
} from '@/test/fixtures/analiseAtivos/raioXDev';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { Estado, FundamentosResposta } from '@/types/analiseAtivosApi';
import type { RaioXResposta, VarianteRaioX } from '@/types/analiseAtivosBlocoD';

type ParcialRaioX = Omit<RaioXResposta, 'ticker' | 'classe' | 'nome' | 'versao'>;

/**
 * REGRA DE OURO: célula comum = MESMO Estado no mesmo ano (a área muda só de unidade: m² → mil m²).
 * Conta as células conferidas para o teste não passar vazio.
 */
function conferirConsistencia(essencial: FundamentosResposta, raioX: ParcialRaioX): number {
  const defs = catalogoRaioX(raioX.variante as VarianteRaioX).filter((d) => d.essencial);
  const linhasRx = new Map(raioX.blocos.flatMap((b) => b.linhas).map((l) => [l.codigo, l]));
  let n = 0;
  for (const le of essencial.linhas) {
    if (le.ano === null) continue;
    expect(raioX.anos).toContain(le.ano);
    for (const d of defs) {
      const ve = le.valores[d.essencial!];
      const lr = linhasRx.get(d.codigo);
      if (!ve || !lr) {
        // a linha só pode faltar no Raio-X se não tiver nenhum valor (ou for n/a em todos os anos)
        if (ve && !lr) expect(ve.estado).not.toBe('ok');
        continue;
      }
      const vr = lr.valores[le.ano] as Estado<number>;
      const esperado: Estado<number> =
        d.escalaEssencial && ve.estado === 'ok'
          ? { estado: 'ok', valor: Math.round((ve.valor / d.escalaEssencial) * 1e4) / 1e4 }
          : d.escalaEssencial && ve.estado === 'ausente' && ve.valorNaoPublicado != null
            ? { ...ve, valorNaoPublicado: ve.valorNaoPublicado / d.escalaEssencial }
            : ve;
      expect({ ano: le.ano, codigo: d.codigo, v: vr }).toEqual({
        ano: le.ano,
        codigo: d.codigo,
        v: esperado,
      });
      n += 1;
    }
  }
  return n;
}

describe('consistência Essencial × Raio-X, célula a célula (dados do DEV)', () => {
  for (const t of ACOES_DEV) {
    it(`${t}`, () => {
      const { essencial, raioX } = montarAcao(HOJE_DEV, dadosAcaoDev(t));
      expect(conferirConsistencia(essencial, raioX)).toBeGreaterThan(20);
      // mesmos anos fechados (Raio-X do mais recente para o mais antigo)
      expect(raioX.anos).toEqual(
        essencial.linhas
          .filter((l) => l.ano !== null)
          .map((l) => l.ano)
          .reverse(),
      );
    });
  }
  for (const t of FIIS_DEV) {
    it(`${t}`, () => {
      const { essencial, raioX } = montarFii(HOJE_DEV, dadosFiiDev(t));
      expect(conferirConsistencia(essencial, raioX)).toBeGreaterThan(30);
    });
  }

  it('CBAV3: nenhum ano com o nº de ações fora de 10× da mediana fica visível', () => {
    const { essencial, raioX } = montarAcao(HOJE_DEV, dadosAcaoDev('CBAV3'));
    const n = raioX.blocos.flatMap((b) => b.linhas).find((l) => l.codigo === 'nAcoesMi')!;
    const visiveis = raioX.anos
      .map((a) => n.valores[a])
      .filter((e): e is { estado: 'ok'; valor: number } => e?.estado === 'ok')
      .map((e) => e.valor);
    expect(visiveis.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...visiveis) / Math.min(...visiveis)).toBeLessThan(10);
    // o Essencial esconde o LPA dos mesmos anos
    for (const ano of [2021, 2022, 2024, 2025]) {
      const l = essencial.linhas.find((x) => x.ano === ano)!;
      expect(l.valores.lpa).toMatchObject({ motivo: MOTIVO_PER_SHARE });
    }
  });

  it('WEGE3: o selo de proventos de 2025 continua no Essencial (Div./ação), não no Raio-X', () => {
    const { essencial, raioX } = montarAcao(HOJE_DEV, dadosAcaoDev('WEGE3'));
    expect(essencial.linhas.find((l) => l.ano === 2025)?.selos).toContain(
      'proventos_em_conferencia',
    );
    expect(
      raioX.blocos.flatMap((b) => b.linhas).every((l) => Object.keys(l.selos).length === 0),
    ).toBe(true);
  });

  it('cnpj_em_conferencia (HGLG11): Essencial e Raio-X marcam as mesmas células', () => {
    const d = dadosFiiDev('HGLG11');
    d.flagsLinha = ['cnpj_em_conferencia'];
    const { essencial, raioX } = montarFii(HOJE_DEV, d);
    expect(conferirConsistencia(essencial, raioX)).toBeGreaterThan(10);
  });
});

describe('obterRaioX (leitura)', () => {
  beforeEach(() => {
    Object.values(mockPrisma).forEach((m) =>
      Object.values(m).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()),
    );
    mockLeitor.obterLinhaQuadro.mockReset();
    mockLeitor.versaoQuadro.mockReset();
    mockAcoes.fundamentosVigentes.mockReset();
    _limparCacheRaioX();
  });

  it('ticker fora da área ⇒ null, sem consultar as tabelas', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(null);
    expect(await obterRaioX('ZZZZ3', HOJE_DEV)).toBeNull();
    expect(mockPrisma.assetPerShareYearly.findMany).not.toHaveBeenCalled();
  });

  it('ação: só o banco, cache por ticker:versão e paramsVersion para o CSV', async () => {
    const l = linhaDev('WEGE3');
    mockLeitor.obterLinhaQuadro.mockResolvedValue(
      linhaQuadroDb({ ...l, symbol: 'WEGE3', paramsVersion: 2 }),
    );
    mockLeitor.versaoQuadro.mockResolvedValue('v-rx-1');
    const d = dadosAcaoDev('WEGE3');
    mockAcoes.fundamentosVigentes.mockResolvedValue(d.periodos);
    mockPrisma.assetPerShareYearly.findMany.mockResolvedValue(
      d.perShare.map((p) => ({
        ...p,
        acoesFim: p.acoesFim === null ? null : new Prisma.Decimal(p.acoesFim),
      })),
    );
    mockPrisma.assetMultiplesYearly.findMany.mockResolvedValue(d.multiplos);
    mockPrisma.assetMultiplesCurrent.findUnique.mockResolvedValue(d.atual);

    const r1 = await obterRaioX('wege3', HOJE_DEV);
    expect(r1?.cache).toBe(false);
    expect(r1?.paramsVersion).toBe(2);
    expect(r1?.dados).toMatchObject({ ticker: 'WEGE3', classe: 'acao', versao: 'v-rx-1' });
    expect(r1?.dados.anos[0]).toBe(2025);
    expect(mockAcoes.fundamentosVigentes).toHaveBeenCalledWith(mockPrisma, [l.cnpj], {
      tipos: ['FY', 'TTM'],
      desde: '2014-01-01',
    });
    const r2 = await obterRaioX('WEGE3', HOJE_DEV);
    expect(r2?.cache).toBe(true);
    expect(mockPrisma.assetPerShareYearly.findMany).toHaveBeenCalledTimes(1);
    // a mesma montagem pura
    expect(r1?.dados.blocos).toEqual(montarAcao(HOJE_DEV, d).raioX.blocos);
  });

  it('FII: trimestres, meses (com desdobramentos) e múltiplos; HGLG11 2017 VP/cota 112,73', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(
      linhaQuadroDb({
        ...linhaDev('HGLG11'),
        symbol: 'HGLG11',
        classe: 'fii',
        fiiTipo: 'tijolo',
      }),
    );
    mockLeitor.versaoQuadro.mockResolvedValue('v-rx-2');
    const d = dadosFiiDev('HGLG11');
    mockPrisma.fiiQuarterly.findMany.mockResolvedValue(
      d.trimestres.map((t) => ({
        ...t,
        refQuarter: new Date(`${t.refQuarter}T00:00:00Z`),
        receitaAluguel: t.receitaAluguel === null ? null : new Prisma.Decimal(t.receitaAluguel),
        resultadoTrimestral:
          t.resultadoTrimestral === null ? null : new Prisma.Decimal(t.resultadoTrimestral),
        rendimentosDeclarados:
          t.rendimentosDeclarados === null ? null : new Prisma.Decimal(t.rendimentosDeclarados),
        taxaPerformance: t.taxaPerformance === null ? null : new Prisma.Decimal(t.taxaPerformance),
      })),
    );
    mockPrisma.fiiMonthly.findMany.mockResolvedValue(
      d.meses.map((m) => ({
        ...m,
        refMonth: new Date(`${m.refMonth}T00:00:00Z`),
        pl: m.pl === null ? null : new Prisma.Decimal(m.pl),
        cotas: m.cotas === null ? null : new Prisma.Decimal(m.cotas),
      })),
    );
    mockPrisma.assetPerShareYearly.findMany.mockResolvedValue(d.perShare);
    mockPrisma.assetMultiplesYearly.findMany.mockResolvedValue(d.multiplos);
    mockPrisma.assetMultiplesCurrent.findUnique.mockResolvedValue(d.atual);
    const r = await obterRaioX('HGLG11', HOJE_DEV);
    const vp = r!.dados.blocos.flatMap((b) => b.linhas).find((l) => l.codigo === 'vpCota')!;
    expect(vp.valores[2017]).toMatchObject({ estado: 'ok' });
    expect((vp.valores[2017] as { valor: number }).valor).toBeCloseTo(112.73, 2);
    expect(r!.dados.blocos).toEqual(montarFii(HOJE_DEV, d).raioX.blocos);
  });

  it('cnpj_em_conferencia: o informe do CNPJ nem é lido', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(
      linhaQuadroDb({
        ...linhaDev('HGLG11'),
        symbol: 'HGLG11',
        classe: 'fii',
        fiiTipo: 'tijolo',
        flags: ['cnpj_em_conferencia'],
      }),
    );
    mockLeitor.versaoQuadro.mockResolvedValue('v-rx-3');
    const d = dadosFiiDev('HGLG11');
    mockPrisma.assetPerShareYearly.findMany.mockResolvedValue(d.perShare);
    mockPrisma.assetMultiplesYearly.findMany.mockResolvedValue(d.multiplos);
    mockPrisma.assetMultiplesCurrent.findUnique.mockResolvedValue(d.atual);
    const r = await obterRaioX('HGLG11', HOJE_DEV);
    expect(r).not.toBeNull();
    expect(mockPrisma.fiiQuarterly.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.fiiMonthly.findMany).not.toHaveBeenCalled();
  });
});
