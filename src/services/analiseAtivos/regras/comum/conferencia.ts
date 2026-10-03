/**
 * CONTRATO DE CONFERÊNCIA — bloco C da Análise de Ativos (fatia 0). Funções puras, sem I/O.
 *
 * Generaliza a trava de proventos (regras/calculo/plausibilidadeProventos.ts) para GRUPOS de
 * indicadores. Fonte: docs/analise-ativos/blocoC/spec-desenho.json (fatia 0, item 3) +
 * decisoes.md (prevalece: sem conferência manual pelo curador nesta fase — decisão 16 —, lucro com
 * salto e "variação > 40%"/"provedor × CVM" só como caso de revisão — decisões 1 e 2).
 *
 * Quem usa (sem arquivo em comum entre as fatias; todas leem daqui):
 *  - A (motor): grava as flags `conf:` / `rev:` / `info:` com `formatarFlagConf`/`formatarFlagRev`
 *    nas linhas (AssetMultiplesCurrent.flags, AssetMultiplesYearly.flags) e troca as métricas de
 *    `componentesDoGrupo(grupo, classe)` por ausente('em_conferencia', '<grupo>:<regra>'), motivo
 *    `motivoIndiceConferencia(comp)` = '<comp>:em_conferencia'. Contaminação entre tickers da mesma
 *    empresa SÓ quando `deveContaminarEmpresa` diz (escopo 'empresa' × 'ticker').
 *  - B (tela): `campoEmConferencia(flags, motivos, campo, classe)` decide, por campo, o estado e a
 *    política de exibição ('ocultar' = '—' + chip, número só no "Por quê?"; 'selo' = valor + chip).
 *  - C (curadoria): `CAMPO_PRINCIPAL[grupo]` e `REGRAS_REVISAO[regra].campo` chaveiam os casos de
 *    regra (`chaveCaso` em curadoria/contrato.ts com periodo = chave da detecção).
 *  - D (relato): `campoPertenceAoGrupo` (curadoria/contrato.ts) usa `DEF_GRUPO[grupo].campos`.
 *
 * COMPATIBILIDADE (obrigatória): a v1 do ScoringParams NUNCA grava 'conf:' (só a v2, com
 * sanidade.conferencia.ligada=true). O legado de proventos ('proventos_em_conferencia_*',
 * 'provento_suspeito', 'proventos_defasados*', motivos 'div:em_conferencia'/'div:fonte_defasada')
 * continua no caminho de hoje (valor visível + selo). Por isso há DUAS leituras separadas:
 * `gruposConf` (só 'conf:') e `gruposLegados` (só o legado) — a leitura nova não muda o legado.
 *
 * Formato das flags (a chave nunca leva ':' nem '@' nem espaço):
 *   conf:<grupo>:<regra>@<chave>   bloqueante (grupo em conferência; efeito no Índice se o grupo tem
 *                                  componente para a classe)
 *   rev:<regra>@<chave>            só abre caso de revisão (nada muda na tela nem no Índice)
 *   info:<codigo>                  só selo informativo (ex.: 'info:cotacao_esporadica')
 */
import {
  ehFlagProventosEmConferencia,
  MOTIVO_INDICE_EM_CONFERENCIA,
  PREFIXO_FLAG_EM_CONFERENCIA,
  proventosEmConferencia,
} from '@/services/analiseAtivos/regras/calculo/plausibilidadeProventos';
import type { NomeComponente } from '@/services/analiseAtivos/tipos';

// Legado de proventos reexportado SEM renomear (fatia A: plausibilidadeProventos continua dona).
export {
  ehFlagProventosEmConferencia,
  MOTIVO_INDICE_EM_CONFERENCIA,
  PREFIXO_FLAG_EM_CONFERENCIA,
  proventosEmConferencia,
};

// ===========================================================================
// Campos de tela
// ===========================================================================

/**
 * Códigos dos dados exibidos (Quadro, KPIs, fundamentos, valuation, gráficos, dividendos). Os nomes
 * seguem os códigos que a tela já usa (LinhaQuadroApi, KpiAtivo.codigo, ItemValuation.codigo) quando
 * existem. 'historico*' = ponto anual da série de múltiplos (barra e média de 10 anos).
 */
export const CAMPOS_TELA = [
  // cotação e tamanho
  'preco',
  'valorMercado',
  'nAcoes',
  'liquidez21',
  // múltiplos
  'pl',
  'pvp',
  'evEbitda',
  'pReceita',
  'pFco',
  'pFcl',
  'lpa',
  'vpa',
  // proventos
  'dy12m',
  'dyMedio5a',
  'dpa12m',
  'payout',
  'proventosAno',
  'rendCota12m',
  // rentabilidade, dívida e demonstrações
  'roe',
  'margemLiquida',
  'divLiqEbitda',
  'divLiqPl',
  'receita',
  'lucroLiquido',
  'patrimonioLiquido',
  'ativoTotal',
  'anosLucroConsecutivos',
  // série anual de múltiplos (ponto do ano)
  'historicoPl',
  'historicoPvp',
  'historicoPReceita',
  'historicoDy',
  // FII
  'vpCota',
  'obrigacoesPl',
  'vacanciaCvm',
  'cotistas',
  'patrimonio',
  'nImoveisCvm',
  'nCri',
  'mesesComRendimento',
  'taxaAdm',
  // blocos agregados
  'indiceMf',
  'criterioSemaforo',
  'dataEvento',
] as const;

export type CampoTela = (typeof CAMPOS_TELA)[number];

export function ehCampoTela(s: string): s is CampoTela {
  return (CAMPOS_TELA as readonly string[]).includes(s);
}

// ===========================================================================
// Grupos
// ===========================================================================

/**
 * Grupos de conferência. SEM 'manual' (decisão 16: o curador não põe dado em conferência à mão nesta
 * fase; a vacância do HGLG11 é nota fixa "a tela segue a CVM" + caso de revisão).
 */
export const GRUPOS_CONFERENCIA = [
  'proventos',
  'acoes_escala',
  'preco_base',
  'preco_esporadico',
  'fundamentos_escala',
  'historico',
  'fii_vp',
  'fii_obrigacoes',
] as const;

export type GrupoConferencia = (typeof GRUPOS_CONFERENCIA)[number];

export function ehGrupoConferencia(s: string): s is GrupoConferencia {
  return (GRUPOS_CONFERENCIA as readonly string[]).includes(s);
}

/** 'empresa' contamina todos os tickers do emissor; 'ticker' só o próprio ticker. */
export type EscopoConferencia = 'empresa' | 'ticker';

/** 'ocultar' = '—' + chip (número só no "Por quê?"); 'selo' = valor visível + chip. */
export type ExibicaoConferencia = 'ocultar' | 'selo';

export type ClasseConferencia = 'acao' | 'fii';

export interface DefGrupo {
  escopo: EscopoConferencia;
  /** classes em que o grupo pode disparar */
  classes: readonly ClasseConferencia[];
  /** componentes do Índice MF que viram ausente('em_conferencia') */
  componentes: Partial<Record<ClasseConferencia, readonly NomeComponente[]>>;
  /** campos de tela afetados e a política de exibição de cada um */
  campos: Partial<Record<CampoTela, ExibicaoConferencia>>;
  /** critérios do semáforo que viram 'sem dado' (códigos de ScoringParams.*.semaforo) */
  criteriosSemaforo: readonly string[];
  /** campo que chaveia o caso de regra na curadoria (ativo × dado) */
  campoPrincipal: CampoTela;
  /** códigos de regra que o motor (fatia A) pode gravar neste grupo */
  regras: readonly string[];
}

const OCULTAR: ExibicaoConferencia = 'ocultar';
const SELO: ExibicaoConferencia = 'selo';

/**
 * Tabela central (spec fatia 0 item 3 + regras_sanidade). Valores aprovados:
 * - proventos: empresa · div · DY/payout/rendimento com selo (o comportamento de hoje).
 * - acoes_escala: empresa · acao[preco] · TODOS os campos que dependem do nº de ações = ocultar
 *   (inclusive o próprio nº de ações, EV/EBITDA e P/Receita — caso CBAV3).
 * - preco_base: ticker · [div, preco] · múltiplos que usam a cotação = ocultar; a cotação negociada
 *   continua visível com selo (é o preço real da B3).
 * - preco_esporadico: ticker · [div, preco] · cotação, P/VP e DY com selo.
 * - fundamentos_escala: empresa · acao[divida, rent, preco] · demonstrações e derivados = ocultar.
 * - historico: empresa · acao[preco] (média de 10 anos) · o ponto anual = ocultar (sai da média e
 *   da barra; a chave da flag é o ano).
 * - fii_vp: ticker (o FII é o próprio ticker) · fii[preco] · VP/cota e P/VP = ocultar.
 * - fii_obrigacoes: ticker · fii[divida] · Obrigações/PL com selo.
 */
export const DEF_GRUPO: Record<GrupoConferencia, DefGrupo> = {
  proventos: {
    escopo: 'empresa',
    classes: ['acao', 'fii'],
    componentes: { acao: ['div'], fii: ['div'] },
    campos: {
      dy12m: SELO,
      payout: SELO,
      rendCota12m: SELO,
      dpa12m: SELO,
      dyMedio5a: SELO,
      proventosAno: SELO,
      historicoDy: SELO,
    },
    criteriosSemaforo: ['dividendos', 'renda_recorrente'],
    campoPrincipal: 'dy12m',
    regras: ['dy_acima_teto', 'salto_recente'],
  },
  acoes_escala: {
    escopo: 'empresa',
    classes: ['acao'],
    componentes: { acao: ['preco'] },
    campos: {
      pl: OCULTAR,
      pvp: OCULTAR,
      valorMercado: OCULTAR,
      evEbitda: OCULTAR,
      pReceita: OCULTAR,
      pFco: OCULTAR,
      pFcl: OCULTAR,
      lpa: OCULTAR,
      vpa: OCULTAR,
      nAcoes: OCULTAR,
    },
    criteriosSemaforo: ['preco_historico'],
    campoPrincipal: 'nAcoes',
    regras: ['pvp_minimo', 'pl_minimo', 'vm_razao'],
  },
  preco_base: {
    escopo: 'ticker',
    classes: ['acao', 'fii'],
    componentes: { acao: ['div', 'preco'], fii: ['div', 'preco'] },
    campos: {
      preco: SELO,
      dy12m: OCULTAR,
      pl: OCULTAR,
      pvp: OCULTAR,
      evEbitda: OCULTAR,
      valorMercado: OCULTAR,
    },
    criteriosSemaforo: ['dividendos', 'renda_recorrente', 'preco_historico', 'preco_vp'],
    campoPrincipal: 'preco',
    regras: ['base_sem_evento'],
  },
  preco_esporadico: {
    escopo: 'ticker',
    classes: ['acao', 'fii'],
    componentes: { acao: ['div', 'preco'], fii: ['div', 'preco'] },
    campos: { preco: SELO, pvp: SELO, dy12m: SELO },
    criteriosSemaforo: ['dividendos', 'renda_recorrente', 'preco_historico', 'preco_vp'],
    campoPrincipal: 'preco',
    regras: ['faixa_pvp', 'desvio_mediana'],
  },
  fundamentos_escala: {
    escopo: 'empresa',
    classes: ['acao'],
    componentes: { acao: ['divida', 'rent', 'preco'] },
    campos: {
      receita: OCULTAR,
      lucroLiquido: OCULTAR,
      patrimonioLiquido: OCULTAR,
      ativoTotal: OCULTAR,
      roe: OCULTAR,
      margemLiquida: OCULTAR,
      divLiqEbitda: OCULTAR,
      divLiqPl: OCULTAR,
      pl: OCULTAR,
      pvp: OCULTAR,
      pReceita: OCULTAR,
      evEbitda: OCULTAR,
      lpa: OCULTAR,
      vpa: OCULTAR,
    },
    criteriosSemaforo: ['endividamento', 'rentabilidade', 'preco_historico'],
    campoPrincipal: 'receita',
    regras: ['salto_escala'],
  },
  historico: {
    escopo: 'empresa',
    classes: ['acao'],
    componentes: { acao: ['preco'] },
    campos: { historicoPl: OCULTAR, historicoPvp: OCULTAR, historicoPReceita: OCULTAR },
    criteriosSemaforo: ['preco_historico'],
    campoPrincipal: 'historicoPl',
    regras: ['escala_ano'],
  },
  fii_vp: {
    escopo: 'ticker',
    classes: ['fii'],
    componentes: { fii: ['preco'] },
    campos: { vpCota: OCULTAR, pvp: OCULTAR },
    criteriosSemaforo: ['preco_vp'],
    campoPrincipal: 'vpCota',
    regras: ['vp_salto'],
  },
  fii_obrigacoes: {
    escopo: 'ticker',
    classes: ['fii'],
    componentes: { fii: ['divida'] },
    campos: { obrigacoesPl: SELO },
    criteriosSemaforo: ['obrigacoes_pl'],
    campoPrincipal: 'obrigacoesPl',
    regras: ['obrigacoes_acima'],
  },
};

/** Grupos de prioridade de exibição: 'ocultar' vence 'selo' quando dois grupos marcam o campo. */
const PESO_EXIBICAO: Record<ExibicaoConferencia, number> = { ocultar: 2, selo: 1 };

/** Componentes do Índice afetados pelo grupo na classe ([] = só exibição). */
export function componentesDoGrupo(
  grupo: GrupoConferencia,
  classe: ClasseConferencia,
): readonly NomeComponente[] {
  return DEF_GRUPO[grupo].componentes[classe] ?? [];
}

/** Motivo do Índice para um componente em conferência ('preco:em_conferencia'). */
export function motivoIndiceConferencia(componente: NomeComponente): string {
  return `${componente}:em_conferencia`;
}

/** Detalhe do ausente('em_conferencia', detalhe) gravado pelo motor: '<grupo>:<regra>'. */
export function detalheConferencia(grupo: GrupoConferencia, regra: string): string {
  return `${grupo}:${regra}`;
}

/**
 * Contaminação entre tickers da mesma empresa: grupo de escopo 'empresa' sempre contamina a
 * referência; grupo de escopo 'ticker' só quando o ticker marcado É a referência (uma PN ilíquida com
 * preço esporádico não tira o C_preço da ON).
 */
export function deveContaminarEmpresa(
  grupo: GrupoConferencia,
  symbolMarcado: string,
  tickerReferencia: string,
): boolean {
  if (DEF_GRUPO[grupo].escopo === 'empresa') return true;
  return symbolMarcado.trim().toUpperCase() === tickerReferencia.trim().toUpperCase();
}

// ===========================================================================
// Regras de revisão (rev:) e informativas (info:)
// ===========================================================================

/**
 * Regras que SÓ abrem caso de revisão (sem efeito na tela nem no Índice), com o campo que chaveia o
 * caso. Decisões 1 e 2: "variação > 40%", "provedor × CVM" e lucro com salto ficam aqui.
 */
export const REGRAS_REVISAO = {
  variacao_nivel: { campo: 'receita' },
  variacao_lucro: { campo: 'lucroLiquido' },
  fii_cotistas: { campo: 'cotistas' },
  fii_pl: { campo: 'patrimonio' },
  dpa_dmpl: { campo: 'dpa12m' },
  rend_fii_cvm: { campo: 'rendCota12m' },
  preco_brapi: { campo: 'preco' },
} as const satisfies Record<string, { campo: CampoTela }>;

export type RegraRevisao = keyof typeof REGRAS_REVISAO;

export function ehRegraRevisao(s: string): s is RegraRevisao {
  return Object.prototype.hasOwnProperty.call(REGRAS_REVISAO, s);
}

/** Códigos de 'info:' (só selo, sem efeito). */
export const INFOS_CONFERENCIA = ['cotacao_esporadica'] as const;
export type InfoConferencia = (typeof INFOS_CONFERENCIA)[number];
export const FLAG_INFO_COTACAO_ESPORADICA = 'info:cotacao_esporadica';

// ===========================================================================
// Flags
// ===========================================================================

export const PREFIXO_CONF = 'conf:';
export const PREFIXO_REV = 'rev:';
export const PREFIXO_INFO = 'info:';

const RE_REGRA = /^[a-z0-9_]{1,40}$/;
/** Chave determinística da detecção (data AAAA-MM-DD, ano, mês AAAA-MM...): sem ':', '@' ou espaço. */
const RE_CHAVE = /^[A-Za-z0-9._\-/]{1,40}$/;

export interface FlagConf {
  grupo: GrupoConferencia;
  regra: string;
  chave: string;
}

export interface FlagRev {
  regra: RegraRevisao;
  chave: string;
}

export function chaveValida(chave: string): boolean {
  return RE_CHAVE.test(chave);
}

/** 'conf:<grupo>:<regra>@<chave>'. Lança para grupo/regra/chave inválidos. */
export function formatarFlagConf(f: FlagConf): string {
  if (!ehGrupoConferencia(f.grupo)) throw new Error(`grupo de conferência inválido: ${f.grupo}`);
  if (!RE_REGRA.test(f.regra)) throw new Error(`regra inválida: ${f.regra}`);
  if (!chaveValida(f.chave)) throw new Error(`chave inválida (sem ':', '@' ou espaço): ${f.chave}`);
  return `${PREFIXO_CONF}${f.grupo}:${f.regra}@${f.chave}`;
}

/** Inverso de formatarFlagConf; null para qualquer flag que não seja 'conf:' válida. */
export function parseFlagConf(flag: string): FlagConf | null {
  if (!flag.startsWith(PREFIXO_CONF)) return null;
  const m = /^conf:([a-z_]+):([a-z0-9_]+)@(.+)$/.exec(flag);
  if (!m) return null;
  const [, grupo, regra, chave] = m;
  if (!ehGrupoConferencia(grupo) || !RE_REGRA.test(regra) || !chaveValida(chave)) return null;
  return { grupo, regra, chave };
}

/** 'rev:<regra>@<chave>'. Lança para regra fora de REGRAS_REVISAO ou chave inválida. */
export function formatarFlagRev(f: FlagRev): string {
  if (!ehRegraRevisao(f.regra)) throw new Error(`regra de revisão inválida: ${f.regra}`);
  if (!chaveValida(f.chave)) throw new Error(`chave inválida (sem ':', '@' ou espaço): ${f.chave}`);
  return `${PREFIXO_REV}${f.regra}@${f.chave}`;
}

export function parseFlagRev(flag: string): FlagRev | null {
  if (!flag.startsWith(PREFIXO_REV)) return null;
  const m = /^rev:([a-z0-9_]+)@(.+)$/.exec(flag);
  if (!m) return null;
  const [, regra, chave] = m;
  if (!ehRegraRevisao(regra) || !chaveValida(chave)) return null;
  return { regra, chave };
}

export function formatarFlagInfo(codigo: InfoConferencia): string {
  return `${PREFIXO_INFO}${codigo}`;
}

export function parseFlagInfo(flag: string): InfoConferencia | null {
  if (!flag.startsWith(PREFIXO_INFO)) return null;
  const codigo = flag.slice(PREFIXO_INFO.length);
  return (INFOS_CONFERENCIA as readonly string[]).includes(codigo)
    ? (codigo as InfoConferencia)
    : null;
}

/** Todas as flags 'conf:' válidas da linha (na ordem). */
export function flagsConf(flags: readonly string[]): FlagConf[] {
  const out: FlagConf[] = [];
  for (const f of flags) {
    const p = parseFlagConf(f);
    if (p) out.push(p);
  }
  return out;
}

/** Todas as flags 'rev:' válidas da linha. */
export function flagsRev(flags: readonly string[]): FlagRev[] {
  const out: FlagRev[] = [];
  for (const f of flags) {
    const p = parseFlagRev(f);
    if (p) out.push(p);
  }
  return out;
}

/** Grupos em conferência pelas flags 'conf:' (SÓ elas; sem repetição, na ordem de GRUPOS). */
export function gruposConf(flags: readonly string[]): GrupoConferencia[] {
  const presentes = new Set(flagsConf(flags).map((f) => f.grupo));
  return GRUPOS_CONFERENCIA.filter((g) => presentes.has(g));
}

/** Conferências do caminho legado (anterior ao bloco C), lidas sem tocar nas flags 'conf:'. */
export type LegadoConferencia = 'proventos' | 'cnpj';

export const FLAG_CNPJ_EM_CONFERENCIA_LEGADO = 'cnpj_em_conferencia';

/**
 * Legado: 'proventos_em_conferencia_*', 'provento_suspeito', 'proventos_defasados*' e os motivos
 * 'div:em_conferencia'/'div:fonte_defasada' → 'proventos'; 'cnpj_em_conferencia' → 'cnpj' (só
 * exibição; o caminho de hoje em linhasQuadro/valuation continua tratando).
 */
export function gruposLegados(
  flags: readonly string[],
  motivosIncompleto: readonly string[] = [],
): LegadoConferencia[] {
  const out: LegadoConferencia[] = [];
  if (proventosEmConferencia(flags, motivosIncompleto)) out.push('proventos');
  if (flags.includes(FLAG_CNPJ_EM_CONFERENCIA_LEGADO)) out.push('cnpj');
  return out;
}

/** Motivo legível do legado de proventos (para o "Por quê?"). */
function regraLegadaProventos(flags: readonly string[], motivos: readonly string[]): string {
  const f = flags.find((x) => x.startsWith(PREFIXO_FLAG_EM_CONFERENCIA));
  if (f) return f.slice(PREFIXO_FLAG_EM_CONFERENCIA.length);
  if (flags.includes('provento_suspeito')) return 'provento_suspeito';
  if (flags.some((x) => x.startsWith('proventos_defasados'))) return 'proventos_defasados';
  if (motivos.includes('div:fonte_defasada')) return 'fonte_defasada';
  return 'em_conferencia';
}

export interface CampoConferencia {
  grupo: GrupoConferencia;
  regra: string;
  /** chave da detecção; null no legado */
  chave: string | null;
  exibicao: ExibicaoConferencia;
  origem: 'conf' | 'legado';
}

/**
 * Estado de conferência de UM campo da linha, ou null.
 * 1) flags 'conf:' cujo grupo marca o campo (e vale para a classe, quando informada); se mais de um
 *    grupo marca, 'ocultar' vence 'selo' (empate: ordem de GRUPOS_CONFERENCIA);
 * 2) senão, o legado de proventos para os campos do grupo 'proventos' — sempre exibicao 'selo' e
 *    origem 'legado' (valor visível + selo, como hoje).
 */
export function campoEmConferencia(
  flags: readonly string[],
  motivosIncompleto: readonly string[],
  campo: CampoTela,
  classe?: ClasseConferencia,
): CampoConferencia | null {
  let melhor: CampoConferencia | null = null;
  const ordem = (g: GrupoConferencia) => GRUPOS_CONFERENCIA.indexOf(g);
  for (const f of flagsConf(flags)) {
    const def = DEF_GRUPO[f.grupo];
    if (classe && !def.classes.includes(classe)) continue;
    const exibicao = def.campos[campo];
    if (!exibicao) continue;
    const cand: CampoConferencia = {
      grupo: f.grupo,
      regra: f.regra,
      chave: f.chave,
      exibicao,
      origem: 'conf',
    };
    if (
      !melhor ||
      PESO_EXIBICAO[exibicao] > PESO_EXIBICAO[melhor.exibicao] ||
      (PESO_EXIBICAO[exibicao] === PESO_EXIBICAO[melhor.exibicao] &&
        ordem(f.grupo) < ordem(melhor.grupo))
    ) {
      melhor = cand;
    }
  }
  if (melhor) return melhor;
  if (DEF_GRUPO.proventos.campos[campo] && proventosEmConferencia(flags, motivosIncompleto)) {
    return {
      grupo: 'proventos',
      regra: regraLegadaProventos(flags, motivosIncompleto),
      chave: null,
      exibicao: 'selo',
      origem: 'legado',
    };
  }
  return null;
}

/** Campos de tela de um grupo (para "o que fica oculto/visível" no "Por quê?"). */
export function camposDoGrupo(grupo: GrupoConferencia): CampoTela[] {
  return Object.keys(DEF_GRUPO[grupo].campos) as CampoTela[];
}
