/**
 * Motor de sanidade do bloco C (fatia A) — aplicação das conferências ao Índice MF e ao semáforo.
 * Funções puras, sem I/O.
 *
 * As regras (escalaAcoes, historicoEscala, precoBase, precoEsporadico, fii, fundamentosRevisao,
 * divergenciaFonte) devolvem DETECÇÕES; aqui elas viram flags ('conf:' / 'rev:' / 'info:', formato de
 * regras/comum/conferencia.ts), passam pelo filtro de liberações da curadoria e, quando bloqueantes,
 * trocam os componentes do grupo por ausente('em_conferencia') — a MESMA forma da trava do DY
 * (plausibilidadeProventos): nota 0, Índice incompleto, motivo '<comp>:em_conferencia'.
 *
 * Regras de aplicação:
 *  - só os componentes de `componentesDoGrupo(grupo, classe)` cuja MÉTRICA (ScoringParams) depende do
 *    grupo mudam (ex.: fii_obrigacoes não toca o C_dívida do FII de papel, que é a concentração de
 *    CRI). 'zero_regra' (prejuízo, PL ≤ 0, EBITDA ≤ 0 com dívida) e 'nao_se_aplica' ficam como estão:
 *    zero é zero, e "não se aplica" redistribui o peso;
 *  - o grupo 'historico' NÃO usa este caminho: o ponto anual fora de escala sai da média de 10 anos
 *    (C_preço recalculado; < mínimo de pontos ⇒ historico_curto), regras_sanidade R2;
 *  - o grupo 'proventos' continua no caminho legado (dyIndice + PREFIXO_FLAG_EM_CONFERENCIA);
 *  - escopo empresa × ticker: `deveContaminarEmpresa` (uma PN com preço esporádico não tira o C_preço
 *    da ON de referência; acoes_escala na PN deixa a ON incompleta);
 *  - liberação (curadoria, decisão 15): a mesma (symbol, regra, chave) não marca de novo; chave nova
 *    marca.
 * Decisão 16: NÃO há conferência manual pelo curador nesta fase.
 */
import {
  componentesDoGrupo,
  formatarFlagConf,
  formatarFlagInfo,
  formatarFlagRev,
  deveContaminarEmpresa,
  flagsConf,
  type ClasseConferencia,
  type GrupoConferencia,
  type InfoConferencia,
  type RegraRevisao,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import type { ComponentesIndice } from '@/services/analiseAtivos/regras/calculo/indiceMf';
import type { ResultadoSemaforo } from '@/services/analiseAtivos/regras/calculo/semaforo';
import type { NomeComponente, ScoringParams } from '@/services/analiseAtivos/tipos';

export type CfgConferencia = ScoringParams['sanidade']['conferencia'];

/** Detecção bloqueante (vira 'conf:<grupo>:<regra>@<chave>'). */
export interface DeteccaoConf {
  tipo: 'conf';
  grupo: GrupoConferencia;
  regra: string;
  chave: string;
  /** número que disparou a regra (só para relatório/“Por quê?”) */
  valor?: number;
}

/** Detecção só de revisão (vira 'rev:<regra>@<chave>'; nada muda na tela nem no Índice). */
export interface DeteccaoRev {
  tipo: 'rev';
  regra: RegraRevisao;
  chave: string;
  valor?: number;
}

/** Selo informativo (vira 'info:<codigo>'). */
export interface DeteccaoInfo {
  tipo: 'info';
  codigo: InfoConferencia;
}

export type Deteccao = DeteccaoConf | DeteccaoRev | DeteccaoInfo;

/** Chave de liberação 'SYMBOL|regra|chave' (mesma de repositorio/curadoria.chaveLiberacao). */
export function chaveLiberacaoDe(symbol: string, regra: string, chave: string): string {
  return `${symbol.trim().toUpperCase()}|${regra}|${chave}`;
}

/** Detecção liberada pela curadoria (dado confirmado + "liberar o valor") para esta chave. */
export function deteccaoLiberada(
  symbol: string,
  d: Deteccao,
  liberacoes: ReadonlySet<string> | undefined,
): boolean {
  if (!liberacoes || liberacoes.size === 0 || d.tipo === 'info') return false;
  return liberacoes.has(chaveLiberacaoDe(symbol, d.regra, d.chave));
}

/** Flag da detecção (formato do contrato). */
export function flagDaDeteccao(d: Deteccao): string {
  if (d.tipo === 'conf')
    return formatarFlagConf({ grupo: d.grupo, regra: d.regra, chave: d.chave });
  if (d.tipo === 'rev') return formatarFlagRev({ regra: d.regra, chave: d.chave });
  return formatarFlagInfo(d.codigo);
}

/**
 * Flags das detecções de um símbolo, sem as liberadas e sem repetição. Um 'info:' some quando o mesmo
 * símbolo tem 'conf:' de preco_esporadico (o selo bloqueante já diz mais).
 */
export function flagsDasDeteccoes(
  symbol: string,
  deteccoes: readonly (Deteccao | null | undefined)[],
  liberacoes?: ReadonlySet<string>,
): string[] {
  const vivas = deteccoes.filter(
    (d): d is Deteccao => !!d && !deteccaoLiberada(symbol, d, liberacoes),
  );
  const temEsporadico = vivas.some((d) => d.tipo === 'conf' && d.grupo === 'preco_esporadico');
  const out: string[] = [];
  for (const d of vivas) {
    if (d.tipo === 'info' && temEsporadico) continue;
    const f = flagDaDeteccao(d);
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

// ===========================================================================
// Escopo empresa × ticker
// ===========================================================================

export interface ConferenciaAplicada {
  grupo: GrupoConferencia;
  regra: string;
  chave: string;
  /** ticker que tem a flag (pode ser ≠ da referência quando o escopo é 'empresa') */
  symbol: string;
}

/**
 * Conferências que valem para o Índice da empresa calculado no ticker de referência: toda flag 'conf:'
 * de qualquer ticker cujo grupo `deveContaminarEmpresa`. Sem repetição de grupo (o primeiro ticker
 * marcado, na ordem recebida, dá a regra/chave). 'proventos' fica de fora (caminho legado).
 */
export function conferenciasDaEmpresa(
  refSymbol: string,
  flagsPorTicker: Iterable<readonly [string, readonly string[]]>,
): ConferenciaAplicada[] {
  const out: ConferenciaAplicada[] = [];
  const vistos = new Set<GrupoConferencia>();
  // a referência primeiro: a regra/chave mostrada é a do próprio ticker quando ele está marcado
  const lista = [...flagsPorTicker].sort(
    (a, b) => Number(b[0] === refSymbol) - Number(a[0] === refSymbol),
  );
  for (const [symbol, flags] of lista) {
    for (const f of flagsConf(flags)) {
      if (f.grupo === 'proventos' || f.grupo === 'historico' || vistos.has(f.grupo)) continue;
      if (!deveContaminarEmpresa(f.grupo, symbol, refSymbol)) continue;
      vistos.add(f.grupo);
      out.push({ grupo: f.grupo, regra: f.regra, chave: f.chave, symbol });
    }
  }
  return out;
}

// ===========================================================================
// Índice e semáforo
// ===========================================================================

/**
 * Métricas (nomes de ScoringParams: componentes e semáforo) que dependem do dado de cada grupo. O
 * componente/critério só entra em conferência se a SUA métrica está aqui.
 */
export const METRICAS_DO_GRUPO: Record<GrupoConferencia, readonly string[]> = {
  proventos: ['dy12mPct'],
  acoes_escala: ['plVsMedia10aPct', 'pvp', 'distanciaPvp1'],
  preco_base: ['dy12mPct', 'plVsMedia10aPct', 'pvp', 'distanciaPvp1'],
  preco_esporadico: ['dy12mPct', 'plVsMedia10aPct', 'pvp', 'distanciaPvp1'],
  fundamentos_escala: ['divLiqEbitda', 'roePct', 'plVsMedia10aPct'],
  // ponto anual: sai da média (não troca o componente)
  historico: [],
  fii_vp: ['pvp', 'distanciaPvp1'],
  fii_obrigacoes: ['obrigacoesPlPct'],
};

export type MetricaPorComponente = Partial<Record<NomeComponente, string>>;

/** Componentes afetados por uma lista de grupos, com o motivo '<grupo>:<regra>' do primeiro. */
export function componentesEmConferencia(
  grupos: readonly Pick<ConferenciaAplicada, 'grupo' | 'regra'>[],
  classe: ClasseConferencia,
  metricaPorComponente: MetricaPorComponente,
): Map<NomeComponente, string> {
  const out = new Map<NomeComponente, string>();
  for (const g of grupos) {
    const metricas = METRICAS_DO_GRUPO[g.grupo];
    for (const comp of componentesDoGrupo(g.grupo, classe)) {
      const metrica = metricaPorComponente[comp];
      if (!metrica || !metricas.includes(metrica) || out.has(comp)) continue;
      out.set(comp, `${g.grupo}:${g.regra}`);
    }
  }
  return out;
}

/**
 * Troca os componentes afetados por ausente('em_conferencia') (nota 0). Calculado e ausente viram
 * conferência; zero_regra e nao_se_aplica ficam. Devolve um objeto novo.
 */
export function aplicarConferenciaComponentes(
  comps: ComponentesIndice,
  afetados: ReadonlyMap<NomeComponente, string>,
): ComponentesIndice {
  if (afetados.size === 0) return comps;
  const out = { ...comps };
  for (const comp of afetados.keys()) {
    const c = out[comp];
    if (c.estado === 'calculado' || c.estado === 'ausente') {
      out[comp] = { estado: 'ausente', nota: 0, motivo: 'em_conferencia' };
    }
  }
  return out;
}

/**
 * Critérios do semáforo cuja métrica depende de um grupo em conferência viram 'sem dado' com motivo
 * 'em_conferencia' (mesma regra do DY em conferência). 'nao_se_aplica' fica, e 'nao_atende' por regra
 * (valor null: PL ≤ 0, EBITDA ≤ 0 com dívida) também.
 */
export function aplicarConferenciaSemaforo(
  sem: ResultadoSemaforo,
  grupos: readonly Pick<ConferenciaAplicada, 'grupo'>[],
  metricaPorCriterio: ReadonlyMap<string, string>,
): ResultadoSemaforo {
  if (grupos.length === 0) return sem;
  const metricas = new Set(grupos.flatMap((g) => METRICAS_DO_GRUPO[g.grupo]));
  let mudou = false;
  const checks = sem.checks.map((c) => {
    const metrica = metricaPorCriterio.get(c.codigo);
    if (!metrica || !metricas.has(metrica)) return c;
    if (c.status === 'nao_se_aplica') return c;
    if (c.status === 'nao_atende' && c.valor === null) return c;
    if (c.status === 'sem_dado' && c.motivo === 'em_conferencia') return c;
    mudou = true;
    const novo = { ...c, status: 'sem_dado' as const, valor: null, motivo: 'em_conferencia' };
    return novo;
  });
  if (!mudou) return sem;
  return {
    checks,
    aplicaveis: checks.filter((c) => c.status !== 'nao_se_aplica').length,
    atendidos: checks.filter((c) => c.status === 'atende').length,
  };
}

// ===========================================================================
// Relatório por regra (job scores e recalcular-analise --versao-params)
// ===========================================================================

export type ClasseRegra = 'conferencia' | 'revisao' | 'info';

export interface ContagemRegra {
  /** 'conf:<grupo>:<regra>' | 'rev:<regra>' | 'info:<codigo>' */
  regra: string;
  classe: ClasseRegra;
  acao: number;
  fii: number;
  /** empresas distintas (CNPJ) entre as ações marcadas */
  empresas: number;
  amostra: string[];
}

const AMOSTRA = 10;

/** Contagem de símbolos por regra e classe de ativo, a partir das flags gravadas nas linhas. */
export function contarRegras(
  linhas: Iterable<{ symbol: string; cnpj?: string; classe: string; flags: readonly string[] }>,
): ContagemRegra[] {
  const por = new Map<string, ContagemRegra>();
  const cnpjs = new Map<string, Set<string>>();
  for (const l of linhas) {
    const classe = l.classe === 'fii' ? 'fii' : 'acao';
    const vistas = new Set<string>();
    for (const f of l.flags) {
      let regra: string | null = null;
      let tipo: ClasseRegra | null = null;
      if (f.startsWith('conf:')) {
        regra = f.split('@')[0];
        tipo = 'conferencia';
      } else if (f.startsWith('rev:')) {
        regra = f.split('@')[0];
        tipo = 'revisao';
      } else if (f.startsWith('info:')) {
        regra = f;
        tipo = 'info';
      }
      if (!regra || !tipo || vistas.has(regra)) continue;
      vistas.add(regra);
      const c = por.get(regra) ?? {
        regra,
        classe: tipo,
        acao: 0,
        fii: 0,
        empresas: 0,
        amostra: [],
      };
      c[classe]++;
      if (classe === 'acao') {
        const set = cnpjs.get(regra) ?? new Set<string>();
        set.add(l.cnpj ?? l.symbol);
        cnpjs.set(regra, set);
        c.empresas = set.size;
      }
      if (c.amostra.length < AMOSTRA) c.amostra.push(l.symbol);
      por.set(regra, c);
    }
  }
  const ordem: Record<ClasseRegra, number> = { conferencia: 0, revisao: 1, info: 2 };
  return [...por.values()].sort(
    (a, b) => ordem[a.classe] - ordem[b.classe] || a.regra.localeCompare(b.regra),
  );
}

/**
 * Regras bloqueantes acima de `pct`% do Quadro de uma classe (alerta 'aviso' do job): a regra está
 * marcando demais — recalibrar antes de seguir.
 */
export function regrasAcimaDoLimite(
  contagens: readonly ContagemRegra[],
  totais: { acao: number; fii: number },
  pct: number,
): Array<{ regra: string; classe: 'acao' | 'fii'; n: number; pct: number }> {
  const out: Array<{ regra: string; classe: 'acao' | 'fii'; n: number; pct: number }> = [];
  for (const c of contagens) {
    if (c.classe !== 'conferencia') continue;
    for (const classe of ['acao', 'fii'] as const) {
      const total = totais[classe];
      if (total <= 0) continue;
      const p = (c[classe] / total) * 100;
      if (p > pct) out.push({ regra: c.regra, classe, n: c[classe], pct: p });
    }
  }
  return out;
}
