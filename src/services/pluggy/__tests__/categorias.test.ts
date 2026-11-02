import { describe, expect, it } from 'vitest';
import { LINHAS_PADRAO } from '@/lib/cashflow/linhasPadrao';
import { MAPA_CATEGORIAS, sugerirPorCategoria } from '../categorias';

describe('sugerirPorCategoria', () => {
  it('mapeia categorias do sandbox para linhas do template', () => {
    expect(sugerirPorCategoria('Salary')).toEqual({
      tipo: 'linha',
      caminho: ['Entradas', 'Entradas Fixas'],
      item: 'Pró-labore / Salário 1',
      alternativas: [{ caminho: ['Entradas', 'Entradas Fixas'], item: 'Salário' }],
    });
    expect(sugerirPorCategoria('Electricity')).toEqual({
      tipo: 'linha',
      caminho: ['Despesas', 'Despesas Fixas', 'Habitação'],
      item: 'Conta de energia',
    });
    expect(sugerirPorCategoria('Telecommunications')).toMatchObject({
      caminho: ['Despesas', 'Despesas Fixas', 'Despesas Pessoais'],
      item: 'Celular',
      alternativas: [
        { caminho: ['Despesas', 'Despesas Fixas', 'Habitação'], item: 'Telefones celulares' },
      ],
    });
    expect(sugerirPorCategoria('Gyms and fitness centers')).toMatchObject({
      caminho: ['Despesas', 'Despesas Fixas', 'Despesas Pessoais'],
      item: 'Academia',
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

  it('a sugestão principal é uma linha padrão do grupo (menos Despesas Financeiras › Outros, legado)', () => {
    for (const [cat, s] of Object.entries(MAPA_CATEGORIAS)) {
      if (s.tipo !== 'linha') continue;
      const grupo = s.caminho.at(-1)!;
      if (grupo === 'Despesas Financeiras' && s.item === 'Outros') continue;
      const nomes = (LINHAS_PADRAO[grupo] ?? []).map((l) => l.name);
      expect(nomes, `${cat} → ${grupo} › ${s.item}`).toContain(s.item);
    }
  });
});
