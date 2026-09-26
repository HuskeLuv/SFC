// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_RECENTES,
  gravarRecente,
  lerRecentes,
  recentesStorageKey,
  resolverRecentes,
} from '../lancamentoRecentes';
import type { LinhaEditavel } from '@/services/cashflow/linhasEditaveis';

const linha = (itemId: string, itemNome: string, grupoNome: string): LinhaEditavel => ({
  itemId,
  itemNome,
  grupoNome,
  grupoTipo: 'despesa',
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('lancamentoRecentes', () => {
  it('grava por usuário, mais recente primeiro, sem repetir e no máximo 5', () => {
    for (let i = 0; i < 7; i++) {
      gravarRecente('u1', { itemId: `i${i}`, nome: `L${i}`, trilha: 'Despesas > X' });
    }
    gravarRecente('u1', { itemId: 'i5', nome: 'L5', trilha: 'Despesas > X' });
    const lista = lerRecentes('u1');
    expect(lista).toHaveLength(MAX_RECENTES);
    expect(lista.map((r) => r.itemId)).toEqual(['i5', 'i6', 'i4', 'i3', 'i2']);
    expect(lerRecentes('u2')).toEqual([]);
    expect(window.localStorage.getItem(recentesStorageKey('u1'))).toContain('i5');
  });

  it('o id novo da personalização substitui o recente de mesmo nome+trilha', () => {
    gravarRecente('u1', { itemId: 'tpl-super', nome: 'Supermercado', trilha: 'Despesas > A' });
    gravarRecente('u1', { itemId: 'user-super', nome: 'Supermercado', trilha: 'Despesas > A' });
    expect(lerRecentes('u1')).toEqual([
      { itemId: 'user-super', nome: 'Supermercado', trilha: 'Despesas > A' },
    ]);
  });

  it('resolve pelo id; se o id sumiu, pelo nome+trilha; senão descarta', () => {
    const linhas = [
      linha('user-super', 'Supermercado', 'Despesas > Alimentação'),
      linha('i-outros-a', 'Outros', 'Despesas > Alimentação'),
      linha('i-outros-t', 'Outros', 'Despesas > Transporte'),
    ];
    const r = resolverRecentes(
      [
        // id antigo (template) → acha pelo nome+trilha
        { itemId: 'tpl-super', nome: 'Supermercado', trilha: 'Despesas > Alimentação' },
        // "Outros" do Transporte, não o da Alimentação
        { itemId: 'sumiu', nome: 'Outros', trilha: 'Despesas > Transporte' },
        // linha excluída → descartada
        { itemId: 'x', nome: 'Academia', trilha: 'Despesas > Saúde' },
        // mesma linha repetida por id → uma vez só
        { itemId: 'user-super', nome: 'Supermercado', trilha: 'Despesas > Alimentação' },
      ],
      linhas,
    );
    expect(r.map((l) => l.itemId)).toEqual(['user-super', 'i-outros-t']);
  });

  it('dado corrompido ou sem usuário vira lista vazia', () => {
    window.localStorage.setItem(recentesStorageKey('u1'), '{nao é json');
    expect(lerRecentes('u1')).toEqual([]);
    window.localStorage.setItem(recentesStorageKey('u1'), JSON.stringify([{ itemId: 1 }, 'x']));
    expect(lerRecentes('u1')).toEqual([]);
    expect(lerRecentes(null)).toEqual([]);
    gravarRecente(undefined, { itemId: 'a', nome: 'A', trilha: 'T' });
    expect(window.localStorage.length).toBe(1);
  });
});
