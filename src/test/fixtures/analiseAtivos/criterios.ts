/**
 * Fixtures dos Filtros de Fundamentos (v2.4, fatia 0) para os testes de A, B, C1, C2 e D.
 *
 * - CASOS_45: casos 24–29 da spec §4.5 com as séries LITERAIS (WEGE3 receita/FCL/Dív.líq-EBITDA do
 *   protótipo; AZUL4 e o FII do caso 28 são ILUSTRATIVOS, montados para dar o resultado literal da
 *   spec). O caso 28 DECLARA a base de proventos cobrindo a janela de 60 meses (inicioBase 2021-01).
 *   `esperado` = estado e fato exatos (fatia A: casos45.test.ts).
 * - CRITERIOS_LINHA_*: CriteriosLinhaApi do Quadro/pares (ação 5 de 6, financeira n de 3, FII
 *   tijolo, FII papel/FoF, sem avaliação = null).
 * - CRITERIOS_ATIVO_WEGE3 / _ITUB4 / _HGLG11: CriteriosAtivo (3 janelas) do topo do ativo.
 * - COMPACTOS_WEGE3: AnaliseQuadroLinha.criterios no formato compacto.
 * - definicoesChips(classe): DefCriterioChip[] a partir do CRITERIA_PARAMS_V1.
 */
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import type { DefCriterio } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import type {
  CriteriosAtivo,
  CriteriosCompactos,
  CriteriosLinhaApi,
  DefCriterioChip,
  EstadoCriterio,
  IdCriterio,
  ItemCriterioApi,
  Janela,
  JanelaCriteriosApi,
  PerfilCriterio,
  PontoCriterio,
} from '@/types/analiseAtivosCriterios';

// ===========================================================================
// Casos 24–29 (spec §4.5)
// ===========================================================================

export interface CasoCriterio45 {
  caso: 24 | 25 | 26 | 27 | 28 | 29;
  descricao: string;
  ticker: string;
  perfil: PerfilCriterio;
  criterio: IdCriterio;
  janela: Janela;
  anoFim: number;
  /** ano → valor (unidade do critério: R$ mi, ×, %) */
  serie?: Record<number, number | null>;
  /** só no 'months' */
  meses?: { consecutivos: number; inicioBase: string };
  esperado: { estado: EstadoCriterio; fato: string; n: number | null; de: number | null };
}

export const CASOS_45: CasoCriterio45[] = [
  {
    caso: 24,
    descricao: 'Critério crescente — atende (WEGE3 receita 2020–2025)',
    ticker: 'WEGE3',
    perfil: 'acao',
    criterio: 'rec',
    janela: 5,
    anoFim: 2025,
    serie: { 2020: 17500, 2021: 23600, 2022: 29900, 2023: 32500, 2024: 36200, 2025: 40800 },
    esperado: {
      estado: 'atende',
      fato: 'cresceu em 5 de 5 anos · 17.500 → 40.800 (R$ mi)',
      n: 5,
      de: 5,
    },
  },
  {
    caso: 25,
    descricao: 'Critério crescente — um ano de queda (WEGE3 FCL; 2022 < 2021)',
    ticker: 'WEGE3',
    perfil: 'acao',
    criterio: 'fcl',
    janela: 5,
    anoFim: 2025,
    serie: { 2020: 1777, 2021: 3011, 2022: 2958, 2023: 4975, 2024: 5175, 2025: 7018 },
    esperado: {
      estado: 'nao_atende',
      fato: 'cresceu em 4 de 5 anos · 1.777 → 7.018 (R$ mi)',
      n: 4,
      de: 5,
    },
  },
  {
    caso: 26,
    descricao: 'Critério limite — caixa líquido (WEGE3 Dív.líq/EBITDA 2021–2025, limite 3×)',
    ticker: 'WEGE3',
    perfil: 'acao',
    criterio: 'dl',
    janela: 5,
    anoFim: 2025,
    serie: { 2021: -0.03, 2022: -0.37, 2023: -0.35, 2024: -0.48, 2025: -0.5 },
    esperado: {
      estado: 'atende',
      fato: 'dentro do limite em 5 de 5 anos · máx. 0,0× (limite 3,0×)',
      n: 5,
      de: 5,
    },
  },
  {
    caso: 27,
    descricao: 'Critério positiva — prejuízo (AZUL4 ilustrativa: margem negativa em todos os anos)',
    ticker: 'AZUL4',
    perfil: 'acao',
    criterio: 'mg',
    janela: 5,
    anoFim: 2025,
    serie: { 2021: -4.2, 2022: -10.5, 2023: -7.9, 2024: -3.3, 2025: -1.6 },
    esperado: {
      estado: 'nao_atende',
      fato: 'positiva em 0 de 5 anos · mín. −10,5%',
      n: 0,
      de: 5,
    },
  },
  {
    caso: 28,
    descricao:
      'Critério meses — 48 meses seguidos até dez/2025, base de proventos desde jan/2021 (cobre 60)',
    ticker: 'FIIX11',
    perfil: 'fii_tijolo',
    criterio: 'mes',
    janela: 5,
    anoFim: 2025,
    meses: { consecutivos: 48, inicioBase: '2021-01' },
    esperado: {
      estado: 'nao_atende',
      fato: '48 de 60 meses com rendimento pago (jan/2021–dez/2025)',
      n: 48,
      de: 60,
    },
  },
  {
    caso: 28,
    descricao: 'Critério meses — a mesma base na janela 3',
    ticker: 'FIIX11',
    perfil: 'fii_tijolo',
    criterio: 'mes',
    janela: 3,
    anoFim: 2025,
    meses: { consecutivos: 48, inicioBase: '2021-01' },
    esperado: {
      estado: 'atende',
      fato: '36 de 36 meses com rendimento pago (jan/2023–dez/2025)',
      n: 36,
      de: 36,
    },
  },
  {
    caso: 29,
    descricao: 'Dado ausente — 7 anos de demonstrações na janela 10 (nunca atende por falta)',
    ticker: 'NOVA3',
    perfil: 'acao',
    criterio: 'rec',
    janela: 10,
    anoFim: 2025,
    serie: { 2019: 800, 2020: 900, 2021: 1000, 2022: 1100, 2023: 1200, 2024: 1300, 2025: 1400 },
    esperado: { estado: 'sem_dado', fato: 'sem dado nas demonstrações', n: null, de: null },
  },
];

// ===========================================================================
// Definições (chips) a partir do params v1
// ===========================================================================

const P = CRITERIA_PARAMS_V1;

function chip(c: DefCriterio, par: DefCriterio | null): DefCriterioChip {
  // chip desabilitado só quando o critério de tijolo é inativo (vac/inad); alav/ltv fica ligado
  const inativo = c.ativo === false;
  return {
    id: c.id,
    rotulo: c.rotulo,
    definicao: c.definicao,
    equivalente: par ? { id: par.id, rotulo: par.rotulo, definicao: par.definicao } : null,
    habilitado: !inativo,
    motivoDesabilitado: inativo ? TEXTOS_CRITERIOS.chips.tooltipDesabilitado : null,
    seloSemDado: inativo,
  };
}

/** Chips da barra de filtros por classe (FII = pares tijolo/papel pelas equivalências). */
export function definicoesChips(classe: ClasseQuadro): DefCriterioChip[] {
  if (classe === 'acao') return P.perfis.acao.map((c) => chip(c, null));
  return P.perfis.fii_tijolo.map((c) => {
    const idPar = P.equivalencias[c.id];
    const par = idPar ? (P.perfis.fii_papel.find((x) => x.id === idPar) ?? null) : null;
    return chip(c, par);
  });
}

/** id → rótulo (props `rotulos` de CelulaCriterios). */
export function rotulosCriterios(perfil: PerfilCriterio): Partial<Record<IdCriterio, string>> {
  const lista =
    perfil === 'fii_tijolo'
      ? P.perfis.fii_tijolo
      : perfil === 'fii_papel'
        ? P.perfis.fii_papel
        : P.perfis.acao;
  return Object.fromEntries(lista.map((c) => [c.id, c.rotulo]));
}

// ===========================================================================
// Linhas do Quadro / pares (CriteriosLinhaApi)
// ===========================================================================

/** WEGE3, janela 5: 5 de 6 (FCL caiu em 2022). */
export const CRITERIOS_LINHA_WEGE3: CriteriosLinhaApi = {
  janela: 5,
  perfil: 'acao',
  n: 5,
  de: 6,
  marcas: [
    { id: 'rec', estado: 'atende', fato: 'cresceu em 5 de 5 anos · 17.470 → 40.804 (R$ mi)' },
    { id: 'luc', estado: 'atende', fato: 'cresceu em 5 de 5 anos · 2.341 → 6.376 (R$ mi)' },
    { id: 'ebitda', estado: 'atende', fato: 'cresceu em 5 de 5 anos · 3.268 → 9.000 (R$ mi)' },
    { id: 'mg', estado: 'atende', fato: 'positiva em 5 de 5 anos · mín. 14,1%' },
    {
      id: 'dl',
      estado: 'atende',
      fato: 'dentro do limite em 5 de 5 anos · máx. 0,0× (limite 3,0×)',
    },
    { id: 'fcl', estado: 'nao_atende', fato: 'cresceu em 2 de 5 anos · 3.371 → 3.760 (R$ mi)' },
  ],
};

/** ITUB4 (financeira, D4): n de 3, EBITDA/DL/FCL não se aplicam. */
export const CRITERIOS_LINHA_ITUB4: CriteriosLinhaApi = {
  janela: 5,
  perfil: 'acao_financeira',
  n: 2,
  de: 3,
  marcas: [
    { id: 'rec', estado: 'nao_atende', fato: 'cresceu em 4 de 5 anos · 98.400 → 150.200 (R$ mi)' },
    { id: 'luc', estado: 'atende', fato: 'cresceu em 5 de 5 anos · 18.900 → 41.400 (R$ mi)' },
    {
      id: 'ebitda',
      estado: 'nao_se_aplica',
      fato: TEXTOS_CRITERIOS.motivos.instituicao_financeira,
    },
    { id: 'mg', estado: 'atende', fato: 'positiva em 5 de 5 anos · mín. 13,8%' },
    { id: 'dl', estado: 'nao_se_aplica', fato: TEXTOS_CRITERIOS.motivos.instituicao_financeira },
    {
      id: 'fcl',
      estado: 'nao_se_aplica',
      fato: TEXTOS_CRITERIOS.motivos.instituicao_financeira_fcl,
    },
  ],
};

/** HGLG11 (tijolo), janela 5: vacância sem dado (D3), Obrigações/PL 20,2% em 2024. */
export const CRITERIOS_LINHA_HGLG11: CriteriosLinhaApi = {
  janela: 5,
  perfil: 'fii_tijolo',
  n: 3,
  de: 6,
  marcas: [
    { id: 'rend', estado: 'atende', fato: 'cresceu em 5 de 5 anos · 9,24 → 13,20 (R$)' },
    { id: 'vp', estado: 'atende', fato: 'cresceu em 5 de 5 anos · 149,10 → 165,95 (R$)' },
    { id: 'vac', estado: 'sem_dado', fato: TEXTOS_CRITERIOS.motivos.sem_fonte_confiavel.vac },
    {
      id: 'alav',
      estado: 'nao_atende',
      fato: 'dentro do limite em 4 de 5 anos · máx. 20,2% (limite 20,0%)',
    },
    { id: 'mes', estado: 'atende', fato: '60 de 60 meses com rendimento pago (jan/2021–dez/2025)' },
    { id: 'res', estado: 'nao_atende', fato: 'cresceu em 3 de 5 anos · 312 → 498 (R$ mi)' },
  ],
};

/** KNCR11 (papel), janela 5: inadimplência e LTV sem dado (D3). */
export const CRITERIOS_LINHA_KNCR11: CriteriosLinhaApi = {
  janela: 5,
  perfil: 'fii_papel',
  n: 2,
  de: 6,
  marcas: [
    { id: 'rend', estado: 'nao_atende', fato: 'cresceu em 3 de 5 anos · 6,10 → 14,10 (R$)' },
    { id: 'vp', estado: 'nao_atende', fato: 'cresceu em 2 de 5 anos · 101,20 → 102,64 (R$)' },
    { id: 'inad', estado: 'sem_dado', fato: TEXTOS_CRITERIOS.motivos.sem_fonte_confiavel.inad },
    { id: 'ltv', estado: 'sem_dado', fato: TEXTOS_CRITERIOS.motivos.sem_fonte_confiavel.ltv },
    { id: 'mes', estado: 'atende', fato: '60 de 60 meses com rendimento pago (jan/2021–dez/2025)' },
    { id: 'res', estado: 'atende', fato: 'cresceu em 5 de 5 anos · 480 → 1.390 (R$ mi)' },
  ],
};

/** Ativo ainda sem avaliação (job não rodou): a célula mostra '—'. */
export const CRITERIOS_LINHA_SEM_AVALIACAO: CriteriosLinhaApi | null = null;

// ===========================================================================
// Topo do ativo (CriteriosAtivo)
// ===========================================================================

function serieAnos(anoInicio: number, valores: Array<number | null>): PontoCriterio[] {
  return valores.map((valor, i) => ({ ano: anoInicio + i, valor }));
}

function itemDe(
  def: DefCriterio,
  estado: EstadoCriterio,
  fato: string,
  serie: PontoCriterio[] | null,
  n: number | null,
  de: number | null,
): ItemCriterioApi {
  return {
    id: def.id,
    rotulo: def.rotulo,
    definicao: def.definicao,
    estado,
    n,
    de,
    fato,
    serie,
    formato: def.formato,
    ...(def.unidade ? { unidade: def.unidade } : {}),
  };
}

const ACAO = Object.fromEntries(P.perfis.acao.map((c) => [c.id, c])) as Record<string, DefCriterio>;
const TIJOLO = Object.fromEntries(P.perfis.fii_tijolo.map((c) => [c.id, c])) as Record<
  string,
  DefCriterio
>;

function janelaApi(
  anoInicio: number,
  anoFim: number,
  itens: ItemCriterioApi[],
): JanelaCriteriosApi {
  const aplicaveis = itens.filter((i) => i.estado !== 'nao_se_aplica');
  return {
    anoInicio,
    anoFim,
    atendidos: aplicaveis.filter((i) => i.estado === 'atende').length,
    aplicaveis: aplicaveis.length,
    itens,
  };
}

const W_REC = [9760, 9367, 9524, 11970, 13347, 17470, 23563, 29905, 32504, 37987, 40804];
const W_LUC = [1156, 1118, 1142, 1338, 1615, 2341, 3586, 4208, 5732, 6043, 6376];
const W_EBITDA = [1478, 1407, 1466, 1824, 2245, 3268, 4679, 5617, 7090, 8503, 9000];
const W_MG = [11.8, 11.9, 12, 11.2, 12.1, 13.4, 15.2, 14.1, 17.6, 15.9, 15.6];
const W_DL = [0.49, -0.26, -0.35, 0.13, -0.49, -0.86, -0.31, -0.27, -0.6, -0.52, -0.3];
const W_FCL = [475, 1768, 1024, 870, 1383, 3371, 92, 1809, 5363, 5402, 3760];

function janelaWege3(j: Janela): JanelaCriteriosApi {
  const fim = 2025;
  const ini = fim - j + 1;
  const corte = (s: number[], up: boolean) => {
    const k = 11 - j - (up ? 1 : 0);
    return serieAnos(2015 + k, s.slice(k));
  };
  const n = (s: number[]) => {
    const w = s.slice(11 - j - 1);
    let c = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[i - 1]) c++;
    return c;
  };
  const up = (def: DefCriterio, s: number[]) => {
    const c = n(s);
    const w = corte(s, true);
    const ini0 = w[0].valor as number;
    const fim0 = w[w.length - 1].valor as number;
    return itemDe(
      def,
      c === j ? 'atende' : 'nao_atende',
      `cresceu em ${c} de ${j} anos · ${ini0.toLocaleString('pt-BR')} → ${fim0.toLocaleString('pt-BR')} (R$ mi)`,
      w,
      c,
      j,
    );
  };
  const mgSerie = corte(W_MG, false);
  const minMg = Math.min(...mgSerie.map((p) => p.valor as number));
  return janelaApi(ini, fim, [
    up(ACAO.rec, W_REC),
    up(ACAO.luc, W_LUC),
    up(ACAO.ebitda, W_EBITDA),
    itemDe(
      ACAO.mg,
      'atende',
      `positiva em ${j} de ${j} anos · mín. ${minMg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%`,
      mgSerie,
      j,
      j,
    ),
    itemDe(
      ACAO.dl,
      'atende',
      `dentro do limite em ${j} de ${j} anos · máx. ${j === 10 ? '0,1' : '0,0'}× (limite 3,0×)`,
      corte(W_DL, false),
      j,
      j,
    ),
    up(ACAO.fcl, W_FCL),
  ]);
}

/** WEGE3 — 3 janelas (séries do protótipo, R$ mi). */
export const CRITERIOS_ATIVO_WEGE3: CriteriosAtivo = {
  perfil: 'acao',
  fonte: 'DFP/ITR (CVM)',
  anoFim: 2025,
  paramsVersion: 1,
  observacaoPerfil: null,
  janelas: { '3': janelaWege3(3), '5': janelaWege3(5), '10': janelaWege3(10) },
};

function janelaItub4(j: Janela): JanelaCriteriosApi {
  const ini = 2025 - j + 1;
  const nsa = (def: DefCriterio, fato: string) =>
    itemDe(def, 'nao_se_aplica', fato, null, null, null);
  return janelaApi(ini, 2025, [
    itemDe(ACAO.rec, 'nao_atende', `cresceu em ${j - 1} de ${j} anos`, null, j - 1, j),
    itemDe(ACAO.luc, 'atende', `cresceu em ${j} de ${j} anos`, null, j, j),
    nsa(ACAO.ebitda, TEXTOS_CRITERIOS.motivos.instituicao_financeira),
    itemDe(ACAO.mg, 'atende', `positiva em ${j} de ${j} anos · mín. 13,8%`, null, j, j),
    nsa(ACAO.dl, TEXTOS_CRITERIOS.motivos.instituicao_financeira),
    nsa(ACAO.fcl, TEXTOS_CRITERIOS.motivos.instituicao_financeira_fcl),
  ]);
}

/** ITUB4 — financeira (n de 3). */
export const CRITERIOS_ATIVO_ITUB4: CriteriosAtivo = {
  perfil: 'acao_financeira',
  fonte: 'DFP/ITR (CVM)',
  anoFim: 2025,
  paramsVersion: 1,
  observacaoPerfil: null,
  janelas: { '3': janelaItub4(3), '5': janelaItub4(5), '10': janelaItub4(10) },
};

function janelaHglg11(j: Janela): JanelaCriteriosApi {
  const ini = 2025 - j + 1;
  if (j === 10) {
    const semDado = (def: DefCriterio) =>
      itemDe(def, 'sem_dado', TEXTOS_CRITERIOS.fatos.semDadoFii10, null, null, null);
    return janelaApi(ini, 2025, [
      semDado(TIJOLO.rend),
      semDado(TIJOLO.vp),
      itemDe(
        TIJOLO.vac,
        'sem_dado',
        TEXTOS_CRITERIOS.motivos.sem_fonte_confiavel.vac,
        null,
        null,
        null,
      ),
      semDado(TIJOLO.alav),
      itemDe(
        TIJOLO.mes,
        'nao_atende',
        '84 de 120 meses com rendimento pago (jan/2016–dez/2025)',
        null,
        84,
        120,
      ),
      semDado(TIJOLO.res),
    ]);
  }
  return janelaApi(ini, 2025, [
    itemDe(
      TIJOLO.rend,
      'atende',
      `cresceu em ${j} de ${j} anos`,
      serieAnos(2025 - j, [9.24, 10.1, 11.0, 11.8, 12.5, 13.2].slice(-(j + 1))),
      j,
      j,
    ),
    itemDe(TIJOLO.vp, 'atende', `cresceu em ${j} de ${j} anos`, null, j, j),
    itemDe(
      TIJOLO.vac,
      'sem_dado',
      TEXTOS_CRITERIOS.motivos.sem_fonte_confiavel.vac,
      null,
      null,
      null,
    ),
    itemDe(
      TIJOLO.alav,
      'nao_atende',
      `dentro do limite em ${j - 1} de ${j} anos · máx. 20,2% (limite 20,0%)`,
      serieAnos(ini, [12.5, 14.6, 20.2, 17.6, 16.2].slice(-j)),
      j - 1,
      j,
    ),
    itemDe(
      TIJOLO.mes,
      'atende',
      `${12 * j} de ${12 * j} meses com rendimento pago (jan/${2026 - j}–dez/2025)`,
      null,
      12 * j,
      12 * j,
    ),
    itemDe(TIJOLO.res, 'nao_atende', `cresceu em ${j - 2} de ${j} anos`, null, j - 2, j),
  ]);
}

/** HGLG11 — tijolo (D3: vacância sem dado; janela 10 sem dado nos informes). */
export const CRITERIOS_ATIVO_HGLG11: CriteriosAtivo = {
  perfil: 'fii_tijolo',
  fonte: 'informes de FIIs (CVM)',
  anoFim: 2025,
  paramsVersion: 1,
  observacaoPerfil: null,
  janelas: { '3': janelaHglg11(3), '5': janelaHglg11(5), '10': janelaHglg11(10) },
};

// ===========================================================================
// Formato compacto (AnaliseQuadroLinha.criterios)
// ===========================================================================

export const COMPACTOS_WEGE3: CriteriosCompactos = {
  '5': {
    n: CRITERIOS_LINHA_WEGE3.n,
    de: CRITERIOS_LINHA_WEGE3.de,
    m: CRITERIOS_LINHA_WEGE3.marcas.map((m) => [m.id, m.estado, m.fato]),
  },
};
