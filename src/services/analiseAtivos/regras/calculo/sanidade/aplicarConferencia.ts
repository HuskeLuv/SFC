/**
 * Motor de sanidade do bloco C (fatia A) — das detecções às flags. Funções puras, sem I/O.
 *
 * As regras (escalaAcoes, historicoEscala, precoBase, precoEsporadico, fii, fundamentosRevisao,
 * divergenciaFonte) devolvem DETECÇÕES; aqui elas viram flags ('conf:' / 'rev:' / 'info:', formato de
 * regras/comum/conferencia.ts) gravadas em asset_multiples_current/yearly, passando pelo filtro de
 * liberações da curadoria. Quem lê as flags (Quadro, página do ativo, curadoria) decide o efeito na
 * tela ("em conferência").
 *
 * D6-a (23/10/2026): a aplicação ao Índice MF e ao semáforo (componentesEmConferencia,
 * aplicarConferenciaComponentes, aplicarConferenciaSemaforo, METRICAS_DO_GRUPO) saiu com o Índice.
 *
 * Regras:
 *  - escopo empresa × ticker: `deveContaminarEmpresa` (uma PN com preço esporádico não contamina a ON
 *    de referência; acoes_escala na PN contamina) — conferenciasDaEmpresa;
 *  - liberação (curadoria, decisão 15): a mesma (symbol, regra, chave) não marca de novo; chave nova
 *    marca.
 * Decisão 16: NÃO há conferência manual pelo curador nesta fase.
 */
import {
  formatarFlagConf,
  formatarFlagInfo,
  formatarFlagRev,
  deveContaminarEmpresa,
  flagsConf,
  type GrupoConferencia,
  type InfoConferencia,
  type RegraRevisao,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

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

/** Detecção só de revisão (vira 'rev:<regra>@<chave>'; nada muda na tela). */
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
 * Conferências que valem para a empresa vista pelo ticker de referência: toda flag 'conf:' de
 * qualquer ticker cujo grupo `deveContaminarEmpresa`. Sem repetição de grupo (o primeiro ticker
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
// Relatório por regra (job derivados e recalcular-analise --versao-params)
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
