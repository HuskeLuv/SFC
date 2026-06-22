import { describe, it, expect } from 'vitest';
import { deriveAutoValues, buildAutoSyncPatch } from '../autoFields';
import type { PlanejamentoContexto } from '@/hooks/usePlanejamentoContexto';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';

const ctx = (over: Partial<PlanejamentoContexto> = {}): PlanejamentoContexto => ({
  asOf: '2026-06-22T00:00:00.000Z',
  patrimonio: 80_000,
  reservaEmergenciaAtual: 12_000,
  aporteMensalRealizado: 800,
  cdiAnualizado: 13.7,
  inflacao12m: 4.2,
  inflacaoFallback: 4.5,
  cashflow: {
    year: 2026,
    activeMonths: 6,
    sobraMensalMedia: 2500,
    despesaMensalMedia: 4000,
    despesaFixaMensal: 2800,
    ...(over.cashflow ?? {}),
  },
  ...over,
});

const params = (over: Partial<PlanoUpsertPayload> = {}): PlanoUpsertPayload => ({
  idade: 30,
  apos: 65,
  vida: 90,
  rentNom: 12,
  inflacao: 5,
  rentNomRetiro: null,
  patrimonio: 10_000,
  aporteM: 1000,
  renda: 5000,
  trackStartMonth: 6,
  trackStartYear: 2026,
  eventos: [],
  fieldLocks: [],
  ...over,
});

describe('deriveAutoValues', () => {
  it('mapeia patrimônio, aporte (sobra), renda (despesa), CDI e IPCA', () => {
    const a = deriveAutoValues(ctx());
    expect(a.patrimonio.autoValue).toBe(80_000);
    expect(a.aporteM.autoValue).toBe(2500);
    expect(a.aporteM.label).toBe('da sua sobra de caixa');
    expect(a.renda.autoValue).toBe(4000);
    expect(a.rentNom.autoValue).toBe(13.7);
    expect(a.inflacao.autoValue).toBe(4.2);
    expect(a.inflacao.label).toBe('IPCA 12m');
  });

  it('aporte cai nos aportes realizados quando não há sobra', () => {
    const a = deriveAutoValues(ctx({ cashflow: { ...ctx().cashflow, sobraMensalMedia: 0 } }));
    expect(a.aporteM.autoValue).toBe(800);
    expect(a.aporteM.label).toBe('dos seus aportes (12m)');
  });

  it('inflação usa fallback quando não há IPCA 12m', () => {
    const a = deriveAutoValues(ctx({ inflacao12m: null }));
    expect(a.inflacao.autoValue).toBe(4.5);
    expect(a.inflacao.label).toBe('meta de inflação');
  });

  it('valores nulos quando contexto é null', () => {
    const a = deriveAutoValues(null);
    expect(a.patrimonio.autoValue).toBeNull();
    expect(a.aporteM.autoValue).toBeNull();
  });

  it('patrimônio null quando zero (conta vazia)', () => {
    const a = deriveAutoValues(ctx({ patrimonio: 0 }));
    expect(a.patrimonio.autoValue).toBeNull();
  });
});

describe('buildAutoSyncPatch', () => {
  it('atualiza campos auto não travados que divergem', () => {
    const patch = buildAutoSyncPatch(params(), deriveAutoValues(ctx()), []);
    expect(patch.patrimonio).toBe(80_000);
    expect(patch.aporteM).toBe(2500);
    expect(patch.renda).toBe(4000);
    expect(patch.rentNom).toBe(13.7);
  });

  it('respeita os campos travados (não os toca)', () => {
    const patch = buildAutoSyncPatch(params(), deriveAutoValues(ctx()), ['aporteM', 'renda']);
    expect(patch.aporteM).toBeUndefined();
    expect(patch.renda).toBeUndefined();
    expect(patch.patrimonio).toBe(80_000);
  });

  it('não inclui campos já iguais ao auto', () => {
    const patch = buildAutoSyncPatch(params({ patrimonio: 80_000 }), deriveAutoValues(ctx()), []);
    expect('patrimonio' in patch).toBe(false);
  });

  it('ignora campos sem valor automático', () => {
    const patch = buildAutoSyncPatch(params(), deriveAutoValues(ctx({ patrimonio: 0 })), []);
    expect('patrimonio' in patch).toBe(false);
  });
});
