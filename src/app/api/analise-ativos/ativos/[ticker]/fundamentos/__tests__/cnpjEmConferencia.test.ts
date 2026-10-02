/**
 * GET /fundamentos de um FII com ticker↔CNPJ não conferido (flag cnpj_em_conferencia na linha do
 * Quadro). Ponta a ponta pela rota, com o serviço real e o banco mockado: receita, resultado,
 * VP/cota, P/VP, vacância, imóveis e área (informe CVM, possivelmente de outro fundo) saem 'em
 * conferência' e o informe nem é lido; rendimento/cota e DY (proventos da B3) continuam.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

const mockExigir = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  assetPerShareYearly: { findMany: vi.fn() },
  assetMultiplesYearly: { findMany: vi.fn() },
  assetMultiplesCurrent: { findUnique: vi.fn() },
  fiiQuarterly: { findMany: vi.fn() },
  fiiMonthly: { findMany: vi.fn() },
}));
const mockLeitor = vi.hoisted(() => ({ obterLinhaQuadro: vi.fn(), versaoQuadro: vi.fn() }));

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mockExigir,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => mockLeitor);
vi.mock('@/services/analiseAtivos/repositorio/acoes', () => ({ fundamentosVigentes: vi.fn() }));

import { GET } from '../route';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { FundamentosResposta } from '@/types/analiseAtivosApi';

const ANOS = Array.from({ length: 10 }, (_, i) => 2016 + i); // 2016–2025
const EM_CONF = {
  estado: 'ausente',
  motivo: 'cnpj_em_conferencia',
  texto: TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia,
};
const INFORME = ['receita', 'resultado', 'vpCota', 'pvp', 'vacancia', 'nImoveis', 'area'];

const chamar = (ticker: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}/fundamentos`), {
    params: Promise.resolve({ ticker }),
  });

function prepararFii(flags: string[], versao: string) {
  mockLeitor.obterLinhaQuadro.mockResolvedValue(
    linhaQuadroDb({
      symbol: 'RCFA11',
      classe: 'fii',
      cnpj: '99999999000199',
      fiiTipo: 'tijolo',
      regua: 'fii_tijolo',
      preco: new Prisma.Decimal('8'),
      flags,
    }),
  );
  mockLeitor.versaoQuadro.mockResolvedValue(versao);
  mockPrisma.fiiQuarterly.findMany.mockResolvedValue(
    [...ANOS, 2026].flatMap((ano) =>
      ['03-31', '06-30', '09-30', '12-31']
        .filter((md) => ano < 2026 || md <= '06-30')
        .map((md) => ({
          refQuarter: new Date(`${ano}-${md}T00:00:00Z`),
          receitaAluguel: new Prisma.Decimal('100000000'),
          resultadoTrimestral: new Prisma.Decimal('110000000'),
          vacanciaFisicaCvmPct: 5,
          nImoveisRenda: 12,
          nImoveisOutros: 0,
          areaM2: 50000,
          nCri: null,
          maiorCriPct: null,
          flags: [],
        })),
    ),
  );
  mockPrisma.assetPerShareYearly.findMany.mockResolvedValue(
    ANOS.map((a) => ({ anoFiscal: a, rendCota: 0.96, vpCotaFim: 2051.3 })),
  );
  mockPrisma.assetMultiplesYearly.findMany.mockResolvedValue(
    ANOS.map((a) => ({
      anoFiscal: a,
      pvp: 0.0039,
      dyPct: 12,
      vacanciaFisicaCvmPct: 5,
      nImoveisCvm: 12,
    })),
  );
  mockPrisma.assetMultiplesCurrent.findUnique.mockResolvedValue({
    pvp: 0.0039,
    dy12mPct: 12,
    vpCota: 2051.3,
    rend12m: 0.96,
  });
  mockPrisma.fiiMonthly.findMany.mockResolvedValue([
    { refMonth: new Date('2020-04-01T00:00:00Z'), fatorDesdobramento: 10 },
  ]);
}

describe('GET /fundamentos — FII com ticker↔CNPJ não conferido', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T15:00:00Z'));
    mockExigir.mockReset().mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1' });
    Object.values(mockPrisma).forEach((m) => Object.values(m).forEach((f) => f.mockReset()));
    Object.values(mockLeitor).forEach((f) => f.mockReset());
  });
  afterEach(() => vi.useRealTimers());

  it('colunas do informe em conferência; rendimento e DY da B3 continuam', async () => {
    prepararFii(['cnpj_em_conferencia'], 'v-fund-cnpj-1');
    const res = await chamar('RCFA11');
    expect(res.status).toBe(200);
    const r = (await res.json()) as FundamentosResposta;

    // o informe do CNPJ (pode ser de outro fundo) nem é lido
    expect(mockPrisma.fiiQuarterly.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.fiiMonthly.findMany).not.toHaveBeenCalled();

    const anos = r.linhas.filter((l) => l.ano !== null);
    expect(anos.map((l) => l.ano)).toEqual(ANOS);
    for (const l of r.linhas) {
      for (const c of INFORME) expect(l.valores[c], `${l.rotulo} ${c}`).toEqual(EM_CONF);
    }
    expect(anos[anos.length - 1].valores.rendCota).toEqual({ estado: 'ok', valor: 0.96 });
    expect(anos[anos.length - 1].valores.dy).toEqual({ estado: 'ok', valor: 12 });

    // Últ. 12m só com os proventos de 12 meses
    const ult = r.linhas.find((l) => l.ano === null)!;
    expect(ult.valores.rendCota).toEqual({ estado: 'ok', valor: 0.96 });
    expect(ult.valores.dy).toEqual({ estado: 'ok', valor: 12 });

    expect(JSON.stringify(r)).not.toContain('0.0039');
    expect(r.notas).not.toContain(TEXTOS_TELA.analise.fundamentos.notaCvmGestor);
    expect(r.notas.join(' ')).not.toContain(TEXTOS_TELA.ativo.anoIncompletoFii);
  });

  it('o mesmo FII conferido mostra o informe (controle)', async () => {
    prepararFii([], 'v-fund-cnpj-2');
    const r = (await (await chamar('RCFA11')).json()) as FundamentosResposta;
    const ult = r.linhas.filter((l) => l.ano !== null).pop()!;
    expect(ult.valores.pvp).toEqual({ estado: 'ok', valor: 0.0039 });
    expect(ult.valores.receita).toEqual({ estado: 'ok', valor: 400 });
  });
});
