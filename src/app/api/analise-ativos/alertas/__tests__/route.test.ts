import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notification: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  },
  requireAuthWithActing: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));

import { GET } from '../route';
import { POST } from '../lidos/route';
import type { AlertasResposta } from '@/types/analiseAtivosSalvos';

const URL_BASE = 'http://localhost/api/analise-ativos/alertas';
const get = (qs = '') => GET(new NextRequest(URL_BASE + qs));
const post = (corpo?: unknown) =>
  POST(
    new NextRequest(`${URL_BASE}/lidos`, {
      method: 'POST',
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      headers: { 'Content-Type': 'application/json' },
    }),
  );

const comoUsuario = () =>
  mocks.requireAuthWithActing.mockResolvedValue({
    payload: { id: 'u1', email: 'u1@x', role: 'user' },
    targetUserId: 'u1',
    actingClient: null,
  });
const comoConsultor = () =>
  mocks.requireAuthWithActing.mockResolvedValue({
    payload: { id: 'c1', email: 'c@x', role: 'consultant' },
    targetUserId: 'u1',
    actingClient: { id: 'u1', name: 'Cliente', email: 'u1@x' },
  });

const NOTIF = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'HGLG11: provento anunciado',
  message: 'Rendimento de R$ 1,10 por cota · data-com 20/10 · pagamento 27/10.',
  metadata: {
    href: '/analise-ativos/HGLG11',
    symbol: 'HGLG11',
    tipo: 'provento',
    classe: 'fii',
    eventoId: 'provento:HGLG11:rendimento:2026-10-20',
  },
  readAt: null,
  createdAt: new Date('2026-10-16T11:10:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
  vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
  vi.stubEnv('ANALISE_ATIVOS_SALVOS_HABILITADO', 'true');
  vi.stubEnv('ANALISE_ATIVOS_ALERTAS_HABILITADO', 'true');
  mocks.prisma.notification.findMany.mockResolvedValue([NOTIF]);
  mocks.prisma.notification.count.mockResolvedValue(1);
  mocks.prisma.notification.updateMany.mockResolvedValue({ count: 3 });
  comoUsuario();
});

describe('GET /api/analise-ativos/alertas', () => {
  it('flag ALERTAS desligada, ou SALVOS desligada, ⇒ 404 antes da sessão', async () => {
    vi.stubEnv('ANALISE_ATIVOS_ALERTAS_HABILITADO', 'false');
    expect((await get()).status).toBe(404);
    vi.stubEnv('ANALISE_ATIVOS_ALERTAS_HABILITADO', 'true');
    vi.stubEnv('ANALISE_ATIVOS_SALVOS_HABILITADO', 'false');
    expect((await get()).status).toBe(404);
    expect(mocks.requireAuthWithActing).not.toHaveBeenCalled();
  });

  it('avisos do usuário logado (Notification do type, 90 dias), no-store', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const r = (await res.json()) as AlertasResposta;
    expect(r).toEqual({
      avisos: [
        {
          id: NOTIF.id,
          titulo: NOTIF.title,
          mensagem: NOTIF.message,
          href: '/analise-ativos/HGLG11',
          symbol: 'HGLG11',
          tipo: 'provento',
          classe: 'fii',
          criadoEm: '2026-10-16T11:10:00.000Z',
          lido: false,
        },
      ],
      naoLidos: 1,
      podeSalvar: true,
      motivoSemSalvar: null,
    });
    const where = mocks.prisma.notification.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u1', type: 'analise_ativos_salvos_alerta' });
    const dias = (Date.now() - where.createdAt.gte.getTime()) / 86_400_000;
    expect(Math.round(dias)).toBe(90);
    expect(where.OR).toBeUndefined();
  });

  it('?classe=fii filtra pelo metadata (o resumo vale para as duas) e ?dias corta', async () => {
    await get('?classe=fii&dias=30');
    const where = mocks.prisma.notification.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { metadata: { path: ['classe'], equals: 'fii' } },
      { metadata: { path: ['tipo'], equals: 'resumo' } },
    ]);
    expect(Math.round((Date.now() - where.createdAt.gte.getTime()) / 86_400_000)).toBe(30);
    expect(mocks.prisma.notification.count.mock.calls[0][0].where).toMatchObject({
      readAt: null,
      OR: where.OR,
    });
  });

  it('query fora do contrato ⇒ 400', async () => {
    expect((await get('?classe=stock')).status).toBe(400);
    expect((await get('?dias=91')).status).toBe(400);
    expect((await get('?outra=1')).status).toBe(400);
  });

  it('metadata ilegível cai num padrão seguro (href da aba Alertas)', async () => {
    mocks.prisma.notification.findMany.mockResolvedValue([
      { ...NOTIF, metadata: { href: '//evil.com', tipo: 'x' } },
    ]);
    const r = (await (await get()).json()) as AlertasResposta;
    expect(r.avisos[0]).toMatchObject({
      href: '/analise-ativos/salvos?aba=alertas',
      tipo: 'resumo',
      classe: null,
    });
  });

  it('consultor agindo: vazio com podeSalvar=false, sem ler o banco', async () => {
    comoConsultor();
    const r = (await (await get()).json()) as AlertasResposta;
    expect(r).toEqual({ avisos: [], naoLidos: 0, podeSalvar: false, motivoSemSalvar: 'consultor' });
    expect(mocks.prisma.notification.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/analise-ativos/alertas/lidos', () => {
  it('sem ids: marca todos os não lidos dos 90 dias, só do usuário e do type', async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, marcados: 3 });
    const a = mocks.prisma.notification.updateMany.mock.calls[0][0];
    expect(a.where).toMatchObject({
      userId: 'u1',
      type: 'analise_ativos_salvos_alerta',
      readAt: null,
    });
    expect(a.where.id).toBeUndefined();
    expect(a.data.readAt).toBeInstanceOf(Date);
  });

  it('corpo vazio = todos; com ids marca só esses', async () => {
    expect((await post()).status).toBe(200);
    await post({ ids: [NOTIF.id] });
    expect(mocks.prisma.notification.updateMany.mock.calls[1][0].where.id).toEqual({
      in: [NOTIF.id],
    });
  });

  it('corpo fora do contrato (strict, uuid) ⇒ 400', async () => {
    expect((await post({ ids: ['nao-uuid'] })).status).toBe(400);
    expect((await post({ ids: [], todos: true })).status).toBe(400);
    const malformado = await POST(
      new NextRequest(`${URL_BASE}/lidos`, {
        method: 'POST',
        body: '{ids:',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(malformado.status).toBe(400);
    expect(mocks.prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('consultor ⇒ 403; flag desligada ⇒ 404', async () => {
    comoConsultor();
    expect((await post({})).status).toBe(403);
    vi.stubEnv('ANALISE_ATIVOS_ALERTAS_HABILITADO', 'false');
    expect((await post({})).status).toBe(404);
    expect(mocks.prisma.notification.updateMany).not.toHaveBeenCalled();
  });
});
