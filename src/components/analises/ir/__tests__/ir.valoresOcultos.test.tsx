// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import {
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
  textosExpostos,
} from '@/test/valoresOcultos';

/**
 * Esconder valores — Carteira › Análise › Imposto de Renda (fatia 3). As 5 telas com fixtures
 * sentinela: com o olho fechado imposto, base, vendas, lucro e rendimentos viram pílula; as
 * alíquotas, contagens e datas continuam; o limite de isenção (regra pública) também.
 * irFormatters.ts não muda (os componentes é que embrulham).
 */

const estado = vi.hoisted(() => ({ belowLg: false, campos: {} as Record<string, string> }));

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => estado.belowLg }));
// Lembrete da aba PGBL (Agenda) fora do teste: sem QueryClient.
vi.mock('@/hooks/useAgenda', () => ({
  useCriarEvento: () => ({ mutate: () => {}, isPending: false, isError: false, error: null }),
}));
// Simulação salva (servidor) fora do teste: vazia, sem QueryClient.
vi.mock('../pgblMarcacoes', async (original) => {
  const real = await original<typeof import('../pgblMarcacoes')>();
  const vazio = {
    carregando: false,
    campos: {},
    planos: {},
    marcas: {},
    salvoEm: null,
    estado: 'ocioso' as const,
    setCampo: () => {},
    setCampos: () => {},
    marcar: () => {},
    marcarRegime: () => {},
  };
  return {
    ...real,
    useSimulacaoPgbl: () => ({ ...vazio, campos: estado.campos }),
    usePlanosMarcados: () => ({ marcas: {}, marcar: () => {} }),
  };
});

const S = { saldo: 9876543.21, aplicado: 8765432.1 };

vi.mock('@/hooks/useIR', () => {
  const ok = <T,>(data: T) => ({ data, isLoading: false, error: null });
  return {
    useIRResumoAnual: () =>
      ok({
        year: 2026,
        asOf: '2026-10-31',
        irPorCategoria: {
          rendaVariavelBr: S.saldo,
          stocksUs: S.aplicado,
          cripto: S.saldo,
          comecotas: S.aplicado,
          rendaFixa: S.saldo,
          total: S.saldo,
        },
        rendimentos: {
          isentos: { dividendosAcoesBr: S.saldo, rendimentosFii: S.aplicado, total: S.saldo },
          tributacaoExclusiva: { jcp: S.aplicado, total: S.aplicado },
          exterior: { proventos: S.saldo, total: S.saldo, semCambio: 0 },
          totalRecebido: S.saldo,
        },
        observacoes: [],
      }),
    useIRMensal: () =>
      ok({
        asOf: '2026-10-31',
        meses: [
          {
            year: 2026,
            month: 1,
            yearMonth: '2026-01',
            irTotalDevido: S.saldo,
            porCategoria: {
              acao_br: {
                category: 'acao_br',
                vendasTotal: S.saldo,
                lucroBruto: S.aplicado,
                prejuizoCompensado: 0,
                lucroTributavel: S.aplicado,
                isento: false,
                motivoIsencao: null,
                aliquota: 0.15,
                irDevido: S.saldo,
                saldoPrejuizoFinal: 0,
              },
              fii: {
                category: 'fii',
                vendasTotal: S.aplicado,
                lucroBruto: -S.saldo,
                prejuizoCompensado: 0,
                lucroTributavel: 0,
                isento: false,
                motivoIsencao: null,
                aliquota: 0.2,
                irDevido: 0,
                saldoPrejuizoFinal: S.saldo,
              },
              etf_br: {
                category: 'etf_br',
                vendasTotal: S.aplicado,
                lucroBruto: 0,
                prejuizoCompensado: 0,
                lucroTributavel: 0,
                isento: true,
                motivoIsencao: 'vendas até R$ 20 mil',
                aliquota: 0.15,
                irDevido: 0,
                saldoPrejuizoFinal: 0,
              },
            },
          },
        ],
        saldosPrejuizoAtual: { rvComum: S.saldo, fii: S.aplicado },
      }),
    useIRStocksUs: () =>
      ok({
        asOf: '2026-10-31',
        meses: [
          {
            year: 2026,
            month: 2,
            yearMonth: '2026-02',
            vendasTotalBrl: S.saldo,
            lucroBrutoBrl: -S.aplicado,
            isento: false,
            motivoIsencao: null,
            aliquota: 0.15,
            irDevido: S.saldo,
          },
        ],
      }),
    useIRCripto: () =>
      ok({
        asOf: '2026-10-31',
        meses: [
          {
            year: 2026,
            month: 3,
            yearMonth: '2026-03',
            vendasTotal: S.saldo,
            lucroBruto: S.aplicado,
            isento: false,
            motivoIsencao: null,
            aliquota: 0.15,
            irDevido: S.aplicado,
          },
        ],
      }),
    useIRPgbl: () =>
      ok({
        year: 2026,
        asOf: '2026-10-31',
        planos: [
          {
            assetId: 'prev1',
            nome: 'Renda Futura PGBL',
            cnpj: null,
            tipoSugerido: 'pgbl',
            aportesQuantidade: 3,
            aportesTotal: S.saldo,
            resgatesTotal: 0,
            saldoAtual: S.aplicado,
          },
        ],
      }),
    useIRComecotas: () =>
      ok({
        asOf: '2026-10-31',
        totalProximaCobranca: S.saldo,
        proximaCobrancaGlobal: '2026-11-30T12:00:00.000Z',
        fundos: [
          {
            symbol: 'FUNDO1',
            nome: 'Fundo Longo',
            tipo: 'longo-prazo',
            diasDecorridos: 120,
            rendimentoEstimado: S.aplicado,
            aliquota: 0.15,
            irEstimado: S.saldo,
            proximaCobranca: '2026-11-30',
            isentoComeCotas: false,
          },
        ],
      }),
  };
});

import IRResumoAnual from '../IRResumoAnual';
import IRMensalRendaVariavel from '../IRMensalRendaVariavel';
import IRStocksUs from '../IRStocksUs';
import IRCripto from '../IRCripto';
import IRComecotas from '../IRComecotas';
import IRPgbl from '../IRPgbl';

afterEach(() => {
  estado.belowLg = false;
  estado.campos = {};
});

/** Simulação salva com renda e IR retido: liga o Balanço da DAA e as contas da aba PGBL. */
const CAMPOS_PREENCHIDOS = {
  rendaTributavel: '200.000,00',
  inss: '10.000,00',
  irRetido: '45.000,00',
  saude: '5.000,00',
};

const sentinelas = [SENTINELAS.saldo, SENTINELAS.aplicado];

const TELAS: Array<[string, React.ComponentType, (texto: string) => void]> = [
  [
    'Resumo anual',
    IRResumoAnual,
    (t) => {
      // Alíquota do JCP continua.
      expect(t).toMatch(/17,5%|15%/);
    },
  ],
  [
    'Mensal — RV BR',
    IRMensalRendaVariavel,
    (t) => {
      expect(t).toContain('Isento');
      expect(t).toContain('1 meses apurados');
    },
  ],
  [
    'Stocks US',
    IRStocksUs,
    (t) => {
      // Regra pública (limite de isenção) fica legível.
      expect(t).toMatch(/R\$\s35\.000,00/);
      expect(t).toContain('R$ 35k/mês');
    },
  ],
  [
    'Cripto',
    IRCripto,
    (t) => {
      expect(t).toContain('R$ 35k/mês');
    },
  ],
  [
    'Come-cotas',
    IRComecotas,
    (t) => {
      expect(t).toContain('15%');
      expect(t).toContain('120 dias na carteira');
    },
  ],
  [
    'PGBL',
    IRPgbl,
    (t) => {
      // Regras públicas (limites legais) e percentuais ficam legíveis.
      expect(t).toMatch(/R\$\s3\.561,50/);
      expect(t).toMatch(/R\$\s2\.275,08/);
      expect(t).toContain('Limite dedutível (12%)');
    },
  ],
];

describe('IR + esconder valores', () => {
  for (const belowLg of [false, true]) {
    const tela = belowLg ? 'celular' : 'computador';
    for (const [nome, Componente, conferirVisiveis] of TELAS) {
      it(`${tela} · ${nome}: olho fechado sem valores, alíquotas visíveis`, () => {
        estado.belowLg = belowLg;
        const { container } = renderComValoresOcultos(<Componente />);
        expectSemValoresExpostos(container, { sentinelas });
        expectPilulas(container);
        conferirVisiveis(container.textContent ?? '');
      });
    }
  }

  for (const [nome, Componente] of TELAS) {
    it(`olho aberto · ${nome}: valores de hoje, nenhuma pílula`, () => {
      const { container } = renderComValoresOcultos(<Componente />, { ocultos: false });
      expectPilulas(container, 0);
      expect(container.textContent).toMatch(/9\.876\.543,21|8\.765\.432,10/);
    });
  }

  for (const [nome, Componente] of [
    ['Resumo anual', IRResumoAnual],
    ['PGBL', IRPgbl],
  ] as const) {
    it(`${nome} com a simulação preenchida: olho fechado sem valores`, () => {
      estado.campos = CAMPOS_PREENCHIDOS;
      const { container } = renderComValoresOcultos(<Componente />);
      expectSemValoresExpostos(container, { sentinelas });
      expectPilulas(container);
    });
  }

  it('Resumo anual: Balanço estimado da DAA com os dados salvos na aba PGBL', () => {
    estado.campos = CAMPOS_PREENCHIDOS;
    renderComValoresOcultos(<IRResumoAnual />, { ocultos: false });
    expect(screen.getByText('Balanço estimado da DAA 2027')).toBeInTheDocument();
    expect(screen.getByText(/Restituição projetada|Imposto a pagar projetado/)).toBeInTheDocument();
    expect(screen.queryByText(/Preencher agora/)).not.toBeInTheDocument();
  });

  it('Resumo anual: sem dados na aba PGBL o Balanço pede o preenchimento', () => {
    renderComValoresOcultos(<IRResumoAnual />, { ocultos: false });
    expect(screen.getByText('Balanço estimado da DAA 2027')).toBeInTheDocument();
    expect(screen.getByText(/Preencher agora/)).toBeInTheDocument();
  });

  it('Resumo anual: o subtexto "Dividendos: R$ … • FII: R$ …" esconde só os valores', () => {
    renderComValoresOcultos(<IRResumoAnual />);
    const subtexto = screen.getByText(/Dividendos:/);
    expectPilulas(subtexto, 2);
    expect(textosExpostos(subtexto).join('')).toMatch(
      /^Dividendos:\s+(valor oculto)?\s*•\s+FII:\s+/,
    );
  });
});
