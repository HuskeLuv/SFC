import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ enviarPush: vi.fn() }));
vi.mock('@/services/push/enviarPush', () => ({ enviarPushDaNotificacao: mocks.enviarPush }));

import { ApiError } from '@/utils/apiErrorHandler';
import { ANALISE_CURADORIA_SLA_TYPE, ANALISE_RELATO_RESPOSTA_TYPE } from '@/lib/push/contract';
import { ConflitoCaso, aplicarAcaoCaso, validarTextoCurador } from '../acoesCuradoria';
import { textoRespostaAutor } from '../notificacoesCaso';
import { TIPOS_NOTIFICACAO } from '../contrato';
import type { CasoPatchBody } from '@/types/analiseAtivosCuradoria';

const ATUALIZADO = new Date('2026-10-02T13:00:00.000Z');
const AGORA = new Date('2026-10-02T14:00:00.000Z');

function prismaFake(caso: Record<string, unknown> | null = {}) {
  const p = {
    analiseCasoDado: {
      findUnique: vi.fn().mockImplementation(({ select }) =>
        Promise.resolve(
          caso === null
            ? null
            : select?.status
              ? {
                  id: 'c1',
                  symbol: 'WEGE3',
                  status: 'aberto',
                  responsavelId: null,
                  updatedAt: ATUALIZADO,
                  ...caso,
                }
              : { updatedAt: (caso.updatedAt as Date) ?? ATUALIZADO },
        ),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    analiseCasoEvento: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({ autorId: 'adm2' }),
    },
    analiseDataReport: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'adm2', name: 'Ana Curadora' }) },
    notification: {
      create: vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: `n-${data.userId}`, ...data })),
    },
    $transaction: vi.fn(),
  };
  p.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(p));
  return p;
}

const acao = (prisma: ReturnType<typeof prismaFake>, corpo: CasoPatchBody) =>
  aplicarAcaoCaso(prisma as never, { casoId: 'c1', adminId: 'adm1', corpo, agora: AGORA });

const esperado = ATUALIZADO.toISOString();

async function erroDe(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('esperava erro');
}

beforeEach(() => vi.clearAllMocks());

describe('transições', () => {
  it('assumir: aberto → em_analise com o admin como responsável e evento', async () => {
    const p = prismaFake();
    await acao(p, { acao: 'assumir', atualizadoEmEsperado: esperado });
    expect(p.analiseCasoDado.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', updatedAt: ATUALIZADO },
      data: { status: 'em_analise', responsavelId: 'adm1', updatedAt: AGORA },
    });
    expect(p.analiseCasoEvento.create.mock.calls[0][0].data).toMatchObject({
      tipo: 'assumido',
      de: 'aberto',
      para: 'em_analise',
      autorId: 'adm1',
    });
  });

  it('soltar: em_analise → aberto sem responsável', async () => {
    const p = prismaFake({ status: 'em_analise', responsavelId: 'adm1' });
    await acao(p, { acao: 'soltar', atualizadoEmEsperado: esperado });
    expect(p.analiseCasoDado.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'aberto',
      responsavelId: null,
    });
  });

  it('assumir caso já em análise → 409 (transição inválida)', async () => {
    const p = prismaFake({ status: 'em_analise' });
    const e = await erroDe(acao(p, { acao: 'assumir', atualizadoEmEsperado: esperado }));
    expect(e).toBeInstanceOf(ConflitoCaso);
    expect(p.analiseCasoDado.updateMany).not.toHaveBeenCalled();
  });

  it('caso fechado é final: decidir de novo → 409', async () => {
    const p = prismaFake({ status: 'corrigido' });
    const e = await erroDe(
      acao(p, {
        acao: 'decidir',
        status: 'rejeitado',
        resolucao: 'sem_procedencia',
        efeitoTela: 'sem_efeito',
        atualizadoEmEsperado: esperado,
      }),
    );
    expect(e).toBeInstanceOf(ConflitoCaso);
  });
});

describe('concorrência otimista (409)', () => {
  it('atualizadoEmEsperado diferente → 409 com quem alterou e quando', async () => {
    const p = prismaFake();
    const e = (await erroDe(
      acao(p, { acao: 'assumir', atualizadoEmEsperado: '2026-10-02T12:00:00.000Z' }),
    )) as ConflitoCaso;
    expect(e).toBeInstanceOf(ConflitoCaso);
    expect(e.corpo).toEqual({
      error: expect.any(String),
      atualizadoEm: ATUALIZADO.toISOString(),
      atualizadoPor: { id: 'adm2', nome: 'Ana Curadora' },
    });
    expect(p.analiseCasoDado.updateMany).not.toHaveBeenCalled();
  });

  it('UPDATE condicional sem linha (corrida) → 409 e nada de evento', async () => {
    const p = prismaFake();
    p.analiseCasoDado.updateMany.mockResolvedValue({ count: 0 });
    const e = await erroDe(acao(p, { acao: 'assumir', atualizadoEmEsperado: esperado }));
    expect(e).toBeInstanceOf(ConflitoCaso);
    expect(p.analiseCasoEvento.create).not.toHaveBeenCalled();
  });
});

describe('decidir', () => {
  const decidir = (over: Partial<Extract<CasoPatchBody, { acao: 'decidir' }>> = {}) =>
    ({
      acao: 'decidir',
      status: 'corrigido',
      resolucao: 'corrigido_fonte',
      efeitoTela: 'sem_efeito',
      atualizadoEmEsperado: esperado,
      ...over,
    }) as CasoPatchBody;

  it('fechar sem resolução → 400', async () => {
    const p = prismaFake({ status: 'em_analise' });
    const e = (await erroDe(acao(p, decidir({ resolucao: undefined })))) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.statusCode).toBe(400);
    expect(e.details).toEqual({ resolucao: ['obrigatoria'] });
  });

  it('resolução incoerente com o status → 400', async () => {
    const p = prismaFake({ status: 'em_analise' });
    const e = (await erroDe(acao(p, decidir({ resolucao: 'dado_confirmado' })))) as ApiError;
    expect(e.statusCode).toBe(400);
  });

  it('liberar_valor só com rejeitado/dado_confirmado', async () => {
    const p = prismaFake({ status: 'em_analise' });
    const e = (await erroDe(acao(p, decidir({ efeitoTela: 'liberar_valor' })))) as ApiError;
    expect(e.statusCode).toBe(400);

    const p2 = prismaFake({ status: 'em_analise' });
    await acao(
      p2,
      decidir({ status: 'rejeitado', resolucao: 'dado_confirmado', efeitoTela: 'liberar_valor' }),
    );
    expect(p2.analiseCasoDado.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'rejeitado',
      resolucao: 'dado_confirmado',
      efeitoTela: 'liberar_valor',
      chaveAberta: null,
      conferenciaManual: false,
    });
  });

  it('compliance: termo proibido na resposta → 400 com details.termos, sem transação', async () => {
    const p = prismaFake({ status: 'em_analise' });
    const e = (await erroDe(
      acao(p, decidir({ respostaPublica: 'O payout real é 54%, o papel ficou barato.' })),
    )) as ApiError;
    expect(e.statusCode).toBe(400);
    expect(e.details?.termos).toEqual(['barato']);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('resposta com HTML → 400; texto saneado (bidi/zero-width) antes do limite', () => {
    expect(() => validarTextoCurador('<b>oi</b>', 'respostaPublica')).toThrow(ApiError);
    expect(validarTextoCurador('Conferimos‮ o dado​.', 'respostaPublica')).toBe(
      'Conferimos o dado.',
    );
    expect(() => validarTextoCurador('x'.repeat(501), 'respostaPublica')).toThrow(ApiError);
    expect(validarTextoCurador('x'.repeat(2000), 'notaCurador')).toHaveLength(2000);
    expect(() => validarTextoCurador('x'.repeat(2001), 'notaCurador')).toThrow(ApiError);
  });

  it('não existe conferência manual: decidir nunca liga a coluna reservada', async () => {
    const p = prismaFake({ status: 'em_analise' });
    await acao(p, decidir({ status: 'em_analise', resolucao: undefined }));
    const data = p.analiseCasoDado.updateMany.mock.calls[0][0].data;
    expect(data.conferenciaManual).toBeUndefined();
    expect(data.resolucao).toBeUndefined();
  });

  it('fechar avisa UMA vez cada autor distinto (consultor que agiu = autor) e grava os eventos', async () => {
    const p = prismaFake({ status: 'em_analise' });
    p.analiseDataReport.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u1' },
    ]);
    const r = await acao(p, decidir({ respostaPublica: 'O dado foi corrigido na fonte.' }));
    expect(r.notificados).toBe(2);
    expect(p.notification.create).toHaveBeenCalledTimes(2);
    const n = p.notification.create.mock.calls[0][0].data;
    expect(n).toMatchObject({
      userId: 'u1',
      type: TIPOS_NOTIFICACAO.resposta,
      title: 'Seu relato sobre WEGE3 foi respondido',
      metadata: expect.objectContaining({ href: '/analise-ativos/WEGE3?relatos=1', casoId: 'c1' }),
    });
    // a resposta livre da equipe NÃO vai na notificação (fica em Meus relatos)
    expect(n.message).not.toContain('corrigido na fonte.');
    expect(p.analiseDataReport.updateMany).toHaveBeenCalledWith({
      where: { casoId: 'c1', respondidoEm: null },
      data: { respondidoEm: AGORA },
    });
    const tipos = p.analiseCasoEvento.create.mock.calls.map((c) => c[0].data.tipo);
    expect(tipos).toEqual(['decisao', 'notificado']);
    expect(mocks.enviarPush).toHaveBeenCalledTimes(2);
  });

  it('salvar sem fechar não notifica ninguém', async () => {
    const p = prismaFake({ status: 'em_analise' });
    p.analiseDataReport.findMany.mockResolvedValue([{ userId: 'u1' }]);
    const r = await acao(
      p,
      decidir({ status: 'em_analise', resolucao: undefined, respostaPublica: 'Rascunho.' }),
    );
    expect(r.notificados).toBe(0);
    expect(p.notification.create).not.toHaveBeenCalled();
  });

  it('caso inexistente → 404', async () => {
    const p = prismaFake(null);
    const e = (await erroDe(
      acao(p, { acao: 'assumir', atualizadoEmEsperado: esperado }),
    )) as ApiError;
    expect(e.statusCode).toBe(404);
  });
});

describe('nota', () => {
  it('grava a anotação interna e o evento', async () => {
    const p = prismaFake({ status: 'em_analise' });
    await acao(p, {
      acao: 'nota',
      notaCurador: 'Pedido à fonte aberto.',
      atualizadoEmEsperado: esperado,
    });
    expect(p.analiseCasoDado.updateMany.mock.calls[0][0].data).toMatchObject({
      notaCurador: 'Pedido à fonte aberto.',
    });
    expect(p.analiseCasoEvento.create.mock.calls[0][0].data.tipo).toBe('nota');
  });

  it('anotação vazia → 400', async () => {
    const p = prismaFake();
    const e = (await erroDe(
      acao(p, { acao: 'nota', notaCurador: '  ​ ', atualizadoEmEsperado: esperado }),
    )) as ApiError;
    expect(e.statusCode).toBe(400);
  });
});

describe('notificações', () => {
  it('rejeitado aparece como mensagem neutra (sem "rejeitado")', () => {
    const t = textoRespostaAutor('wege3', 'sem_procedencia');
    expect(t.title).toBe('Seu relato sobre WEGE3 foi respondido');
    expect(t.message.toLowerCase()).not.toContain('rejeit');
  });

  it('os types do push batem com TIPOS_NOTIFICACAO', () => {
    expect(ANALISE_RELATO_RESPOSTA_TYPE).toBe(TIPOS_NOTIFICACAO.resposta);
    expect(ANALISE_CURADORIA_SLA_TYPE).toBe(TIPOS_NOTIFICACAO.sla);
  });
});
