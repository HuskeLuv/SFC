import { describe, expect, it } from 'vitest';
import { montarOrcamentoV2, type EntradaMontagem, type OrcadoRow } from '../montarOrcamento';
import { calcularReceitaPrevista, entradasLancadas, type ReceitaMes } from '../receitaPrevista';
import { ANEXO_B, ANEXO_B_HOJE, ANEXO_B_RECEITA } from '@/test/fixtures/orcamentoAnexoB';
import {
  ANEXO_B_ANO,
  ANEXO_B_MES0,
  acharGrupo,
  acharItem,
  arvoreAnexoB,
  grupo,
  idCat,
  idSub,
  indiceCategoria,
  item,
  orcadosAnexoB,
  valor,
} from '@/test/fixtures/orcamentoAnexoBArvore';
import type { CashflowGroup } from '@/types/cashflow';
import type { CategoriaV2 } from '@/types/orcamentoV2';

const AGORA = new Date('2026-10-23T15:00:00.000Z');

function receitaDa(arvore: CashflowGroup[]): ReceitaMes[] {
  return calcularReceitaPrevista(ANEXO_B_ANO, entradasLancadas(arvore), null);
}

function montar(over: Partial<EntradaMontagem> = {}) {
  const arvore = over.arvore ?? arvoreAnexoB();
  return montarOrcamentoV2({
    arvore,
    orcados: orcadosAnexoB(),
    receitaPorMes: receitaDa(arvore),
    ano: ANEXO_B_ANO,
    mes0: ANEXO_B_MES0,
    visao: 'mes',
    fonte: 'lancado',
    hojeSP: { ...ANEXO_B_HOJE },
    prefs: null,
    atualizadoEm: AGORA,
    ...over,
  });
}

const cat = (cats: CategoriaV2[], nome: string): CategoriaV2 => {
  const c = cats.find((x) => x.nome === nome);
  if (!c) throw new Error(`categoria ${nome} ausente`);
  return c;
};
const sub = (c: CategoriaV2, nome: string) => {
  const s = c.subcategorias.find((x) => x.nome === nome);
  if (!s) throw new Error(`sub ${nome} ausente em ${c.nome}`);
  return s;
};
const pct0 = (consumido: number | null) =>
  consumido === null ? null : Math.round(consumido * 100);

describe('montarOrcamentoV2 — Anexo B (outubro/2026, dia 23, receita 24.000)', () => {
  const r = montar();

  it('cabeçalho: versão, mês 1–12, referência do dia 23 de 31 e receita do Fluxo', () => {
    expect(r.versao).toBe(2);
    expect(r.ano).toBe(2026);
    expect(r.mes).toBe(10);
    expect(r.visao).toBe('mes');
    expect(r.fonte).toBe('lancado');
    expect(r.referencia).toEqual({
      dia: 23,
      diasNoMes: 31,
      ritmo: 23 / 31,
      fase: 'corrente',
      rotuloRealizado: 'lancado',
      atualizadoEm: AGORA.toISOString(),
    });
    expect(r.receitaPrevista).toEqual({ valor: 24_000, origem: 'fluxo' });
    expect(r.mesesSemOrcamento).toBeUndefined();
  });

  it('T01: totais do mês', () => {
    expect(r.resumo.orcado).toBe(18_014.9);
    expect(r.resumo.realizado).toBe(16_176);
    expect(r.resumo.disponivel).toBe(1_838.9);
    expect(r.resumo.orcadoPctReceita).toBe(75.1);
    expect(r.resumo.sobraPrevista).toBe(8_695.1);
    expect(r.resumo.orcadoObjetivos).toBe(2_710);
    expect(r.resumo.realizadoPctOrcado).toBe(89.8);
  });

  it('T02 (revisto 27/10): índice = (24.000 − 15.304,90 de gastos) ÷ 24.000 = 36,2%', () => {
    expect(r.resumo.indicePoupanca).toBe(36.2);
  });

  it('T04: contadores dos chips (Estouro 6 · À frente 6 · Sem orçamento 12; R-08 revisto)', () => {
    expect(r.resumo.contagens).toEqual({ estouro: 6, aFrente: 6, semOrcamento: 12 });
  });

  it('13 categorias e 82 subcategorias (D1–D4), na ordem da árvore', () => {
    expect(r.resumo.totalCategorias).toBe(13);
    expect(r.resumo.totalSubcategorias).toBe(82);
    expect(r.categorias.map((c) => c.nome)).toEqual(ANEXO_B.map((c) => c.nome));
  });

  it('T05: Habitação = soma das subcategorias (R-01)', () => {
    const h = cat(r.categorias, 'Habitação');
    expect(h.orcado).toBe(5_250);
    expect(h.realizado).toBe(4_768.8);
    expect(h.diferenca).toBe(481.2);
    expect(pct0(h.consumido)).toBe(91);
    expect(h.status).toBe('warn');
    expect(h.qtdEstouro).toBe(0);
    expect(h.qtdAFrente).toBe(1);
    expect(h.pctReceita).toBe(21.9);
  });

  it('T13: gasto sem orçamento acende estouro e leva a categoria junto', () => {
    const fin = cat(r.categorias, 'Despesas Financeiras');
    const juros = sub(fin, 'Juros / IOF');
    expect(juros.orcado).toBe(0);
    expect(juros.consumido).toBeNull();
    expect(juros.diferenca).toBe(-12.4);
    expect(juros.status).toBe('bad');
    expect(fin.status).toBe('bad');
    expect(pct0(fin.consumido)).toBe(107);
  });

  it('T14: categoria sem orçamento → 0 de 5, status none, consumido "—"', () => {
    const dep = cat(r.categorias, 'Despesas com dependentes');
    expect(dep.qtdComOrcamento).toBe(0);
    expect(dep.subcategorias).toHaveLength(5);
    expect(dep.status).toBe('none');
    expect(dep.consumido).toBeNull();
    expect(dep.pctReceita).toBeNull();
  });

  it('todas as linhas do Anexo B: status e % consumido por categoria e por subcategoria', () => {
    for (const esperada of ANEXO_B) {
      const c = cat(r.categorias, esperada.nome);
      expect({
        orcado: c.orcado,
        realizado: c.realizado,
        diferenca: c.diferenca,
        consumidoPct: pct0(c.consumido),
        status: c.status,
        qtdEstouro: c.qtdEstouro,
        qtdAFrente: c.qtdAFrente,
      }).toEqual(esperada.esperado);
      esperada.subcategorias.forEach((s, j) => {
        const v = c.subcategorias[j];
        expect(v.nome).toBe(s.nome);
        expect({ status: v.status, consumidoPct: pct0(v.consumido) }).toEqual(s.esperado);
      });
    }
  });

  it('Geral: não editável na estrutura, orçado editável; Planejamento é poupança e tudo fixo', () => {
    const plan = cat(r.categorias, 'Planejamento Financeiro');
    expect(plan.poupanca).toBe(true);
    expect(plan.subcategorias.every((s) => s.fixa)).toBe(true);
    const geral = sub(plan, 'Geral');
    expect(geral.geral).toBe(true);
    expect(geral.editavelEstrutura).toBe(false);
    expect(geral.editavelOrcado).toBe(true);
    const mercado = sub(cat(r.categorias, 'Habitação'), 'Mercado');
    expect(mercado).toMatchObject({ geral: false, fixa: false, espelho: null, valor: 1_400 });
    expect(mercado.editavelEstrutura).toBe(true);
  });

  it('catálogo: ícone/abreviação padrão pelo nome canônico; sistema derivado do template', () => {
    const pets = cat(r.categorias, 'Animais de estimação');
    expect(pets).toMatchObject({ icone: 'pet', abreviacao: 'Pets', sistema: true });
  });

  it('prefs ausentes → padrões; copiarDe = setembro sem orçado', () => {
    expect(r.prefs).toEqual({
      categoriasRecolhidas: [],
      graficoVisivel: true,
      avisoGeralPendente: false,
    });
    expect(r.copiarDe).toEqual({ ano: 2026, mes: 9, temOrcado: false });
  });
});

describe('montarOrcamentoV2 — mapeamento da árvore (§2)', () => {
  it('T33: Investimentos fica fora (D12); aportes não entram; índice = (Receita − Orçado dos gastos) ÷ Receita', () => {
    const r = montar();
    expect(r.categorias.some((c) => c.nome === 'Investimentos')).toBe(false);
    const ids = r.categorias.flatMap((c) => c.subcategorias.map((s) => s.id));
    expect(ids).not.toContain('it-aporte');
    expect(ids).not.toContain('it-carteira');
    expect(ids).not.toContain('it-saldo');
    expect(ids).not.toContain('it-salario');
    expect(r.resumo.realizado).toBe(16_176);
    expect(r.resumo.indicePoupanca).toBe(
      Math.round(
        ((ANEXO_B_RECEITA - (r.resumo.orcado - r.resumo.orcadoObjetivos)) / ANEXO_B_RECEITA) * 1000,
      ) / 10,
    );
  });

  it('nome exibido = CashflowGroup.name mesclado (D11), com ícone/abreviação do canônico', () => {
    const arvore = arvoreAnexoB();
    const habitacao = acharGrupo(arvore, idCat(indiceCategoria('Habitação')));
    habitacao.name = 'Casa';
    habitacao.icone = 'lazer';
    const r = montar({ arvore });
    const c = r.categorias[0];
    expect(c).toMatchObject({ nome: 'Casa', icone: 'lazer', abreviacao: 'Habitação' });
  });

  it('categoria do usuário: nome próprio, ícone genérico, não é sistema', () => {
    const arvore = arvoreAnexoB();
    arvore.push(
      grupo('g-hobby', 'Hobby', 'despesa', {
        templateId: null,
        templateName: null,
        orderIndex: 9,
        items: [item('it-hobby', 'g-hobby', 'Lego', { values: [valor('it-hobby', 9, 120)] })],
      }),
    );
    const r = montar({ arvore });
    const hobby = cat(r.categorias, 'Hobby');
    expect(hobby).toMatchObject({ icone: 'tag', abreviacao: 'Hobby', sistema: false });
    expect(hobby.realizado).toBe(120);
    expect(r.resumo.totalCategorias).toBe(14);
  });

  it('itens de subgrupos aninhados entram achatados na categoria', () => {
    const arvore = arvoreAnexoB();
    const lazer = acharGrupo(arvore, idCat(indiceCategoria('Lazer')));
    lazer.children = [
      grupo('g-viagens', 'Viagens', 'despesa', {
        items: [item('it-hotel', 'g-viagens', 'Hotel', { values: [valor('it-hotel', 9, 300)] })],
      }),
    ];
    const r = montar({ arvore });
    const c = cat(r.categorias, 'Lazer');
    expect(c.subcategorias.map((s) => s.nome)).toContain('Hotel');
    expect(c.realizado).toBe(1_414.5);
    expect(r.categorias).toHaveLength(13);
  });

  it('orçado de item fora da árvore (oculto) é ignorado', () => {
    const orcados: OrcadoRow[] = [
      ...orcadosAnexoB(),
      { itemId: 'it-oculto', ano: 2026, mes: 9, valor: 9_999, pct: null },
    ];
    expect(montar({ orcados }).resumo.orcado).toBe(18_014.9);
  });

  it('fixa nula usa o padrão do catálogo (R-07)', () => {
    const arvore = arvoreAnexoB();
    const h = indiceCategoria('Habitação');
    acharItem(arvore, idSub(h, 1)).orcamentoFixa = null; // Condomínio → fixa no catálogo
    acharItem(arvore, idSub(h, 6)).orcamentoFixa = null; // Mercado → variável no catálogo
    const c = montar({ arvore }).categorias[h];
    expect(c.subcategorias[1].fixa).toBe(true);
    expect(c.subcategorias[6].fixa).toBe(false);
  });
});

describe('montarOrcamentoV2 — Lançado × Consolidado (P1), inclusive espelhos (Q4)', () => {
  function arvoreComEspelhos() {
    const arvore = arvoreAnexoB();
    const plan = indiceCategoria('Planejamento Financeiro');
    const japao = acharItem(arvore, idSub(plan, 0));
    japao.objetivoId = 'obj-1';
    // Espelho de objetivo: 500 já pagos (vermelho) + 210 planejados pelo sync (preto).
    japao.values = [valor(japao.id, 9, 500), { ...valor(japao.id, 9, 210, '#000000'), id: 'v2' }];
    const fin = indiceCategoria('Despesas Financeiras');
    const seguro = acharItem(arvore, idSub(fin, 3));
    seguro.dividaId = 'div-1';
    seguro.values = [valor(seguro.id, 9, 110, '#0000FF')]; // parcela prevista (azul)
    const mercado = acharItem(arvore, idSub(indiceCategoria('Habitação'), 6));
    mercado.values = [valor(mercado.id, 9, 1_126.3, null)]; // a pagar
    return { arvore, plan, fin };
  }

  it('Lançado conta toda célula, espelhos inclusos', () => {
    const { arvore, plan, fin } = arvoreComEspelhos();
    const r = montar({ arvore });
    expect(r.categorias[plan].subcategorias[0]).toMatchObject({
      espelho: 'objetivo',
      realizado: 710,
      editavelEstrutura: false,
      editavelOrcado: true,
    });
    expect(r.categorias[fin].subcategorias[3]).toMatchObject({ espelho: 'divida', realizado: 110 });
    expect(r.resumo.realizado).toBe(16_176);
  });

  it('Consolidado conta só Pago/Recebido, espelhos inclusos', () => {
    const { arvore, plan, fin } = arvoreComEspelhos();
    const r = montar({ arvore, fonte: 'consolidado' });
    expect(r.fonte).toBe('consolidado');
    expect(r.referencia.rotuloRealizado).toBe('realizado');
    expect(r.categorias[plan].subcategorias[0].realizado).toBe(500);
    expect(r.categorias[fin].subcategorias[3].realizado).toBe(0);
    expect(r.categorias[indiceCategoria('Habitação')].subcategorias[6].realizado).toBe(0);
    expect(r.resumo.realizado).toBe(14_729.7);
    // Receita prevista não segue o toggle (P2): continua 24.000.
    expect(r.receitaPrevista.valor).toBe(24_000);
  });
});

describe('montarOrcamentoV2 — fase do mês (R-06, Q18)', () => {
  it('mês futuro: ritmo 1, rótulo "previsto", sem "à frente" (o previsto contra o orçado inteiro)', () => {
    const r = montar({ hojeSP: { ano: 2026, mes0: 8, dia: 23 } });
    expect(r.referencia).toMatchObject({ fase: 'futuro', ritmo: 1, dia: 0, diasNoMes: 31 });
    expect(r.referencia.rotuloRealizado).toBe('previsto');
    expect(r.resumo.contagens.aFrente).toBe(0);
    expect(r.resumo.contagens.estouro).toBe(6);
    expect(sub(cat(r.categorias, 'Animais de estimação'), 'Ração').status).toBe('ok');
  });

  it('mês futuro no Consolidado: rótulo "realizado"', () => {
    const r = montar({ hojeSP: { ano: 2026, mes0: 8, dia: 23 }, fonte: 'consolidado' });
    expect(r.referencia.rotuloRealizado).toBe('realizado');
  });

  it('mês passado: ritmo 1, dia = último dia, rótulo "lancado"', () => {
    const r = montar({ hojeSP: { ano: 2026, mes0: 10, dia: 5 } });
    expect(r.referencia).toMatchObject({ fase: 'passado', ritmo: 1, dia: 31 });
    expect(r.referencia.rotuloRealizado).toBe('lancado');
  });
});

describe('montarOrcamentoV2 — receita', () => {
  it('sem receita (nenhuma) → % da receita, sobra e índice nulos; orçado em % vale 0', () => {
    const arvore = arvoreAnexoB({});
    const plan = indiceCategoria('Planejamento Financeiro');
    const orcados: OrcadoRow[] = [
      ...orcadosAnexoB().filter((o) => o.itemId !== idSub(plan, 1)),
      { itemId: idSub(plan, 1), ano: 2026, mes: 9, valor: null, pct: 6.3 },
    ];
    const r = montar({ arvore, orcados });
    expect(r.receitaPrevista).toEqual({ valor: null, origem: 'nenhuma' });
    expect(r.resumo.orcadoPctReceita).toBeNull();
    expect(r.resumo.sobraPrevista).toBeNull();
    expect(r.resumo.indicePoupanca).toBeNull();
    expect(r.categorias.every((c) => c.pctReceita === null)).toBe(true);
    const entrada = r.categorias[plan].subcategorias[1];
    expect(entrada).toMatchObject({ valor: null, pct: 6.3, orcado: 0 });
    expect(r.resumo.orcado).toBe(16_514.9);
  });

  it('orçado em % convertido pela receita do mês (R-17, T23: 6,3% de 24.000 = 1.512)', () => {
    const plan = indiceCategoria('Planejamento Financeiro');
    const orcados: OrcadoRow[] = [
      ...orcadosAnexoB().filter((o) => o.itemId !== idSub(plan, 1)),
      { itemId: idSub(plan, 1), ano: 2026, mes: 9, valor: null, pct: 6.3 },
    ];
    const r = montar({ orcados });
    expect(r.categorias[plan].subcategorias[1]).toMatchObject({ orcado: 1_512, pct: 6.3 });
    expect(r.categorias[plan].orcado).toBe(2_722);
    expect(r.resumo.indicePoupanca).toBe(36.2);
  });

  it('média de 3 meses: origem e meses base vão no payload', () => {
    const arvore = arvoreAnexoB({ 6: 20_000, 8: 22_000 });
    const r = montar({ arvore });
    expect(r.receitaPrevista).toEqual({
      valor: 21_000,
      origem: 'media3m',
      mesesBase: [
        { ano: 2026, mes: 7 },
        { ano: 2026, mes: 9 },
      ],
    });
    expect(r.resumo.orcadoPctReceita).toBe(85.8);
  });
});

describe('montarOrcamentoV2 — visão ano (R-15, Q7)', () => {
  const plan = indiceCategoria('Planejamento Financeiro');
  const mercadoId = idSub(indiceCategoria('Habitação'), 6);
  const entradaId = idSub(plan, 1);

  function montarAno() {
    const arvore = arvoreAnexoB({ 7: 20_000, 8: 22_000, 9: 24_000 });
    acharItem(arvore, mercadoId).values.push(valor(mercadoId, 8, 1_000), valor(mercadoId, 7, 900));
    const orcados: OrcadoRow[] = [
      ...orcadosAnexoB(),
      { itemId: mercadoId, ano: 2026, mes: 8, valor: 1_300, pct: null },
      { itemId: entradaId, ano: 2026, mes: 8, valor: null, pct: 5 }, // 5% de 22.000 = 1.100
      // Novembro (depois do mês pedido) não entra no acumulado.
      { itemId: mercadoId, ano: 2026, mes: 10, valor: 7_777, pct: null },
    ];
    return montar({ arvore, orcados, visao: 'ano' });
  }

  it('período começa no 1º mês com orçado (set): soma set..out do orçado e do realizado', () => {
    const r = montarAno();
    expect(r.inicioAcumulado).toBe(9);
    const mercado = r.categorias[indiceCategoria('Habitação')].subcategorias[6];
    // o realizado de agosto (900) fica fora: antes do 1º mês com orçado
    expect(mercado).toMatchObject({
      orcado: 2_700,
      valor: 2_700,
      pct: null,
      realizado: 2_126.3,
      editavelOrcado: false,
    });
    const entrada = r.categorias[plan].subcategorias[1];
    expect(entrada.orcado).toBe(2_600);
    expect(r.resumo.orcado).toBe(20_414.9);
    expect(r.resumo.realizado).toBe(17_176);
  });

  it('receita, ritmo e meses sem orçamento só do período (set..out)', () => {
    const r = montarAno();
    // agosto (20.000) fica fora: o período começa em setembro
    expect(r.receitaPrevista).toEqual({ valor: 46_000, origem: 'fluxo' });
    // 1º/set..23/out = 30 + 23 = 53 dias de 61 (set + out)
    expect(r.referencia.ritmo).toBeCloseTo(53 / 61, 10);
    expect(r.referencia.fase).toBe('corrente');
    expect(r.mesesSemOrcamento).toEqual([]);
    expect(r.categorias.every((c) => c.subcategorias.every((s) => !s.editavelOrcado))).toBe(true);
  });

  it('sub sem nenhum orçado no período → valor null', () => {
    const r = montarAno();
    const dep = cat(r.categorias, 'Despesas com dependentes');
    expect(dep.subcategorias.every((s) => s.valor === null && s.orcado === 0)).toBe(true);
  });
});

describe('montarOrcamentoV2 — copiarDe e prefs', () => {
  it('janeiro copia de dezembro do ano anterior', () => {
    const arvore = arvoreAnexoB({ 0: 24_000 });
    const r = montar({
      arvore,
      mes0: 0,
      orcados: [{ itemId: idSub(0, 0), ano: 2025, mes: 11, valor: 2_400, pct: null }],
    });
    expect(r.copiarDe).toEqual({ ano: 2025, mes: 12, temOrcado: true });
    // A linha de dezembro/2025 não vira orçado de janeiro/2026.
    expect(r.resumo.orcado).toBe(0);
  });

  it('copiarDe com orçado no mês anterior', () => {
    const orcados = [...orcadosAnexoB(), ...orcadosAnexoB(8)];
    expect(montar({ orcados }).copiarDe).toEqual({ ano: 2026, mes: 9, temOrcado: true });
  });

  it('prefs salvas e aviso da Geral pendente só para ativado que ainda não viu', () => {
    const base = {
      categoriasRecolhidas: ['cat-1'],
      graficoVisivel: false,
      estruturaCriadaEm: new Date('2026-10-27'),
      avisoGeralVistoEm: null,
    };
    expect(montar({ prefs: base }).prefs).toEqual({
      categoriasRecolhidas: ['cat-1'],
      graficoVisivel: false,
      avisoGeralPendente: true,
    });
    expect(
      montar({ prefs: { ...base, avisoGeralVistoEm: new Date('2026-10-28') } }).prefs
        .avisoGeralPendente,
    ).toBe(false);
    expect(montar({ prefs: { ...base, estruturaCriadaEm: null } }).prefs.avisoGeralPendente).toBe(
      false,
    );
  });
});
