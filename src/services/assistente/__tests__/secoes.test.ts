import { describe, it, expect } from 'vitest';
import {
  contextoRecortado,
  extrairSecoes,
  resultadoConsulta,
  secoesComDados,
  secoesDaIntencao,
} from '../secoes';

const ctx = {
  hoje: '2026-09-21',
  mesAtual: 'setembro',
  ano: 2026,
  usuario: { nome: 'Ana' },
  carteira: {
    saldoBruto: 1000,
    distribuicao: { acoes: { valor: 1000 } },
    posicoes: { acoes: { totalGeral: { valor: 1000 } } },
    proventosRecebidos: { total: 50 },
    rentabilidade: { twr: { noAno: 5 } },
    alocacaoAlvoPorClasse: null,
  },
  mesAtualResumo: { entradas: 10 },
  anoResumo: { acumuladoAteMesAtual: { entradas: 90 } },
  fluxoDeCaixa: [{ grupo: 'Habitação' }],
  dividas: [],
  objetivos: [{ nome: 'Viagem' }],
  aposentadoria: null,
};

describe('secoesDaIntencao', () => {
  it('une as seções das intenções sem repetir, na ordem do catálogo', () => {
    expect(secoesDaIntencao(['vencimentos', 'dividas'])).toEqual(['posicoes', 'agenda', 'dividas']);
    expect(secoesDaIntencao(['conceito', 'outro'])).toEqual([]);
  });
});

describe('secoesComDados', () => {
  it('ignora seções vazias ou nulas', () => {
    expect(secoesComDados(ctx)).toEqual([
      'posicoes',
      'rentabilidade',
      'proventos',
      'fluxo',
      'objetivos',
    ]);
  });
});

describe('contextoRecortado', () => {
  it('núcleo + seções pedidas nos mesmos caminhos + o que mais existe', () => {
    const r = contextoRecortado(ctx, ['proventos', 'dividas']);
    expect(r).toEqual({
      hoje: '2026-09-21',
      mesAtual: 'setembro',
      ano: 2026,
      usuario: { nome: 'Ana' },
      carteira: {
        saldoBruto: 1000,
        distribuicao: { acoes: { valor: 1000 } },
        proventosRecebidos: { total: 50 },
      },
      mesAtualResumo: { entradas: 10 },
      anoResumo: { acumuladoAteMesAtual: { entradas: 90 } },
      secoesDisponiveis: {
        posicoes: expect.any(String),
        rentabilidade: expect.any(String),
        fluxo: expect.any(String),
        objetivos: expect.any(String),
      },
    });
  });
});

describe('consultar_dados', () => {
  it('devolve as seções pedidas e ignora nomes desconhecidos', () => {
    expect(JSON.parse(resultadoConsulta(ctx, { secoes: ['objetivos', 'xpto'] }))).toEqual({
      objetivos: [{ nome: 'Viagem' }],
    });
  });

  it('seção sem dados e pedido inválido', () => {
    expect(JSON.parse(resultadoConsulta(ctx, { secoes: ['dividas'] }))).toEqual({
      vazio: ['dividas'],
    });
    expect(JSON.parse(resultadoConsulta(ctx, {})).erro).toMatch(/Informe secoes/);
  });

  it('extrairSecoes preserva o caminho aninhado', () => {
    expect(extrairSecoes(ctx, ['rentabilidade'])).toEqual({
      carteira: { rentabilidade: { twr: { noAno: 5 } } },
    });
  });
});
