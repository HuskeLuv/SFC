import { describe, expect, it, vi } from 'vitest';

const mockProventosCarregados = vi.hoisted(() => vi.fn());
vi.mock('../carteiraAvancada', () => ({ proventosDaJanelaCarregados: mockProventosCarregados }));

import type {
  BlocoDividas,
  BlocoOrcamento,
  ItemDividaRelatorio,
  MesesRelatorio,
  MesOrcamentoRelatorio,
} from '@/types/relatorioFinanceiro';
import type { SaudeFinanceiraPayload } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import { notaSaude, statusDaNota } from '@/services/saudeFinanceira/notaSaude';
import type { ContextoMontador, Insumos } from '../insumos';
import { hojeEmSaoPaulo, mesesDaJanela, periodoDoRelatorio } from '../periodo';
import { indicadoresRelatorio, montarSaude, type EntradaSaude } from '../saude';

/** "Dia 3 de novembro": o mês corrente é parcial; as bases são ago–out. */
const AGORA = new Date('2026-11-03T09:42:00-03:00');
const HOJE = hojeEmSaoPaulo(AGORA);

function ctxCom(meses: MesesRelatorio): ContextoMontador {
  return {
    userId: 'u1',
    meses,
    periodo: periodoDoRelatorio(meses, AGORA),
    mesesDoPeriodo: mesesDaJanela(HOJE, meses),
    agora: AGORA,
    hojeSP: HOJE,
    comConsultor: false,
    insumos: {} as Insumos,
  };
}

const mesOrc = (mes: string, fechado: boolean, receita: number, gasto: number) =>
  ({
    mes,
    rotulo: mes,
    fechado,
    receita,
    receitaOrigem: 'fluxo',
    categorias: [{ chave: 'x', nome: 'X', orcado: 0, realizado: gasto, status: 'ok' }],
  }) as MesOrcamentoRelatorio;

function orcamento(meses: MesOrcamentoRelatorio[]): BlocoOrcamento {
  return {
    temOrcamento: true,
    meses,
    ritmo: null,
    // média de ago–out: receita 50 mil, gasto 30 mil
    referenciaFechada: { receitaMedia3m: 50000, gastoMedio3m: 30000, sobraMesAnterior: 18000 },
  };
}

const divida = (extra: Partial<ItemDividaRelatorio>): ItemDividaRelatorio => ({
  id: 'd',
  nome: 'Financiamento',
  instituicao: null,
  sistema: 'SAC',
  imobiliario: true,
  status: 'ativa',
  saldo: 100000,
  cetAA: 10,
  parcelaMes: 4000,
  jurosMes: 800,
  jurosAteQuitar: 50000,
  parcelasRestantes: 100,
  quitacao: '2035-01',
  ...extra,
});

const DIVIDAS: BlocoDividas = {
  itens: [
    divida({}),
    divida({
      id: 'r',
      nome: 'Rotativo do cartão',
      sistema: 'Rotativo',
      imobiliario: false,
      saldo: 2000,
      parcelaMes: 300,
    }),
    divida({ id: 'q', nome: 'Quitada', status: 'quitada', saldo: 0, parcelaMes: 9999 }),
  ],
  semDividasForaImovel: { mes: null, motivo: 'com_rotativo' },
  avisos: { semCet: 0, parcelasVencidasSemPagamento: 0 },
};

const SAUDE_BASE = {
  asOf: '2026-11-03T12:42:00.000Z',
  porClasse: {
    reservaEmergencia: 210000,
    reservaOportunidade: 0,
    rendaFixaFundos: 290000,
    fimFia: 0,
    fiis: 0,
    acoes: 0,
    stocks: 0,
    reits: 0,
    etfs: 0,
    moedasCriptos: 0,
    previdenciaSeguros: 0,
    opcoes: 0,
    imoveisBens: 500000,
    tesouroDireto: 0,
    etfsExterior: 0,
  },
  caixa: {
    bolso: 10000,
    reservado: 0,
    porAba: {
      acoes: 0,
      fii: 0,
      etf: 0,
      reit: 0,
      stocks: 0,
      moedasCriptos: 0,
      previdenciaSeguros: 0,
      opcoes: 0,
      fimFia: 0,
      rendaFixa: 0,
    },
  },
  imoveisBens: [{ nome: 'Apartamento', valor: 500000 }],
  nPosicoes: 4,
} as unknown as SaudeFinanceiraPayload;

const PROVENTOS_JANELA = mesesDaJanela(HOJE, 13).map((mes) => ({
  mes,
  fii: mes === '2026-11' ? 99999 : 2000, // o mês parcial nunca entra
  acao: 1000,
  jcp: 0,
  exterior: 0,
}));

const entrada = (
  meses: MesesRelatorio,
  orc: BlocoOrcamento,
  extra: Partial<EntradaSaude> = {},
): EntradaSaude => ({
  ctx: ctxCom(meses),
  saudeBase: SAUDE_BASE,
  orcamento: orc,
  dividas: DIVIDAS,
  carteiraAvancada: null,
  ...extra,
});

const porChave = (lista: ReturnType<typeof indicadoresRelatorio>) =>
  Object.fromEntries(lista.map((i) => [i.chave, i]));

describe('notaSaude (régua provisória)', () => {
  it('6 indicadores good = 100, Saudável', () => {
    const seis = Array.from({ length: 6 }, () => ({ valor: 1, status: 'good' as const }));
    expect(notaSaude(seis)).toEqual({ nota: 100, status: 'good' });
  });

  it('faixas: ≥ 70 Saudável, 40–69 Atenção, < 40 Alerta', () => {
    expect(statusDaNota(70)).toBe('good');
    expect(statusDaNota(69)).toBe('warn');
    expect(statusDaNota(40)).toBe('warn');
    expect(statusDaNota(39)).toBe('bad');
  });

  it("indicador '—' fica fora da média", () => {
    expect(
      notaSaude([
        { valor: 1, status: 'good' },
        { valor: 1, status: 'bad' },
        { valor: null, status: null },
      ]),
    ).toEqual({ nota: 50, status: 'warn' });
    expect(notaSaude([{ valor: null, status: null }])).toEqual({ nota: null, status: null });
  });
});

describe('indicadoresRelatorio no dia 3 de novembro', () => {
  it('n=1: bases nos 3 meses fechados (ago–out), não no mês parcial', () => {
    mockProventosCarregados.mockReturnValue(PROVENTOS_JANELA);
    // novembro parcial, quase sem gasto lançado: não pode mexer em nada
    const ind = porChave(
      indicadoresRelatorio(entrada(1, orcamento([mesOrc('2026-11', false, 0, 500)]))),
    );
    expect(ind.poupanca).toMatchObject({ valor: 40, valorFmt: '40,0%', status: 'good' });
    expect(ind.poupanca.base).toBe('fechados3m');
    expect(ind.reserva).toMatchObject({ valor: 7, valorFmt: '7,0 meses', status: 'good' });
    expect(ind.reserva.base).toBe('fechados3m');
    // proventos de ago–out (3 mil/mês) ÷ gasto médio 30 mil
    expect(ind.independencia).toMatchObject({ valor: 10, status: 'warn', base: 'fechados3m' });
    // parcelas das abertas (4.000 + 300) ÷ receita média 50 mil
    expect(ind.comprometimento).toMatchObject({ valor: 8.6, status: 'good' });
    expect(ind.rotativo).toMatchObject({ valor: 1, valorFmt: 'Sim', status: 'bad' });
    // dívidas 102 mil ÷ bens (500 mil investidos + 500 mil do imóvel + 10 mil em contas)
    expect(ind.endividamento.valor).toBeCloseTo((102000 / 1010000) * 100, 2);
    expect(ind.endividamento.status).toBe('good');
  });

  it('n=3: poupança pelos meses fechados do período, sem o parcial', () => {
    mockProventosCarregados.mockReturnValue(PROVENTOS_JANELA);
    const orc = orcamento([
      mesOrc('2026-09', true, 40000, 30000),
      mesOrc('2026-10', true, 60000, 40000),
      mesOrc('2026-11', false, 1000, 20000),
    ]);
    const ind = porChave(indicadoresRelatorio(entrada(3, orc)));
    expect(ind.poupanca).toMatchObject({ valor: 30, base: 'periodo', status: 'good' });
  });

  it("sem gasto nos 3 fechados: reserva, independência e poupança '—', fora da nota", () => {
    mockProventosCarregados.mockReturnValue(PROVENTOS_JANELA);
    const orc = orcamento([mesOrc('2026-11', false, 0, 0)]);
    orc.referenciaFechada = { receitaMedia3m: 0, gastoMedio3m: 0, sobraMesAnterior: null };
    const b = montarSaude(entrada(1, orc));
    const ind = porChave(b.indicadores);
    expect(ind.poupanca.valorFmt).toBe('—');
    expect(ind.reserva.valor).toBeNull();
    expect(ind.independencia.status).toBeNull();
    expect(ind.comprometimento.valor).toBeNull();
    // sobram endividamento (good) e rotativo (bad) → 50
    expect(b.nota).toBe(50);
    expect(b.status).toBe('warn');
  });

  it('sem a janela de proventos carregada, usa os do bloco 4b', () => {
    mockProventosCarregados.mockReturnValue(null);
    const ind = porChave(
      indicadoresRelatorio(
        entrada(3, orcamento([mesOrc('2026-11', false, 0, 0)]), {
          carteiraAvancada: {
            retornoDiario: { datas: [], carteira: [], ibov: [], cdi: [], ipca: [] },
            twr: null,
            cdi: null,
            ipca: null,
            ibov: null,
            proventos: PROVENTOS_JANELA.slice(-3),
            fgc: null,
            irRendaVariavel: null,
          },
        }),
      ),
    );
    // só set e out estão no bloco (3 meses: set, out, nov): (2 × 3.000) ÷ 3 ÷ 30.000
    expect(ind.independencia.valor).toBeCloseTo((6000 / 3 / 30000) * 100, 2);
  });
});

describe('montarSaude', () => {
  it('usuário sem dados (só o rotativo tem valor): nota null, sem "Saudável"', () => {
    mockProventosCarregados.mockReturnValue(null);
    const orc = orcamento([mesOrc('2026-11', false, 0, 0)]);
    orc.referenciaFechada = { receitaMedia3m: 0, gastoMedio3m: 0, sobraMesAnterior: null };
    const vazia = {
      ...SAUDE_BASE,
      porClasse: Object.fromEntries(Object.keys(SAUDE_BASE.porClasse).map((k) => [k, 0])),
      caixa: { ...SAUDE_BASE.caixa, bolso: 0 },
      imoveisBens: [],
      nPosicoes: 0,
    } as unknown as SaudeFinanceiraPayload;
    const b = montarSaude(
      entrada(1, orc, { saudeBase: vazia, dividas: { ...DIVIDAS, itens: [] } }),
    );
    const ind = porChave(b.indicadores);
    expect(ind.rotativo).toMatchObject({ valor: 0, status: 'good' });
    expect(b.nota).toBeNull();
    expect(b.status).toBeNull();
    expect(b.frase).toBe('Ainda não há dados suficientes para calcular a sua nota.');
  });

  it('nota, frase do melhor e do pior, balanço e asOf em SP', () => {
    mockProventosCarregados.mockReturnValue(PROVENTOS_JANELA);
    const b = montarSaude(entrada(1, orcamento([mesOrc('2026-11', false, 0, 500)])));
    // good: poupança, reserva, comprometimento, endividamento; warn: independência; bad: rotativo
    expect(b.nota).toBe(Math.round((4 * 100 + 50 + 0) / 6));
    expect(b.status).toBe('good');
    expect(b.frase).toBe(
      'Sua saúde financeira está boa: seu ponto forte é o índice de poupança (40,0%). O ponto de alerta é o uso do rotativo (Sim).',
    );
    expect(b.bens).toEqual([
      { nome: 'Investimentos', valor: 500000 },
      { nome: 'Apartamento', valor: 500000 },
      { nome: 'Saldo em contas', valor: 10000 },
    ]);
    expect(b.dividas).toEqual([
      { nome: 'Financiamento', valor: 100000 },
      { nome: 'Rotativo do cartão', valor: 2000 },
    ]);
    expect(b.asOf).toBe('2026-11-03');
    expect(b.historicoNota).toEqual([]);
    expect(b.frase).not.toMatch(/aporte|PGBL|dedu[cç]/i);
  });
});
