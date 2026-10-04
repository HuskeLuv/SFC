import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { BancoFalso } from '@/services/analiseAtivos/curadoria/__tests__/bancoFalsoCuradoria';

const mocks = vi.hoisted(() => ({
  requireAuthWithActing: vi.fn(),
  obterLinhaQuadro: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock('@/lib/prisma', async () => {
  const { criarBancoFalso } =
    await import('@/services/analiseAtivos/curadoria/__tests__/bancoFalsoCuradoria');
  const banco = criarBancoFalso();
  return { default: banco.db, prisma: banco.db, __banco: banco };
});
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => ({
  obterLinhaQuadro: mocks.obterLinhaQuadro,
}));
vi.mock('@/services/push/enviarPush', () => ({ enviarPushDaNotificacao: vi.fn() }));
vi.mock('jose', () => ({ jwtVerify: mocks.jwtVerify }));
vi.stubEnv('JWT_SECRET', 'test-secret-key-for-vitest');

import * as prismaMod from '@/lib/prisma';
import { POST } from '../route';
import { GET as GET_MEUS } from '../../meus-reportes/route';
import { limparCacheAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { linhaQuadro } from '@/services/analiseAtivos/curadoria/__tests__/bancoFalsoCuradoria';
import { middleware } from '@/middleware';
import { CSRF_COOKIE_NAME } from '@/utils/csrf';

const banco = (prismaMod as unknown as { __banco: BancoFalso }).__banco;

const URL_POST = 'http://localhost/api/analise-ativos/reportes';
const URL_MEUS = 'http://localhost/api/analise-ativos/meus-reportes';

const corpo = (over: Record<string, unknown> = {}) => ({
  ticker: 'WEGE3',
  bloco: 'valuation',
  campo: 'payout',
  valorExibido: '55%',
  periodo: '2025',
  fonteExibida: 'CVM DFP 2025',
  versao: 'q-2026-10-02',
  mensagem: 'O release do 4T25 informa payout de 52% em 2025.',
  valorEsperado: '52%',
  ...over,
});
const post = (body: unknown) =>
  new NextRequest(URL_POST, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const comoUsuario = (id: string) =>
  mocks.requireAuthWithActing.mockResolvedValue({
    payload: { id, email: `${id}@x`, role: 'user' },
    targetUserId: id,
    actingClient: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
  for (const t of Object.values(banco.tabelas)) t.length = 0;
  vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
  vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
  vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'true');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('ANALISE_ATIVOS_ALERTA_ADMIN', 'false');
  mocks.obterLinhaQuadro.mockImplementation(async (s: string) =>
    ['WEGE3', 'HGLG11'].includes(s) ? linhaQuadro({ symbol: s }) : null,
  );
  comoUsuario('u1');
});

describe('POST /api/analise-ativos/reportes', () => {
  it('201 com protocolo e prazo; caso e relato gravados; no-store', async () => {
    const res = await POST(post(corpo()));
    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const b = await res.json();
    expect(b).toMatchObject({ status: 'aberto' });
    expect(b.protocolo).toHaveLength(8);
    expect(b.slaAte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(banco.tabelas.reportes).toHaveLength(1);
    expect(banco.tabelas.reportes[0]).toMatchObject({ userId: 'u1', valorEsperado: '52%' });
  });

  it('401 sem sessão', async () => {
    mocks.requireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    expect((await POST(post(corpo()))).status).toBe(401);
  });

  it('404 com a flag do relato desligada (antes de olhar a sessão), área desligada ou fora do beta', async () => {
    vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'false');
    expect((await POST(post(corpo()))).status).toBe(404);
    expect(mocks.requireAuthWithActing).not.toHaveBeenCalled();

    vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'true');
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'false');
    expect((await POST(post(corpo()))).status).toBe(404);

    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'beta');
    banco.tabelas.usuarios.push({ id: 'u3', role: 'user', featureBetas: [] });
    limparCacheAcessoAnalise('u3');
    comoUsuario('u3');
    expect((await POST(post(corpo()))).status).toBe(404);
    expect(banco.tabelas.reportes).toHaveLength(0);
  });

  it('404 com ticker fora do Quadro', async () => {
    const res = await POST(post(corpo({ ticker: 'ZZZZ3' })));
    expect(res.status).toBe(404);
  });

  it('400 por campo: HTML, campo fora da allowlist, chave extra, mensagem curta', async () => {
    const html = await POST(post(corpo({ mensagem: 'olha isso <img src=x onerror=alert(1)>' })));
    expect(html.status).toBe(400);
    expect((await html.json()).details).toEqual({ mensagem: ['html'] });

    const campo = await POST(post(corpo({ bloco: 'kpis', campo: 'receita' })));
    expect((await campo.json()).details).toEqual({ campo: ['invalido'] });

    const extra = await POST(post({ ...corpo(), userId: 'outro' }));
    expect(extra.status).toBe(400);

    const curta = await POST(post(corpo({ mensagem: 'errado' })));
    expect((await curta.json()).details).toEqual({ mensagem: ['min'] });
    expect(banco.tabelas.reportes).toHaveLength(0);
  });

  it('U+202E e zero-width são removidos antes de gravar e contados no retrato', async () => {
    const res = await POST(post(corpo({ mensagem: 'payout‮ errado​ no release do 4T25' })));
    expect(res.status).toBe(201);
    const rep = banco.tabelas.reportes[0];
    expect(rep.mensagem).toBe('payout errado no release do 4T25');
    expect((rep.contextoServidor as { saneamento: { removidos: number } }).saneamento).toEqual({
      removidos: 2,
    });
  });

  it('409 duplicado: devolve casoId e reporteId do relato existente, nada criado', async () => {
    const r1 = await (await POST(post(corpo()))).json();
    const res = await POST(post(corpo({ mensagem: 'de novo o payout de 2025 está errado' })));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: expect.any(String),
      casoId: r1.casoId,
      reporteId: r1.id,
    });
    expect(banco.tabelas.reportes).toHaveLength(1);
  });

  it('429 por dia (6º relato), com limite e voltaEm', async () => {
    const campos = ['pl', 'pvp', 'dy12m', 'roe', 'payout'];
    for (const [i, c] of campos.entries()) {
      const t = i < 2 ? 'HGLG11' : 'WEGE3';
      const r = await POST(post(corpo({ ticker: t, campo: c, periodo: null })));
      expect(r.status).toBe(201);
    }
    const res = await POST(post(corpo({ campo: 'lpa', periodo: null })));
    expect(res.status).toBe(429);
    const b = await res.json();
    expect(b.limite).toBe('dia');
    expect(typeof b.voltaEm).toBe('string');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('429 por hora no mesmo ativo (4º relato)', async () => {
    for (const c of ['pl', 'pvp', 'roe']) {
      expect((await POST(post(corpo({ campo: c, periodo: null })))).status).toBe(201);
    }
    const res = await POST(post(corpo({ campo: 'lpa', periodo: null })));
    expect(res.status).toBe(429);
    expect((await res.json()).limite).toBe('hora_ativo');
  });

  it('429 global (300 em 24 h)', async () => {
    const caso = banco.casoDeRegra({ symbol: 'ZZZZ3' });
    for (let i = 0; i < 300; i += 1) {
      banco.tabelas.reportes.push({
        id: `g${i}`,
        casoId: caso.id,
        userId: `outro${i}`,
        symbol: 'ZZZZ3',
        campo: 'pl',
        createdAt: new Date(),
      });
    }
    const res = await POST(post(corpo()));
    expect(res.status).toBe(429);
    expect((await res.json()).limite).toBe('global');
  });

  it('consultor agindo: autor = consultor, clienteId = cliente; cliente não é notificado', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    banco.tabelas.usuarios.push({ id: 'adm1', role: 'admin' });
    mocks.requireAuthWithActing.mockResolvedValue({
      payload: { id: 'consultor-1', email: 'c@x', role: 'consultant' },
      targetUserId: 'cliente-9',
      actingClient: { id: 'cliente-9', name: 'Marina', email: 'm@x' },
    });
    expect((await POST(post(corpo()))).status).toBe(201);
    expect(banco.tabelas.reportes[0]).toMatchObject({
      userId: 'consultor-1',
      clienteId: 'cliente-9',
    });
    expect(banco.tabelas.notificacoes.map((n) => n.userId)).toEqual(['adm1']);
  });

  it('anexa ao caso de regra só com campo do grupo; senão caso novo', async () => {
    const regra = banco.casoDeRegra({
      symbol: 'WEGE3',
      classe: 'acao',
      grupo: 'proventos',
      campo: 'dy12m',
      chaveAberta: 'WEGE3|dy12m|2026-09-30',
    });
    const a = await (await POST(post(corpo({ campo: 'payout' })))).json();
    expect(a.casoId).toBe(regra.id);
    expect(regra.origem).toBe('misto');
    const b = await (await POST(post(corpo({ campo: 'pl', periodo: null })))).json();
    expect(b.casoId).not.toBe(regra.id);
  });

  it('aviso aos admins 1× por caso, em produção, mesmo com ALERTA_ADMIN=false', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    banco.tabelas.usuarios.push({ id: 'adm1', role: 'admin' });
    await POST(post(corpo()));
    comoUsuario('u2');
    await POST(post(corpo()));
    const avisos = banco.tabelas.notificacoes.filter((n) => n.type === 'analise_ativos_reporte');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].metadata).toMatchObject({
      href: expect.stringMatching(/^\/admin\/curadoria\//),
    });
  });

  it('fora de produção não avisa os admins', async () => {
    banco.tabelas.usuarios.push({ id: 'adm1', role: 'admin' });
    await POST(post(corpo()));
    expect(banco.tabelas.notificacoes).toHaveLength(0);
  });
});

describe('GET /api/analise-ativos/meus-reportes', () => {
  const meus = (qs = '') => GET_MEUS(new NextRequest(`${URL_MEUS}${qs}`));

  it('só os relatos do usuário logado (nunca de outro, nem do cliente personificado)', async () => {
    await POST(post(corpo()));
    comoUsuario('u2');
    await POST(post(corpo({ campo: 'pl', periodo: null })));
    comoUsuario('u1');
    const res = await meus();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const b = await res.json();
    expect(b.itens).toHaveLength(1);
    expect(b.itens[0]).toMatchObject({
      ticker: 'WEGE3',
      campo: 'payout',
      mensagem: expect.stringContaining('release'),
      caso: { status: 'aberto', resolucao: null, respostaPublica: null, novo: false },
    });
    // consultor agindo vê os PRÓPRIOS relatos, não os do cliente
    mocks.requireAuthWithActing.mockResolvedValue({
      payload: { id: 'consultor-1', email: 'c@x', role: 'consultant' },
      targetUserId: 'u1',
      actingClient: { id: 'u1' },
    });
    expect((await (await meus()).json()).itens).toHaveLength(0);
    // userId na query é ignorado
    comoUsuario('u2');
    const ig = await (await meus('?userId=u1')).json();
    expect(ig.itens.every((i: { campo: string }) => i.campo === 'pl')).toBe(true);
  });

  it('rejeitado aparece como "conferido_sem_alteracao" com resposta; novo = aviso não lido', async () => {
    const r = await (await POST(post(corpo()))).json();
    Object.assign(banco.tabelas.casos[0], {
      status: 'rejeitado',
      resolucao: 'dado_confirmado',
      respostaPublica: 'Conferimos com a CVM.',
      chaveAberta: null,
    });
    banco.tabelas.notificacoes.push({
      id: 'n1',
      userId: 'u1',
      type: 'analise_ativos_reporte_resposta',
      readAt: null,
      metadata: { casoId: r.casoId },
      createdAt: new Date(),
    });
    const b = await (await meus()).json();
    expect(b.itens[0].caso).toMatchObject({
      status: 'conferido_sem_alteracao',
      resolucao: 'dado_confirmado',
      respostaPublica: 'Conferimos com a CVM.',
      novo: true,
    });
    banco.tabelas.notificacoes[0].readAt = new Date();
    expect((await (await meus()).json()).itens[0].caso.novo).toBe(false);
  });

  it('filtra por ticker; ticker/cursor inválidos → 400; flag desligada → 404', async () => {
    await POST(post(corpo()));
    await POST(post(corpo({ ticker: 'HGLG11', campo: 'pvp', periodo: null })));
    const b = await (await meus('?ticker=hglg11')).json();
    expect(b.itens.map((i: { ticker: string }) => i.ticker)).toEqual(['HGLG11']);
    expect((await meus('?ticker=../x')).status).toBe(400);
    expect((await meus('?cursor=lixo')).status).toBe(400);
    vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'false');
    expect((await meus()).status).toBe(404);
  });

  it('pagina com cursor (20 por página)', async () => {
    const caso = banco.casoDeRegra({ symbol: 'WEGE3', origem: 'usuario' });
    for (let i = 0; i < 25; i += 1) {
      banco.tabelas.reportes.push({
        id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
        protocolo: `P${i}`,
        casoId: caso.id,
        userId: 'u1',
        symbol: 'WEGE3',
        bloco: 'valuation',
        campo: 'pl',
        periodo: null,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)),
      });
    }
    const p1 = await (await meus()).json();
    expect(p1.itens).toHaveLength(20);
    expect(p1.proximoCursor).toBeTruthy();
    const p2 = await (await meus(`?cursor=${p1.proximoCursor}`)).json();
    expect(p2.itens).toHaveLength(5);
    expect(p2.proximoCursor).toBeNull();
    const ids = new Set([...p1.itens, ...p2.itens].map((i: { id: string }) => i.id));
    expect(ids.size).toBe(25);
  });
});

describe('borda (middleware): CSRF e tier de IP do relato', () => {
  const CSRF = 'b'.repeat(64);
  const pelaBorda = (path: string, method: string, ip: string, headers = {}) => {
    const req = new NextRequest(new URL(path, 'http://localhost'), {
      method,
      headers: { 'x-forwarded-for': ip, ...headers },
    });
    req.cookies.set('token', 'jwt.valido');
    req.cookies.set(CSRF_COOKIE_NAME, CSRF);
    return req;
  };

  beforeEach(() => {
    mocks.jwtVerify.mockResolvedValue({ payload: { sub: 'u1' } });
  });

  it('POST sem x-csrf-token → 403', async () => {
    const res = await middleware(pelaBorda('/api/analise-ativos/reportes', 'POST', '10.0.0.1'));
    expect(res.status).toBe(403);
  });

  it('11º POST do mesmo IP em 1 min → 429; 11 GETs em meus-reportes passam', async () => {
    const ip = '10.0.0.2';
    for (let i = 0; i < 10; i += 1) {
      const r = await middleware(
        pelaBorda('/api/analise-ativos/reportes', 'POST', ip, { 'x-csrf-token': CSRF }),
      );
      expect(r.status).not.toBe(429);
    }
    const bloqueado = await middleware(
      pelaBorda('/api/analise-ativos/reportes', 'POST', ip, { 'x-csrf-token': CSRF }),
    );
    expect(bloqueado.status).toBe(429);
    for (let i = 0; i < 11; i += 1) {
      const r = await middleware(pelaBorda('/api/analise-ativos/meus-reportes', 'GET', ip));
      expect(r.status).not.toBe(429);
    }
  });
});
