/**
 * Assinaturas F2: com a chave ligada, as rotas internas que o plano não alcança respondem 403
 * (gate central) e o contexto do assistente só omite a seção, sem erro. Os planejados (carteira)
 * somem junto quando o resumo da carteira foi recusado. Chave desligada: como antes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockGet = vi.hoisted(() => vi.fn());
const mockPlanejados = vi.hoisted(() => vi.fn());

vi.mock('@/app/api/analises/cobertura-fgc/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/analises/cobertura-fgc', req),
}));
vi.mock('@/app/api/analises/portfolio-goal/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/analises/portfolio-goal', req),
}));
vi.mock('@/app/api/analises/proventos/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/analises/proventos', req),
}));
vi.mock('@/app/api/aposentadoria/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/aposentadoria', req),
}));
vi.mock('@/app/api/calendar/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/calendar', req),
}));
vi.mock('@/app/api/carteira/acoes/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/acoes', req),
}));
vi.mock('@/app/api/carteira/configuracao/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/configuracao', req),
}));
vi.mock('@/app/api/carteira/etf/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/etf', req),
}));
vi.mock('@/app/api/carteira/fii/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/fii', req),
}));
vi.mock('@/app/api/carteira/fim-fia/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/fim-fia', req),
}));
vi.mock('@/app/api/carteira/imoveis-bens/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/imoveis-bens', req),
}));
vi.mock('@/app/api/carteira/moedas-criptos/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/moedas-criptos', req),
}));
vi.mock('@/app/api/carteira/opcoes/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/opcoes', req),
}));
vi.mock('@/app/api/carteira/previdencia-seguros/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/previdencia-seguros', req),
}));
vi.mock('@/app/api/carteira/reit/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/reit', req),
}));
vi.mock('@/app/api/carteira/renda-fixa/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/renda-fixa', req),
}));
vi.mock('@/app/api/carteira/reserva-emergencia/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/reserva-emergencia', req),
}));
vi.mock('@/app/api/carteira/reserva-oportunidade/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/reserva-oportunidade', req),
}));
vi.mock('@/app/api/carteira/resumo/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/resumo', req),
}));
vi.mock('@/app/api/carteira/stocks/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/carteira/stocks', req),
}));
vi.mock('@/app/api/cashflow/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/cashflow', req),
}));
vi.mock('@/app/api/cashflow/orcamento/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/cashflow/orcamento', req),
}));
vi.mock('@/app/api/cashflow/orcamento/v2/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/cashflow/orcamento/v2', req),
}));
vi.mock('@/app/api/dividas/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/dividas', req),
}));
vi.mock('@/app/api/planejamento-sonhos/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/planejamento-sonhos', req),
}));
vi.mock('@/app/api/profile/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/profile', req),
}));
vi.mock('@/app/api/saude-financeira/route', () => ({
  GET: (req: NextRequest) => mockGet('/api/saude-financeira', req),
}));
vi.mock('@/services/portfolio/ativosPlanejados', () => ({
  listarTodosPlanejados: mockPlanejados,
  abaDoAssetPlanejado: () => 'acoes',
  ROTULO_ABA: { acoes: 'Ações' },
}));
vi.mock('@/services/cashflow/orcamentoV2/acesso', () => ({
  estadoAcessoOrcamentoV2: vi.fn().mockResolvedValue({ estado: 'desligada', ativado: false }),
}));

import { buildContextoUsuario, invalidarContextoUsuario } from '../contexto';

/** Rotas Basic respondem; as Pro/Adv, 403 plano_insuficiente (o que o gate central devolve). */
const BASIC = new Set([
  '/api/cashflow',
  '/api/cashflow/orcamento',
  '/api/dividas',
  '/api/calendar',
  '/api/profile',
]);

function responderComoBasic() {
  mockGet.mockImplementation(async (rota: string) =>
    BASIC.has(rota)
      ? NextResponse.json(
          rota === '/api/dividas'
            ? { dividas: [{ nome: 'Carro', saldoDevedor: 30000 }] }
            : rota === '/api/cashflow'
              ? { groups: [] }
              : {},
        )
      : NextResponse.json(
          {
            error: 'Recurso disponível no plano Pro',
            codigo: 'plano_insuficiente',
            need: 'pro',
            plano: 'basic',
          },
          { status: 403 },
        ),
  );
}

const req = () => new NextRequest('http://localhost/api/assistente', { method: 'POST' });

describe('buildContextoUsuario × plano', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPlanejados.mockReset().mockResolvedValue([]);
    invalidarContextoUsuario('u1');
    responderComoBasic();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    invalidarContextoUsuario('u1');
  });

  it('rotas internas com 403 omitem a seção sem erro; as Basic entram', async () => {
    vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
    const ctx = JSON.parse(await buildContextoUsuario(req(), 'u1'));
    expect(ctx.dividas).toEqual([{ nome: 'Carro', saldoDevedor: 30000 }]);
    expect(ctx.carteira).toBeUndefined();
    expect(ctx.saudeFinanceira).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/carteira/resumo', expect.any(NextRequest));
    // Carteira recusada: os planejados (dados da carteira) nem são lidos.
    expect(mockPlanejados).not.toHaveBeenCalled();
  });

  it('chave desligada: carteira e planejados entram mesmo com o resumo falhando (como antes)', async () => {
    const ctx = JSON.parse(await buildContextoUsuario(req(), 'u1'));
    expect(ctx.carteira).toBeDefined();
    expect(mockPlanejados).toHaveBeenCalledWith('u1');
  });
});
