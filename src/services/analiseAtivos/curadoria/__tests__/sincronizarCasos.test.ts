import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ enviarPush: vi.fn() }));
vi.mock('@/services/push/enviarPush', () => ({ enviarPushDaNotificacao: mocks.enviarPush }));

import {
  campoOk,
  executarCuradoria,
  extrairDeteccoes,
  planejarCuradoria,
  valorDoCampo,
  type CasoAbertoJob,
  type CasoFechadoJob,
  type Deteccao,
  type LerValorCampo,
} from '../sincronizarCasos';
import { enviarDigestSla, textoDigest } from '../notificacoesCaso';
import { montarWhere } from '../filaCuradoria';
import { TIPOS_NOTIFICACAO } from '../contrato';
import type { JobContexto } from '@/services/analiseAtivos/tipos';

const HOJE = '2026-10-05';
const AGORA_HOJE = new Date('2026-10-05T10:41:00Z');

const linhaWege = {
  symbol: 'WEGE3',
  classe: 'acao',
  cnpj: '84429695000111',
  flags: [
    'conf:proventos:salto_recente@2025',
    'proventos_em_conferencia_salto',
    'rev:variacao_lucro@2025',
  ],
};

function caso(p: Partial<CasoAbertoJob> = {}): CasoAbertoJob {
  return {
    id: 'c1',
    symbol: 'WEGE3',
    grupo: 'proventos',
    campo: 'dy12m',
    periodo: '2025',
    origem: 'regra',
    regraCodigo: 'salto_recente',
    chaveDeteccao: '2025',
    chaveAberta: 'WEGE3|dy12m|2025',
    regraAtiva: true,
    emConferencia: true,
    nReportes: 0,
    ...p,
  };
}

const valorOk: LerValorCampo = () => ({ valor: 1.8, deHoje: true });
const valorSumiu: LerValorCampo = () => ({ valor: null, deHoje: true });

function planejar(over: {
  deteccoes?: Deteccao[];
  abertos?: CasoAbertoJob[];
  fechados?: CasoFechadoJob[];
  lerValor?: LerValorCampo;
  processarCessacao?: boolean;
}) {
  return planejarCuradoria({
    deteccoes: over.deteccoes ?? [],
    abertos: over.abertos ?? [],
    fechados: over.fechados ?? [],
    lerValor: over.lerValor ?? valorOk,
    processarCessacao: over.processarCessacao ?? true,
  });
}

describe('extrairDeteccoes', () => {
  it('lê conf: e rev: e ignora o legado de proventos', () => {
    const d = extrairDeteccoes([linhaWege]);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({
      tipo: 'conf',
      grupo: 'proventos',
      regra: 'salto_recente',
      chave: '2025',
      campo: 'dy12m',
      chaveCaso: 'WEGE3|dy12m|2025',
    });
    expect(d[1]).toMatchObject({
      tipo: 'rev',
      grupo: 'outro',
      regra: 'variacao_lucro',
      campo: 'lucroLiquido',
      chaveCaso: 'WEGE3|lucroLiquido|2025',
    });
  });

  it('não repete o mesmo caso vindo da linha e do histórico anual', () => {
    const anual = { ...linhaWege, flags: ['conf:proventos:salto_recente@2025'] };
    expect(extrairDeteccoes([linhaWege, anual])).toHaveLength(2);
  });

  it('flag malformada não vira caso', () => {
    expect(
      extrairDeteccoes([{ ...linhaWege, flags: ['conf:manual:x@1', 'rev:nada@2025'] }]),
    ).toEqual([]);
  });
});

describe('planejarCuradoria', () => {
  const [conf, rev] = extrairDeteccoes([linhaWege]);

  it('abre um caso por (ativo, regra, chave) quando não há caso aberto', () => {
    const p = planejar({ deteccoes: [conf, rev] });
    expect(p.criar.map((c) => c.deteccao.chaveCaso)).toEqual([
      'WEGE3|dy12m|2025',
      'WEGE3|lucroLiquido|2025',
    ]);
    expect(p.atualizar).toEqual([]);
  });

  it('é idempotente: caso aberto com a regra ativa e o mesmo estado não é tocado', () => {
    const p = planejar({ deteccoes: [conf], abertos: [caso()] });
    expect(p).toEqual({ criar: [], atualizar: [], autorresolver: [], cessar: [] });
  });

  it('caso de usuário com a mesma chave vira misto (atualiza, não cria)', () => {
    const c = caso({ origem: 'usuario', regraCodigo: null, regraAtiva: false, nReportes: 1 });
    const p = planejar({ deteccoes: [conf], abertos: [c] });
    expect(p.criar).toEqual([]);
    expect(p.atualizar).toHaveLength(1);
    expect(p.atualizar[0].caso.id).toBe('c1');
  });

  it('regra que voltou a marcar reativa o caso (evento regra_disparou)', () => {
    const p = planejar({ deteccoes: [conf], abertos: [caso({ regraAtiva: false })] });
    expect(p.atualizar[0].reativou).toBe(true);
  });

  it('autorresolve SÓ caso de regra pura cujo campo voltou a ok na linha de hoje', () => {
    const p = planejar({ deteccoes: [], abertos: [caso()] });
    expect(p.autorresolver.map((c) => c.id)).toEqual(['c1']);
    expect(p.cessar).toEqual([]);
  });

  it('regra que cessou porque o dado sumiu NÃO fecha', () => {
    const p = planejar({ deteccoes: [], abertos: [caso()], lerValor: valorSumiu });
    expect(p.autorresolver).toEqual([]);
    expect(p.cessar.map((c) => c.id)).toEqual(['c1']);
  });

  it('linha de outro dia não autoriza o fechamento', () => {
    const p = planejar({
      deteccoes: [],
      abertos: [caso()],
      lerValor: () => ({ valor: 1.8, deHoje: false }),
    });
    expect(p.autorresolver).toEqual([]);
    expect(p.cessar).toHaveLength(1);
  });

  it('caso fora do Quadro (sem linha) não fecha', () => {
    const p = planejar({ deteccoes: [], abertos: [caso()], lerValor: () => null });
    expect(p.cessar).toHaveLength(1);
  });

  it('misto e caso com relato NUNCA fecham sozinhos, mesmo com o campo ok', () => {
    const p = planejar({
      deteccoes: [],
      abertos: [
        caso({ id: 'm', origem: 'misto', nReportes: 2 }),
        caso({ id: 'r', origem: 'regra', nReportes: 1, chaveAberta: 'WEGE3|dy12m|2024' }),
      ],
    });
    expect(p.autorresolver).toEqual([]);
    expect(p.cessar.map((c) => c.id).sort()).toEqual(['m', 'r']);
  });

  it('caso de usuário sem regra e caso com a regra já parada não entram no "parou"', () => {
    const p = planejar({
      deteccoes: [],
      abertos: [
        caso({ id: 'u', origem: 'usuario', regraCodigo: null, regraAtiva: false, nReportes: 1 }),
        caso({ id: 'p', regraAtiva: false }),
      ],
    });
    expect(p.cessar).toEqual([]);
    expect(p.autorresolver).toEqual([]);
  });

  it('sem linha do Quadro de hoje, não processa "regra parou"', () => {
    const p = planejar({ deteccoes: [], abertos: [caso()], processarCessacao: false });
    expect(p.cessar).toEqual([]);
    expect(p.autorresolver).toEqual([]);
  });

  it('não reabre detecção que o curador já decidiu como rejeitado', () => {
    const p = planejar({
      deteccoes: [conf],
      fechados: [
        {
          id: 'f',
          symbol: 'WEGE3',
          regraCodigo: 'salto_recente',
          chaveDeteccao: '2025',
          status: 'rejeitado',
        },
      ],
    });
    expect(p.criar).toEqual([]);
  });

  it('escopo empresa: UM caso por CNPJ (o 1º ticker), nada novo com irmão aberto ou rejeitado', () => {
    const linhas = ['CELP7', 'CELP5', 'CELP3'].map((symbol) => ({
      symbol,
      classe: 'acao',
      cnpj: 'C',
      flags: [
        'conf:acoes_escala:pl_minimo@2026-06-30',
        'conf:preco_base:base_sem_evento@2026-04-29',
      ],
    }));
    const dets = extrairDeteccoes(linhas);
    const p = planejar({ deteccoes: dets });
    const acoes = p.criar.filter((c) => c.deteccao.grupo === 'acoes_escala');
    expect(acoes.map((c) => c.deteccao.symbol)).toEqual(['CELP3']);
    // escopo ticker continua um caso por símbolo
    expect(p.criar.filter((c) => c.deteccao.grupo === 'preco_base')).toHaveLength(3);

    const aberto = caso({
      id: 'c5',
      symbol: 'CELP5',
      grupo: 'acoes_escala',
      campo: dets.find((d) => d.symbol === 'CELP5' && d.grupo === 'acoes_escala')!.campo,
      regraCodigo: 'pl_minimo',
      chaveDeteccao: '2026-06-30',
      chaveAberta: dets.find((d) => d.symbol === 'CELP5' && d.grupo === 'acoes_escala')!.chaveCaso,
    });
    const p2 = planejar({ deteccoes: dets, abertos: [aberto] });
    expect(p2.criar.filter((c) => c.deteccao.grupo === 'acoes_escala')).toEqual([]);
    expect(p2.cessar).toEqual([]);
    expect(p2.autorresolver).toEqual([]);

    const p3 = planejar({
      deteccoes: dets,
      fechados: [
        {
          id: 'f7',
          symbol: 'CELP7',
          regraCodigo: 'pl_minimo',
          chaveDeteccao: '2026-06-30',
          status: 'rejeitado',
        },
      ],
    });
    expect(p3.criar.filter((c) => c.deteccao.grupo === 'acoes_escala')).toEqual([]);
  });

  it('reabre detecção corrigida que voltou, com casoAnteriorId', () => {
    const p = planejar({
      deteccoes: [conf],
      fechados: [
        {
          id: 'f',
          symbol: 'WEGE3',
          regraCodigo: 'salto_recente',
          chaveDeteccao: '2025',
          status: 'corrigido',
        },
      ],
    });
    expect(p.criar).toEqual([{ deteccao: conf, casoAnteriorId: 'f' }]);
  });
});

describe('valorDoCampo / campoOk', () => {
  const linha = {
    geradoEm: AGORA_HOJE,
    preco: 40,
    valorMercado: 4_000_000,
    pl: 30,
    pvp: null,
    dy12mPct: 1.8,
    payoutPct: 52,
    obrigacoesPlPct: null,
    cotistas: null,
    patrimonio: null,
  };

  it('campo com valor finito na linha de hoje = ok', () => {
    expect(campoOk(valorDoCampo('dy12m', { linha }, HOJE))).toBe(true);
    expect(campoOk(valorDoCampo('nAcoes', { linha }, HOJE))).toBe(true);
  });

  it('null, campo sem fonte e linha antiga não são ok', () => {
    expect(campoOk(valorDoCampo('pvp', { linha }, HOJE))).toBe(false);
    expect(campoOk(valorDoCampo('receita', { linha }, HOJE))).toBe(false);
    expect(campoOk(valorDoCampo('dy12m', { linha }, '2026-10-06'))).toBe(false);
    expect(campoOk(valorDoCampo('dy12m', {}, HOJE))).toBe(false);
  });
});

// ===========================================================================
// executarCuradoria (I/O com prisma mockado)
// ===========================================================================

function prismaFake(
  over: { linhasFlag?: unknown[]; abertos?: unknown[]; linhasHoje?: number } = {},
) {
  const p = {
    $queryRaw: vi.fn(),
    analiseCasoDado: {
      findMany: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'novo' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    analiseCasoEvento: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn() },
    analiseQuadroLinha: {
      count: vi.fn().mockResolvedValue(over.linhasHoje ?? 10),
      findMany: vi.fn().mockResolvedValue([]),
    },
    assetMultiplesCurrent: { findMany: vi.fn().mockResolvedValue([]) },
    assetMultiplesYearly: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'adm1' }, { id: 'adm2' }]) },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: `n-${data.userId}`, ...data })),
    },
    $transaction: vi.fn(),
  };
  p.$queryRaw.mockResolvedValueOnce(over.linhasFlag ?? []).mockResolvedValueOnce([]);
  p.analiseCasoDado.findMany.mockResolvedValueOnce(over.abertos ?? []).mockResolvedValueOnce([]);
  p.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(p)
      : Promise.all(arg as unknown[]),
  );
  return p;
}

function ctxFake(prisma: unknown, aplicar: boolean): JobContexto {
  return {
    prisma: prisma as JobContexto['prisma'],
    prazo: 120_000,
    restanteMs: () => 100_000,
    estourouPrazo: () => false,
    alertar: vi.fn(),
    contar: vi.fn(),
    params: {} as JobContexto['params'],
    paramsVersion: 1,
    hoje: HOJE,
    origem: 'script',
    aplicar,
  };
}

describe('executarCuradoria', () => {
  const envOriginal = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T10:55:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...envOriginal };
  });

  it('dry-run conta sem gravar', async () => {
    const p = prismaFake({ linhasFlag: [linhaWege] });
    const r = await executarCuradoria(ctxFake(p, false));
    expect(r.detalhes).toMatchObject({ abertos: 2, atualizados: 0, digestEnviados: 0 });
    expect(p.analiseCasoDado.create).not.toHaveBeenCalled();
    expect(p.analiseCasoEvento.create).not.toHaveBeenCalled();
  });

  it('aplicar abre o caso de regra sem prazo, com evento', async () => {
    const p = prismaFake({
      linhasFlag: [{ ...linhaWege, flags: ['conf:fii_obrigacoes:obrigacoes_acima@2026-08'] }],
    });
    const r = await executarCuradoria(ctxFake(p, true));
    expect(r.detalhes).toMatchObject({ abertos: 1 });
    const data = p.analiseCasoDado.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      origem: 'regra',
      status: 'aberto',
      grupo: 'fii_obrigacoes',
      campo: 'obrigacoesPl',
      emConferencia: true,
      regraAtiva: true,
      chaveAberta: 'WEGE3|obrigacoesPl|2026-08',
    });
    expect(data.slaAte).toBeUndefined();
    expect(p.analiseCasoEvento.create.mock.calls[0][0].data).toMatchObject({
      tipo: 'aberto',
      autorId: null,
    });
  });

  it('caso misto que deixou de marcar: só regraAtiva=false + evento, nunca fecha', async () => {
    const p = prismaFake({ abertos: [caso({ origem: 'misto', nReportes: 2 })] });
    const r = await executarCuradoria(ctxFake(p, true));
    expect(r.detalhes).toMatchObject({ autorresolvidos: 0, regraCessou: 1 });
    expect(p.analiseCasoDado.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { regraAtiva: false, emConferencia: false },
    });
    expect(p.analiseCasoDado.updateMany).not.toHaveBeenCalled();
  });

  it('autorresolução repete no UPDATE a condição nReportes=0 e origem regra', async () => {
    const p = prismaFake({ abertos: [caso({ campo: 'dy12m' })] });
    p.analiseQuadroLinha.findMany.mockResolvedValue([
      { symbol: 'WEGE3', geradoEm: new Date('2026-10-05T10:41:00Z'), dy12mPct: 1.7 },
    ]);
    const r = await executarCuradoria(ctxFake(p, true));
    expect(r.detalhes).toMatchObject({ autorresolvidos: 1 });
    const arg = p.analiseCasoDado.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ nReportes: 0, origem: 'regra' });
    expect(arg.data).toMatchObject({
      status: 'corrigido',
      resolucao: 'fonte_corrigiu',
      chaveAberta: null,
    });
  });

  it('Quadro sem linha de hoje: alerta e não mexe em caso aberto', async () => {
    const p = prismaFake({ abertos: [caso()], linhasHoje: 0 });
    const ctx = ctxFake(p, true);
    const r = await executarCuradoria(ctx);
    expect(r.detalhes).toMatchObject({ autorresolvidos: 0, regraCessou: 0 });
    expect(ctx.alertar).toHaveBeenCalled();
  });

  it('resumo de prazos só com a flag de relato ligada e em produção', async () => {
    const p = prismaFake();
    p.analiseCasoDado.count.mockResolvedValue(1);
    process.env.ANALISE_ATIVOS_REPORTE_HABILITADO = 'true';
    (process.env as Record<string, string>).NODE_ENV = 'test';
    let r = await executarCuradoria(ctxFake(p, true));
    expect(r.detalhes).toMatchObject({ digestEnviados: 0 });

    const p2 = prismaFake();
    p2.analiseCasoDado.count.mockResolvedValue(1);
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete process.env.ANALISE_ATIVOS_ALERTA_ADMIN;
    r = await executarCuradoria(ctxFake(p2, true));
    expect(r.detalhes).toMatchObject({ digestEnviados: 2 });
    expect(p2.notification.create).toHaveBeenCalledTimes(2);
  });
});

describe('resumo diário de prazos (digest)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não manda nada sem vencidos nem vencendo', () => {
    expect(textoDigest({ vencidos: 0, vencendo: 0 })).toBeNull();
    expect(textoDigest({ vencidos: 1, vencendo: 2 })?.message).toBe(
      '1 vencidos e 2 vencendo em até 2 dias úteis.',
    );
  });

  it('1×/dia por admin: quem já recebeu hoje fica de fora; cria Notification + push', async () => {
    const p = prismaFake();
    p.notification.findMany.mockResolvedValue([{ userId: 'adm1' }]);
    const n = await enviarDigestSla(
      p as never,
      { vencidos: 1, vencendo: 0 },
      new Date('2026-10-05T10:55:00Z'),
      true,
    );
    expect(n).toBe(1);
    expect(p.notification.create).toHaveBeenCalledTimes(1);
    expect(p.notification.create.mock.calls[0][0].data).toMatchObject({
      userId: 'adm2',
      type: TIPOS_NOTIFICACAO.sla,
      metadata: expect.objectContaining({ href: '/admin/curadoria' }),
    });
    expect(mocks.enviarPush).toHaveBeenCalledTimes(1);
    // o "hoje" é o dia civil de São Paulo
    expect(p.notification.findMany.mock.calls[0][0].where.createdAt.gte.toISOString()).toBe(
      '2026-10-05T03:00:00.000Z',
    );
  });

  it('casos só de regra e de revisão não entram nos prazos (sem slaAte; fora da revisão)', () => {
    const w = JSON.stringify(montarWhere({ fila: 'vencidos' }, { hoje: HOJE, adminId: 'a' }));
    expect(w).toContain('slaAte');
    expect(w).toContain('notIn');
  });
});
