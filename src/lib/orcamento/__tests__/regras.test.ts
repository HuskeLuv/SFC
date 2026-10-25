import { describe, expect, it } from 'vitest';
import {
  aceitaPct,
  calcularCategoria,
  calcularResumo,
  calcularSubcategoria,
  consumido,
  contarStatus,
  converterModo,
  diferenca,
  faseDoMes,
  filtrarCategorias,
  mesesSemOrcamento,
  normalizarBusca,
  orcadoAcumulado,
  orcadoEfetivo,
  parsePctBR,
  parseValorBR,
  receitaAcumulada,
  ritmoDoAno,
  ritmoDoMes,
  statusCategoria,
  statusSubcategoria,
  subcategoriaFixa,
  validarNomeSubcategoria,
  type HojeSP,
} from '../regras';
import {
  ANEXO_B,
  ANEXO_B_HOJE,
  ANEXO_B_RECEITA,
  type CategoriaAnexoB,
} from '@/test/fixtures/orcamentoAnexoB';

const HOJE: HojeSP = { ...ANEXO_B_HOJE };
const RITMO = ritmoDoMes(2026, 9, HOJE).ritmo;

/** Monta a tela do mês com as regras, como farão o servidor e a UI otimista. */
function montar(cats: CategoriaAnexoB[], receita: number | null = ANEXO_B_RECEITA, ritmo = RITMO) {
  return cats.map((c) => {
    const subcategorias = c.subcategorias.map((s) => ({
      nome: s.nome,
      geral: s.geral,
      ...calcularSubcategoria(s, receita, ritmo),
    }));
    return { nome: c.nome, ...calcularCategoria(subcategorias, receita), subcategorias };
  });
}

/** Cópia do Anexo B com uma sub alterada. */
function comSub(
  catNome: string,
  subNome: string,
  patch: Partial<CategoriaAnexoB['subcategorias'][number]>,
): CategoriaAnexoB[] {
  return ANEXO_B.map((c) =>
    c.nome !== catNome
      ? c
      : {
          ...c,
          subcategorias: c.subcategorias.map((s) => (s.nome === subNome ? { ...s, ...patch } : s)),
        },
  );
}

const tela = montar(ANEXO_B);
const cat = (nome: string) => tela.find((c) => c.nome === nome)!;
const sub = (catNome: string, subNome: string) =>
  cat(catNome).subcategorias.find((s) => s.nome === subNome)!;

describe('fixture do Anexo B', () => {
  it('13 categorias e 82 subcategorias (D1–D5: não 14/87), uma Geral por categoria', () => {
    expect(ANEXO_B).toHaveLength(13);
    expect(ANEXO_B.reduce((a, c) => a + c.subcategorias.length, 0)).toBe(82);
    for (const c of ANEXO_B) {
      expect(c.subcategorias.filter((s) => s.geral)).toHaveLength(1);
      expect(c.subcategorias.at(-1)!.geral).toBe(true);
    }
  });

  it('cada linha de subcategoria bate com o Anexo B (status e % consumido)', () => {
    for (const c of ANEXO_B) {
      for (const s of c.subcategorias) {
        const calc = sub(c.nome, s.nome);
        expect({ linha: `${c.nome} › ${s.nome}`, status: calc.status }).toEqual({
          linha: `${c.nome} › ${s.nome}`,
          status: s.esperado.status,
        });
        expect(calc.consumido === null ? null : Math.round(calc.consumido * 100)).toBe(
          s.esperado.consumidoPct,
        );
      }
    }
  });

  it('cada linha de categoria bate com o Anexo B (R-01, R-09)', () => {
    for (const c of ANEXO_B) {
      const calc = cat(c.nome);
      expect({
        nome: c.nome,
        orcado: calc.orcado,
        realizado: calc.realizado,
        diferenca: calc.diferenca,
        consumidoPct: calc.consumido === null ? null : Math.round(calc.consumido * 100),
        status: calc.status,
        qtdEstouro: calc.qtdEstouro,
        qtdAFrente: calc.qtdAFrente,
      }).toEqual({ nome: c.nome, ...c.esperado });
    }
  });
});

describe('R-06 ritmo do mês', () => {
  it('T03: corrente = 23/31 → traço em 74%', () => {
    const r = ritmoDoMes(2026, 9, HOJE);
    expect(r).toMatchObject({ dia: 23, diasNoMes: 31, fase: 'corrente' });
    expect(Math.round(r.ritmo * 100)).toBe(74);
    expect(r.ritmo).toBeCloseTo(0.7419, 4);
  });

  it('passado = 1 com o último dia (mês fechado)', () => {
    expect(ritmoDoMes(2026, 8, HOJE)).toEqual({
      dia: 30,
      diasNoMes: 30,
      ritmo: 1,
      fase: 'passado',
    });
    expect(ritmoDoMes(2025, 11, HOJE)).toMatchObject({ ritmo: 1, fase: 'passado' });
  });

  it('futuro = ritmo 1 e dia 0 (Q18: previsto comparado com o orçado inteiro)', () => {
    expect(ritmoDoMes(2026, 10, HOJE)).toEqual({ dia: 0, diasNoMes: 30, ritmo: 1, fase: 'futuro' });
    expect(ritmoDoMes(2027, 0, HOJE)).toMatchObject({ ritmo: 1, fase: 'futuro' });
  });

  it('fevereiro bissexto e virada de ano', () => {
    expect(ritmoDoMes(2028, 1, { ano: 2028, mes0: 1, dia: 29 })).toMatchObject({
      dia: 29,
      diasNoMes: 29,
      ritmo: 1,
    });
    expect(ritmoDoMes(2027, 1, { ano: 2027, mes0: 1, dia: 14 }).ritmo).toBe(0.5);
    expect(faseDoMes(2026, 11, { ano: 2027, mes0: 0, dia: 1 })).toBe('passado');
  });

  it('mês futuro com previsto lançado não acende "à frente" em massa (ritmo 1)', () => {
    const { ritmo } = ritmoDoMes(2026, 10, HOJE);
    // Restaurantes 94% no dia 23 é warn; o mesmo previsto em novembro é ok.
    expect(statusSubcategoria(500, 468, false, RITMO)).toBe('warn');
    expect(statusSubcategoria(500, 468, false, ritmo)).toBe('ok');
    // estouro continua possível no futuro (previsto acima do orçado)
    expect(statusSubcategoria(100, 138.4, false, ritmo)).toBe('bad');
  });
});

describe('R-15 acumulado do ano', () => {
  it('ritmo do período corrente = dias decorridos no ano ÷ dias do ano', () => {
    // 1º/jan..23/out = 273 + 23 = 296 dias; 2026 tem 365.
    expect(ritmoDoAno(2026, 9, HOJE)).toBeCloseTo(296 / 365, 10);
    expect(ritmoDoAno(2026, 11, { ano: 2026, mes0: 11, dia: 31 })).toBe(1);
    expect(ritmoDoAno(2026, 11, { ano: 2026, mes0: 11, dia: 1 })).toBeCloseTo(335 / 365, 10);
    // ano bissexto: 31 + 29 = 60 dias até 29/fev, de 366
    expect(ritmoDoAno(2028, 1, { ano: 2028, mes0: 1, dia: 29 })).toBeCloseTo(60 / 366, 10);
  });

  it('período fechado ou que termina no futuro = 1', () => {
    expect(ritmoDoAno(2026, 2, HOJE)).toBe(1);
    expect(ritmoDoAno(2026, 11, HOJE)).toBe(1);
    expect(ritmoDoAno(2025, 9, HOJE)).toBe(1);
  });

  it('orçado acumulado soma jan..mês e converte o % com a receita de cada mês', () => {
    const orcados = [
      { valor: 100, pct: null },
      null,
      { valor: null, pct: 10 },
      { valor: 999, pct: null }, // depois do mês selecionado: fora
    ];
    const receitas = [20_000, 20_000, 30_000, 30_000];
    expect(orcadoAcumulado(orcados, receitas, 2)).toBe(3100);
    expect(orcadoAcumulado(orcados, [null, null, null], 2)).toBe(100);
  });

  it('receita acumulada ignora meses sem receita; nenhuma → null', () => {
    expect(receitaAcumulada([24_000, null, 21_000.5], 2)).toBe(45_000.5);
    expect(receitaAcumulada([null, undefined], 1)).toBeNull();
  });

  it('meses sem orçamento (0–11) no período', () => {
    expect(mesesSemOrcamento([500, 0, null, 10, 0], 3)).toEqual([1, 2]);
    expect(mesesSemOrcamento([], 1)).toEqual([0, 1]);
  });
});

describe('R-08 status da subcategoria', () => {
  it('T08: Uber/99 → −38,40, 138%, estouro; Transporte 85% ok com "1 estouro"', () => {
    const s = sub('Transporte', 'Uber / 99');
    expect(s.diferenca).toBe(-38.4);
    expect(Math.round(s.consumido! * 100)).toBe(138);
    expect(s.status).toBe('bad');
    const t = cat('Transporte');
    expect(t).toMatchObject({ status: 'ok', qtdEstouro: 1, qtdAFrente: 0 });
    expect(Math.round(t.consumido! * 100)).toBe(85);
  });

  it('T09: fixa a 90% não acende laranja', () => {
    expect(sub('Habitação', 'Energia').status).toBe('ok');
    // a mesma conta não fixa estaria à frente (90 − 74 = 16 p.p.)
    expect(statusSubcategoria(220, 198.4, false, RITMO)).toBe('warn');
  });

  it('T10: fixa que passa de 100,5% é estouro', () => {
    expect(sub('Despesas pessoais', 'Assinaturas (streaming)').status).toBe('bad');
  });

  it('tolerância 1,005: até 100,5% não é estouro', () => {
    expect(statusSubcategoria(1000, 1005, true, RITMO)).toBe('ok');
    expect(statusSubcategoria(1000, 1005.01, true, RITMO)).toBe('bad');
    expect(statusSubcategoria(200, 201, false, 1)).toBe('ok'); // 100,5% em mês fechado
    // 10,05 ÷ 10 = 1,0050000000000001 em ponto flutuante: exatamente 100,5% não é estouro
    expect(statusSubcategoria(10, 10.05, false, 1)).toBe('ok');
    expect(statusSubcategoria(6, 6.03, true, RITMO)).toBe('ok');
    expect(statusSubcategoria(10, 10.06, false, 1)).toBe('bad');
    // categoria: mesma tolerância sobre as somas
    const ok = { orcado: 0, realizado: 0, status: 'ok' as const };
    expect(statusCategoria([{ ...ok, orcado: 10, realizado: 10.05 }]).status).toBe('ok');
    expect(statusCategoria([{ ...ok, orcado: 6, realizado: 6.03 }]).status).toBe('ok');
    expect(statusCategoria([{ ...ok, orcado: 10, realizado: 10.06 }]).status).toBe('bad');
  });

  it('T11: Ração 98% (24 p.p. acima do ritmo) → à frente; Pets 81% laranja com "1 à frente"', () => {
    expect(sub('Animais de estimação', 'Ração').status).toBe('warn');
    const pets = cat('Animais de estimação');
    expect(pets).toMatchObject({ status: 'warn', qtdAFrente: 1, qtdEstouro: 0 });
    expect(Math.round(pets.consumido! * 100)).toBe(81);
  });

  it('T12: Mercado 80% mas só 6 p.p. acima do ritmo → ok', () => {
    expect(sub('Habitação', 'Mercado').status).toBe('ok');
  });

  it('limites de 80% e 10 p.p. são inclusivos', () => {
    expect(statusSubcategoria(100, 80, false, 0.7)).toBe('warn');
    expect(statusSubcategoria(100, 79.99, false, 0.5)).toBe('ok');
    expect(statusSubcategoria(100, 85, false, 0.75)).toBe('warn');
    expect(statusSubcategoria(100, 85, false, 0.7501)).toBe('ok');
  });

  it('mês fechado (ritmo 1): nunca "à frente", só estouro', () => {
    expect(statusSubcategoria(100, 100, false, 1)).toBe('ok');
    expect(statusSubcategoria(100, 101, false, 1)).toBe('bad');
  });

  it('T13: gasto sem orçamento → consumido "—", −12,40, estouro; categoria 107% em estouro', () => {
    const j = sub('Despesas Financeiras', 'Juros / IOF');
    expect(j).toMatchObject({ consumido: null, diferenca: -12.4, status: 'bad' });
    const f = cat('Despesas Financeiras');
    expect(f).toMatchObject({ status: 'bad', orcado: 180, realizado: 192.4 });
    expect(Math.round(f.consumido! * 100)).toBe(107);
  });

  it('T14: categoria sem orçamento → 0 de 5, "sem orçamento", consumido nulo', () => {
    const d = cat('Despesas com dependentes');
    expect(d.subcategorias).toHaveLength(5);
    expect(d).toMatchObject({
      qtdComOrcamento: 0,
      status: 'none',
      consumido: null,
      diferenca: 0,
      pctReceita: null,
    });
  });

  it('orçado 0 e realizado 0 → none', () => {
    expect(statusSubcategoria(0, 0, false, RITMO)).toBe('none');
  });
});

describe('R-09 status da categoria e da linha Total', () => {
  it('T15: Lazer 87% laranja com "1 estouro" e "2 à frente do ritmo"', () => {
    const l = cat('Lazer');
    expect(l).toMatchObject({ status: 'warn', qtdEstouro: 1, qtdAFrente: 2 });
    expect(Math.round(l.consumido! * 100)).toBe(87);
  });

  it('T05: Habitação = soma das subs, 91%, sem etiqueta', () => {
    expect(cat('Habitação')).toMatchObject({
      orcado: 5250,
      realizado: 4768.8,
      diferenca: 481.2,
      status: 'ok',
      qtdComOrcamento: 8,
    });
  });

  it('categoria sem orçado com gasto → bad', () => {
    expect(
      statusCategoria([
        { orcado: 0, realizado: 10, status: 'bad' },
        { orcado: 0, realizado: 0, status: 'none' },
      ]).status,
    ).toBe('bad');
  });

  it('Total usa a mesma regra sobre as categorias: warn por Pets e Lazer, 1 categoria em estouro', () => {
    const total = statusCategoria(tela);
    expect(total).toEqual({ status: 'warn', qtdEstouro: 1, qtdAFrente: 2 });
  });
});

describe('KPIs (§4.2, T01–T03)', () => {
  const resumo = calcularResumo(tela, ANEXO_B_RECEITA);

  it('T01: orçado, realizado, disponível, % da receita e sobra', () => {
    expect(resumo).toMatchObject({
      orcado: 18_014.9,
      realizado: 16_176,
      disponivel: 1_838.9,
      orcadoPctReceita: 75.1,
      sobraPrevista: 5_985.1,
      totalCategorias: 13,
      totalSubcategorias: 82,
    });
  });

  it('T02: índice de poupança (24.000 − 18.014,90) ÷ 24.000 = 24,9%', () => {
    expect(resumo.indicePoupanca).toBe(24.9);
  });

  it('T03: KPI Realizado = 90% do orçado', () => {
    expect(resumo.realizadoPctOrcado).toBe(89.8);
    expect(Math.round(resumo.realizadoPctOrcado!)).toBe(90);
  });

  it('T04: contadores dos chips 6 / 3 / 12', () => {
    expect(resumo.contagens).toEqual({ estouro: 6, aFrente: 3, semOrcamento: 12 });
    expect(contarStatus(tela)).toEqual(resumo.contagens);
  });

  it('T06 revisto (D-errata): Mercado 1.400 → 1.500 dá total 18.114,90', () => {
    const t = montar(comSub('Habitação', 'Mercado', { valor: 1500 }));
    const r = calcularResumo(t, ANEXO_B_RECEITA);
    expect(t.find((c) => c.nome === 'Habitação')!.orcado).toBe(5350);
    expect(r.orcado).toBe(18_114.9);
    expect(r.disponivel).toBe(1_938.9);
    const mercado = t[0].subcategorias.find((s) => s.nome === 'Mercado')!;
    expect(Math.round(mercado.consumido! * 100)).toBe(75);
  });

  it('T35 revisto: +300 em Cinema/Shows → 300%, estouro, realizado 16.476,00', () => {
    const t = montar(comSub('Lazer', 'Cinema / Shows', { realizado: 300 }));
    const cinema = t
      .find((c) => c.nome === 'Lazer')!
      .subcategorias.find((s) => s.nome === 'Cinema / Shows')!;
    expect(Math.round(cinema.consumido! * 100)).toBe(300);
    expect(cinema.status).toBe('bad');
    expect(calcularResumo(t, ANEXO_B_RECEITA).realizado).toBe(16_476);
  });

  it('sem receita prevista: % da receita, sobra e índice nulos (§12.1)', () => {
    const r = calcularResumo(montar(ANEXO_B, null), null);
    expect(r).toMatchObject({ orcadoPctReceita: null, sobraPrevista: null, indicePoupanca: null });
    expect(r.orcado).toBe(18_014.9);
  });

  it('disponível pode ficar negativo; sem orçado o "% do orçado" é nulo', () => {
    const r = calcularResumo(
      [
        {
          orcado: 0,
          realizado: 50,
          status: 'bad',
          subcategorias: [{ geral: true, status: 'bad' }],
        },
      ],
      1000,
    );
    expect(r).toMatchObject({
      disponivel: -50,
      realizadoPctOrcado: null,
      status: 'bad',
      indicePoupanca: 100,
    });
  });
});

describe('R-17 % da receita', () => {
  const ENTRADA = { valor: 1500, pct: null };

  it('orçado efetivo = round(receita × pct ÷ 100, 2); sem receita → 0', () => {
    expect(orcadoEfetivo({ valor: null, pct: 6.3 }, 24_000)).toBe(1512);
    expect(orcadoEfetivo({ valor: null, pct: 7 }, 24_000)).toBe(1680);
    expect(orcadoEfetivo({ valor: null, pct: 33.3 }, 1000.01)).toBe(333);
    expect(orcadoEfetivo({ valor: null, pct: 10 }, null)).toBe(0);
    expect(orcadoEfetivo({ valor: 250, pct: null }, null)).toBe(250);
    expect(orcadoEfetivo({ valor: null, pct: null }, 24_000)).toBe(0);
  });

  it('T23: Entrada apartamento R$ → % = 6,3% (= 1.512,00); Planejamento 2.722; índice 24,9%', () => {
    const conv = converterModo('pct', ENTRADA, ANEXO_B_RECEITA);
    expect(conv).toEqual({ valor: null, pct: 6.3 });
    const t = montar(comSub('Planejamento Financeiro', 'Entrada apartamento', conv));
    const plan = t.find((c) => c.nome === 'Planejamento Financeiro')!;
    const entrada = plan.subcategorias.find((s) => s.nome === 'Entrada apartamento')!;
    expect(entrada.orcado).toBe(1512);
    expect(calcularCategoria([entrada], ANEXO_B_RECEITA).pctReceita).toBe(6.3);
    expect(plan.orcado).toBe(2722);
    expect(calcularResumo(t, ANEXO_B_RECEITA).indicePoupanca).toBe(24.9);
  });

  it('T24: 6,3 → 7% = 1.680,00; Planejamento 2.890; total 18.194,90; índice 24,2%', () => {
    const t = montar(
      comSub('Planejamento Financeiro', 'Entrada apartamento', { valor: null, pct: 7 }),
    );
    const plan = t.find((c) => c.nome === 'Planejamento Financeiro')!;
    expect(plan.orcado).toBe(2890);
    const r = calcularResumo(t, ANEXO_B_RECEITA);
    expect(r.orcado).toBe(18_194.9);
    expect(r.indicePoupanca).toBe(24.2);
  });

  it('T25: % → R$ → % volta ao mesmo valor (7% → 1.680,00 → 7,0%)', () => {
    const emValor = converterModo('valor', { valor: null, pct: 7 }, ANEXO_B_RECEITA);
    expect(emValor).toEqual({ valor: 1680, pct: null });
    expect(converterModo('pct', emValor, ANEXO_B_RECEITA)).toEqual({ valor: null, pct: 7 });
  });

  it('já no modo pedido não muda; % sem receita não converte; teto de 100%', () => {
    expect(converterModo('valor', ENTRADA, ANEXO_B_RECEITA)).toEqual(ENTRADA);
    expect(converterModo('pct', { valor: null, pct: 5 }, ANEXO_B_RECEITA)).toEqual({
      valor: null,
      pct: 5,
    });
    expect(converterModo('pct', ENTRADA, null)).toEqual(ENTRADA);
    expect(converterModo('pct', ENTRADA, 0)).toEqual(ENTRADA);
    expect(converterModo('pct', { valor: 50_000, pct: null }, 24_000)).toEqual({
      valor: null,
      pct: 100,
    });
    expect(converterModo('valor', { valor: null, pct: 7 }, null)).toEqual({ valor: 0, pct: null });
  });

  it('% só em subcategoria não Geral de categoria poupança (T26)', () => {
    expect(aceitaPct({ geral: false }, { poupanca: true })).toBe(true);
    expect(aceitaPct({ geral: true }, { poupanca: true })).toBe(false);
    expect(aceitaPct({ geral: false }, { poupanca: false })).toBe(false);
  });
});

describe('R-07 fixa', () => {
  it('escolha do usuário vence o padrão; Planejamento sempre fixa', () => {
    expect(subcategoriaFixa({ orcamentoFixa: null, fixaPadrao: true, poupanca: false })).toBe(true);
    expect(subcategoriaFixa({ orcamentoFixa: false, fixaPadrao: true, poupanca: false })).toBe(
      false,
    );
    expect(subcategoriaFixa({ orcamentoFixa: true, fixaPadrao: false, poupanca: false })).toBe(
      true,
    );
    expect(subcategoriaFixa({ orcamentoFixa: false, fixaPadrao: false, poupanca: true })).toBe(
      true,
    );
  });
});

describe('R-04/R-05', () => {
  it('diferença em centavos; consumido sem teto e nulo com orçado 0', () => {
    expect(diferenca(1400, 1126.3)).toBe(273.7);
    expect(consumido(100, 138.4)).toBeCloseTo(1.384, 10);
    expect(consumido(0, 12.4)).toBeNull();
  });
});

describe('R-10 filtros e busca', () => {
  const nomes = (cs: { nome: string; subcategorias: { nome: string }[] }[]) =>
    cs.map((c) => [c.nome, c.subcategorias.map((s) => s.nome)]);

  it('sem filtro e sem busca: tudo, mesma referência', () => {
    expect(filtrarCategorias(tela, 'todas', '  ')).toBe(tela);
  });

  it('T18: Estouro → 5 categorias, só as subs em estouro', () => {
    expect(nomes(filtrarCategorias(tela, 'estouro', ''))).toEqual([
      ['Transporte', ['Uber / 99']],
      ['Saúde', ['Farmácia']],
      ['Despesas pessoais', ['Vestuário', 'Assinaturas (streaming)']],
      ['Lazer', ['Delivery / iFood']],
      ['Despesas Financeiras', ['Juros / IOF']],
    ]);
  });

  it('À frente do ritmo → Ração, Restaurantes, Bar/Cafés', () => {
    expect(nomes(filtrarCategorias(tela, 'aFrente', ''))).toEqual([
      ['Animais de estimação', ['Ração']],
      ['Lazer', ['Restaurantes', 'Bar / Cafés']],
    ]);
  });

  it('T19: Sem orçamento → as 12 subs, nunca a Geral; Gás (60/0) fora', () => {
    const subs = filtrarCategorias(tela, 'semOrcamento', '').flatMap((c) =>
      c.subcategorias.map((s) => s.nome),
    );
    expect(subs).toEqual([
      'Consultoria financeira',
      'Escola',
      'Babá',
      'Atividades',
      'Mesada',
      'Marketing',
      'Impostos PJ',
      'Reserva de emergência',
      'Móveis e decoração',
      'Anuidades (OAB, CRM, CRP…)',
      'Contador IR PF',
      'Presentes do mês',
    ]);
    expect(subs).not.toContain('Geral');
    expect(subs).not.toContain('Gás');
  });

  it('T20: busca "ifood" → só Lazer › Delivery / iFood', () => {
    expect(nomes(filtrarCategorias(tela, 'todas', 'ifood'))).toEqual([
      ['Lazer', ['Delivery / iFood']],
    ]);
  });

  it('busca sem acento/caixa; categoria que bate mostra todas as subs (D13)', () => {
    expect(nomes(filtrarCategorias(tela, 'todas', 'AGUA'))).toEqual([['Habitação', ['Água']]]);
    const saude = filtrarCategorias(tela, 'todas', 'saude');
    expect(saude).toHaveLength(1);
    expect(saude[0].subcategorias).toHaveLength(8);
  });

  it('busca combinada com filtro respeita os dois', () => {
    expect(nomes(filtrarCategorias(tela, 'estouro', 'lazer'))).toEqual([
      ['Lazer', ['Delivery / iFood']],
    ]);
    expect(filtrarCategorias(tela, 'estouro', 'habitação')).toEqual([]);
    expect(filtrarCategorias(tela, 'todas', 'xyz inexistente')).toEqual([]);
  });

  it('filtrar não altera as categorias originais', () => {
    filtrarCategorias(tela, 'estouro', '');
    expect(cat('Lazer').subcategorias).toHaveLength(7);
  });
});

describe('R-18 entrada', () => {
  it('T07 revisto: "1.500,00", "1500,5", "1500" válidos; "abc" inválido (não salva, não vira 0)', () => {
    expect(parseValorBR('1.500,00')).toBe(1500);
    expect(parseValorBR('1500,5')).toBe(1500.5);
    expect(parseValorBR('1500')).toBe(1500);
    expect(parseValorBR('abc')).toBeNull();
  });

  it('aceita R$, espaços e milhar em grupos de 3; vazio = 0', () => {
    expect(parseValorBR(' R$ 1.234.567,89 ')).toBe(1_234_567.89);
    expect(parseValorBR('0,99')).toBe(0.99);
    expect(parseValorBR('')).toBe(0);
    expect(parseValorBR('   ')).toBe(0);
  });

  it('rejeita negativo, 3 casas, milhar torto e ponto decimal', () => {
    for (const t of ['-10', '10,123', '1.50', '1.5', '15.00,0', '1,', ',5', '10.5', '1 500']) {
      expect({ t, v: parseValorBR(t) }).toEqual({ t, v: null });
    }
  });

  it('percentual 0–100 com 1 casa', () => {
    expect(parsePctBR('6,3')).toBe(6.3);
    expect(parsePctBR('7')).toBe(7);
    expect(parsePctBR('7.5%')).toBe(7.5);
    expect(parsePctBR('100')).toBe(100);
    expect(parsePctBR('0')).toBe(0);
    for (const t of ['100,1', '101', '6,25', '-1', 'abc', '']) {
      expect({ t, v: parsePctBR(t) }).toEqual({ t, v: null });
    }
  });
});

describe('validarNomeSubcategoria (R-12/R-18)', () => {
  const irmaos = ['Restaurantes', 'Delivery / iFood', 'Bar / Cafés', 'Geral'];

  it('apara as pontas e aceita nome novo', () => {
    expect(validarNomeSubcategoria('  Shows e teatro ', irmaos)).toEqual({
      ok: true,
      nome: 'Shows e teatro',
    });
  });

  it('vazio, só espaços ou mais de 60 caracteres', () => {
    expect(validarNomeSubcategoria('', irmaos)).toEqual({ ok: false, motivo: 'vazio' });
    expect(validarNomeSubcategoria('   ', irmaos)).toEqual({ ok: false, motivo: 'vazio' });
    expect(validarNomeSubcategoria('x'.repeat(60), irmaos)).toMatchObject({ ok: true });
    expect(validarNomeSubcategoria('x'.repeat(61), irmaos)).toEqual({ ok: false, motivo: 'longo' });
  });

  it('duplicado sem acento/caixa/espaços extras, inclusive com a Geral', () => {
    expect(validarNomeSubcategoria('bar /  cafes', irmaos)).toEqual({
      ok: false,
      motivo: 'duplicado',
    });
    expect(validarNomeSubcategoria('GERAL', irmaos)).toEqual({ ok: false, motivo: 'duplicado' });
    expect(validarNomeSubcategoria('Bar', irmaos)).toMatchObject({ ok: true });
  });

  it('normalizarBusca', () => {
    expect(normalizarBusca('  Animais   de  Estimação ')).toBe('animais de estimacao');
  });
});
