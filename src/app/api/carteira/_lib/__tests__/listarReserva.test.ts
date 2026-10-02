import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cenarioCompleto, criarPrismaEmMemoria, eventoMover, type Cenario } from './caixaRfFixture';

const holder = vi.hoisted(() => ({ prisma: null as unknown }));
vi.mock('@/lib/prisma', () => ({
  get prisma() {
    return holder.prisma;
  },
  get default() {
    return holder.prisma;
  },
}));

import { benchmarkDoTitulo, liquidezDoTitulo, listarReserva } from '../listarReserva';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import { valuatePortfolioItem } from '@/services/portfolio/itemValuation';
import type { FixedIncomeAssetWithAsset } from '@/services/portfolio/patrimonioHistoricoBuilder';

const HOJE = new Date('2026-10-02T12:00:00.000Z');
const MOTIVO_OFF_EMERG = 'Reserva Emergência ainda não pode ser movida para outra aba';

let cenario: Cenario;
const usar = (c: Cenario) => {
  cenario = c;
  holder.prisma = criarPrismaEmMemoria(c);
};
const ligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
const ids = (r: { ativos: { id: string }[] }) => r.ativos.map((a) => a.id);
const linha = (r: { ativos: { id: string }[] }, id: string) =>
  r.ativos.find((a) => a.id === id) as Record<string, unknown> | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOJE);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('listarReserva — chave desligada (como antes da fase 2)', () => {
  it('Emergência: seleção, valores e defaults de hoje + naoMovivelMotivo em toda linha', async () => {
    usar(cenarioCompleto());
    const r = await listarReserva('user-1', 'reservaEmergencia');
    // Tesouro de destinos mistos aparece pela 1ª compra marcada que a rota antiga achava.
    expect(ids(r)).toEqual(['p-emerg', 'p-poup', 'p-td-res', 'p-fundo-res']);
    for (const a of r.ativos) expect(a.naoMovivelMotivo).toBe(MOTIVO_OFF_EMERG);
    expect(linha(r, 'p-td-res')).toMatchObject({
      cotizacaoResgate: 'D+0',
      liquidacaoResgate: 'Imediata',
      benchmark: 'CDI',
      valorAtualizado: 8000,
      vencimento: HOJE,
    });
    expect(r.ativos.some((a) => a.movido || a.saldoEmConta)).toBe(false);
    expect(r).toMatchObject({ saldoInicioMes: 17500, rendimento: 0, rentabilidade: 0 });
  });

  it('Oportunidade lista cash e o Tesouro marcado para a Oportunidade (duplicação de hoje)', async () => {
    usar(cenarioCompleto());
    const r = await listarReserva('user-1', 'reservaOportunidade');
    expect(ids(r)).toEqual(['p-cc-op', 'p-cash', 'p-td-res', 'p-td-pre-res']);
  });

  it('override do trio é ignorado: o CDB movido continua fora da reserva', async () => {
    usar(cenarioCompleto({ 'p-cdb': 'reservaEmergencia' }));
    const r = await listarReserva('user-1', 'reservaEmergencia');
    expect(ids(r)).not.toContain('p-cdb');
  });
});

describe('listarReserva — chave ligada (mover fase 2)', () => {
  it('sem override: saldos sem título idênticos ao caminho de hoje (+ saldoEmConta)', async () => {
    usar(cenarioCompleto());
    const off = await listarReserva('user-1', 'reservaEmergencia');
    ligar();
    usar(cenarioCompleto());
    const on = await listarReserva('user-1', 'reservaEmergencia');
    for (const id of ['p-emerg', 'p-poup']) {
      const { naoMovivelMotivo: _m, ...antes } = linha(off, id) as Record<string, unknown>;
      expect(linha(on, id)).toEqual({ ...antes, saldoEmConta: true });
    }
    // Título com FI: o Fundo DI de reserva não é "saldo em conta".
    expect(linha(on, 'p-fundo-res')?.saldoEmConta).toBeUndefined();
    expect(on.ativos.some((a) => a.naoMovivelMotivo)).toBe(false);
  });

  it("Tesouro de destinos mistos: só na reserva da 1ª compra por data; 'cash' na Oportunidade", async () => {
    ligar();
    usar(cenarioCompleto());
    const emerg = await listarReserva('user-1', 'reservaEmergencia');
    const oport = await listarReserva('user-1', 'reservaOportunidade');
    expect(ids(emerg)).toContain('p-td-res');
    expect(ids(oport)).not.toContain('p-td-res');
    expect(ids(oport)).toEqual(['p-cc-op', 'p-cash', 'p-td-pre-res']);
  });

  it('CDB da RF movido para a Emergência: vencimento real, "No vencimento" e "110% CDI"', async () => {
    ligar();
    usar(cenarioCompleto({ 'p-cdb': 'reservaEmergencia' }));
    const r = await listarReserva('user-1', 'reservaEmergencia');
    const cdb = linha(r, 'p-cdb');
    expect(cdb).toMatchObject({
      cotizacaoResgate: 'No vencimento',
      liquidacaoResgate: 'No vencimento',
      vencimento: new Date('2030-06-15T12:00:00.000Z'),
      benchmark: '110% CDI',
    });
    expect(cdb?.cotizacaoResgate).not.toBe('D+0');
    expect(cdb?.liquidacaoResgate).not.toBe('Imediata');
    expect(cdb?.vencimento).not.toEqual(HOJE);
    // Mesmo nome da Renda Fixa (descrição do FI), não o Asset.name com valor e data.
    expect(cdb?.nome).toBe('FI fi-cdb');
    // E não aparece na Oportunidade.
    expect(ids(await listarReserva('user-1', 'reservaOportunidade'))).not.toContain('p-cdb');
  });

  it('valores explícitos das notes de reserva vencem os do título', async () => {
    ligar();
    usar(cenarioCompleto());
    const r = await listarReserva('user-1', 'reservaEmergencia');
    expect(linha(r, 'p-fundo-res')).toMatchObject({
      benchmark: 'CDI',
      vencimento: new Date('2027-01-01'),
      cotizacaoResgate: 'D+0',
      liquidacaoResgate: 'Imediata',
    });
    // Tesouro sem metadado nas notes: os do título (Selic, vencimento, diária).
    expect(linha(r, 'p-td-res')).toMatchObject({
      benchmark: 'Selic',
      vencimento: new Date('2031-03-01T12:00:00.000Z'),
      cotizacaoResgate: 'D+0',
      liquidacaoResgate: 'Imediata',
    });
  });

  it('linha com FI == valuatePortfolioItem (a mesma valoração da pizza)', async () => {
    ligar();
    usar(cenarioCompleto({ 'p-cdb': 'reservaEmergencia' }));
    const r = await listarReserva('user-1', 'reservaEmergencia');
    const pricer = await createFixedIncomePricer('user-1');
    for (const id of ['p-cdb', 'p-td-res', 'p-fundo-res']) {
      const p = cenario.portfolio.find((x) => x.id === id)!;
      const asset = cenario.assets.find((a) => a.id === p.assetId)!;
      const v = valuatePortfolioItem({
        item: p as never,
        asset: asset as never,
        fixedIncome: pricer.fixedIncomeByAssetId.get(p.assetId as string),
        fiGetCurrentValue: pricer.getCurrentValue,
        tesouroReservaDestino: id === 'p-td-res' ? 'emergencia' : undefined,
      });
      expect(linha(r, id)?.valorAtualizado).toBe(v.valorAtualBRL);
      expect(v.categoria).toBe('reservaEmergencia');
    }
  });

  it('selo "movido" lido do Histórico só para a linha fora da base', async () => {
    ligar();
    const c = cenarioCompleto({ 'p-cdb': 'reservaEmergencia', 'p-emerg': 'reservaOportunidade' });
    c.changeLogs = [eventoMover('p-cdb', 'reservaEmergencia')];
    usar(c);
    const r = await listarReserva('user-1', 'reservaEmergencia');
    expect(linha(r, 'p-cdb')).toMatchObject({ movido: true, movidoEm: expect.any(String) });
    expect(linha(r, 'p-poup')?.movido).toBeUndefined();
    // Saldo em conta movido entre as Reservas.
    expect(ids(r)).not.toContain('p-emerg');
    expect(ids(await listarReserva('user-1', 'reservaOportunidade'))).toContain('p-emerg');
  });
});

describe('rótulos do título', () => {
  const fi = (x: Partial<FixedIncomeAssetWithAsset>) =>
    ({
      indexer: null,
      indexerPercent: null,
      annualRate: 0,
      tesouroBondType: null,
      liquidityType: null,
      ...x,
    }) as FixedIncomeAssetWithAsset;

  it('benchmark sem o "CDI" padrão', () => {
    expect(benchmarkDoTitulo(fi({ indexer: 'CDI', indexerPercent: 110 }))).toBe('110% CDI');
    expect(benchmarkDoTitulo(fi({ indexer: 'CDI', indexerPercent: 100 }))).toBe('CDI');
    expect(benchmarkDoTitulo(fi({ indexer: 'IPCA', annualRate: 6.5 }))).toBe('IPCA + 6,5%');
    expect(benchmarkDoTitulo(fi({ indexer: 'PRE', annualRate: 12.5 }))).toBe('Pré 12,5%');
    expect(benchmarkDoTitulo(fi({ indexer: 'CDI', tesouroBondType: 'Tesouro Selic' }))).toBe(
      'Selic',
    );
    expect(benchmarkDoTitulo(fi({ indexer: 'CDI', tesouroBondType: 'Tesouro Prefixado' }))).toBe(
      'Pré',
    );
  });

  it('liquidez: diária → D+0/Imediata; vazia ou no vencimento → "No vencimento"', () => {
    expect(liquidezDoTitulo(fi({ liquidityType: 'DAILY' }))).toEqual({
      cotizacaoResgate: 'D+0',
      liquidacaoResgate: 'Imediata',
    });
    for (const liquidityType of [null, 'MATURITY']) {
      expect(liquidezDoTitulo(fi({ liquidityType }))).toEqual({
        cotizacaoResgate: 'No vencimento',
        liquidacaoResgate: 'No vencimento',
      });
    }
  });
});
