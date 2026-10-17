import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import type { PrismaClient } from '@prisma/client';
import {
  executarAlertasSalvos,
  type DependenciasAlertas,
  type RelatorioAlertasSalvos,
} from '../executarAlertasSalvos';
import {
  textoAvisoCriterios,
  textoAvisoFiiTrimestral,
  textoAvisoProvento,
  textoAvisoResultado,
  textoAvisoResumo,
} from '../textosDoAviso';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { encontrarPalavrasProibidasBlocoD } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import type { NotificacaoCriada } from '@/services/push/enviarPush';

// ---------------------------------------------------------------------------
// Banco falso em memória (só o que o job usa)
// ---------------------------------------------------------------------------

const AGORA = new Date('2026-10-16T11:10:00.000Z');
const ha = (dias: number) => new Date(AGORA.getTime() - dias * 86_400_000);

interface Item {
  userId: string;
  listaId: string;
  symbol: string;
  classe: string;
  createdAt: Date;
}
interface Lista {
  alertaResultado: boolean;
  alertaProvento: boolean;
  alertaCriterios: boolean;
}
interface Envio {
  userId: string;
  tipo: string;
  symbol: string;
  chave: string;
  notificationId: string | null;
  createdAt: Date;
}
interface Notif {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}

let db: {
  quadro: Array<{ symbol: string; classe: string; cnpj: string }>;
  marcos: Map<string, { symbol: string; tipo: string; marco: unknown }>;
  evals: Array<Record<string, unknown>>;
  fiiTri: Array<{ cnpj: string; refQuarter: Date; fetchedAt: Date }>;
  listas: Map<string, Lista>;
  itens: Item[];
  acesso: Set<string>;
  eventos: Array<Record<string, unknown>>;
  dividendos: Array<Record<string, unknown>>;
  posicoes: Array<{ userId: string; symbol: string }>;
  envios: Envio[];
  notifs: Notif[];
  falharEscrita: boolean;
  aparelhos: Set<string>;
  pushDesligado: Set<string>;
};

function novoDb(): typeof db {
  return {
    quadro: [
      { symbol: 'WEGE3', classe: 'acao', cnpj: 'C-WEG' },
      { symbol: 'PETR3', classe: 'acao', cnpj: 'C-PETR' },
      { symbol: 'PETR4', classe: 'acao', cnpj: 'C-PETR' },
      { symbol: 'TAEE11', classe: 'acao', cnpj: 'C-TAEE' },
      { symbol: 'HGLG11', classe: 'fii', cnpj: 'C-HGLG' },
    ],
    marcos: new Map(),
    evals: [],
    fiiTri: [],
    listas: new Map(),
    itens: [],
    acesso: new Set(['u1', 'u2']),
    eventos: [],
    dividendos: [],
    posicoes: [],
    envios: [],
    notifs: [],
    falharEscrita: false,
    aparelhos: new Set(['u1', 'u2']),
    pushDesligado: new Set(),
  };
}

type Arg = { where?: Record<string, unknown>; data?: unknown; skipDuplicates?: boolean };

function fakePrisma() {
  const em = (v: unknown) => (v as { in?: string[] } | undefined)?.in;
  const p = {
    analiseQuadroLinha: { findMany: vi.fn(async () => db.quadro) },
    analiseAlertaMarco: {
      findMany: vi.fn(async () => [...db.marcos.values()]),
      upsert: vi.fn(
        async (a: {
          where: { symbol_tipo: { symbol: string; tipo: string } };
          create: { symbol: string; tipo: string; marco: unknown };
        }) => {
          const k = `${a.where.symbol_tipo.symbol}|${a.where.symbol_tipo.tipo}`;
          db.marcos.set(k, { ...a.create });
          return a.create;
        },
      ),
    },
    criteriaEval: { findMany: vi.fn(async () => db.evals) },
    fiiQuarterly: { findMany: vi.fn(async () => db.fiiTri) },
    analiseListaItem: {
      findMany: vi.fn(async () =>
        db.itens
          .map((i) => ({ ...i, lista: db.listas.get(i.listaId)! }))
          .filter(
            (i) => i.lista.alertaResultado || i.lista.alertaProvento || i.lista.alertaCriterios,
          ),
      ),
    },
    user: {
      findMany: vi.fn(async (a: Arg) =>
        (em(a.where?.id) ?? []).filter((id) => db.acesso.has(id)).map((id) => ({ id })),
      ),
    },
    assetEvento: { findMany: vi.fn(async () => db.eventos) },
    assetDividendHistory: {
      findMany: vi.fn(async (a: Arg) => {
        const symbols = em(a.where?.symbol) ?? [];
        return db.dividendos.filter((d) => symbols.includes(d.symbol as string));
      }),
    },
    portfolio: {
      findMany: vi.fn(async (a: Arg) => {
        const users = em(a.where?.userId) ?? [];
        return db.posicoes
          .filter((x) => users.includes(x.userId))
          .map((x) => ({ userId: x.userId, asset: { symbol: x.symbol } }));
      }),
    },
    analiseAlertaEnvio: {
      findMany: vi.fn(async (a: Arg) => {
        const w = a.where ?? {};
        const users = em(w.userId);
        const chaves = em(w.chave);
        return db.envios.filter(
          (e) =>
            (!users || users.includes(e.userId)) &&
            (!chaves || chaves.includes(e.chave)) &&
            (typeof w.userId !== 'string' || e.userId === w.userId) &&
            (w.notificationId === undefined || e.notificationId === w.notificationId) &&
            (!w.tipo || e.tipo !== (w.tipo as { not: string }).not),
        );
      }),
      createMany: vi.fn(
        async (a: { data: Omit<Envio, 'createdAt'>[]; skipDuplicates?: boolean }) => {
          if (db.falharEscrita) throw new Error('banco fora');
          let n = 0;
          for (const e of a.data) {
            const dup = db.envios.some(
              (x) => x.userId === e.userId && x.tipo === e.tipo && x.chave === e.chave,
            );
            if (dup) {
              if (!a.skipDuplicates) throw new Error('unique violation');
              continue;
            }
            db.envios.push({ ...e, createdAt: AGORA });
            n++;
          }
          return { count: n };
        },
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    notification: {
      createMany: vi.fn(async (a: { data: Omit<Notif, 'readAt' | 'createdAt'>[] }) => {
        if (db.falharEscrita) throw new Error('banco fora');
        for (const n of a.data) db.notifs.push({ ...n, readAt: null, createdAt: AGORA });
        return { count: a.data.length };
      }),
      updateMany: vi.fn(async (a: { where: { id: string }; data: Partial<Notif> }) => {
        const n = db.notifs.find((x) => x.id === a.where.id);
        if (n) Object.assign(n, a.data);
        return { count: n ? 1 : 0 };
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    pushSubscription: {
      findMany: vi.fn(async (a: Arg) =>
        (em(a.where?.userId) ?? [])
          .filter((u) => db.aparelhos.has(u))
          .map((userId) => ({ userId })),
      ),
    },
    pushPreferencia: {
      findMany: vi.fn(async (a: Arg) =>
        (em(a.where?.userId) ?? [])
          .filter((u) => db.pushDesligado.has(u))
          .map((userId) => ({ userId })),
      ),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return p;
}

let prisma: ReturnType<typeof fakePrisma>;
let alertas: AlertaJob[];
let pushes: string[];
let seq: number;

const deps = (): DependenciasAlertas => ({
  agora: () => AGORA,
  novoId: () => `n${++seq}`,
  enviarPush: async (n: NotificacaoCriada) => {
    await new Promise((r) => setTimeout(r, 5));
    pushes.push(n.title);
  },
});

function ctx(over: Partial<JobContexto> = {}): JobContexto {
  return {
    prisma: prisma as unknown as PrismaClient,
    prazo: Number.MAX_SAFE_INTEGER,
    restanteMs: () => 1e9,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: () => undefined,
    params: SCORING_PARAMS_V1,
    paramsVersion: 2,
    hoje: '2026-10-16',
    origem: 'script',
    aplicar: true,
    ...over,
  };
}

const rodar = async (over: Partial<JobContexto> = {}) => {
  const r = await executarAlertasSalvos(ctx(over), deps());
  return { ...r, rel: r.detalhes as unknown as RelatorioAlertasSalvos };
};

const lista = (id: string, al: Partial<Lista> = {}) =>
  db.listas.set(id, { alertaResultado: true, alertaProvento: true, alertaCriterios: false, ...al });
const salvar = (userId: string, listaId: string, symbol: string, createdAt = ha(30)) =>
  db.itens.push({
    userId,
    listaId,
    symbol,
    classe: symbol === 'HGLG11' ? 'fii' : 'acao',
    createdAt,
  });
const provento = (symbol: string, dataCom: string, over: Record<string, unknown> = {}) =>
  db.dividendos.push({
    id: `d-${symbol}-${dataCom}`,
    symbol,
    date: new Date('2026-10-30T00:00:00Z'),
    dataCom: new Date(`${dataCom}T00:00:00Z`),
    tipo: 'DIVIDENDO',
    valorUnitario: 1.1,
    source: 'BRAPI',
    createdAt: ha(0.2),
    ...over,
  });
const resultado = (cnpj: string, id = `e-${cnpj}`) =>
  db.eventos.push({
    id,
    cnpj,
    tipo: 'resultado',
    periodoRef: '2026-3T',
    data: new Date('2026-10-15T00:00:00Z'),
    estimado: false,
    fetchedAt: ha(0.4),
  });

beforeEach(() => {
  db = novoDb();
  prisma = fakePrisma();
  alertas = [];
  pushes = [];
  seq = 0;
  vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
  vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'beta');
  vi.stubEnv('ANALISE_ATIVOS_SALVOS_HABILITADO', 'true');
  vi.stubEnv('ANALISE_ATIVOS_ALERTAS_HABILITADO', 'true');
  vi.stubEnv('WEB_PUSH_HABILITADO', 'true');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'pub');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
});

afterEach(() => vi.unstubAllEnvs());

describe('executarAlertasSalvos', () => {
  it('flag desligada (ou ALERTAS sem SALVOS) = pulado, sem ler o banco', async () => {
    vi.stubEnv('ANALISE_ATIVOS_ALERTAS_HABILITADO', 'false');
    expect((await rodar()).pulado).toMatch(/desligados/);
    vi.stubEnv('ANALISE_ATIVOS_ALERTAS_HABILITADO', 'true');
    vi.stubEnv('ANALISE_ATIVOS_SALVOS_HABILITADO', 'false');
    expect((await rodar()).pulado).toMatch(/desligados/);
    expect(prisma.analiseQuadroLinha.findMany).not.toHaveBeenCalled();
  });

  it('resultado por companhia: PETR3+PETR4 salvos = 1 aviso "PETR3/PETR4: …", link do 1º', async () => {
    lista('L1');
    salvar('u1', 'L1', 'PETR4');
    salvar('u1', 'L1', 'PETR3');
    resultado('C-PETR');
    const { rel } = await rodar();
    expect(rel.avisos).toBe(1);
    expect(db.notifs).toHaveLength(1);
    const n = db.notifs[0];
    expect(n.title).toBe('PETR3/PETR4: resultado do 3T26');
    expect(n.title).not.toMatch(/R\$/);
    expect(n.type).toBe('analise_ativos_salvos_alerta');
    expect(n.metadata).toEqual({
      href: '/analise-ativos/PETR3',
      symbol: 'PETR3/PETR4',
      tipo: 'resultado',
      classe: 'acao',
      eventoId: 'evento:e-C-PETR',
    });
    expect(db.envios).toEqual([
      expect.objectContaining({ userId: 'u1', tipo: 'resultado', chave: 'evento:e-C-PETR' }),
    ]);
  });

  it('2 rodadas no mesmo dia não duplicam (e o insert usa skipDuplicates)', async () => {
    lista('L1');
    salvar('u1', 'L1', 'WEGE3');
    salvar('u1', 'L1', 'TAEE11');
    resultado('C-WEG');
    provento('TAEE11', '2026-10-20');
    await rodar();
    expect(db.notifs).toHaveLength(2);
    const segunda = await rodar();
    expect(segunda.rel.avisos).toBe(0);
    expect(db.notifs).toHaveLength(2);
    expect(db.envios).toHaveLength(2);
    for (const c of prisma.analiseAlertaEnvio.createMany.mock.calls) {
      expect(c[0].skipDuplicates).toBe(true);
    }
  });

  it('mesmo ativo em 2 listas = 1 aviso (união das preferências)', async () => {
    lista('L1', { alertaProvento: false });
    lista('L2', { alertaResultado: false });
    salvar('u1', 'L1', 'TAEE11');
    salvar('u1', 'L2', 'TAEE11');
    provento('TAEE11', '2026-10-20');
    resultado('C-TAEE');
    await rodar();
    expect(db.notifs.map((n) => n.title).sort()).toEqual([
      'TAEE11: provento anunciado',
      'TAEE11: resultado do 3T26',
    ]);
    expect(db.notifs.find((n) => n.title.includes('provento'))?.message).toBe(
      'Dividendos de R$ 1,10 por unit · data-com 20/10 · pagamento 30/10.',
    );
  });

  it('preferência por lista respeitada: provento desligado não avisa', async () => {
    lista('L1', { alertaProvento: false });
    salvar('u1', 'L1', 'TAEE11');
    provento('TAEE11', '2026-10-20');
    const { rel } = await rodar();
    expect(rel.avisos).toBe(0);
    expect(db.notifs).toEqual([]);
  });

  it('ativo com posição na Carteira não recebe provento (a Agenda já avisa)', async () => {
    lista('L1');
    salvar('u1', 'L1', 'TAEE11');
    salvar('u2', 'L1', 'TAEE11');
    db.posicoes.push({ userId: 'u1', symbol: 'TAEE11' });
    provento('TAEE11', '2026-10-20');
    await rodar();
    expect(db.notifs.map((n) => n.userId)).toEqual(['u2']);
  });

  it('usuário sem acesso à área é pulado', async () => {
    lista('L1');
    salvar('u1', 'L1', 'WEGE3');
    salvar('u9', 'L1', 'WEGE3');
    resultado('C-WEG');
    const { rel } = await rodar();
    expect(rel.pulados).toBe(1);
    expect(rel.usuarios).toBe(1);
    expect(db.notifs.map((n) => n.userId)).toEqual(['u1']);
  });

  it('mais de 5 avisos no dia = 1 resumo, com todos os envios registrados', async () => {
    db.quadro.push(
      ...['AAAA3', 'BBBB3', 'CCCC3', 'DDDD3', 'EEEE3'].map((s) => ({
        symbol: s,
        classe: 'acao',
        cnpj: `C-${s}`,
      })),
    );
    lista('L1');
    for (const s of ['AAAA3', 'BBBB3', 'CCCC3', 'DDDD3', 'EEEE3', 'WEGE3']) {
      salvar('u1', 'L1', s);
      resultado(db.quadro.find((q) => q.symbol === s)!.cnpj);
    }
    const { rel } = await rodar();
    expect(rel.resumos).toBe(1);
    expect(rel.avisos).toBe(0);
    expect(db.notifs).toHaveLength(1);
    expect(db.notifs[0]).toMatchObject({
      title: 'Novidades em 6 ativos dos seus Salvos',
      metadata: expect.objectContaining({
        tipo: 'resumo',
        classe: null,
        symbol: '*',
        href: '/analise-ativos/salvos?aba=alertas',
        eventoId: 'resumo:2026-10-16',
      }),
    });
    expect(db.envios).toHaveLength(7);
    expect(new Set(db.envios.map((e) => e.notificationId))).toEqual(new Set([db.notifs[0].id]));
    expect(pushes).toEqual(['Novidades em 6 ativos dos seus Salvos']);
  });

  it('com resumo já enviado hoje, novidade da 2ª rodada entra nele (sem novo aviso)', async () => {
    db.quadro.push(
      ...['AAAA3', 'BBBB3', 'CCCC3', 'DDDD3', 'EEEE3'].map((s) => ({
        symbol: s,
        classe: 'acao',
        cnpj: `C-${s}`,
      })),
    );
    lista('L1');
    for (const s of ['AAAA3', 'BBBB3', 'CCCC3', 'DDDD3', 'EEEE3', 'WEGE3']) {
      salvar('u1', 'L1', s);
      resultado(db.quadro.find((q) => q.symbol === s)!.cnpj);
    }
    await rodar();
    salvar('u1', 'L1', 'TAEE11');
    provento('TAEE11', '2026-10-20');
    pushes = [];
    await rodar();
    expect(db.notifs).toHaveLength(1);
    expect(db.notifs[0].title).toBe('Novidades em 7 ativos dos seus Salvos');
    expect(pushes).toEqual([]);
  });

  it('critérios: 1ª vez silenciosa; 4 → 5 avisa quem ligou; mudança anterior ao item não', async () => {
    lista('L1', { alertaCriterios: true });
    lista('L2', { alertaCriterios: false });
    salvar('u1', 'L1', 'WEGE3');
    salvar('u2', 'L2', 'WEGE3');
    const ev = (atendidos: number, paramsVersion = 2) => ({
      symbol: 'WEGE3',
      atendidos,
      aplicaveis: 6,
      anoInicio: 2021,
      anoFim: 2025,
      paramsVersion,
      semDado: false,
    });
    db.evals = [ev(4)];
    await rodar();
    expect(db.notifs).toEqual([]);
    expect(db.marcos.get('WEGE3|criterios:5')?.marco).toMatchObject({ atendidos: 4 });

    db.evals = [ev(5)];
    await rodar();
    expect(db.notifs).toHaveLength(1);
    expect(db.notifs[0]).toMatchObject({
      userId: 'u1',
      title: 'WEGE3: a contagem de critérios mudou',
      message: 'De 4 de 6 para 5 de 6 na janela de 5 anos (2021–2025).',
    });

    // troca de versão de parâmetros: silenciosa
    db.evals = [ev(3, 3)];
    await rodar();
    expect(db.notifs).toHaveLength(1);

    // item salvo DEPOIS da mudança (tirou e salvou de novo): não avisa
    db.itens = [];
    salvar('u1', 'L1', 'WEGE3', new Date(AGORA.getTime() + 60_000));
    db.evals = [ev(4, 3)];
    await rodar();
    expect(db.notifs).toHaveLength(1);
  });

  it('FII: informe trimestral novo contra o marco', async () => {
    lista('L1');
    salvar('u1', 'L1', 'HGLG11');
    db.fiiTri = [
      { cnpj: 'C-HGLG', refQuarter: new Date('2026-06-30T00:00:00Z'), fetchedAt: ha(80) },
    ];
    await rodar();
    expect(db.notifs).toEqual([]);
    db.fiiTri.push({
      cnpj: 'C-HGLG',
      refQuarter: new Date('2026-09-30T00:00:00Z'),
      fetchedAt: ha(0.3),
    });
    await rodar();
    expect(db.notifs).toHaveLength(1);
    expect(db.notifs[0]).toMatchObject({
      title: 'HGLG11: informe trimestral publicado na CVM',
      metadata: expect.objectContaining({ classe: 'fii', tipo: 'resultado' }),
    });
  });

  it('push esperado antes de terminar (allSettled), mesmo com falha de um envio', async () => {
    lista('L1');
    salvar('u1', 'L1', 'WEGE3');
    salvar('u2', 'L1', 'WEGE3');
    resultado('C-WEG');
    const d = deps();
    let chamadas = 0;
    const r = await executarAlertasSalvos(ctx(), {
      ...d,
      enviarPush: async (n) => {
        chamadas++;
        await new Promise((res) => setTimeout(res, 10));
        if (n.userId === 'u2') throw new Error('push fora');
        pushes.push(n.userId);
      },
    });
    expect(chamadas).toBe(2);
    expect(pushes).toEqual(['u1']);
    expect((r.detalhes as unknown as RelatorioAlertasSalvos).push).toEqual({
      enviados: 1,
      falhas: 1,
      semAparelho: 0,
    });
  });

  it("push só para quem tem aparelho e não desligou 'analise'; sino e aba sempre", async () => {
    lista('L1');
    for (const u of ['u1', 'u2']) salvar(u, 'L1', 'WEGE3');
    db.acesso.add('u3');
    salvar('u3', 'L1', 'WEGE3');
    db.aparelhos = new Set(['u1', 'u2']);
    db.pushDesligado = new Set(['u2']);
    resultado('C-WEG');
    const { rel } = await rodar();
    expect(db.notifs.map((n) => n.userId).sort()).toEqual(['u1', 'u2', 'u3']);
    expect(pushes).toEqual(['WEGE3: resultado do 3T26']);
    expect(rel.push).toEqual({ enviados: 1, falhas: 0, semAparelho: 2 });
  });

  it('push desligado no servidor (WEB_PUSH_HABILITADO): nenhuma chamada', async () => {
    vi.stubEnv('WEB_PUSH_HABILITADO', 'false');
    lista('L1');
    salvar('u1', 'L1', 'WEGE3');
    resultado('C-WEG');
    await rodar();
    expect(db.notifs).toHaveLength(1);
    expect(pushes).toEqual([]);
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('--sem-aplicar só calcula: nada gravado, sem push, sem limpeza', async () => {
    lista('L1', { alertaCriterios: true });
    salvar('u1', 'L1', 'WEGE3');
    resultado('C-WEG');
    db.evals = [
      {
        symbol: 'WEGE3',
        atendidos: 4,
        aplicaveis: 6,
        anoInicio: 2021,
        anoFim: 2025,
        paramsVersion: 2,
        semDado: false,
      },
    ];
    const { rel } = await rodar({ aplicar: false });
    expect(rel.avisos).toBe(1);
    expect(db.notifs).toEqual([]);
    expect(db.envios).toEqual([]);
    expect(db.marcos.size).toBe(0);
    expect(pushes).toEqual([]);
    expect(prisma.analiseAlertaEnvio.deleteMany).not.toHaveBeenCalled();
  });

  it('limpeza de 90 dias (envios e Notification do type)', async () => {
    await rodar();
    const corte = (c: unknown) =>
      (c as { where: { createdAt: { lt: Date } } }).where.createdAt.lt.getTime();
    const esperado = AGORA.getTime() - 90 * 86_400_000;
    expect(corte(prisma.analiseAlertaEnvio.deleteMany.mock.calls[0][0])).toBe(esperado);
    const n = prisma.notification.deleteMany.mock.calls[0][0] as {
      where: { type: string; createdAt: { lt: Date } };
    };
    expect(n.where.type).toBe('analise_ativos_salvos_alerta');
    expect(corte(n)).toBe(esperado);
  });

  it('prazo estourado → parcial, sem gravar marcos (os fatos voltam na próxima)', async () => {
    lista('L1', { alertaCriterios: true });
    salvar('u1', 'L1', 'WEGE3');
    resultado('C-WEG');
    db.evals = [
      {
        symbol: 'WEGE3',
        atendidos: 4,
        aplicaveis: 6,
        anoInicio: 2021,
        anoFim: 2025,
        paramsVersion: 2,
        semDado: false,
      },
    ];
    const r = await rodar({ estourouPrazo: () => true });
    expect(r.parcial).toBe(true);
    expect(db.notifs).toEqual([]);
    expect(db.marcos.size).toBe(0);
    expect(alertas.map((a) => a.codigo)).toContain('alertas_salvos_prazo');
  });

  it('erro de escrita num lote: alerta, conta o erro e não grava marcos', async () => {
    lista('L1');
    salvar('u1', 'L1', 'WEGE3');
    resultado('C-WEG');
    db.evals = [
      {
        symbol: 'WEGE3',
        atendidos: 4,
        aplicaveis: 6,
        anoInicio: 2021,
        anoFim: 2025,
        paramsVersion: 2,
        semDado: false,
      },
    ];
    db.falharEscrita = true;
    const { rel } = await rodar();
    expect(rel.erros).toBe(1);
    expect(db.marcos.size).toBe(0);
    expect(alertas.map((a) => a.codigo)).toContain('alertas_salvos_escrita');
  });
});

describe('textosDoAviso — compliance', () => {
  it('nenhum título leva R$ nem palavra proibida; mensagens sem palavra proibida', () => {
    const textos = [
      textoAvisoResultado(['PETR3', 'PETR4'], {
        tipo: 'resultado',
        origem: 'cvm_ipe',
        chave: 'evento:e',
        cnpj: 'c',
        tickers: ['PETR3', 'PETR4'],
        periodoRef: '2026-FY',
        data: '2026-10-15',
      }),
      textoAvisoFiiTrimestral(['HGLG11'], {
        tipo: 'resultado',
        origem: 'fii_trimestral',
        chave: 'fii_tri:c:2026-09-30',
        cnpj: 'c',
        tickers: ['HGLG11'],
        refQuarter: '2026-09-30',
        publicadoEm: '2026-10-15',
      }),
      ...(['dividendo', 'jcp', 'rendimento', 'outro'] as const).map((tipoProvento) =>
        textoAvisoProvento(
          {
            tipo: 'provento',
            chave: 'k',
            symbol: 'HGLG11',
            tipoProvento,
            valor: 1.1,
            dataCom: '2026-10-20',
            pagamento: null,
          },
          'fii',
        ),
      ),
      textoAvisoCriterios({
        tipo: 'criterios',
        chave: 'k',
        symbol: 'WEGE3',
        de: { atendidos: 5, aplicaveis: 6 },
        para: { atendidos: 4, aplicaveis: 6 },
        anoInicio: 2021,
        anoFim: 2025,
        mudouEm: AGORA.toISOString(),
      }),
      textoAvisoResumo(7),
    ];
    for (const { titulo, mensagem } of textos) {
      expect(titulo).not.toMatch(/R\$/);
      for (const s of [titulo, mensagem]) {
        expect(encontrarProibidasV2(s)).toEqual([]);
        expect(encontrarPalavrasProibidasBlocoD(s)).toEqual([]);
      }
    }
    expect(textos[0].titulo).toBe('PETR3/PETR4: resultado anual de 2026');
    expect(textos[1].mensagem).toBe(
      'O fundo entregou o informe do 3º trimestre de 2026 em 15/10/2026. Os números entram na Análise de Ativos depois do processamento diário.',
    );
    expect(textos[2].mensagem).toBe(
      'Rendimento de R$ 1,10 por cota · data-com 20/10 · pagamento a definir.',
    );
  });
});
