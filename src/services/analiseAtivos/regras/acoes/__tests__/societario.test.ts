import { describe, expect, it } from 'vitest';
import {
  normalizarSegmentoListagem,
  tagAlongPorEspecie,
  tagAlongValido,
} from '@/services/analiseAtivos/regras/acoes/tagAlong';
import {
  escolherDireitoDividendo,
  extrairPctDividendoMinimo,
  trechoDividendo,
} from '@/services/analiseAtivos/regras/acoes/dividendoMinimo';
import {
  acionistasParaTela,
  ehLinhaDireta,
  idSintetico,
  type PosicaoAcionariaLinha,
} from '@/services/analiseAtivos/regras/acoes/acionistas';
import { MAX_TRECHO_FRE } from '@/types/analiseAtivosComplementos';

describe('tag along (duas bases)', () => {
  const base = { emitePn: false, emiteUnit: false, declarados: [] };

  it('Novo Mercado: ON 100% pela regra do segmento (B3); PN e Unit não emite', () => {
    expect(tagAlongPorEspecie({ ...base, segmentoListagem: 'NM' })).toEqual([
      { especie: 'ON', classePn: '', pct: 100, base: 'segmento_b3' },
      { especie: 'PN', classePn: '', pct: null, base: 'nao_emite' },
      { especie: 'UNIT', classePn: '', pct: null, base: 'nao_emite' },
    ]);
    expect(tagAlongPorEspecie({ ...base, segmentoListagem: 'Novo Mercado' })[0].pct).toBe(100);
  });

  it('Nível 1: ON 80% com a base art. 254-A (o 80 do FRE não troca a base); PN do FRE 2022', () => {
    const r = tagAlongPorEspecie({
      segmentoListagem: 'Nível 1',
      emitePn: true,
      emiteUnit: false,
      declarados: [
        { especie: 'ON', classePn: '', pctTagAlong: 80 },
        { especie: 'PN', classePn: '', pctTagAlong: 80 },
      ],
    });
    expect(r[0]).toEqual({ especie: 'ON', classePn: '', pct: 80, base: 'lei_254a' });
    expect(r[1]).toEqual({ especie: 'PN', classePn: '', pct: 80, base: 'fre_2022' });
  });

  it('PN fora do Nível 2 sem valor no FRE: conforme estatuto; Nível 2: ON e PN 100%', () => {
    const n1 = tagAlongPorEspecie({ ...base, emitePn: true, segmentoListagem: 'N1' });
    expect(n1[1]).toEqual({ especie: 'PN', classePn: '', pct: null, base: 'conforme_estatuto' });
    const n2 = tagAlongPorEspecie({ ...base, emitePn: true, segmentoListagem: 'N2' });
    expect(n2.slice(0, 2).map((t) => [t.pct, t.base])).toEqual([
      [100, 'segmento_b3'],
      [100, 'segmento_b3'],
    ]);
  });

  it('valor espúrio do FRE (7500, 0, 125) é descartado', () => {
    expect(tagAlongValido(7500)).toBeNull();
    expect(tagAlongValido(0)).toBeNull();
    expect(tagAlongValido(125)).toBeNull();
    expect(tagAlongValido(0.000001)).toBeNull();
    expect(tagAlongValido(100)).toBe(100);
    const r = tagAlongPorEspecie({
      segmentoListagem: null,
      emitePn: true,
      emiteUnit: false,
      declarados: [
        { especie: 'ON', classePn: '', pctTagAlong: 7500 },
        { especie: 'PN', classePn: '', pctTagAlong: 0 },
      ],
    });
    expect(r[0]).toEqual({ especie: 'ON', classePn: '', pct: 80, base: 'lei_254a' });
    expect(r[1].base).toBe('conforme_estatuto');
  });

  it('ON 100% declarado no FRE 2022 em companhia do Tradicional: valor do FRE com a fonte', () => {
    const r = tagAlongPorEspecie({
      ...base,
      segmentoListagem: '',
      declarados: [{ especie: 'ON', classePn: '', pctTagAlong: 100 }],
    });
    expect(r[0]).toEqual({ especie: 'ON', classePn: '', pct: 100, base: 'fre_2022' });
  });

  it('PN por classe e Unit = ações que a compõem (o menor; conforme estatuto se faltar número)', () => {
    const r = tagAlongPorEspecie({
      segmentoListagem: 'N1',
      emitePn: true,
      emiteUnit: true,
      declarados: [
        { especie: 'PN', classePn: 'B', pctTagAlong: 80 },
        { especie: 'PN', classePn: 'A', pctTagAlong: null },
      ],
    });
    expect(r.map((t) => [t.especie, t.classePn, t.pct, t.base])).toEqual([
      ['ON', '', 80, 'lei_254a'],
      ['PN', 'A', null, 'conforme_estatuto'],
      ['PN', 'B', 80, 'fre_2022'],
      ['UNIT', '', null, 'conforme_estatuto'],
    ]);
    const n2 = tagAlongPorEspecie({
      ...base,
      emitePn: true,
      emiteUnit: true,
      segmentoListagem: 'N2',
    });
    expect(n2[2]).toEqual({ especie: 'UNIT', classePn: '', pct: 100, base: 'segmento_b3' });
  });

  it('normaliza códigos da B3 e rótulos', () => {
    expect(['NM', 'N1', 'N2', 'MA', 'M2', 'MB', '', null].map(normalizarSegmentoListagem)).toEqual([
      'NM',
      'N1',
      'N2',
      'MA',
      'M2',
      'TRADICIONAL',
      'TRADICIONAL',
      'TRADICIONAL',
    ]);
    expect(normalizarSegmentoListagem('Nível 2')).toBe('N2');
  });
});

describe('dividendo mínimo (regex sobre o FRE 2022)', () => {
  it('"25% do lucro líquido" e variações', () => {
    expect(
      extrairPctDividendoMinimo('importância não inferior a 25% do lucro líquido apurado'),
    ).toBe(25);
    expect(
      extrairPctDividendoMinimo(
        '25% (vinte e cinco por cento) no mínimo, do lucro líquido ajustado na forma do artigo 202',
      ),
    ).toBe(25);
    expect(extrairPctDividendoMinimo('equivalente a 40% do lucro líquido ajustado')).toBe(40);
    expect(extrairPctDividendoMinimo('dividendo de 37,5% do Lucro Líquido')).toBe(37.5);
  });

  it('remete à seção 18.12 ⇒ sem dado (null); reserva legal não conta', () => {
    expect(extrairPctDividendoMinimo('Informações prestadas na seção 18.12.')).toBeNull();
    expect(extrairPctDividendoMinimo('conforme o item 18.12 do Formulário')).toBeNull();
    expect(
      extrairPctDividendoMinimo(
        '5% do lucro líquido para a reserva legal; o dividendo mínimo obrigatório é de 30% do lucro líquido ajustado.',
      ),
    ).toBe(30);
    expect(extrairPctDividendoMinimo(null)).toBeNull();
    expect(extrairPctDividendoMinimo('dividendo de R$ 0,022 por ação')).toBeNull();
  });

  it('trecho literal até 400 caracteres, a partir da frase do %', () => {
    const texto =
      'O Banco negocia somente ações ordinárias. O Estatuto Social assegura aos acionistas o recebimento semestral de dividendo mínimo e obrigatório equivalente a 25% do lucro líquido ajustado, como definido em lei. ' +
      'x'.repeat(600);
    const t = trechoDividendo(texto)!;
    expect(t.length).toBeLessThanOrEqual(MAX_TRECHO_FRE);
    expect(t.startsWith('…O Estatuto Social assegura')).toBe(true);
    expect(t.endsWith('…')).toBe(true);
    expect(trechoDividendo('Informações prestadas na seção 18.12.')).toBe(
      'Informações prestadas na seção 18.12.',
    );
    expect(trechoDividendo('')).toBeNull();
  });

  it('linha escolhida: a ON com %; senão qualquer com %; senão a com texto', () => {
    const on = {
      especie: 'ON',
      classePn: '',
      direitoDividendoTexto: 'x',
      pctDividendoMinimo: null,
    };
    const pn = { especie: 'PN', classePn: 'A', direitoDividendoTexto: 'y', pctDividendoMinimo: 25 };
    expect(escolherDireitoDividendo([pn, on])).toBe(pn);
    expect(escolherDireitoDividendo([pn, { ...on, pctDividendoMinimo: 30 }])?.especie).toBe('ON');
    expect(escolherDireitoDividendo([{ ...pn, pctDividendoMinimo: null }, on])).toBe(on);
    expect(escolherDireitoDividendo([])).toBeNull();
  });
});

describe('acionistas', () => {
  it('direto = sem relacionado; sintéticas com id fixo', () => {
    expect(ehLinhaDireta('')).toBe(true);
    expect(ehLinhaDireta('8236642')).toBe(false);
    expect(idSintetico('Outros', '')).toBe('OUTROS');
    expect(idSintetico('Ações Tesouraria', '')).toBe('TESOURARIA');
    expect(idSintetico('Ações em tesouraria', null)).toBe('TESOURARIA');
    // 'Outros' com tipo de pessoa é um acionista de verdade
    expect(idSintetico('Outros', 'PJ')).toBeNull();
  });

  const l = (
    id: string,
    nome: string,
    total: number,
    extra: Partial<PosicaoAcionariaLinha> = {},
  ) => ({
    idAcionista: id,
    nome,
    pctOn: total,
    pctPn: 0,
    pctTotal: total,
    controlador: false,
    acordoAcionistas: false,
    sintetica: false,
    ...extra,
  });

  it('até 6 diretos por % do total, "Outros" soma os excedentes, depois tesouraria; PN null sem PN', () => {
    const linhas = [
      l('OUTROS', 'Outros', 30, { sintetica: true }),
      l('TESOURARIA', 'Ações Tesouraria', 0.3, { sintetica: true }),
      ...[10, 9, 8, 7, 6, 5, 4, 3].map((p, i) => l(`a${i}`, `Acionista ${i}`, p)),
      l('c', 'Controladora', 15, { controlador: true, acordoAcionistas: true }),
    ];
    const r = acionistasParaTela(linhas, { emitePn: false });
    expect(r.map((a) => a.nome)).toEqual([
      'Controladora',
      'Acionista 0',
      'Acionista 1',
      'Acionista 2',
      'Acionista 3',
      'Acionista 4',
      'Outros',
      'Ações em tesouraria',
    ]);
    expect(r[0]).toMatchObject({ controlador: true, acordoAcionistas: true, sintetica: null });
    // 'Outros' do FRE (30) + os diretos que não couberam (5 + 4 + 3)
    expect(r[6]).toMatchObject({ sintetica: 'outros', pctTotal: 30 + 5 + 4 + 3 });
    expect(r.every((a) => a.pctPn === null)).toBe(true);
    const somaLinhas = linhas.reduce((s, a) => s + (a.pctTotal ?? 0), 0);
    expect(r.reduce((s, a) => s + (a.pctTotal ?? 0), 0)).toBeCloseTo(somaLinhas, 6);
    // só nome e % (sem documento)
    expect(Object.keys(r[0]).sort()).toEqual([
      'acordoAcionistas',
      'controlador',
      'nome',
      'pctOn',
      'pctPn',
      'pctTotal',
      'sintetica',
    ]);
  });

  it('tesouraria zerada não aparece', () => {
    const r = acionistasParaTela(
      [l('a', 'A', 60), l('TESOURARIA', 'Ações Tesouraria', 0, { sintetica: true })],
      { emitePn: true },
    );
    expect(r.map((a) => a.nome)).toEqual(['A']);
  });
});
