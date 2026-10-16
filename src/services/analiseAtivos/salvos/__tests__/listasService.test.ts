import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ ref: null as null | import('./fakeSalvosPrisma').FakeSalvos }));

vi.mock('@/lib/prisma', async () => {
  const { criarFakeSalvos } = await import('./fakeSalvosPrisma');
  fake.ref = criarFakeSalvos();
  return { prisma: fake.ref.prisma, default: fake.ref.prisma };
});

import { ApiError } from '@/utils/apiErrorHandler';
import {
  MAX_ITENS_POR_LISTA,
  MAX_LISTAS_POR_USUARIO,
  NOME_LISTA_PADRAO,
} from '@/services/analiseAtivos/salvos/contrato';
import {
  adicionarItem,
  apagarLista,
  atualizarLista,
  chaveTravaSalvos,
  criarLista,
  definirSalvo,
  indiceSalvos,
  listarListas,
  removerItem,
} from '@/services/analiseAtivos/salvos/listasService';
import {
  apagarSalvosDoUsuario,
  paraExportacao,
} from '@/services/analiseAtivos/salvos/privacidadeSalvos';

const U = 'user-1';
const OUTRO = 'user-2';
const WEGE3 = { symbol: 'WEGE3', classe: 'acao' as const };
const HGLG11 = { symbol: 'HGLG11', classe: 'fii' as const };

async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (e) {
    if (e instanceof ApiError) return e.statusCode;
    throw e;
  }
}

/** Insere itens direto na tabela falsa (para chegar aos limites sem 500 chamadas). */
function semear(listaId: string, userId: string, n: number, prefixo = 'T') {
  for (let i = 0; i < n; i += 1) {
    fake.ref!.tabelas.analiseListaItem.push({
      id: `i-${listaId}-${i}`,
      listaId,
      userId,
      symbol: `${prefixo}${String(i).padStart(3, '0')}3`,
      classe: 'acao',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  }
}

beforeEach(() => fake.ref!.limpar());

describe('sentinela padrao (PUT /salvos/[ticker])', () => {
  it("0 listas: cria 'Salvos' com o ativo (listaCriada) e usa a trava do usuário", async () => {
    const r = await definirSalvo(U, WEGE3, ['padrao']);
    expect(r.salvo).toBe(true);
    expect(r.listaCriada?.nome).toBe(NOME_LISTA_PADRAO);
    expect(r.listaIds).toEqual([r.listaCriada!.id]);
    expect(fake.ref!.travas).toContain(chaveTravaSalvos(U));
    const listas = await listarListas(U);
    expect(listas).toHaveLength(1);
    expect(listas[0]).toMatchObject({
      nome: 'Salvos',
      contagem: { acao: 1, fii: 0 },
      alertas: { resultado: true, provento: true, criterios: false },
    });
  });

  it('1 lista: usa a existente (sem criar outra)', async () => {
    const l = await criarLista(U, { nome: 'Dividendos' }, true);
    const r = await definirSalvo(U, WEGE3, ['padrao']);
    expect(r.listaIds).toEqual([l.id]);
    expect(r.listaCriada).toBeUndefined();
    expect(await listarListas(U)).toHaveLength(1);
  });

  it('2+ listas: 400 (o cliente abre "Salvar em…")', async () => {
    await criarLista(U, { nome: 'A' }, true);
    await criarLista(U, { nome: 'B' }, true);
    expect(await status(definirSalvo(U, WEGE3, ['padrao']))).toBe(400);
  });

  it("dois PUT concorrentes com 0 listas criam UMA 'Salvos'", async () => {
    const [a, b] = await Promise.all([
      definirSalvo(U, WEGE3, ['padrao']),
      definirSalvo(U, HGLG11, ['padrao']),
    ]);
    const listas = await listarListas(U);
    expect(listas).toHaveLength(1);
    expect(a.listaIds).toEqual(b.listaIds);
    expect(listas[0].contagem).toEqual({ acao: 1, fii: 1 });
  });

  it('[] remove de todas; conjunto explícito alterna; lista de outro usuário → 404', async () => {
    const a = await criarLista(U, { nome: 'A' }, true);
    const b = await criarLista(U, { nome: 'B' }, true);
    const alheia = await criarLista(OUTRO, { nome: 'C' }, true);
    expect((await definirSalvo(U, WEGE3, [b.id, a.id])).listaIds).toEqual([a.id, b.id]);
    expect((await indiceSalvos(U)).porTicker).toEqual({ WEGE3: [a.id, b.id] });
    expect((await definirSalvo(U, WEGE3, [b.id])).listaIds).toEqual([b.id]);
    expect(await status(definirSalvo(U, WEGE3, [alheia.id]))).toBe(404);
    const vazio = await definirSalvo(U, WEGE3, []);
    expect(vazio).toEqual({ ticker: 'WEGE3', listaIds: [], salvo: false });
    expect((await indiceSalvos(U)).porTicker).toEqual({});
  });
});

describe('limites (409)', () => {
  it('21ª lista', async () => {
    for (let i = 0; i < MAX_LISTAS_POR_USUARIO; i += 1) {
      await criarLista(U, { nome: `Lista ${i}` }, true);
    }
    expect(await status(criarLista(U, { nome: 'Mais uma' }, true))).toBe(409);
  });

  it('nome repetido (sem diferenciar maiúsculas e acentos)', async () => {
    await criarLista(U, { nome: 'Ações boas' }, true);
    expect(await status(criarLista(U, { nome: 'acoes BOAS' }, true))).toBe(409);
    // outro usuário pode ter o mesmo nome
    expect(await status(criarLista(OUTRO, { nome: 'Ações boas' }, true))).toBe(200);
  });

  it('201º item da lista', async () => {
    const l = await criarLista(U, { nome: 'Cheia' }, true);
    semear(l.id, U, MAX_ITENS_POR_LISTA);
    expect(await status(adicionarItem(U, l.id, WEGE3))).toBe(409);
    expect(await status(definirSalvo(U, WEGE3, [l.id]))).toBe(409);
  });

  it('501º item do usuário (somando as listas)', async () => {
    const listas = [];
    for (let i = 0; i < 3; i += 1) listas.push(await criarLista(U, { nome: `L${i}` }, true));
    semear(listas[0].id, U, 200, 'A');
    semear(listas[1].id, U, 200, 'B');
    semear(listas[2].id, U, 100, 'C');
    const nova = await criarLista(U, { nome: 'Nova' }, true);
    expect(await status(adicionarItem(U, nova.id, WEGE3))).toBe(409);
    expect(await status(criarLista(U, { nome: 'Com item', item: WEGE3 }, true))).toBe(409);
  });
});

describe('itens e isolamento', () => {
  it('adicionar é idempotente (201 → 200) e remover também', async () => {
    const l = await criarLista(U, { nome: 'A' }, true);
    const r1 = await adicionarItem(U, l.id, WEGE3);
    const r2 = await adicionarItem(U, l.id, WEGE3);
    expect([r1.criado, r2.criado]).toEqual([true, false]);
    expect(r2.item.adicionadoEm).toBe(r1.item.adicionadoEm);
    await removerItem(U, l.id, 'WEGE3');
    await removerItem(U, l.id, 'WEGE3');
    expect((await listarListas(U))[0].contagem.acao).toBe(0);
  });

  it('outro usuário não lê, não altera e não apaga a lista', async () => {
    const l = await criarLista(U, { nome: 'Minha', item: WEGE3 }, true);
    expect(await listarListas(OUTRO)).toEqual([]);
    expect((await indiceSalvos(OUTRO)).porTicker).toEqual({});
    expect(await status(adicionarItem(OUTRO, l.id, HGLG11))).toBe(404);
    expect(await status(removerItem(OUTRO, l.id, 'WEGE3'))).toBe(404);
    expect(await status(atualizarLista(OUTRO, l.id, { nome: 'X' }))).toBe(404);
    expect(await status(apagarLista(OUTRO, l.id))).toBe(404);
    expect((await listarListas(U))[0]).toMatchObject({ nome: 'Minha', contagem: { acao: 1 } });
  });

  it('alertas pedidos sem o recurso alertas são ignorados na criação', async () => {
    const sem = await criarLista(U, { nome: 'A', alertas: { provento: false } }, false);
    const com = await criarLista(U, { nome: 'B', alertas: { provento: false } }, true);
    expect(sem.alertas.provento).toBe(true);
    expect(com.alertas.provento).toBe(false);
  });

  it('renomear para um nome que já existe → 409; o próprio nome em outra caixa passa', async () => {
    const a = await criarLista(U, { nome: 'A' }, true);
    await criarLista(U, { nome: 'B' }, true);
    expect(await status(atualizarLista(U, a.id, { nome: 'b' }))).toBe(409);
    expect((await atualizarLista(U, a.id, { nome: 'a' })).nome).toBe('a');
  });
});

describe('LGPD', () => {
  it('export traz listas com itens; exclusão apaga tudo do bloco 1 e as Notification dos avisos', async () => {
    await criarLista(U, { nome: 'Minha', item: WEGE3 }, true);
    await criarLista(OUTRO, { nome: 'Dele', item: WEGE3 }, true);
    const t = fake.ref!.tabelas;
    const quando = new Date('2026-10-14T00:00:00Z');
    t.analiseFiltroSalvo.push({
      id: 'f1',
      userId: U,
      nome: 'F',
      classe: 'acao',
      estado: {},
      createdAt: quando,
      updatedAt: quando,
      ultimoUsoEm: null,
    });
    t.analiseComparacao.push({
      id: 'c1',
      userId: U,
      nome: 'C',
      classe: 'acao',
      tickers: ['WEGE3'],
      janela: 5,
      tipoFii: null,
      createdAt: quando,
      updatedAt: quando,
    });
    t.analiseAlertaEnvio.push({
      id: 'e1',
      userId: U,
      tipo: 'provento',
      symbol: 'WEGE3',
      chave: 'k',
      createdAt: new Date('2026-10-15T00:00:00Z'),
    });
    t.notification.push(
      { id: 'n1', userId: U, type: 'analise_ativos_salvos_alerta' },
      { id: 'n2', userId: U, type: 'consultant_invite' },
    );

    const exp = await paraExportacao(U, new Date('2026-10-16T12:00:00Z'));
    expect(exp.listas).toHaveLength(1);
    expect(exp.listas[0].itens.map((i) => i.ticker)).toEqual(['WEGE3']);
    expect(exp.alertasEnviados).toHaveLength(1);

    const r = await apagarSalvosDoUsuario(U);
    expect(r).toMatchObject({ listas: 1, itens: 1, notificacoes: 1, envios: 1 });
    expect(t.analiseLista.map((l) => l.userId)).toEqual([OUTRO]);
    expect(t.analiseListaItem.map((i) => i.userId)).toEqual([OUTRO]);
    expect(t.analiseFiltroSalvo).toEqual([]);
    expect(t.analiseComparacao).toEqual([]);
    expect(t.notification.map((n) => n.id)).toEqual(['n2']);
  });
});
