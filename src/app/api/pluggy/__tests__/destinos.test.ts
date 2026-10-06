import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockAuth }));

const mockPrisma = vi.hoisted(() => ({
  bankConnection: { findFirst: vi.fn() },
  bankInvestment: { findMany: vi.fn() },
  bankLoan: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

const mockServico = vi.hoisted(() => ({
  listarDestinosImportados: vi.fn(),
  aplicarDestinos: vi.fn(),
  classificarDestinos: vi.fn(),
  contarParaRevisar: vi.fn(),
  destinoAtualPorPortfolio: vi.fn(),
}));
vi.mock('@/services/pluggy/destinosImportacao', () => mockServico);

const mockImportar = vi.hoisted(() => ({ importarPendentes: vi.fn() }));
vi.mock('@/services/pluggy/importarCarteira', () => mockImportar);

const mockRecordChange = vi.hoisted(() => vi.fn());
vi.mock('@/services/changeHistory/recordChange', () => ({ recordChange: mockRecordChange }));

const mockInvalidateCaixa = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/caixaParaInvestir', () => ({
  invalidateCaixaCaches: mockInvalidateCaixa,
}));
const mockInvalidarContexto = vi.hoisted(() => vi.fn());
vi.mock('@/services/assistente/contexto', () => ({
  invalidarContextoUsuario: mockInvalidarContexto,
}));

import { GET as listarDestinos, POST as salvarDestinos } from '../carteira/destinos/route';
import { GET as carteira } from '../carteira/route';
import { POST as importar } from '../carteira/importar/route';
import { ACAO_DESTINO_IMPORTACAO } from '@/lib/pluggyDestinos';
import type { MoverSnapshotEstado } from '@/lib/carteiraMover';

const CONN = '7d3c1e2a-0b1c-4d5e-8f90-123456789abc';
const BI1 = '11111111-1111-4111-8111-111111111111';
const BI2 = '22222222-2222-4222-8222-222222222222';
const BI_ALHEIO = '99999999-9999-4999-8999-999999999999';

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

const proprio = {
  payload: { id: 'user-1', email: 'u@x', role: 'user' },
  targetUserId: 'user-1',
  actingClient: null,
};
const consultor = {
  payload: { id: 'cons-1', email: 'c@x', role: 'consultant' },
  targetUserId: 'user-1',
  actingClient: { id: 'user-1', name: 'Cliente', email: 'u@x' },
};

const antes: MoverSnapshotEstado = { categoriaOverride: null, tipoFii: 'tijolo' };
const depois: MoverSnapshotEstado = {
  categoriaOverride: 'fimFia',
  tipoFii: 'tijolo',
  tipoFundo: 'fiagro',
};
const registro = (id: string, bankInvestmentId: string, symbol: string) => ({
  tipo: 'posicao' as const,
  id,
  bankInvestmentId,
  asset: { symbol, name: symbol, source: 'brapi' },
  origem: { categoria: 'fiis' as const, subgrupo: 'tijolo' },
  destino: { categoria: 'fimFia' as const, subgrupo: 'fiagro' },
  objetivoZerado: false,
  antes,
  depois,
});

const okAplicados = (aplicados: number) => ({
  tipo: 'ok' as const,
  resposta: {
    aplicados,
    semMudanca: 0,
    confirmados: aplicados,
    parcial: false,
    erros: [],
    historicoIds: [],
  },
  registros: [registro('p-1', BI1, 'KNCA11'), registro('p-2', BI2, 'RZAG11')].slice(0, aplicados),
});

const investimentoDb = (over: Record<string, unknown> = {}) => ({
  id: BI1,
  connectionId: CONN,
  userId: 'user-1',
  connection: { connectorName: 'Pluggy Bank' },
  type: 'EQUITY',
  subtype: 'REAL_ESTATE_FUND',
  name: 'KNCA11',
  code: 'KNCA11',
  balance: { toString: () => '1500.5' },
  quantity: 10,
  amountOriginal: null,
  rate: null,
  rateType: null,
  dueDate: null,
  issuer: null,
  status: 'ACTIVE',
  ativo: true,
  assetId: 'a-1',
  portfolioId: 'p-1',
  importStatus: 'importado',
  importError: null,
  importedAt: new Date('2026-10-06T12:00:00Z'),
  destinoConfirmadoEm: null,
  ...over,
});

describe('rotas /api/pluggy/carteira (destino na importação)', () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLUGGY_HABILITADO = 'true';
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'secret';
    process.env.PLUGGY_DESTINOS_HABILITADO = 'true';
    mockAuth.mockResolvedValue(proprio);
    mockRecordChange.mockImplementation(
      async ({ entityId }: { entityId: string }) => `log-${entityId}`,
    );
    mockServico.listarDestinosImportados.mockResolvedValue({
      habilitado: true,
      itens: [],
      paraRevisar: 0,
    });
    mockServico.classificarDestinos.mockResolvedValue(0);
    mockServico.contarParaRevisar.mockResolvedValue(0);
    mockServico.destinoAtualPorPortfolio.mockResolvedValue(new Map());
    mockPrisma.bankConnection.findFirst.mockResolvedValue({ id: CONN });
    mockPrisma.bankLoan.findMany.mockResolvedValue([]);
  });
  afterEach(() => {
    process.env = { ...env };
  });

  describe('auth', () => {
    it('consultor agindo por cliente → 403 no GET e no POST, sem chamar o serviço', async () => {
      mockAuth.mockResolvedValue(consultor);
      const g = await listarDestinos(req('/api/pluggy/carteira/destinos', 'GET'));
      const p = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', { itens: [], confirmarIds: [BI1] }),
      );
      expect(g.status).toBe(403);
      expect(p.status).toBe(403);
      expect(mockServico.listarDestinosImportados).not.toHaveBeenCalled();
      expect(mockServico.aplicarDestinos).not.toHaveBeenCalled();
    });

    it('integração Pluggy desligada → 503', async () => {
      delete process.env.PLUGGY_HABILITADO;
      const g = await listarDestinos(req('/api/pluggy/carteira/destinos', 'GET'));
      const p = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', { confirmarIds: [BI1] }),
      );
      expect(g.status).toBe(503);
      expect(p.status).toBe(503);
    });
  });

  describe('chave PLUGGY_DESTINOS_HABILITADO desligada', () => {
    beforeEach(() => {
      delete process.env.PLUGGY_DESTINOS_HABILITADO;
    });

    it('GET → vazio, sem chamar o serviço', async () => {
      const res = await listarDestinos(req('/api/pluggy/carteira/destinos', 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ habilitado: false, itens: [], paraRevisar: 0 });
      expect(mockServico.listarDestinosImportados).not.toHaveBeenCalled();
    });

    it('POST → 404, nada gravado', async () => {
      const res = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', {
          itens: [{ id: BI1, categoria: 'fimFia', subgrupo: 'fiagro' }],
        }),
      );
      expect(res.status).toBe(404);
      expect(mockServico.aplicarDestinos).not.toHaveBeenCalled();
      expect(mockRecordChange).not.toHaveBeenCalled();
    });

    it('GET /carteira: payload igual ao antigo (sem destino/situacaoDestino/paraRevisar)', async () => {
      mockPrisma.bankInvestment.findMany.mockResolvedValue([investimentoDb()]);
      const res = await carteira(req('/api/pluggy/carteira', 'GET'));
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(['emprestimos', 'investimentos']);
      expect(Object.keys(body.investimentos[0]).sort()).toEqual(
        [
          'id',
          'banco',
          'type',
          'subtype',
          'name',
          'code',
          'balance',
          'quantity',
          'amountOriginal',
          'rate',
          'rateType',
          'dueDate',
          'issuer',
          'status',
          'ativo',
          'assetId',
          'portfolioId',
          'importStatus',
          'importError',
          'importedAt',
        ].sort(),
      );
      expect(mockServico.destinoAtualPorPortfolio).not.toHaveBeenCalled();
      expect(mockServico.contarParaRevisar).not.toHaveBeenCalled();
    });

    it('importar: classifica mesmo assim e responde paraRevisar 0', async () => {
      mockImportar.importarPendentes.mockResolvedValue({ investimentos: 2, emprestimos: 0 });
      const res = await importar(req('/api/pluggy/carteira/importar', 'POST'));
      expect(await res.json()).toEqual({ investimentos: 2, emprestimos: 0, paraRevisar: 0 });
      expect(mockServico.classificarDestinos).toHaveBeenCalledWith('user-1');
      expect(mockServico.contarParaRevisar).not.toHaveBeenCalled();
    });
  });

  describe('GET /destinos', () => {
    it('lista do próprio usuário, no-store, com filtros', async () => {
      const res = await listarDestinos(
        req(`/api/pluggy/carteira/destinos?connectionId=${CONN}&paraRevisar=1`, 'GET'),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(mockServico.listarDestinosImportados).toHaveBeenCalledWith('user-1', {
        connectionId: CONN,
        somenteParaRevisar: true,
      });
      expect(mockPrisma.bankConnection.findFirst).toHaveBeenCalledWith({
        where: { id: CONN, userId: 'user-1' },
        select: { id: true },
      });
    });

    it('IDOR: conexão de outro usuário → 404, sem listar', async () => {
      mockPrisma.bankConnection.findFirst.mockResolvedValue(null);
      const res = await listarDestinos(
        req(`/api/pluggy/carteira/destinos?connectionId=${CONN}`, 'GET'),
      );
      expect(res.status).toBe(404);
      expect(mockServico.listarDestinosImportados).not.toHaveBeenCalled();
    });

    it('query inválida → 400', async () => {
      const res = await listarDestinos(
        req('/api/pluggy/carteira/destinos?connectionId=nao-uuid', 'GET'),
      );
      expect(res.status).toBe(400);
    });
  });

  describe('POST /destinos', () => {
    it('JSON inválido → 400', async () => {
      const res = await salvarDestinos(req('/api/pluggy/carteira/destinos', 'POST', '{x'));
      expect(res.status).toBe(400);
      expect(mockServico.aplicarDestinos).not.toHaveBeenCalled();
    });

    it('corpo inválido (vazio, categoria fora da lista) → 400 sem chamar o serviço', async () => {
      const vazio = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', { itens: [], confirmarIds: [] }),
      );
      const categoria = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', {
          itens: [{ id: BI1, categoria: 'previdencia' }],
        }),
      );
      expect(vazio.status).toBe(400);
      expect(categoria.status).toBe(400);
      expect(mockServico.aplicarDestinos).not.toHaveBeenCalled();
    });

    it('validação falha (fase 1) → 409 com erros por item, nada gravado nem registrado', async () => {
      const erros = [{ id: BI2, nome: 'CDB X', motivo: 'Em reais — esta aba é em dólar' }];
      mockServico.aplicarDestinos.mockResolvedValue({ tipo: 'invalido', erros });
      const res = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', {
          itens: [
            { id: BI1, categoria: 'fimFia', subgrupo: 'fiagro' },
            { id: BI2, categoria: 'stocks' },
          ],
        }),
      );
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'Não foi possível salvar', erros });
      expect(mockRecordChange).not.toHaveBeenCalled();
      expect(mockInvalidateCaixa).not.toHaveBeenCalled();
      expect(mockInvalidarContexto).not.toHaveBeenCalled();
    });

    it('IDOR: id de outro usuário → serviço recebe o targetUserId e recusa (409)', async () => {
      mockServico.aplicarDestinos.mockResolvedValue({
        tipo: 'invalido',
        erros: [
          {
            id: BI_ALHEIO,
            nome: 'Investimento',
            motivo: 'Este investimento já foi conferido ou não está mais na Carteira',
          },
        ],
      });
      const res = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', { itens: [], confirmarIds: [BI_ALHEIO] }),
      );
      expect(res.status).toBe(409);
      expect(mockServico.aplicarDestinos).toHaveBeenCalledWith('user-1', {
        itens: [],
        confirmarIds: [BI_ALHEIO],
      });
      expect(mockRecordChange).not.toHaveBeenCalled();
    });

    it('ok com 2 itens → 2 registros com a action nova e snapshot kind mover; caches invalidados', async () => {
      mockServico.aplicarDestinos.mockResolvedValue(okAplicados(2));
      const res = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', {
          itens: [
            { id: BI1, categoria: 'fimFia', subgrupo: 'fiagro' },
            { id: BI2, categoria: 'fimFia', subgrupo: 'fiagro' },
          ],
          confirmarIds: [BI1, BI2],
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        aplicados: 2,
        semMudanca: 0,
        confirmados: 2,
        parcial: false,
        erros: [],
        historicoIds: ['log-p-1', 'log-p-2'],
      });
      expect(mockRecordChange).toHaveBeenCalledTimes(2);
      const chamada = mockRecordChange.mock.calls[0][0];
      expect(chamada).toMatchObject({
        section: 'carteira',
        action: ACAO_DESTINO_IMPORTACAO,
        entity: 'portfolio',
        entityId: 'p-1',
        entityLabel: 'KNCA11',
        auth: proprio,
        snapshot: { v: 1, kind: 'mover', data: antes, meta: { after: depois } },
      });
      expect(chamada.changes).toEqual([
        { field: 'aba', label: 'Aba', before: "FII's", after: 'Fundos' },
        expect.objectContaining({ field: 'subgrupo', label: 'Subgrupo' }),
      ]);
      expect(mockInvalidateCaixa).toHaveBeenCalledWith('user-1');
      expect(mockInvalidarContexto).toHaveBeenCalledWith('user-1');
    });

    it('só confirmação (Está tudo certo) → sem registro nem invalidação', async () => {
      mockServico.aplicarDestinos.mockResolvedValue({
        ...okAplicados(0),
        resposta: { ...okAplicados(0).resposta, confirmados: 3 },
      });
      const res = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', { itens: [], confirmarIds: [BI1, BI2] }),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).historicoIds).toEqual([]);
      expect(mockRecordChange).not.toHaveBeenCalled();
      expect(mockInvalidateCaixa).not.toHaveBeenCalled();
    });

    it('parcial por concorrência → 200 parcial com erros por item e histórico só dos aplicados', async () => {
      const erro = {
        id: BI2,
        nome: 'RZAG11',
        motivo: 'O investimento não existe mais na carteira',
      };
      mockServico.aplicarDestinos.mockResolvedValue({
        tipo: 'ok',
        resposta: {
          aplicados: 1,
          semMudanca: 0,
          confirmados: 1,
          parcial: true,
          erros: [erro],
          historicoIds: [],
        },
        registros: [registro('p-1', BI1, 'KNCA11')],
      });
      const res = await salvarDestinos(
        req('/api/pluggy/carteira/destinos', 'POST', {
          itens: [
            { id: BI1, categoria: 'fimFia', subgrupo: 'fiagro' },
            { id: BI2, categoria: 'fimFia', subgrupo: 'fiagro' },
          ],
          confirmarIds: [BI1, BI2],
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.parcial).toBe(true);
      expect(body.erros).toEqual([erro]);
      expect(body.historicoIds).toEqual(['log-p-1']);
      expect(mockRecordChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /carteira com a chave ligada', () => {
    it('cada investimento ganha destino e situacaoDestino; resposta ganha paraRevisar', async () => {
      const destino = {
        categoria: 'fiis',
        abaId: 'fiis',
        label: "FII's",
        subgrupoLabel: 'Tijolo',
        rotulo: "FII's › Tijolo",
      };
      mockPrisma.bankInvestment.findMany.mockResolvedValue([
        investimentoDb(),
        investimentoDb({ id: 'b', portfolioId: 'p-2', destinoConfirmadoEm: new Date() }),
        investimentoDb({ id: 'c', portfolioId: 'p-apagado' }),
        investimentoDb({ id: 'd', importStatus: 'vinculado', portfolioId: 'p-3' }),
        investimentoDb({ id: 'e', importStatus: 'sem-suporte', portfolioId: null }),
        investimentoDb({ id: 'f', importStatus: 'pendente', portfolioId: null }),
        investimentoDb({ id: 'g', ativo: false }),
      ]);
      mockServico.destinoAtualPorPortfolio.mockResolvedValue(
        new Map([
          ['p-1', destino],
          ['p-2', destino],
          ['p-3', destino],
        ]),
      );
      mockServico.contarParaRevisar.mockResolvedValue(1);
      const res = await carteira(req('/api/pluggy/carteira', 'GET'));
      const body = await res.json();
      expect(body.paraRevisar).toBe(1);
      expect(mockServico.destinoAtualPorPortfolio).toHaveBeenCalledWith('user-1', [
        'p-1',
        'p-2',
        'p-apagado',
        'p-3',
      ]);
      const sit = body.investimentos.map(
        (i: { situacaoDestino: string | null }) => i.situacaoDestino,
      );
      expect(sit).toEqual([
        'para-revisar',
        'confirmado',
        'fora-da-carteira',
        'ja-estava',
        'sem-suporte',
        null,
        null,
      ]);
      expect(body.investimentos[0].destino).toEqual(destino);
      expect(body.investimentos[2].destino).toBeNull();
    });
  });

  describe('POST /importar com a chave ligada', () => {
    it('classifica e responde paraRevisar', async () => {
      mockImportar.importarPendentes.mockResolvedValue({ investimentos: 3, emprestimos: 0 });
      mockServico.contarParaRevisar.mockResolvedValue(2);
      const res = await importar(req('/api/pluggy/carteira/importar', 'POST'));
      expect(await res.json()).toEqual({ investimentos: 3, emprestimos: 0, paraRevisar: 2 });
      expect(mockServico.classificarDestinos).toHaveBeenCalledWith('user-1');
    });

    it('classificação falhando não derruba a importação', async () => {
      mockImportar.importarPendentes.mockResolvedValue({ investimentos: 1, emprestimos: 0 });
      mockServico.classificarDestinos.mockRejectedValue(new Error('boom'));
      const res = await importar(req('/api/pluggy/carteira/importar', 'POST'));
      expect(res.status).toBe(200);
      expect((await res.json()).paraRevisar).toBe(0);
    });

    it('consultor → 403 sem importar', async () => {
      mockAuth.mockResolvedValue(consultor);
      const res = await importar(req('/api/pluggy/carteira/importar', 'POST'));
      expect(res.status).toBe(403);
      expect(mockImportar.importarPendentes).not.toHaveBeenCalled();
    });
  });
});
