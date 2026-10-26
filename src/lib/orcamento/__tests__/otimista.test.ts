import { describe, it, expect } from 'vitest';
import type { CategoriaV2, OrcamentoV2Response, SubcategoriaV2 } from '@/types/orcamentoV2';
import { aplicarNaSubcategoria, aplicarOrcadoOtimista, aplicarRespostaEscrita } from '../otimista';

const sub = (id: string, extra: Partial<SubcategoriaV2> = {}): SubcategoriaV2 => ({
  id,
  nome: id,
  geral: false,
  fixa: false,
  espelho: null,
  orcado: 0,
  valor: null,
  pct: null,
  realizado: 0,
  diferenca: 0,
  consumido: null,
  status: 'none',
  editavelEstrutura: true,
  editavelOrcado: true,
  ...extra,
});

const categoria = (id: string, subcategorias: SubcategoriaV2[], extra: Partial<CategoriaV2> = {}) =>
  ({
    id,
    nome: id,
    icone: 'x',
    abreviacao: id,
    poupanca: false,
    sistema: false,
    orcado: 0,
    realizado: 0,
    diferenca: 0,
    consumido: null,
    pctReceita: null,
    status: 'none',
    qtdEstouro: 0,
    qtdAFrente: 0,
    qtdComOrcamento: 0,
    subcategorias,
    ...extra,
  }) as CategoriaV2;

function payload(visao: 'mes' | 'ano' = 'mes'): OrcamentoV2Response {
  return {
    versao: 2,
    ano: 2026,
    mes: 10,
    visao,
    fonte: 'lancado',
    referencia: {
      dia: 23,
      diasNoMes: 31,
      ritmo: 0.5,
      fase: 'corrente',
      rotuloRealizado: 'lancado',
      atualizadoEm: '',
    },
    receitaPrevista: { valor: 24000, origem: 'fluxo' },
    resumo: {} as OrcamentoV2Response['resumo'],
    copiarDe: { ano: 2026, mes: 9, temOrcado: false },
    prefs: { categoriasRecolhidas: [], graficoVisivel: true, avisoGeralPendente: false },
    categorias: [
      categoria('lazer', [sub('bar', { realizado: 90 }), sub('cinema', { realizado: 10 })]),
      categoria('plan', [sub('reserva')], { poupanca: true }),
    ],
  };
}

describe('otimista', () => {
  it('orçado novo recalcula linha (status com o ritmo), categoria e resumo', () => {
    const d = aplicarOrcadoOtimista(payload(), 'bar', { valor: 100, pct: null });
    const bar = d.categorias[0].subcategorias[0];
    // 90% consumido com ritmo 0,5 → à frente do ritmo
    expect(bar).toMatchObject({ orcado: 100, valor: 100, consumido: 0.9, status: 'warn' });
    expect(d.categorias[0]).toMatchObject({ orcado: 100, realizado: 100, qtdAFrente: 1 });
    expect(d.resumo).toMatchObject({ orcado: 100, realizado: 100, sobraPrevista: 23900 });
    expect(d.resumo.contagens.aFrente).toBe(1);
  });

  it('pct converte pela receita do payload (R-17)', () => {
    const d = aplicarOrcadoOtimista(payload(), 'reserva', { valor: null, pct: 10 });
    expect(d.categorias[1].subcategorias[0]).toMatchObject({ orcado: 2400, pct: 10, valor: null });
  });

  it('fixa não acende "à frente"', () => {
    const d1 = aplicarOrcadoOtimista(payload(), 'bar', { valor: 100, pct: null });
    const d2 = aplicarNaSubcategoria(d1, 'bar', { fixa: true });
    expect(d2.categorias[0].subcategorias[0].status).toBe('ok');
  });

  it('visão ano e item inexistente: payload intacto', () => {
    const ano = payload('ano');
    expect(aplicarOrcadoOtimista(ano, 'bar', { valor: 1, pct: null })).toBe(ano);
    const mes = payload();
    expect(aplicarOrcadoOtimista(mes, 'nao-existe', { valor: 1, pct: null })).toBe(mes);
  });

  it('resposta do servidor troca a categoria inteira e o resumo', () => {
    const d = payload();
    const nova = categoria('lazer', [sub('bar-u', { orcado: 50 })], { orcado: 50 });
    const r = aplicarRespostaEscrita(d, {
      subcategoria: nova.subcategorias[0],
      categoria: nova,
      resumo: { ...d.resumo, orcado: 50 },
    });
    expect(r.categorias[0]).toBe(nova);
    expect(r.categorias[1]).toBe(d.categorias[1]);
    expect(r.resumo.orcado).toBe(50);
  });
});
