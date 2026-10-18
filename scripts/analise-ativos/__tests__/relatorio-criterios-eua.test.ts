import { describe, expect, it } from 'vitest';
import { montarRelatorioEua, type LinhaEvalEua } from '../relatorio-criterios-eua';

const linha = (
  symbol: string,
  classe: 'stock' | 'reit' | 'acao',
  perfil: string,
  janela: number,
  estados: Record<string, string>,
): LinhaEvalEua => ({
  symbol,
  classe,
  perfil,
  janela,
  atendidos: Object.values(estados).filter((e) => e === 'atende').length,
  aplicaveis: 6,
  anoFim: 2025,
  paramsVersion: 3,
  resultados: Object.entries(estados).map(([id, estado]) => ({ id, estado })),
});

const STOCK = {
  rec: 'atende',
  luc: 'nao_atende',
  ebitda: 'atende',
  mg: 'atende',
  dl: 'atende',
  fcl: 'sem_dado',
};
const REIT = {
  rec: 'atende',
  dpa: 'atende',
  fco_acao: 'nao_atende',
  dl: 'nao_atende',
  pay: 'atende',
  ocup: 'sem_dado',
};

describe('montarRelatorioEua', () => {
  const linhas = [3, 5, 10].flatMap((j) => [
    linha('AAPL', 'stock', 'stock', j, STOCK),
    linha('O', 'reit', 'reit', j, REIT),
    linha('PETR4', 'acao', 'acao', j, STOCK),
  ]);
  const r = montarRelatorioEua(linhas, { geradoEm: '2026-10-17' });

  it('só as classes EUA, por perfil, com a distribuição n de 6', () => {
    expect(r.texto).toContain('== perfil stock (1 tickers) ==');
    expect(r.texto).toContain('== perfil reit (1 tickers) ==');
    expect(r.texto).not.toContain('perfil acao');
    expect(r.texto).toContain('distribuição (janela 5): 4 de 6: 1');
  });

  it('cobertura contra os mínimos: fcl sem dado fica ABAIXO', () => {
    expect(r.texto).toMatch(/ABAIXO stock\.fcl: 0\/1/);
    expect(r.abaixoDoMinimo).toBe(1);
  });

  it('nota explícita do caixa operacional por ação e da ocupação dos REITs', () => {
    expect(r.texto).toContain('Caixa operacional/ação crescente na janela 5: 0/1 (0%) atendem');
    expect(r.texto).toContain('Ocupação ≥ 95%: sem dado para todos');
  });

  it('linguagem factual: sem recomendação nem nome de índice', () => {
    expect(r.texto).not.toMatch(/recomenda|melhor|pior|S&P|MSCI/i);
  });
});
