import { describe, expect, it } from 'vitest';
import { MAPA_CATEGORIAS, sugerirPorCategoria } from '../categorias';

describe('sugerirPorCategoria', () => {
  it('mapeia categorias do sandbox para linhas do template', () => {
    expect(sugerirPorCategoria('Salary')).toEqual({
      tipo: 'linha',
      caminho: ['Entradas', 'Entradas Fixas'],
      item: 'Salário',
    });
    expect(sugerirPorCategoria('Electricity')).toMatchObject({ item: 'Conta de energia' });
    expect(sugerirPorCategoria('Telecommunications')).toMatchObject({
      item: 'Telefones celulares',
    });
    expect(sugerirPorCategoria('Gyms and fitness centers')).toMatchObject({
      caminho: ['Despesas', 'Despesas Fixas', 'Saúde'],
    });
    expect(sugerirPorCategoria('Groceries')).toMatchObject({ item: 'Supermercado' });
  });

  it('transferências próprias e fatura são transferência; investimentos ficam com a Carteira', () => {
    expect(sugerirPorCategoria('Credit card payment')).toEqual({ tipo: 'transferencia' });
    expect(sugerirPorCategoria('Same person transfer - PIX')).toEqual({ tipo: 'transferencia' });
    expect(sugerirPorCategoria('Fixed income')).toEqual({ tipo: 'investimento' });
  });

  it('transferência genérica, Other e nulo ficam sem sugestão', () => {
    expect(sugerirPorCategoria('Transfer - PIX')).toEqual({ tipo: 'nenhuma' });
    expect(sugerirPorCategoria('Other')).toEqual({ tipo: 'nenhuma' });
    expect(sugerirPorCategoria(null)).toEqual({ tipo: 'nenhuma' });
    expect(sugerirPorCategoria('Categoria inventada')).toEqual({ tipo: 'nenhuma' });
  });

  it('toda linha do mapa aponta para um caminho que começa em Entradas ou Despesas', () => {
    for (const [cat, s] of Object.entries(MAPA_CATEGORIAS)) {
      if (s.tipo !== 'linha') continue;
      expect(['Entradas', 'Despesas'], cat).toContain(s.caminho[0]);
      expect(s.item.length, cat).toBeGreaterThan(0);
    }
  });
});
