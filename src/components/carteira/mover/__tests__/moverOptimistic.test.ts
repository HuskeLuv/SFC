import { describe, expect, it } from 'vitest';
import {
  CAMPO_PENDENTE,
  encontrarLinha,
  moverLinhaEntreSecoes,
  removerLinha,
  secaoDaLinha,
  type DadosAba,
} from '../moverOptimistic';

const linha = (id: string, tipo: string, valor: number, extra: Record<string, unknown> = {}) => ({
  id,
  ticker: id.toUpperCase(),
  tipo,
  quantidade: 10,
  valorTotal: valor * 0.9,
  valorAtualizado: valor,
  percentualCarteira: valor / 10,
  riscoPorAtivo: 1,
  objetivo: 5,
  quantoFalta: 1,
  necessidadeAporte: 100,
  rentabilidade: 10,
  ...extra,
});

const secao = (tipo: string, nome: string, ativos: ReturnType<typeof linha>[]) => ({
  tipo,
  nome,
  ativos,
  totalQuantidade: ativos.reduce((s, a) => s + a.quantidade, 0),
  totalValorAplicado: ativos.reduce((s, a) => s + a.valorTotal, 0),
  totalValorAtualizado: ativos.reduce((s, a) => s + a.valorAtualizado, 0),
  totalPercentualCarteira: ativos.reduce((s, a) => s + a.percentualCarteira, 0),
  totalRisco: ativos.length,
  totalObjetivo: ativos.reduce((s, a) => s + a.objetivo, 0),
  totalQuantoFalta: ativos.length,
  totalNecessidadeAporte: ativos.length * 100,
  rentabilidadeMedia: 10,
});

const fii = (): DadosAba => ({
  secoes: [
    secao('fofi', 'FOF', [linha('kdif', 'fofi', 1000), linha('cpti', 'fofi', 500)]),
    secao('tvm', 'TVM', [linha('irim', 'tvm', 800)]),
  ],
  totalGeral: {
    quantidade: 30,
    valorAplicado: 2070,
    valorAtualizado: 2300,
    objetivo: 15,
    quantoFalta: 3,
    necessidadeAporte: 300,
    rentabilidade: 10,
  },
});

describe('moverLinhaEntreSecoes', () => {
  it('troca a seção da linha, marca pendente e recalcula as somas das duas seções', () => {
    const dados = fii();
    const novo = moverLinhaEntreSecoes(dados, 'fiis', 'kdif', 'tvm');

    const fofi = novo.secoes.find((s) => s.tipo === 'fofi')!;
    const tvm = novo.secoes.find((s) => s.tipo === 'tvm')!;
    expect(fofi.ativos.map((a) => a.id)).toEqual(['cpti']);
    expect(tvm.ativos.map((a) => a.id)).toEqual(['irim', 'kdif']);
    const movida = tvm.ativos.find((a) => a.id === 'kdif')!;
    expect(movida.tipo).toBe('tvm');
    expect(movida[CAMPO_PENDENTE]).toBe(true);
    expect(fofi.totalValorAtualizado).toBe(500);
    expect(tvm.totalValorAtualizado).toBe(1800);
    expect(tvm.totalQuantidade).toBe(20);
    expect(tvm.totalObjetivo).toBe(10);
    // Total geral não muda (mesma aba).
    expect(novo.totalGeral).toEqual(dados.totalGeral);
    // Não muta o original (rollback).
    expect(dados.secoes[0].ativos).toHaveLength(2);
  });

  it('cria a seção de destino que não existe e remove a de origem vazia', () => {
    const novo = moverLinhaEntreSecoes(fii(), 'fiis', 'irim', 'infra');
    expect(novo.secoes.map((s) => s.tipo)).toEqual(['fofi', 'infra']);
    const infra = novo.secoes.find((s) => s.tipo === 'infra')!;
    expect(infra.nome).toBe('Infra');
    expect(infra.totalValorAtualizado).toBe(800);
    expect(infra.rentabilidadeMedia).toBe(10);
  });

  it('usa o campo de seção da aba (estrategia em Ações, regiao em ETF)', () => {
    const acoes: DadosAba = {
      secoes: [
        { estrategia: 'value', nome: 'Value', ativos: [{ id: 'petr', estrategia: 'value' }] },
      ],
    };
    const novo = moverLinhaEntreSecoes(acoes, 'acoes', 'petr', 'growth');
    expect(secaoDaLinha(novo, 'acoes', 'petr')).toBe('growth');
  });

  it('sem a linha no cache devolve os dados como estão', () => {
    const dados = fii();
    expect(moverLinhaEntreSecoes(dados, 'fiis', 'nada', 'tvm')).toBe(dados);
  });
});

describe('removerLinha', () => {
  it('tira a linha da aba e desconta seção e total geral', () => {
    const novo = removerLinha(fii(), 'kdif');
    expect(encontrarLinha(novo, 'kdif')).toBeNull();
    const fofi = novo.secoes.find((s) => s.tipo === 'fofi')!;
    expect(fofi.totalValorAtualizado).toBe(500);
    expect(novo.totalGeral?.valorAtualizado).toBe(1300);
    expect(novo.totalGeral?.objetivo).toBe(10);
    expect(novo.totalGeral?.quantidade).toBe(20);
    // rentabilidade agregada não é soma: fica como está até o refetch.
    expect(novo.totalGeral?.rentabilidade).toBe(10);
  });

  it('remove a seção que ficou vazia', () => {
    const novo = removerLinha(fii(), 'irim');
    expect(novo.secoes.map((s) => s.tipo)).toEqual(['fofi']);
  });

  it('fundos: valor aplicado vem de valorInicialAplicado', () => {
    const dados: DadosAba = {
      secoes: [
        {
          tipo: 'fim',
          ativos: [
            { id: 'f1', tipo: 'fim', valorInicialAplicado: 300, valorAtualizado: 330 },
            { id: 'f2', tipo: 'fim', valorInicialAplicado: 100, valorAtualizado: 110 },
          ],
          totalValorAplicado: 400,
          totalValorAtualizado: 440,
        },
      ],
      totalGeral: { valorAplicado: 400, valorAtualizado: 440 },
    };
    const novo = removerLinha(dados, 'f1');
    expect(novo.secoes[0].totalValorAplicado).toBe(100);
    expect(novo.totalGeral?.valorAplicado).toBe(100);
  });
});
