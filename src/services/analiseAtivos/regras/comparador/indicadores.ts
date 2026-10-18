/**
 * Catálogo de indicadores do Comparador (v2.4, fatia D — Comparador isonômico). PURO e isomórfico.
 *
 * Os indicadores aparecem LADO A LADO, todos com o mesmo peso visual: não há direção ("maior é
 * mais favorável"), marca de valor nem placar (spec v2.4 §3.3/§9). Os critérios de fundamentos
 * (contagem factual "n de 6") vêm ANTES dos grupos, montados por montarComparador.
 *
 * Grupos (spec-desenho.json → arquitetura.fatias[D]):
 *  - Ações: Qualidade · Endividamento · Preço · Dividendos;
 *  - FIIs: Renda · Preço · Endividamento · fonte CVM (Obrigações/PL, comum aos dois tipos) ·
 *    Qualidade dos imóveis (tijolo: vacância CVM com selo, nº de imóveis, área CVM) · Qualidade dos
 *    ativos da carteira (papel: nº de CRIs) · Tamanho e liquidez.
 *  - Misto (tijolo + papel, decidido pelo PERFIL de critérios e não pelo rótulo do fundo): cada
 *    grupo de tipo marca 'n/a' para os fundos do outro tipo.
 *
 * Cada extrator devolve o Estado ANTES da política de conferência; montarComparador aplica a
 * conferência pelo `campoTela` (chip 'em conferência').
 *
 * Stocks e REITs (fatia C): grupos próprios, do último FY da SEC na linha do Quadro, SEM cotação
 * (decisão do Wellington de 17/10) — stock: Qualidade · Endividamento · Dividendos; REIT: Geração
 * de caixa · Qualidade · Endividamento · Dividendos. Sem ganhador e sem cor, como no Brasil.
 */
import type { CampoTela } from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_EUA_TELAS } from '@/services/analiseAtivos/textosEuaTelas';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { TipoAtivoComparador } from '@/types/analiseAtivosBlocoD';
import type {
  ClasseQuadro,
  Estado,
  FormatoAnalise,
  LinhaQuadroApi,
} from '@/types/analiseAtivosApi';
import type { CriteriosLinhaApi } from '@/types/analiseAtivosCriterios';

// ===========================================================================
// Catálogo
// ===========================================================================

/** Dados de um ativo que os extratores leem (montados por montarComparador). */
export interface DadosAtivoComparador {
  linha: LinhaQuadroApi;
  /** perfil do ativo para a aplicabilidade ('acao' | 'tijolo' | 'papel') */
  tipo: TipoAtivoComparador;
  /** instituição financeira (D4): margem, dívida e P/Receita 'n/a' */
  financeira: boolean;
  /** AssetMultiplesCurrent (só os campos usados); null = sem linha */
  atual: {
    divLiqPl: number | null;
    pReceita: number | null;
    rend12m: number | null;
    vpCota: number | null;
    naoSeAplica: string[];
  } | null;
  /** último informe trimestral do FII (refQuarter ≥ hoje − 9 meses); null = sem informe */
  trimestre: {
    nImoveis: number | null;
    areaM2: number | null;
    nCri: number | null;
  } | null;
  /** FII com ticker↔CNPJ não conferido: dados do informe ficam '—' */
  cnpjEmConferencia: boolean;
}

type CodigoLinhaEua = keyof typeof TEXTOS_EUA_TELAS.comparador.linhas;
type CodigoLinha = Exclude<keyof typeof TEXTOS_COMPARADOR.linhas, 'semNegociacao'> | CodigoLinhaEua;

export interface DefIndicador {
  codigo: CodigoLinha;
  rotulo: string;
  sub: string | null;
  formato: FormatoAnalise;
  /** tipos a que a linha se aplica; os demais ficam 'n/a' */
  aplicavel: (tipo: TipoAtivoComparador) => boolean;
  fonteCvmAviso: boolean;
  /** campo de tela da conferência (regras/comum/conferencia.ts); null = sem conferência */
  campoTela: CampoTela | null;
  extrator: (d: DadosAtivoComparador) => Estado<number>;
}

export interface DefGrupoComparador {
  codigo: string;
  rotulo: string;
  /** rótulo quando a comparação mistura tijolo e papel */
  rotuloMisto?: string;
  aplicavelA: TipoAtivoComparador[];
  linhas: DefIndicador[];
}

const TL = TEXTOS_COMPARADOR.linhas;
const TG = TEXTOS_COMPARADOR.grupos;

const TIPOS_FII: TipoAtivoComparador[] = ['tijolo', 'papel'];

/**
 * Tipo de comparação de um ativo. FII: o perfil de critérios decide (fii_tijolo | fii_papel); sem
 * avaliação, a régua gravada no Quadro; sem nada, o rótulo (tijolo/híbrido → tijolo; papel, FoF
 * e indefinido → papel, a mesma regra de composição dos critérios sem dado de imóveis).
 */
export function tipoDoAtivo(
  linha: Pick<LinhaQuadroApi, 'classe' | 'fiiTipo'>,
  criterios: Pick<CriteriosLinhaApi, 'perfil'> | null,
  regua: string | null = null,
): TipoAtivoComparador {
  // ação, stock e REIT: um tipo só (o Comparador EUA não mistura classes)
  if (linha.classe !== 'fii') return 'acao';
  if (criterios?.perfil === 'fii_tijolo') return 'tijolo';
  if (criterios?.perfil === 'fii_papel') return 'papel';
  if (regua === 'fii_tijolo') return 'tijolo';
  if (regua === 'fii_papel') return 'papel';
  return linha.fiiTipo === 'tijolo' || linha.fiiTipo === 'hibrido' ? 'tijolo' : 'papel';
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export function okOuSemDado(n: number | null | undefined): Estado<number> {
  return typeof n === 'number' && Number.isFinite(n)
    ? { estado: 'ok', valor: n }
    : { estado: 'ausente', motivo: 'sem_dado_fonte', texto: TEXTOS_TELA.ausentesPorCampo.semDado };
}

export function naoSeAplicaComparador(motivo = 'fora_do_escopo'): Estado<number> {
  return { estado: 'nao_se_aplica', motivo, texto: TEXTOS_COMPARADOR.celula.naoSeAplica };
}

function cnpjEmConferencia(): Estado<number> {
  return {
    estado: 'ausente',
    motivo: 'cnpj_em_conferencia',
    texto: TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia,
  };
}

/** Campo do AssetMultiplesCurrent de ação (financeira ou naoSeAplica ⇒ n/a). */
function doAtualAcao(campo: 'divLiqPl' | 'pReceita') {
  return (d: DadosAtivoComparador): Estado<number> => {
    if (d.financeira) return naoSeAplicaComparador('financeira');
    if (d.atual?.naoSeAplica.includes(campo)) return naoSeAplicaComparador();
    return okOuSemDado(d.atual?.[campo]);
  };
}

function doTrimestre(fn: (t: NonNullable<DadosAtivoComparador['trimestre']>) => number | null) {
  return (d: DadosAtivoComparador): Estado<number> => {
    if (d.cnpjEmConferencia) return cnpjEmConferencia();
    return okOuSemDado(d.trimestre ? fn(d.trimestre) : null);
  };
}

type Base = Omit<DefIndicador, 'rotulo' | 'sub' | 'aplicavel' | 'fonteCvmAviso'> & {
  aplicavel?: DefIndicador['aplicavel'];
  fonteCvmAviso?: boolean;
};

function linha(b: Base): DefIndicador {
  const t =
    b.codigo in TL
      ? TL[b.codigo as Exclude<CodigoLinha, CodigoLinhaEua>]
      : TEXTOS_EUA_TELAS.comparador.linhas[b.codigo as CodigoLinhaEua];
  return {
    ...b,
    rotulo: t.rotulo,
    sub: t.sub ? t.sub : null,
    aplicavel: b.aplicavel ?? (() => true),
    fonteCvmAviso: b.fonteCvmAviso ?? false,
  };
}

export const GRUPOS_ACAO: DefGrupoComparador[] = [
  {
    codigo: 'qualidade',
    rotulo: TG.qualidade,
    aplicavelA: ['acao'],
    linhas: [
      linha({
        codigo: 'lucrosSeguidos',
        formato: 'inteiro',
        campoTela: 'anosLucroConsecutivos',
        extrator: (d) => okOuSemDado(d.linha.anosLucroConsecutivos),
      }),
      linha({ codigo: 'roe', formato: 'pct', campoTela: 'roe', extrator: (d) => d.linha.roe }),
      linha({
        codigo: 'margemLiquida',
        formato: 'pct',
        campoTela: 'margemLiquida',
        extrator: (d) =>
          d.financeira ? naoSeAplicaComparador('financeira') : d.linha.margemLiquida,
      }),
    ],
  },
  {
    codigo: 'endividamento',
    rotulo: TG.endividamento,
    aplicavelA: ['acao'],
    linhas: [
      linha({
        codigo: 'divLiqEbitda',
        formato: 'numero2',
        campoTela: 'divLiqEbitda',
        extrator: (d) =>
          d.financeira ? naoSeAplicaComparador('financeira') : d.linha.divLiqEbitda,
      }),
      linha({
        codigo: 'divLiqPl',
        formato: 'numero2',
        campoTela: 'divLiqPl',
        extrator: doAtualAcao('divLiqPl'),
      }),
    ],
  },
  {
    codigo: 'preco',
    rotulo: TG.preco,
    aplicavelA: ['acao'],
    linhas: [
      linha({ codigo: 'pl', formato: 'numero', campoTela: 'pl', extrator: (d) => d.linha.pl }),
      linha({ codigo: 'pvp', formato: 'numero2', campoTela: 'pvp', extrator: (d) => d.linha.pvp }),
      linha({
        codigo: 'pReceita',
        formato: 'numero2',
        campoTela: 'pReceita',
        extrator: doAtualAcao('pReceita'),
      }),
    ],
  },
  {
    codigo: 'dividendos',
    rotulo: TG.dividendos,
    aplicavelA: ['acao'],
    linhas: [
      linha({
        codigo: 'dy12m',
        formato: 'pct',
        campoTela: 'dy12m',
        extrator: (d) => d.linha.dy12m,
      }),
      linha({
        codigo: 'payout',
        formato: 'pct',
        campoTela: 'payout',
        extrator: (d) => d.linha.payout,
      }),
    ],
  },
];

const soTijolo = (t: TipoAtivoComparador) => t === 'tijolo';
const soPapel = (t: TipoAtivoComparador) => t === 'papel';

export const GRUPOS_FII: DefGrupoComparador[] = [
  {
    codigo: 'renda',
    rotulo: TG.renda,
    aplicavelA: TIPOS_FII,
    linhas: [
      linha({
        codigo: 'dy12m',
        formato: 'pct',
        campoTela: 'dy12m',
        extrator: (d) => d.linha.dy12m,
      }),
      linha({
        codigo: 'rendimentoCota',
        formato: 'numero2',
        campoTela: 'rendCota12m',
        extrator: (d) => okOuSemDado(d.atual?.rend12m),
      }),
      linha({
        codigo: 'mesesComRendimento',
        formato: 'inteiro',
        campoTela: 'mesesComRendimento',
        extrator: (d) => okOuSemDado(d.linha.mesesComRendimento),
      }),
    ],
  },
  {
    codigo: 'preco',
    rotulo: TG.preco,
    aplicavelA: TIPOS_FII,
    linhas: [
      linha({
        codigo: 'pvpFii',
        formato: 'numero2',
        campoTela: 'pvp',
        extrator: (d) => d.linha.pvp,
      }),
      linha({
        codigo: 'vpCota',
        formato: 'numero2',
        campoTela: 'vpCota',
        extrator: (d) => (d.cnpjEmConferencia ? cnpjEmConferencia() : okOuSemDado(d.atual?.vpCota)),
      }),
    ],
  },
  {
    // comum aos dois tipos (D3: alavancagem = Obrigações/PL)
    codigo: 'endividamento',
    rotulo: TG.endividamentoFii,
    aplicavelA: TIPOS_FII,
    linhas: [
      linha({
        codigo: 'obrigacoesPl',
        formato: 'pct',
        campoTela: 'obrigacoesPl',
        extrator: (d) => d.linha.obrigacoesPl,
      }),
    ],
  },
  {
    codigo: 'imoveis',
    rotulo: TG.imoveis,
    rotuloMisto: TG.imoveisMisto,
    aplicavelA: ['tijolo'],
    linhas: [
      linha({
        codigo: 'vacanciaFisica',
        formato: 'pct',
        aplicavel: soTijolo,
        fonteCvmAviso: true,
        campoTela: 'vacanciaCvm',
        extrator: (d) => d.linha.vacanciaCvm,
      }),
      linha({
        codigo: 'nImoveis',
        formato: 'inteiro',
        aplicavel: soTijolo,
        campoTela: 'nImoveisCvm',
        extrator: (d) =>
          d.cnpjEmConferencia
            ? cnpjEmConferencia()
            : okOuSemDado(d.trimestre?.nImoveis ?? d.linha.nImoveisCvm),
      }),
      linha({
        codigo: 'areaInformada',
        formato: 'inteiro',
        aplicavel: soTijolo,
        campoTela: null,
        extrator: doTrimestre((t) => (t.areaM2 === null ? null : t.areaM2 / 1000)),
      }),
    ],
  },
  {
    codigo: 'ativosPapel',
    rotulo: TG.ativosPapel,
    rotuloMisto: TG.ativosPapelMisto,
    aplicavelA: ['papel'],
    linhas: [
      linha({
        codigo: 'nCri',
        formato: 'inteiro',
        aplicavel: soPapel,
        campoTela: 'nCri',
        extrator: doTrimestre((t) => t.nCri),
      }),
    ],
  },
  {
    codigo: 'tamanhoLiquidez',
    rotulo: TG.tamanhoLiquidez,
    aplicavelA: TIPOS_FII,
    linhas: [
      linha({
        codigo: 'patrimonio',
        formato: 'moedaCompacta',
        campoTela: 'patrimonio',
        extrator: (d) => okOuSemDado(d.linha.patrimonio),
      }),
      linha({
        codigo: 'cotistas',
        formato: 'inteiro',
        campoTela: 'cotistas',
        extrator: (d) => okOuSemDado(d.linha.cotistas),
      }),
      linha({
        codigo: 'liquidez21',
        formato: 'moedaCompacta',
        campoTela: 'liquidez21',
        extrator: (d) => okOuSemDado(d.linha.liquidezMedia21),
      }),
    ],
  },
];

// ---------------------------------------------------------------------------
// Stocks e REITs (fatia C)
// ---------------------------------------------------------------------------

const GE = TEXTOS_EUA_TELAS.comparador.grupos;
const EUA: TipoAtivoComparador[] = ['acao'];

const QUALIDADE_EUA = [
  linha({
    codigo: 'lucrosSeguidosEua',
    formato: 'inteiro',
    campoTela: null,
    extrator: (d) => okOuSemDado(d.linha.anosLucroConsecutivos),
  }),
  linha({ codigo: 'roeEua', formato: 'pct', campoTela: null, extrator: (d) => d.linha.roe }),
  linha({
    codigo: 'margemEua',
    formato: 'pct',
    campoTela: null,
    extrator: (d) => d.linha.margemLiquida,
  }),
];

const DIVIDA_EUA = linha({
  codigo: 'divLiqEbitdaEua',
  formato: 'multiplo',
  campoTela: null,
  extrator: (d) => d.linha.divLiqEbitda,
});

const DPA_EUA = linha({
  codigo: 'dpaEua',
  formato: 'numero2',
  campoTela: null,
  extrator: (d) => okOuSemDado(d.linha.dpa),
});

export const GRUPOS_STOCK: DefGrupoComparador[] = [
  { codigo: 'qualidade', rotulo: GE.qualidade, aplicavelA: EUA, linhas: QUALIDADE_EUA },
  { codigo: 'endividamento', rotulo: GE.endividamento, aplicavelA: EUA, linhas: [DIVIDA_EUA] },
  {
    codigo: 'dividendos',
    rotulo: GE.dividendos,
    aplicavelA: EUA,
    linhas: [
      DPA_EUA,
      linha({
        codigo: 'payoutEua',
        formato: 'pct',
        campoTela: null,
        extrator: (d) => d.linha.payout,
      }),
    ],
  },
];

export const GRUPOS_REIT: DefGrupoComparador[] = [
  {
    codigo: 'geracaoCaixa',
    rotulo: GE.geracaoCaixa,
    aplicavelA: EUA,
    linhas: [
      linha({
        codigo: 'fcoAcaoEua',
        formato: 'numero2',
        campoTela: null,
        extrator: (d) => okOuSemDado(d.linha.fcoPorAcao),
      }),
      linha({
        codigo: 'divFcoEua',
        formato: 'pct',
        campoTela: null,
        extrator: (d) => okOuSemDado(d.linha.dividendosFcoPct),
      }),
    ],
  },
  {
    codigo: 'qualidade',
    rotulo: GE.qualidade,
    aplicavelA: EUA,
    // a margem do REIT não vem na linha do Quadro (lucro contábil com a depreciação dos imóveis:
    // n/a na linha); ficam os anos seguidos de lucro e de dividendo crescente
    linhas: [
      QUALIDADE_EUA[0],
      linha({
        codigo: 'anosDividendoEua',
        formato: 'inteiro',
        campoTela: null,
        extrator: (d) => okOuSemDado(d.linha.anosDividendo),
      }),
    ],
  },
  { codigo: 'endividamento', rotulo: GE.endividamento, aplicavelA: EUA, linhas: [DIVIDA_EUA] },
  { codigo: 'dividendos', rotulo: GE.dividendos, aplicavelA: EUA, linhas: [DPA_EUA] },
];

export function catalogoComparador(classe: ClasseQuadro): DefGrupoComparador[] {
  if (classe === 'stock') return GRUPOS_STOCK;
  if (classe === 'reit') return GRUPOS_REIT;
  return classe === 'acao' ? GRUPOS_ACAO : GRUPOS_FII;
}

/** tijolo e papel no mesmo conjunto (pelo perfil de critérios). */
export function ehMisto(tipos: readonly TipoAtivoComparador[]): boolean {
  return tipos.includes('tijolo') && tipos.includes('papel');
}
