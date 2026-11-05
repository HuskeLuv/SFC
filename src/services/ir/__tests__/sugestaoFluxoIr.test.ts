import { describe, expect, it } from 'vitest';
import { sugerirDoFluxo } from '../sugestaoFluxoIr';

const linha = (name: string, porMes: number[], extra: Record<string, unknown> = {}) => ({
  name,
  values: porMes.map((value, month) => ({ month, value })),
  ...extra,
});

describe('sugerirDoFluxo', () => {
  it('soma o ano das entradas tributáveis e das despesas dedutíveis, com as linhas de origem', () => {
    const r = sugerirDoFluxo([
      {
        name: 'Entradas',
        type: 'entrada',
        children: [
          {
            name: 'Entradas Fixas',
            items: [
              linha('Pró-labore / Salário 1', [5000, 5000]),
              linha('Aluguel 1', [1500]),
              linha("Proventos FII's", [300]),
            ],
          },
          {
            name: 'Sem Tributação',
            items: [linha('13º Salário', [5000]), linha('Férias', [6000])],
          },
        ],
      },
      {
        name: 'Despesas',
        type: 'despesa',
        children: [
          {
            name: 'Saúde',
            items: [
              linha('Plano de Saúde', [800, 800]),
              linha('Médicos e terapeutas', [400]),
              linha('Medicamentos / Farmácia', [200]),
            ],
          },
          {
            name: 'Despesas com Dependentes',
            items: [
              linha('Escola / Faculdade', [2000, 2000]),
              linha('Material escolar', [500]),
              linha('Cursos', [300]),
            ],
          },
          { name: 'Animais de Estimação', items: [linha('Exames e consultas', [600])] },
        ],
      },
    ]);

    expect(r.rendaTributavel.total).toBe(11500);
    expect(r.rendaTributavel.linhas.map((l) => l.linha)).toEqual([
      'Pró-labore / Salário 1',
      'Aluguel 1',
    ]);
    expect(r.saude).toEqual({
      total: 2000,
      linhas: [
        { grupo: 'Saúde', linha: 'Plano de Saúde', total: 1600 },
        { grupo: 'Saúde', linha: 'Médicos e terapeutas', total: 400 },
      ],
    });
    expect(r.educacao).toEqual({
      total: 4000,
      linhas: [{ grupo: 'Despesas com Dependentes', linha: 'Escola / Faculdade', total: 4000 }],
    });
  });

  it('ignora linhas e grupos ocultos e linhas sem valor no ano', () => {
    const r = sugerirDoFluxo([
      {
        name: 'Despesas',
        type: 'despesa',
        items: [linha('Plano de Saúde', [0, 0]), linha('Escola', [900], { hidden: true })],
        children: [{ name: 'Saúde', hidden: true, items: [linha('Dentista', [300])] }],
      },
    ]);
    expect(r.saude.total).toBe(0);
    expect(r.educacao.total).toBe(0);
  });
});
