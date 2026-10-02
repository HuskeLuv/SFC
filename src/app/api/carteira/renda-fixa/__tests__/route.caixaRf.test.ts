/**
 * GET /api/carteira/renda-fixa e as duas Reservas com o mover da fase 2
 * (MOVER_CAIXA_RF_HABILITADO): "um item, uma aba", soma igual à pizza, 'cash'
 * só na Oportunidade, seção da RF derivada e paridade com a chave desligada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  cenarioCompleto,
  criarPrismaEmMemoria,
  eventoMover,
  type Cenario,
} from '@/app/api/carteira/_lib/__tests__/caixaRfFixture';

const holder = vi.hoisted(() => ({ prisma: null as unknown }));
vi.mock('@/lib/prisma', () => ({
  get prisma() {
    return holder.prisma;
  },
  get default() {
    return holder.prisma;
  },
}));
vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

import { GET as getRf } from '../route';
import { GET as getEmerg } from '../../reserva-emergencia/route';
import { GET as getOport } from '../../reserva-oportunidade/route';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import { valuatePortfolioItem } from '@/services/portfolio/itemValuation';
import { reservaDestinoPorAsset } from '@/services/portfolio/tesouroDestino';

const HOJE = new Date('2026-10-02T12:00:00.000Z');
const req = () => new NextRequest('http://localhost/api/carteira/x', { method: 'GET' });
const ligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');

type Linha = Record<string, unknown> & { id: string; valorAtualizado: number; tipo?: string };
type RfBody = {
  secoes: { tipo: string; ativos: Linha[] }[];
  totalGeral: { valorAtualizado: number };
};
type ReservaBody = { ativos: Linha[] };

let cenario: Cenario;
const usar = (c: Cenario) => {
  cenario = c;
  holder.prisma = criarPrismaEmMemoria(c);
};

const rf = async () => (await (await getRf(req())).json()) as RfBody;
const emerg = async () => (await (await getEmerg(req())).json()) as ReservaBody;
const oport = async () => (await (await getOport(req())).json()) as ReservaBody;
const linhasRf = (b: RfBody) => b.secoes.flatMap((s) => s.ativos);
const secaoDe = (b: RfBody, id: string) => b.secoes.find((s) => s.ativos.some((a) => a.id === id));

/** Todas as linhas do trio: aba → ids. */
async function abas() {
  return {
    rendaFixaFundos: linhasRf(await rf()),
    reservaEmergencia: (await emerg()).ativos,
    reservaOportunidade: (await oport()).ativos,
  };
}

const semMotivo = (o: unknown): unknown =>
  JSON.parse(JSON.stringify(o), (k, v) => (k === 'naoMovivelMotivo' ? undefined : v));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOJE);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('renda-fixa — chave desligada', () => {
  it("lista 'cash' como hoje e marca toda linha com naoMovivelMotivo", async () => {
    usar(cenarioCompleto());
    const b = await rf();
    const linhas = linhasRf(b);
    expect(linhas.map((l) => l.id).sort()).toEqual(
      ['p-cash', 'p-cdb', 'p-legacy', 'p-td-ipca', 'p-td-pre'].sort(),
    );
    for (const l of linhas) {
      expect(l.naoMovivelMotivo).toBe('Renda Fixa ainda não pode ser movida para outra aba');
      expect(l.movido).toBeUndefined();
    }
  });

  it('override para uma Reserva é ignorado (o CDB continua na RF)', async () => {
    usar(cenarioCompleto({ 'p-cdb': 'reservaEmergencia' }));
    expect(linhasRf(await rf()).map((l) => l.id)).toContain('p-cdb');
  });

  it('seção de paridade: IPCA+ (tipo híbrido) em Híbrida; debênture legacy pelo debentureTipo', async () => {
    usar(cenarioCompleto());
    const b = await rf();
    expect(secaoDe(b, 'p-td-ipca')?.tipo).toBe('hibrida');
    expect(secaoDe(b, 'p-legacy')?.tipo).toBe('hibrida');
    expect(secaoDe(b, 'p-td-pre')?.tipo).toBe('prefixada');
    expect(secaoDe(b, 'p-cdb')?.tipo).toBe('pos-fixada');
  });
});

describe('renda-fixa — chave ligada', () => {
  it("sem override: payload igual ao da chave desligada, exceto a saída do 'cash'", async () => {
    usar(cenarioCompleto());
    const off = semMotivo(await rf()) as RfBody;
    ligar();
    usar(cenarioCompleto());
    const on = await rf();

    expect(linhasRf(on).map((l) => l.id)).not.toContain('p-cash');
    const cash = linhasRf(off).find((l) => l.id === 'p-cash')!;
    // As linhas que ficam são idênticas (só o % da carteira muda, pelo total sem o cash).
    const pick = (l: Linha) => {
      const { percentualCarteira: _p, riscoPorAtivo: _r, ...resto } = l;
      return resto;
    };
    for (const l of linhasRf(on)) {
      expect(pick(l)).toEqual(pick(linhasRf(off).find((x) => x.id === l.id)!));
    }
    expect(on.totalGeral.valorAtualizado).toBeCloseTo(
      off.totalGeral.valorAtualizado - cash.valorAtualizado,
      6,
    );
    expect(linhasRf(on).some((l) => l.naoMovivelMotivo)).toBe(false);
  });

  it("'cash' aparece só na Reserva de Oportunidade", async () => {
    ligar();
    usar(cenarioCompleto());
    const a = await abas();
    expect(a.reservaOportunidade.map((l) => l.id)).toContain('p-cash');
    expect(a.rendaFixaFundos.map((l) => l.id)).not.toContain('p-cash');
    expect(a.reservaEmergencia.map((l) => l.id)).not.toContain('p-cash');
  });

  it('CDB movido para a Emergência sai da RF (e só aparece na reserva)', async () => {
    ligar();
    usar(cenarioCompleto({ 'p-cdb': 'reservaEmergencia' }));
    const a = await abas();
    expect(a.rendaFixaFundos.map((l) => l.id)).not.toContain('p-cdb');
    expect(a.reservaEmergencia.map((l) => l.id)).toContain('p-cdb');
  });

  it('Tesouro Prefixado de reserva movido para a RF: só na RF, na seção do título', async () => {
    ligar();
    const c = cenarioCompleto({ 'p-td-pre-res': 'rendaFixaFundos' });
    c.changeLogs = [eventoMover('p-td-pre-res', 'rendaFixaFundos')];
    usar(c);
    const b = await rf();
    // O FI de reserva nasce CDB_PRE + CDI: sem o tipo do título cairia em Pós-fixada.
    expect(secaoDe(b, 'p-td-pre-res')?.tipo).toBe('prefixada');
    const linha = linhasRf(b).find((l) => l.id === 'p-td-pre-res')!;
    expect(linha).toMatchObject({ tipo: 'prefixada', movido: true });
    expect((await oport()).ativos.map((l) => l.id)).not.toContain('p-td-pre-res');
    expect((await emerg()).ativos.map((l) => l.id)).not.toContain('p-td-pre-res');
    // Nenhum item NÃO movido muda de seção.
    usar(cenarioCompleto());
    const semMover = await rf();
    for (const l of linhasRf(semMover)) expect(secaoDe(b, l.id)?.tipo).toBe(l.tipo);
  });

  describe.each([
    ['sem override', {}],
    ['CDB → Emergência', { 'p-cdb': 'reservaEmergencia' }],
    ['Tesouro de reserva → RF', { 'p-td-res': 'rendaFixaFundos' }],
    ['conta corrente → Emergência', { 'p-cc-op': 'reservaEmergencia' }],
    ['Fundo DI → Oportunidade', { 'p-fundo-res': 'reservaOportunidade' }],
    ['cash com FI → RF', { 'p-cash': 'rendaFixaFundos' }],
    ['override de outro grupo (lixo)', { 'p-cdb': 'acoes', 'p-petr': 'reservaEmergencia' }],
  ])('%s', (_nome, overrides) => {
    it('um item, uma aba — e a soma das abas bate com a pizza (valuatePortfolioItem)', async () => {
      ligar();
      usar(cenarioCompleto(overrides as Record<string, string>));
      const a = await abas();

      const vistos = new Map<string, string[]>();
      for (const [cat, linhas] of Object.entries(a)) {
        for (const l of linhas) vistos.set(l.id, [...(vistos.get(l.id) ?? []), cat]);
      }
      const grupo = cenario.portfolio.filter((p) => p.id !== 'p-petr').map((p) => p.id as string);
      expect([...vistos.keys()].sort()).toEqual(grupo.sort());
      for (const [id, cats] of vistos) expect(cats, id).toHaveLength(1);

      // Pizza: categoria e valor por valuatePortfolioItem (categoriaEfetiva segue o override).
      const pricer = await createFixedIncomePricer('user-1');
      const destinos = await reservaDestinoPorAsset('user-1');
      const pizza: Record<string, number> = {};
      for (const p of cenario.portfolio) {
        const asset = cenario.assets.find((x) => x.id === p.assetId)!;
        const v = valuatePortfolioItem({
          item: p as never,
          asset: asset as never,
          fixedIncome: pricer.fixedIncomeByAssetId.get(p.assetId as string),
          fiGetCurrentValue: pricer.getCurrentValue,
          tesouroReservaDestino: destinos.get(p.assetId as string),
        });
        if (p.id !== 'p-petr') expect(vistos.get(p.id as string)?.[0], `${p.id}`).toBe(v.categoria);
        pizza[v.categoria] = (pizza[v.categoria] ?? 0) + v.valorAtualBRL;
      }
      for (const [cat, linhas] of Object.entries(a)) {
        const soma = linhas.reduce((s, l) => s + l.valorAtualizado, 0);
        expect(soma, cat).toBeCloseTo(pizza[cat] ?? 0, 6);
      }
      // A ação continua fora do trio (renda variável).
      expect(pizza.acoes).toBe(300);
    });
  });
});
