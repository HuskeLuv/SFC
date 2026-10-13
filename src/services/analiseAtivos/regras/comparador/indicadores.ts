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
 */
import type { CampoTela } from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type {
  ComparadorResposta,
  ConferenciaCelulaComparador,
  GraficosComparador,
} from '@/types/analiseAtivosBlocoD';
import type {
  ClasseQuadro,
  Estado,
  FiiTipoTela,
  ForaDoQuadroMotivo,
  FormatoAnalise,
  LinhaQuadroApi,
} from '@/types/analiseAtivosApi';
import type {
  CriteriosLinhaApi,
  IdCriterio,
  Janela,
  LeituraDosDados,
} from '@/types/analiseAtivosCriterios';

// ===========================================================================
// Tipos da resposta isonômica (o contrato de analiseAtivosBlocoD.ts ainda carrega os campos do
// Índice/★ como obrigatórios; a fatia F os remove do tipo. A resposta da D já sai sem eles.)
// ===========================================================================

/**
 * Tipo do ativo para a aplicabilidade de grupo/linha: 'acao' ou o perfil de critérios do FII
 * (tijolo | papel; FoF, híbrido e indefinido seguem a regra de composição do motor, rec. 3).
 */
export type TipoAtivoComparador = 'acao' | 'tijolo' | 'papel';

/** Uma linha de indicador (sem direção, sem marca de valor). */
export interface LinhaComparadorV2 {
  codigo: string;
  rotulo: string;
  sub: string | null;
  formato: FormatoAnalise;
  /** selo 'fonte CVM' sob o valor (vacância física da CVM, que pode diferir do gestor) */
  fonteCvmAviso: boolean;
  /** chave = ticker; 'n/a' no misto (tijolo × papel) e nas financeiras */
  valores: Record<string, Estado<number>>;
  conferencia: Record<string, ConferenciaCelulaComparador | null>;
}

export interface GrupoComparadorV2 {
  codigo: string;
  rotulo: string;
  aplicavelA: TipoAtivoComparador[];
  linhas: LinhaComparadorV2[];
}

/** Ativo do Comparador (sem Índice, sem régua do Índice). */
export interface AtivoComparadorV2 {
  ticker: string;
  nome: string;
  preco: Estado<number>;
  precoData: string | null;
  fiiTipo: FiiTipoTela | null;
  /** 'acao' | 'tijolo' | 'papel' (perfil de critérios) */
  tipoComparacao: TipoAtivoComparador;
  /** critérios na janela pedida; null = sem avaliação */
  criterios: CriteriosLinhaApi | null;
  noQuadro: boolean;
  foraDoQuadroMotivo: ForaDoQuadroMotivo | null;
  /** grupos de conferência deste ativo */
  conferencias: string[];
  /** sugestões do mesmo segmento/tipo para o slot vazio */
  pares: string[];
}

/** Rótulos e equivalências do bloco de critérios (linhas na ordem do perfil). */
export interface CriteriosComparador {
  /** id da linha → rótulo, na ORDEM das linhas (no misto, 'Obrigações/PL ≤ 20% / LTV ≤ 60%') */
  rotulos: Partial<Record<IdCriterio, string>>;
  /** id da linha (tijolo) → id equivalente (papel); só no misto */
  equivalencias: Partial<Record<IdCriterio, IdCriterio>>;
}

/**
 * GET /api/analise-ativos/comparador?t=…&janela=5 — resposta isonômica. Nenhuma chave casa
 * /indice|semaforo|destaque/i. ORDEM: `tickers`, `ativos`, `graficos.series` e
 * `leitura.contagens` seguem a ordem dos slots.
 */
export interface ComparadorRespostaV2 {
  classe: ClasseQuadro;
  janela: Janela;
  tickers: string[];
  ignorados: ComparadorResposta['ignorados'];
  /** tijolo + papel no mesmo conjunto (pelo perfil de critérios) */
  misto: boolean;
  ativos: AtivoComparadorV2[];
  criterios: CriteriosComparador;
  grupos: GrupoComparadorV2[];
  graficos: GraficosComparador | null;
  leitura: LeituraDosDados;
  versao: string;
}

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

type CodigoLinha = Exclude<keyof typeof TEXTOS_COMPARADOR.linhas, 'semNegociacao'>;

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
  if (linha.classe === 'acao') return 'acao';
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
  const t = TL[b.codigo];
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

export function catalogoComparador(classe: ClasseQuadro): DefGrupoComparador[] {
  return classe === 'acao' ? GRUPOS_ACAO : GRUPOS_FII;
}

/** tijolo e papel no mesmo conjunto (pelo perfil de critérios). */
export function ehMisto(tipos: readonly TipoAtivoComparador[]): boolean {
  return tipos.includes('tijolo') && tipos.includes('papel');
}
