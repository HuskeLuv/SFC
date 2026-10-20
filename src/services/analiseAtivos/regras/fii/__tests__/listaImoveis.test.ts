/**
 * A6, fatia A — lista de imóveis do FII + composição. Fixtures com o FII FICTÍCIO XPTO11 (CNPJ,
 * nomes, endereços e números inventados; nenhum valor de terceiros).
 */
import { describe, expect, it } from 'vitest';
import {
  COLUNAS_TRIMESTRAL,
  lerInformeTrimestralLinhas,
  type FiiTrimestreBruto,
} from '@/services/analiseAtivos/fii/parserInformeTrimestral';
import { montarLinhasImoveis, planejar } from '@/services/analiseAtivos/fii/gravarImoveisFii';
import {
  ehSetorPlaceholder,
  inferirUf,
  montarListaImoveis,
  normalizarSetor,
  setoresReais,
  type ImovelLido,
} from '@/services/analiseAtivos/regras/fii/listaImoveis';
import {
  montarComposicaoFii,
  type EntradaComposicaoFii,
} from '@/services/analiseAtivos/regras/fii/composicaoFii';
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import type { Estado } from '@/types/analiseAtivosApi';

const XPTO = '99888777000166';
const XPTO_MASC = '99.888.777/0001-66';

async function* texto(t: string): AsyncIterable<string> {
  for (const l of t.split('\n')) yield l;
}
const cab = (cols: readonly string[]) => cols.join(';');

const COLS_IMOVEL_2026 = [
  'CNPJ_Fundo_Classe',
  'Data_Referencia',
  'Versao',
  'Classe',
  'Nome_Imovel',
  'Endereco',
  'Area',
  'Numero_Unidades',
  'Outras_Caracteristicas_Relevantes',
  'Percentual_Vacancia',
  'Percentual_Inadimplencia',
  'Percentual_Receitas_FII',
];
const COLS_INQ = [
  'CNPJ_Fundo_Classe',
  'Data_Referencia',
  'Versao',
  'Nome_Imovel',
  'Setor_Atuacao',
  'Percentual_Receita_Imovel',
  'Percentual_Receitas_FII',
];

function imovelCsv(cnpjCol: string, linhas: string[]): string {
  return [cab([cnpjCol, ...COLS_IMOVEL_2026.slice(1)]), ...linhas].join('\n');
}

async function ler(entradas: { imovel: string; inquilino?: string }) {
  const vazio = (cols: readonly string[]) => () => texto(cab(cols));
  return lerInformeTrimestralLinhas(
    {
      imovel: () => texto(entradas.imovel),
      ativo: vazio(COLUNAS_TRIMESTRAL.ativo),
      complemento: vazio(COLUNAS_TRIMESTRAL.complemento),
      resultado: vazio(COLUNAS_TRIMESTRAL.resultado),
      ...(entradas.inquilino ? { inquilino: () => texto(entradas.inquilino!) } : {}),
    },
    { arquivo: 'fixture_xpto' },
  );
}

const RENDA = 'Imóveis para renda acabados';

describe('parserInformeTrimestral (A6: nome, endereço, unidades e inquilino)', () => {
  it('layout 2026 (CNPJ_Fundo_Classe): lê nome/endereço/unidades e fica a maior Versao', async () => {
    const r = await ler({
      imovel: imovelCsv('CNPJ_Fundo_Classe', [
        `${XPTO_MASC};2026-06-30;1;${RENDA};Galpão Antigo;Rua A, 1, Cidade X, SP;1000;1;-;0;0;0.5`,
        `${XPTO_MASC};2026-06-30;2;${RENDA};Galpão Alfa;Rua das Flores, 10, Cidade Y, MG;12000.5;3;-;0.1;0;0.6`,
        `${XPTO_MASC};2026-06-30;2;Terreno;Terreno Beta;-;50000;;-;;;`,
      ]),
    });
    const t = r.trimestres.find((x) => x.cnpj === XPTO)!;
    expect(t.versaoImovel).toBe(2);
    expect(t.imoveis).toHaveLength(2);
    expect(t.imoveis[0]).toMatchObject({
      nome: 'Galpão Alfa',
      endereco: 'Rua das Flores, 10, Cidade Y, MG',
      unidades: 3,
      area: 12000.5,
      vacanciaPct: 10,
      receitaPct: 60,
    });
    expect(t.imoveis[1]).toMatchObject({ nome: 'Terreno Beta', endereco: null, unidades: null });
    expect(t.setoresInquilino).toBeNull();
    expect(t.versaoInquilino).toBeNull();
  });

  it('layout 2019 (CNPJ_Fundo): o alias resolve e as colunas opcionais são lidas', async () => {
    const r = await ler({
      imovel: imovelCsv('CNPJ_Fundo', [
        `${XPTO_MASC};2019-03-29;1;${RENDA};Loja Gama;Av. Central, 500, Rio de Janeiro;800;2;-;0;0;1`,
      ]),
    });
    const t = r.trimestres[0];
    expect(t.refQuarter).toBe('2019-03-31');
    expect(t.imoveis[0]).toMatchObject({ nome: 'Loja Gama', unidades: 2 });
  });

  it('inquilino: agrega por setor na maior versão; vazio vira "" e SetorN fica marcado', async () => {
    const r = await ler({
      imovel: imovelCsv('CNPJ_Fundo_Classe', [
        `${XPTO_MASC};2026-06-30;2;${RENDA};Galpão Alfa;Rua X, SP;100;1;-;0;0;1`,
      ]),
      inquilino: [
        cab(COLS_INQ),
        `${XPTO_MASC};2026-06-30;1;Galpão Alfa;Indústria;1;0.9`,
        `${XPTO_MASC};2026-06-30;2;Galpão Alfa;Logística;0.5;0.3`,
        `${XPTO_MASC};2026-06-30;2;Galpão Beta;Logística;0.5;0.2`,
        `${XPTO_MASC};2026-06-30;2;Galpão Beta;;1;0.1`,
        `${XPTO_MASC};2026-06-30;2;Galpão Gama;SetorN;1;0.05`,
      ].join('\n'),
    });
    const t = r.trimestres[0];
    expect(t.versaoInquilino).toBe(2);
    const porSetor = Object.fromEntries(t.setoresInquilino!.map((s) => [s.setor, s]));
    expect(Object.keys(porSetor).sort()).toEqual(['', 'Logística', 'SetorN']);
    expect(porSetor['Logística'].pctReceitaFii).toBeCloseTo(50);
    expect(porSetor['Logística'].nLinhas).toBe(2);
    const linhas = montarLinhasImoveis(t);
    expect(linhas.setores.find((s) => s.setor === 'SetorN')!.placeholder).toBe(true);
    expect(linhas.setores.find((s) => s.setor === '')!.placeholder).toBe(false);
  });
});

describe('inferirUf', () => {
  it.each([
    ['Av. Central, 500, Rio de Janeiro', 'RJ'],
    ['Rodovia BR 153, Km 5,5', null],
    ['Rua das Flores, 10, Cidade Y - MG, 30000-000', 'MG'],
    ['Estrada Velha, Km 3, Cidade Z/PR', 'PR'],
    ['Rua Bahia, 100, São Paulo', 'SP'],
    ['Av. Paraná, Cidade W, Mato Grosso do Sul', 'MS'],
    ['Rua Pará, 20, Belém, Pará', 'PA'],
    ['Avenida para o porto, 30', null],
    ['-', null],
    [null, null],
  ])('%s → %s', (endereco, uf) => {
    expect(inferirUf(endereco)).toBe(uf);
  });
});

describe('setor dos locatários', () => {
  it("'SetorN' e numerados são placeholder; vazio é ''", () => {
    expect(ehSetorPlaceholder('SetorN')).toBe(true);
    expect(ehSetorPlaceholder('Setor1')).toBe(true);
    expect(ehSetorPlaceholder('Setor 2')).toBe(true);
    expect(ehSetorPlaceholder('Setor público')).toBe(false);
    expect(normalizarSetor('')).toBe('');
    expect(normalizarSetor('  -  ')).toBe('');
    expect(normalizarSetor(' Varejo  alimentar ')).toBe('Varejo alimentar');
  });

  it('setoresReais tira placeholder e vazio e ordena pelo % da receita', () => {
    expect(
      setoresReais([
        { setor: 'Varejo', pctReceitaFii: 10, placeholder: false },
        { setor: 'Setor1', pctReceitaFii: 80, placeholder: true },
        { setor: '', pctReceitaFii: 5, placeholder: false },
        { setor: 'Logística', pctReceitaFii: 42.123, placeholder: false },
      ]),
    ).toEqual([
      { setor: 'Logística', receitaPct: 42.12 },
      { setor: 'Varejo', receitaPct: 10 },
    ]);
  });
});

function imovel(p: Partial<ImovelLido> & { ordem: number }): ImovelLido {
  return {
    classe: RENDA,
    nome: `Imóvel ${p.ordem}`,
    endereco: null,
    ufInferida: null,
    area: null,
    unidades: 1,
    vacanciaPct: 0,
    receitaPct: null,
    ...p,
  };
}
const VAC: Estado<number> = { estado: 'ok', valor: 4.8 };

describe('montarListaImoveis', () => {
  it('ordena por área, separa outras classes e monta o resumo', () => {
    const r = montarListaImoveis({
      refQuarter: '2026-06-30',
      fiiTipo: 'tijolo',
      vacancia: VAC,
      setores: [{ setor: 'Logística', pctReceitaFii: 60, placeholder: false }],
      imoveis: [
        imovel({ ordem: 0, area: 1000, ufInferida: 'SP', receitaPct: 30 }),
        imovel({ ordem: 1, area: 5000, ufInferida: 'MG', receitaPct: 40 }),
        imovel({ ordem: 2, area: null, ufInferida: 'SP', receitaPct: 25 }),
        imovel({ ordem: 3, area: 9000, classe: 'Terreno' }),
      ],
    });
    expect(r.estado).toBe('ok');
    if (r.estado !== 'ok') return;
    expect(r.valor.imoveis.map((i) => i.ordem)).toEqual([1, 0, 2]);
    expect(r.valor.outros).toEqual([
      { ordem: 3, nome: 'Imóvel 3', classe: 'Terreno', areaM2: 9000 },
    ]);
    expect(r.valor.resumo).toMatchObject({
      nImoveisRenda: 3,
      nOutros: 1,
      areaTotalM2: 6000,
      vacanciaFisicaPct: VAC,
      nEstados: 2,
      nComUf: 3,
      setores: [{ setor: 'Logística', receitaPct: 60 }],
    });
    expect(r.valor.somaReceitaPct).toBe(95);
    expect(r.valor.somaReceitaForaDaFaixa).toBe(false);
  });

  it('soma da receita fora de 90–105%: liga o aviso SEM normalizar os percentuais', () => {
    const r = montarListaImoveis({
      refQuarter: '2026-06-30',
      fiiTipo: 'hibrido',
      vacancia: VAC,
      setores: [],
      imoveis: [imovel({ ordem: 0, receitaPct: 40.5 }), imovel({ ordem: 1, receitaPct: 30 })],
    });
    if (r.estado !== 'ok') throw new Error('esperava ok');
    expect(r.valor.somaReceitaPct).toBe(70.5);
    expect(r.valor.somaReceitaForaDaFaixa).toBe(true);
    expect(r.valor.imoveis.map((i) => i.receitaPct)).toEqual([40.5, 30]);
    expect(r.valor.resumo.setores).toEqual([]);
  });

  it('papel/FoF: não se aplica; sem informe; sem imóvel de renda; CNPJ em conferência', () => {
    const base = { refQuarter: '2026-06-30', vacancia: VAC, setores: [] };
    expect(montarListaImoveis({ ...base, fiiTipo: 'papel', imoveis: [] })).toMatchObject({
      estado: 'nao_se_aplica',
      motivo: 'nao_se_aplica_tipo',
    });
    expect(montarListaImoveis({ ...base, fiiTipo: 'fof', imoveis: [] }).estado).toBe(
      'nao_se_aplica',
    );
    expect(
      montarListaImoveis({ ...base, refQuarter: null, fiiTipo: 'tijolo', imoveis: [] }),
    ).toMatchObject({ estado: 'ausente', motivo: 'sem_informe_trimestral' });
    expect(
      montarListaImoveis({
        ...base,
        fiiTipo: 'tijolo',
        imoveis: [imovel({ ordem: 0, classe: 'Terreno' })],
      }),
    ).toMatchObject({
      estado: 'ausente',
      motivo: 'sem_imoveis_renda',
      texto: TEXTOS_IMOVEIS_FII.motivos.sem_imoveis_renda,
    });
    expect(
      montarListaImoveis({
        ...base,
        fiiTipo: 'tijolo',
        cnpjEmConferencia: true,
        imoveis: [imovel({ ordem: 0 })],
      }),
    ).toMatchObject({ estado: 'ausente', motivo: 'cnpj_em_conferencia' });
  });
});

const COMP: EntradaComposicaoFii = {
  refMonth: '2026-09-01',
  ativoTotal: 1000,
  imoveis: 800,
  spe: 50,
  cri: 30,
  lciLca: null,
  cotasFii: 20,
  rendaFixa: 60,
  acoes: 10,
};

describe('montarComposicaoFii', () => {
  it('6 fatias sobre o ativo total, somando 100%; nulo conta como 0; imóveis inclui SPE', () => {
    const r = montarComposicaoFii(COMP);
    if (r.estado !== 'ok') throw new Error('esperava ok');
    expect(r.valor.fatias.map((f) => f.codigo)).toEqual([
      'imoveis',
      'cri_cra',
      'lci_lca',
      'cotas_fii',
      'caixa_renda_fixa',
      'outros',
    ]);
    expect(r.valor.fatias.map((f) => f.pct)).toEqual([85, 3, 0, 2, 6, 4]);
    expect(r.valor.fatias.reduce((a, f) => a + f.pct, 0)).toBeCloseTo(100, 6);
    expect(r.valor.outrosDetalhado).toBe(false);
  });

  it('resíduo negativo vira sem dado (composição inconsistente)', () => {
    const r = montarComposicaoFii({ ...COMP, imoveis: 950 });
    expect(r).toMatchObject({
      estado: 'ausente',
      motivo: 'composicao_inconsistente',
      texto: TEXTOS_IMOVEIS_FII.motivos.composicao_inconsistente,
    });
  });

  it('com valoresReceber: Outros se divide em aluguéis a receber + outros investimentos', () => {
    const r = montarComposicaoFii({ ...COMP, valoresReceber: 25 });
    if (r.estado !== 'ok') throw new Error('esperava ok');
    expect(r.valor.outrosDetalhado).toBe(true);
    expect(r.valor.fatias.slice(-2)).toEqual([
      { codigo: 'alugueis_receber', pct: 2.5, valor: 25 },
      { codigo: 'outros_investimentos', pct: 1.5, valor: 15 },
    ]);
    expect(r.valor.fatias.reduce((a, f) => a + f.pct, 0)).toBeCloseTo(100, 6);
  });

  it('sem ativo total ou sem nenhuma coluna de composição: sem informe mensal', () => {
    expect(montarComposicaoFii(null).estado).toBe('ausente');
    expect(montarComposicaoFii({ ...COMP, ativoTotal: null })).toMatchObject({
      motivo: 'sem_informe_mensal',
    });
    expect(
      montarComposicaoFii({
        refMonth: '2026-09-01',
        ativoTotal: 10,
        imoveis: null,
        spe: null,
        cri: null,
        lciLca: null,
        cotasFii: null,
        rendaFixa: null,
        acoes: null,
      }),
    ).toMatchObject({ motivo: 'sem_informe_mensal' });
  });
});

describe('gravarImoveisFii (núcleo puro)', () => {
  const bruto = (versao: number): FiiTrimestreBruto => ({
    cnpj: XPTO,
    refQuarter: '2026-06-30',
    versao,
    imoveis: [
      {
        classe: RENDA,
        nome: 'Galpão Alfa',
        endereco: 'Rua X, Cidade Y, SP',
        unidades: 2,
        area: 100.456,
        vacanciaPct: 0,
        inadimplenciaPct: 0,
        receitaPct: 50,
      },
    ],
    ativos: [],
    faixas: null,
    idxIpcaPct: null,
    idxIgpmPct: null,
    receitaAluguel: null,
    resultadoTrimestral: null,
    rendimentosDeclarados: null,
    taxaPerformance: null,
    versaoImovel: versao,
    setoresInquilino: [{ setor: 'Logística', pctReceitaFii: 50, nLinhas: 1 }],
    versaoInquilino: versao,
  });

  it('montarLinhasImoveis infere a UF e arredonda a área; sem entrada não gera linha', () => {
    const m = montarLinhasImoveis(bruto(2));
    expect(m.imoveis[0]).toMatchObject({ ordem: 0, versao: 2, ufInferida: 'SP', area: 100.46 });
    expect(m.setores[0]).toMatchObject({ setor: 'Logística', placeholder: false });
    const sem = montarLinhasImoveis({ ...bruto(2), versaoImovel: null, versaoInquilino: null });
    expect(sem).toEqual({ imoveis: [], setores: [] });
  });

  it('planejar: cria, ignora igual, substitui diferente e nunca regride a versão', () => {
    const k = `${XPTO}|2026-06-30`;
    const linhas = new Map([[k, montarLinhasImoveis(bruto(2)).imoveis]]);
    const assinar = (g: unknown[]) => JSON.stringify(g);
    expect(planejar(linhas, new Map(), assinar).contagem).toMatchObject({ criadas: 1, linhas: 1 });
    const igual = new Map([[k, { versao: 2, assinatura: assinar(linhas.get(k)!) }]]);
    const p = planejar(linhas, igual, assinar);
    expect(p.contagem.iguais).toBe(1);
    expect(p.escrever.size).toBe(0);
    const outra = new Map([[k, { versao: 2, assinatura: 'x' }]]);
    expect(planejar(linhas, outra, assinar).contagem.substituidas).toBe(1);
    const maior = new Map([[k, { versao: 3, assinatura: 'x' }]]);
    expect(planejar(linhas, maior, assinar).contagem).toMatchObject({ versaoMenor: 1, linhas: 0 });
  });
});
