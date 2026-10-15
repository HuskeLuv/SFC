/**
 * v2.5 — curadoria como ÚNICA fonte de verdade da aprovação de pontos de provedor: o caso do grupo
 * 'fonte_externa' aberto pela ingestão, resolvido na tela (aplicarAcaoCaso) ou pela casca de CLI
 * (revisarCasoFonte → a mesma aplicarAcaoCaso), muda o reviewStatus do ponto na mesma transação.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const mocks = vi.hoisted(() => ({ enviarPush: vi.fn() }));
vi.mock('@/services/push/enviarPush', () => ({ enviarPushDaNotificacao: mocks.enviarPush }));

import { aplicarAcaoCaso } from '../acoesCuradoria';
import { corpoDecisaoFonte, decisaoDoEfeito, referenciaDoContexto } from '../efeitoFonteExterna';
import { revisarCasoFonte } from '../revisarFonte';
import {
  abrirCasoFonte,
  aprovarPonto,
  REGRA_SANIDADE_FONTE,
  type CasoFonteParaAbrir,
} from '@/services/analiseAtivos/repositorio/fontesFundamentosEscrita';

type Linha = Record<string, unknown>;
const AGORA = new Date('2026-10-15T13:00:00.000Z');

/** Banco mínimo em memória: casos, eventos, pontos de provedor e qualidade. */
function banco() {
  const casos: Linha[] = [];
  const eventos: Linha[] = [];
  const pontos: Linha[] = [
    { id: 'pt-1', reviewStatus: 'pending', reviewedBy: null, reviewedAt: null },
    { id: 'pt-2', reviewStatus: 'pending', reviewedBy: null, reviewedAt: null },
  ];
  const qualidade: Linha[] = [{ id: 'q-1', reviewStatus: 'pending', reviewedBy: null }];
  let seq = 0;
  const bate = (l: Linha, where: Linha) =>
    Object.entries(where).every(([k, v]) =>
      v instanceof Date ? (l[k] as Date)?.getTime() === v.getTime() : l[k] === v,
    );
  const updateMany = (tabela: Linha[]) =>
    vi.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
      const alvo = tabela.filter((l) => bate(l, where));
      for (const l of alvo) Object.assign(l, data);
      return { count: alvo.length };
    });
  const p = {
    analiseCasoDado: {
      findUnique: vi.fn(async ({ where }: { where: Linha }) => {
        const c = casos.find((x) => bate(x, where));
        return c ? { ...c } : null;
      }),
      create: vi.fn(async ({ data }: { data: Linha }) => {
        const c = { id: `caso-${++seq}`, updatedAt: new Date('2026-10-15T10:00:00Z'), ...data };
        casos.push(c);
        return { id: c.id };
      }),
      update: vi.fn(async ({ where, data }: { where: Linha; data: Linha }) => {
        const c = casos.find((x) => bate(x, where))!;
        Object.assign(c, data);
        return c;
      }),
      updateMany: updateMany(casos),
    },
    analiseCasoEvento: {
      create: vi.fn(async ({ data }: { data: Linha }) => {
        eventos.push(data);
        return data;
      }),
      findFirst: vi.fn(async () => null),
    },
    analiseDataReport: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: { email: string } }) =>
        where.email === 'admin.demo@finapp.local'
          ? { id: 'adm1', role: 'admin' }
          : where.email === 'usuario.demo@finapp.local'
            ? { id: 'u1', role: 'user' }
            : null,
      ),
      findUnique: vi.fn(async () => null),
    },
    notification: { create: vi.fn() },
    assetFundamentalsSerie: { updateMany: updateMany(pontos) },
    fiiPropertyQuality: { updateMany: updateMany(qualidade) },
    $transaction: vi.fn(),
  };
  p.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(p));
  return { prisma: p as unknown as PrismaClient, casos, eventos, pontos, qualidade, p };
}

function casoDoPonto(id: string, tabela = 'asset_fundamentals_serie'): CasoFonteParaAbrir {
  return {
    symbol: 'WEGE3',
    cnpj: '84429695000111',
    classe: 'acao',
    campo: 'net_income_adjusted',
    periodo: '2026-12-31',
    contexto: {
      tipo: 'fonte_externa',
      referencia: { tabela: tabela as 'asset_fundamentals_serie', id },
      fonte: 'exemplo',
      serie: 'net_income_adjusted',
      valor: 9_000_000_000,
      valorCvm: null,
      valorAnterior: 6_000_000_000,
      motivos: ['variacao'],
      versao: 1,
      regraDesde: '2026-10-15',
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('abrir o caso fonte_externa', () => {
  it('abre com grupo, regra e referência; ponto novo do mesmo período só atualiza o caso', async () => {
    const b = banco();
    expect(await abrirCasoFonte(b.prisma, casoDoPonto('pt-1'), AGORA)).toBe('aberto');
    expect(b.casos[0]).toMatchObject({
      grupo: 'fonte_externa',
      origem: 'regra',
      regraCodigo: REGRA_SANIDADE_FONTE,
      chaveAberta: 'WEGE3|net_income_adjusted|2026-12-31',
      status: 'aberto',
    });
    // caso só de regra: sem prazo
    expect(b.casos[0].slaAte).toBeUndefined();
    expect(b.eventos[0]).toMatchObject({ tipo: 'aberto', texto: 'variacao' });
    expect(await abrirCasoFonte(b.prisma, casoDoPonto('pt-2'), AGORA)).toBe('atualizado');
    expect(b.casos).toHaveLength(1);
    expect(referenciaDoContexto(b.casos[0].contexto)).toEqual({
      tabela: 'asset_fundamentals_serie',
      id: 'pt-2',
    });
  });
});

describe('resolver o caso muda o ponto (mesma transação)', () => {
  it("'liberar_valor' (rejeitado/dado_confirmado) aprova o ponto com reviewedBy = o admin", async () => {
    const b = banco();
    await abrirCasoFonte(b.prisma, casoDoPonto('pt-1'), AGORA);
    const caso = b.casos[0];
    await aplicarAcaoCaso(b.prisma, {
      casoId: caso.id as string,
      adminId: 'adm1',
      corpo: corpoDecisaoFonte('aprovar', (caso.updatedAt as Date).toISOString()),
      agora: AGORA,
    });
    expect(b.pontos[0]).toMatchObject({
      reviewStatus: 'approved',
      reviewedBy: 'adm1',
      reviewedAt: AGORA,
    });
    expect(b.pontos[1].reviewStatus).toBe('pending');
    expect(b.casos[0]).toMatchObject({ status: 'rejeitado', resolucao: 'dado_confirmado' });
  });

  it('fechar com outro efeito (o alarme procede) rejeita o ponto', async () => {
    const b = banco();
    await abrirCasoFonte(b.prisma, casoDoPonto('pt-1'), AGORA);
    await aplicarAcaoCaso(b.prisma, {
      casoId: b.casos[0].id as string,
      adminId: 'adm1',
      corpo: corpoDecisaoFonte('rejeitar', (b.casos[0].updatedAt as Date).toISOString()),
      agora: AGORA,
    });
    expect(b.pontos[0]).toMatchObject({ reviewStatus: 'rejected', reviewedBy: 'adm1' });
    expect(b.casos[0]).toMatchObject({ status: 'corrigido', efeitoTela: 'manter_conferencia' });
  });

  it('qualidade de FII: a referência aponta para fii_property_quality', async () => {
    const b = banco();
    await abrirCasoFonte(b.prisma, casoDoPonto('q-1', 'fii_property_quality'), AGORA);
    await aplicarAcaoCaso(b.prisma, {
      casoId: b.casos[0].id as string,
      adminId: 'adm1',
      corpo: corpoDecisaoFonte('aprovar', (b.casos[0].updatedAt as Date).toISOString()),
      agora: AGORA,
    });
    expect(b.qualidade[0]).toMatchObject({ reviewStatus: 'approved', reviewedBy: 'adm1' });
    expect(b.pontos.every((x) => x.reviewStatus === 'pending')).toBe(true);
  });

  it('salvar sem fechar (em análise) não mexe no ponto', async () => {
    const b = banco();
    await abrirCasoFonte(b.prisma, casoDoPonto('pt-1'), AGORA);
    await aplicarAcaoCaso(b.prisma, {
      casoId: b.casos[0].id as string,
      adminId: 'adm1',
      corpo: {
        acao: 'decidir',
        status: 'em_analise',
        efeitoTela: 'sem_efeito',
        atualizadoEmEsperado: (b.casos[0].updatedAt as Date).toISOString(),
      },
      agora: AGORA,
    });
    expect(b.pontos[0].reviewStatus).toBe('pending');
  });

  it('caso de outro grupo fechado não toca em ponto nenhum', async () => {
    const b = banco();
    b.casos.push({
      id: 'c-regra',
      symbol: 'WEGE3',
      status: 'aberto',
      responsavelId: null,
      grupo: 'historico',
      contexto: { referencia: { tabela: 'asset_fundamentals_serie', id: 'pt-1' } },
      updatedAt: AGORA,
    });
    await aplicarAcaoCaso(b.prisma, {
      casoId: 'c-regra',
      adminId: 'adm1',
      corpo: corpoDecisaoFonte('aprovar', AGORA.toISOString()),
      agora: AGORA,
    });
    expect(b.pontos[0].reviewStatus).toBe('pending');
  });

  it('aprovar ponto que já não está pendente não muda nada (idempotente)', async () => {
    const b = banco();
    b.pontos[0].reviewStatus = 'rejected';
    expect(
      await aprovarPonto(b.p, { tabela: 'asset_fundamentals_serie', id: 'pt-1' }, 'adm1', AGORA),
    ).toBe(0);
    expect(b.pontos[0].reviewStatus).toBe('rejected');
    expect(decisaoDoEfeito('liberar_valor')).toBe('aprovar');
    expect(decisaoDoEfeito('sem_efeito')).toBe('rejeitar');
  });
});

describe('casca de CLI (revisar-fonte) — a mesma ação do caso', () => {
  it('dry-run não grava; --apply fecha o caso e aprova o ponto', async () => {
    const b = banco();
    await abrirCasoFonte(b.prisma, casoDoPonto('pt-1'), AGORA);
    const casoId = b.casos[0].id as string;
    const seco = await revisarCasoFonte(b.prisma, {
      casoId,
      decisao: 'aprovar',
      revisorEmail: 'admin.demo@finapp.local',
      aplicar: false,
    });
    expect(seco).toMatchObject({ aplicado: false, referencia: { id: 'pt-1' } });
    expect(b.pontos[0].reviewStatus).toBe('pending');
    expect(b.casos[0].status).toBe('aberto');

    await revisarCasoFonte(b.prisma, {
      casoId,
      decisao: 'aprovar',
      revisorEmail: 'admin.demo@finapp.local',
      aplicar: true,
      agora: AGORA,
    });
    expect(b.pontos[0]).toMatchObject({ reviewStatus: 'approved', reviewedBy: 'adm1' });
    expect(b.casos[0]).toMatchObject({ status: 'rejeitado', resolvidoPorId: 'adm1' });
    expect(b.eventos.some((e) => e.tipo === 'decisao')).toBe(true);
  });

  it('só admin; caso de outro grupo ou já fechado = erro', async () => {
    const b = banco();
    await abrirCasoFonte(b.prisma, casoDoPonto('pt-1'), AGORA);
    const casoId = b.casos[0].id as string;
    await expect(
      revisarCasoFonte(b.prisma, {
        casoId,
        decisao: 'aprovar',
        revisorEmail: 'usuario.demo@finapp.local',
        aplicar: true,
      }),
    ).rejects.toThrow(/não é admin/);
    b.casos[0].grupo = 'historico';
    await expect(
      revisarCasoFonte(b.prisma, {
        casoId,
        decisao: 'aprovar',
        revisorEmail: 'admin.demo@finapp.local',
        aplicar: true,
      }),
    ).rejects.toThrow(/fonte_externa/);
    b.casos[0].grupo = 'fonte_externa';
    b.casos[0].status = 'corrigido';
    await expect(
      revisarCasoFonte(b.prisma, {
        casoId,
        decisao: 'rejeitar',
        revisorEmail: 'admin.demo@finapp.local',
        aplicar: true,
      }),
    ).rejects.toThrow(/fechado/);
  });
});
