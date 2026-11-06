import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  irPgblSimulacao: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import type { MesesRelatorio } from '@/types/relatorioFinanceiro';
import { REGRAS_IRPF_2026 } from '@/services/ir/irpfAnual';
import type { ContextoMontador, Insumos } from '../insumos';
import { hojeEmSaoPaulo, mesesDaJanela, periodoDoRelatorio } from '../periodo';
import { economiaPotencialGancho, montarIr, montarIrGancho, recortarArvoreAte } from '../ir';

const AGORA = new Date('2026-11-03T09:42:00-03:00');

/** Os números do protótipo do Pedro (PG), como a aba PGBL os salvaria. */
const CAMPOS_PEDRO = {
  rendaTributavel: '186.400,00',
  inss: '10.934,20',
  irRetido: '31.280,00',
  dependentes: '2',
  saude: '6.800,00',
  educacao: '3.561,50',
  doacoesIncentivadas: '500,00',
};

const vazioDeEntrada = {
  rendaTributavel: 0,
  inss: 0,
  aportesPgbl: 0,
  dependentes: 0,
  saude: 0,
  educacao: 0,
  pensaoJudicial: 0,
  livroCaixa: 0,
  doacoesIncentivadas: 0,
  irRetido: 0,
};

/** Fluxo de caixa: salário de jan a dez (o futuro não entra) e aluguel. */
const ARVORE = [
  {
    name: 'Receitas',
    type: 'entrada',
    items: [
      {
        name: 'Salário',
        values: Array.from({ length: 12 }, (_, m) => ({ month: m, value: 10000 })),
      },
      { name: 'Aluguel', values: [{ month: 0, value: 2000 }] },
    ],
    children: [],
  },
  {
    name: 'Despesas',
    type: 'despesa',
    items: [{ name: 'Plano de saúde', values: [{ month: 5, value: 1200 }] }],
    children: [],
  },
];

function ctxCom(agora: Date, meses: MesesRelatorio = 1): ContextoMontador {
  const hojeSP = hojeEmSaoPaulo(agora);
  const insumos = {
    userId: 'u1',
    agora,
    hojeSP,
    janela: mesesDaJanela(hojeSP, 13),
    cashflowDoAno: vi.fn().mockResolvedValue(ARVORE),
  } as unknown as Insumos;
  return {
    userId: 'u1',
    meses,
    periodo: periodoDoRelatorio(meses, agora),
    mesesDoPeriodo: mesesDaJanela(hojeSP, meses),
    agora,
    hojeSP,
    comConsultor: false,
    insumos,
  };
}

const assetPrev = (id: string, name: string) => ({
  id,
  name,
  cnpj: '11.111.111/0001-11',
  currentPrice: { toNumber: () => 0 },
});

function simulacao(campos: Record<string, string>, planos: Record<string, unknown> = {}) {
  mockPrisma.irPgblSimulacao.findUnique.mockResolvedValue({ campos, planos });
}

describe('irGancho (Basic/Pro)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  });

  it('exemplo do Pedro: renda de 186.400 → até R$ 6.151,20', async () => {
    simulacao(CAMPOS_PEDRO);
    const g = await montarIrGancho(ctxCom(AGORA));
    expect(g).toEqual({
      ano: 2026,
      encerrado: false,
      rendaTributavel: 186400,
      rendaOrigem: 'simulacao',
      economiaMaxima: 6151.2,
      diasAte3112: 58,
    });
  });

  it('renda de 50.000 com o redutor de 2026 → 0 (IR já é zero)', () => {
    expect(
      economiaPotencialGancho({ ...vazioDeEntrada, rendaTributavel: 50000 }, REGRAS_IRPF_2026),
    ).toBe(0);
  });

  it('sem renda salva: o lançado no fluxo até o mês de hoje', async () => {
    mockPrisma.irPgblSimulacao.findUnique.mockResolvedValue(null);
    const g = await montarIrGancho(ctxCom(AGORA));
    // jan–nov de salário + aluguel de jan (dezembro ainda não)
    expect(g.rendaTributavel).toBe(11 * 10000 + 2000);
    expect(g.rendaOrigem).toBe('lancado');
  });

  it('janeiro de 2027 sem regra: ano 2026 encerrado, sem dias até 31/12', async () => {
    simulacao(CAMPOS_PEDRO);
    const ctx = ctxCom(new Date('2027-01-10T10:00:00-03:00'));
    const g = await montarIrGancho(ctx);
    expect(g.ano).toBe(2026);
    expect(g.encerrado).toBe(true);
    expect(g.diasAte3112).toBeNull();
    expect(mockPrisma.irPgblSimulacao.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_ano: { userId: 'u1', ano: 2026 } } }),
    );
    expect(ctx.insumos.cashflowDoAno).toHaveBeenCalledWith(2026);
  });

  it('o gancho não carrega nenhum detalhe do mecanismo', async () => {
    simulacao(CAMPOS_PEDRO);
    const g = await montarIrGancho(ctxCom(AGORA));
    expect(JSON.stringify(g)).not.toMatch(/pgbl|aporte|dedu[cç]/i);
  });
});

describe('montarIr (Advanced)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { quantity: 0, avgPrice: 0, totalInvested: 0, asset: assetPrev('p1', 'Renda Futura PGBL') },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      ...Array.from({ length: 10 }, (_, i) => ({
        type: 'compra',
        total: 1200,
        quantity: 0,
        price: 0,
        date: new Date(Date.UTC(2026, i, 5)),
        asset: assetPrev('p1', 'Renda Futura PGBL'),
      })),
      {
        type: 'compra',
        total: 2200,
        quantity: 0,
        price: 0,
        date: new Date(Date.UTC(2026, 3, 5)),
        asset: assetPrev('p2', 'Multimercado Prev'),
      },
      {
        type: 'compra',
        total: 5000,
        quantity: 0,
        price: 0,
        date: new Date(Date.UTC(2026, 3, 5)),
        asset: assetPrev('v1', 'Plano VGBL'),
      },
    ]);
  });

  it('exemplo do Pedro: limite, aportado, economia, restituição e condições', async () => {
    simulacao(CAMPOS_PEDRO, {
      p2: { tipo: 'pgbl', regime: 'regressivo' },
      p1: { regime: 'regressivo' },
    });
    const ir = await montarIr(ctxCom(AGORA));
    expect(ir.ano).toBe(2026);
    expect(ir.rendaTributavel).toBe(186400);
    expect(ir.rendaOrigem).toBe('simulacao');
    expect(ir.limite12).toBe(22368);
    expect(ir.aportado).toBe(14200); // o VGBL fica de fora
    expect(ir.nAportes).toBe(11);
    expect(ir.faltaNoLimite).toBe(8168);
    expect(ir.economia).toBe(3905);
    expect(ir.economiaMaxima).toBe(6151.2);
    expect(ir.economiaFalta).toBe(2246.2);
    expect(ir.simulacao.completo.irDevido).toBe(28842.63);
    expect(ir.simulacao.simplificado.irDevido).toBe(35747.8);
    expect(ir.retidoNaFonte).toBe(31280);
    expect(ir.restituicaoProjetada).toBe(2437.37);
    expect(ir.diasAte3112).toBe(58);
    expect(ir.planos.map((p) => [p.nome, p.nAportes, p.totalAno, p.regime])).toEqual([
      ['Renda Futura PGBL', 10, 12000, 'Regressivo'],
      ['Multimercado Prev', 1, 2200, 'Regressivo'],
    ]);
    const c = Object.fromEntries(ir.condicoes.map((x) => [x.chave, x]));
    expect(c.modeloCompleto.status).toBe('good');
    expect(c.inss.status).toBe('good');
    expect(c.tipoPlano.status).toBe('good');
    expect(c.prazo).toMatchObject({ status: 'warn', titulo: 'Aportes até 31/12/2026' });
    expect(c.regime.titulo).toBe('Regime de tributação: regressivo');
    expect(c.irpfm).toBeUndefined();
    const d = Object.fromEntries(ir.deducoes.map((x) => [x.chave, x]));
    expect(d.previdencia.valor).toBe(25134.2);
    expect(d.educacao).toMatchObject({ valor: 3561.5 });
    expect(d.dependentes).toMatchObject({ valor: 4550.16, nota: '2 cadastrados' });
    expect(d.doacoes.valor).toBe(500);
    // só leitura
    expect(mockPrisma.irPgblSimulacao.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.irPgblSimulacao.create).not.toHaveBeenCalled();
    expect(mockPrisma.irPgblSimulacao.update).not.toHaveBeenCalled();
  });

  it('sem INSS: condição warn, economia 0', async () => {
    simulacao({ rendaTributavel: '186.400,00' });
    const ir = await montarIr(ctxCom(AGORA));
    const c = Object.fromEntries(ir.condicoes.map((x) => [x.chave, x]));
    expect(c.inss).toMatchObject({ status: 'warn', titulo: 'Informe o INSS na aba PGBL' });
    expect(ir.economia).toBe(0);
    expect(ir.economiaMaxima).toBe(0);
    expect(ir.retidoNaFonte).toBeNull();
    expect(ir.restituicaoProjetada).toBeNull();
    // plano sem tipo (p2 só pelo nome não dá) → pede para confirmar
    expect(c.tipoPlano.status).toBe('warn');
  });

  it('IRPFM: renda de 900 mil acende o aviso', async () => {
    simulacao({ ...CAMPOS_PEDRO, rendaTributavel: '900.000,00' });
    const ir = await montarIr(ctxCom(AGORA));
    expect(ir.simulacao.avisos.irpfmPossivel).toBe(true);
    const c = Object.fromEntries(ir.condicoes.map((x) => [x.chave, x]));
    expect(c.irpfm.status).toBe('warn');
  });

  it('renda pelo lançado, com as partes por linha; saúde do fluxo quando o campo está vazio', async () => {
    simulacao({ inss: '10.000,00' });
    const ir = await montarIr(ctxCom(AGORA));
    expect(ir.rendaOrigem).toBe('lancado');
    expect(ir.rendaTributavel).toBe(112000);
    expect(ir.rendaPartes).toEqual([
      { nome: 'Salário', valor: 110000 },
      { nome: 'Aluguel', valor: 2000 },
    ]);
    expect(ir.simulacao.deducoesCompleto.saude).toBe(1200);
  });

  it('janeiro de 2027: ano 2026 encerrado, prazo vira info', async () => {
    simulacao(CAMPOS_PEDRO);
    const ir = await montarIr(ctxCom(new Date('2027-01-10T10:00:00-03:00')));
    expect(ir.encerrado).toBe(true);
    expect(ir.diasAte3112).toBeNull();
    const c = Object.fromEntries(ir.condicoes.map((x) => [x.chave, x]));
    expect(c.prazo).toMatchObject({ status: 'info', titulo: 'Ano-calendário 2026 encerrado' });
  });
});

describe('recortarArvoreAte', () => {
  it('mantém só os meses até o limite, nos filhos também', () => {
    const r = recortarArvoreAte(
      [
        {
          name: 'A',
          items: [
            {
              name: 'x',
              values: [
                { month: 1, value: 1 },
                { month: 5, value: 1 },
              ],
            },
          ],
          children: [{ name: 'B', items: [{ name: 'y', values: [{ month: 9, value: 1 }] }] }],
        },
      ],
      4,
    );
    expect(r[0].items![0].values).toEqual([{ month: 1, value: 1 }]);
    expect(r[0].children![0].items![0].values).toEqual([]);
  });
});
