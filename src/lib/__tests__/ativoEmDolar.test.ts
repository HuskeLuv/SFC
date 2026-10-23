import { describe, it, expect } from 'vitest';
import {
  isAtivoEmDolar,
  lerNotesTransacao,
  marcadorOperacaoUsd,
  posicaoEmDolar,
  unidadeDaTransacao,
} from '../ativoEmDolar';

const PETR4 = { type: 'stock', currency: 'BRL' };
const STOCK_SEM_MOEDA = { type: 'stock', currency: null };
const CRYPTO_USD = { type: 'crypto', currency: 'USD' };
const ETF_USD = { type: 'etf', currency: 'USD' };
const REIT_USD = { type: 'reit', currency: 'USD' };
const STOCK_USD = { type: 'stock', currency: 'USD' };

const notesCom = (operation: Record<string, unknown>) => JSON.stringify({ operation });

describe('isAtivoEmDolar', () => {
  it('só stock/reit com currency USD', () => {
    expect(isAtivoEmDolar(PETR4)).toBe(false);
    expect(isAtivoEmDolar(STOCK_SEM_MOEDA)).toBe(false);
    expect(isAtivoEmDolar(CRYPTO_USD)).toBe(false);
    expect(isAtivoEmDolar(ETF_USD)).toBe(false);
    expect(isAtivoEmDolar(REIT_USD)).toBe(true);
    expect(isAtivoEmDolar(STOCK_USD)).toBe(true);
    expect(isAtivoEmDolar(null)).toBe(false);
    expect(isAtivoEmDolar({ type: 'bdr', currency: 'USD' })).toBe(false);
  });
});

describe('lerNotesTransacao', () => {
  it('aceita string JSON e objeto; ilegível/vazio/array = null', () => {
    expect(lerNotesTransacao('{"a":1}')).toEqual({ a: 1 });
    expect(lerNotesTransacao({ a: 1 })).toEqual({ a: 1 });
    expect(lerNotesTransacao('{quebrado')).toBeNull();
    expect(lerNotesTransacao('')).toBeNull();
    expect(lerNotesTransacao('[1]')).toBeNull();
    expect(lerNotesTransacao(null)).toBeNull();
  });
});

describe('unidadeDaTransacao', () => {
  it('ação BR é sempre BRL, mesmo com marcador USD', () => {
    expect(unidadeDaTransacao({ notes: notesCom({ unidade: 'USD' }) }, PETR4)).toBe('BRL');
    expect(unidadeDaTransacao({ notes: null }, PETR4)).toBe('BRL');
    expect(unidadeDaTransacao({ notes: notesCom({ unidade: 'USD' }) }, ETF_USD)).toBe('BRL');
  });

  it('com marcador segue o marcador', () => {
    expect(unidadeDaTransacao({ notes: notesCom({ unidade: 'USD' }) }, STOCK_USD)).toBe('USD');
    expect(unidadeDaTransacao({ notes: notesCom({ unidade: 'BRL' }) }, REIT_USD)).toBe('BRL');
  });

  it('sem marcador: stock = BRL (legado), REIT = USD', () => {
    // operation.moeda 'USD' é a escolha do usuário, não a unidade gravada.
    const legado = notesCom({ moeda: 'USD', cotacaoMoeda: 5 });
    expect(unidadeDaTransacao({ notes: legado }, STOCK_USD)).toBe('BRL');
    expect(unidadeDaTransacao({ notes: legado }, REIT_USD)).toBe('USD');
  });

  it('notes ilegível cai no padrão do tipo', () => {
    expect(unidadeDaTransacao({ notes: '{quebrado' }, STOCK_USD)).toBe('BRL');
    expect(unidadeDaTransacao({ notes: '{quebrado' }, REIT_USD)).toBe('USD');
    expect(unidadeDaTransacao({ notes: notesCom({ unidade: 'EUR' }) }, STOCK_USD)).toBe('BRL');
  });
});

describe('posicaoEmDolar', () => {
  it('moedaRegistro null: stock não, REIT sim', () => {
    expect(posicaoEmDolar({ moedaRegistro: null }, STOCK_USD)).toBe(false);
    expect(posicaoEmDolar({ moedaRegistro: null }, REIT_USD)).toBe(true);
    expect(posicaoEmDolar({}, REIT_USD)).toBe(true);
  });

  it("moedaRegistro 'USD' em ativo em dólar: sim", () => {
    expect(posicaoEmDolar({ moedaRegistro: 'USD' }, STOCK_USD)).toBe(true);
    expect(posicaoEmDolar({ moedaRegistro: 'USD' }, REIT_USD)).toBe(true);
  });

  it('ativo que não está em dólar: nunca', () => {
    expect(posicaoEmDolar({ moedaRegistro: 'USD' }, PETR4)).toBe(false);
    expect(posicaoEmDolar({ moedaRegistro: 'USD' }, STOCK_SEM_MOEDA)).toBe(false);
    expect(posicaoEmDolar({ moedaRegistro: 'USD' }, ETF_USD)).toBe(false);
  });

  it("moedaRegistro 'BRL' explícito: não", () => {
    expect(posicaoEmDolar({ moedaRegistro: 'BRL' }, REIT_USD)).toBe(false);
  });
});

describe('marcadorOperacaoUsd', () => {
  it('monta o marcador e descarta cotação inválida', () => {
    expect(marcadorOperacaoUsd(5.2)).toEqual({ moeda: 'USD', unidade: 'USD', cotacaoMoeda: 5.2 });
    expect(marcadorOperacaoUsd(0).cotacaoMoeda).toBeNull();
    expect(marcadorOperacaoUsd().cotacaoMoeda).toBeNull();
  });
});
