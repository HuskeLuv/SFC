/**
 * "Em conferência" na tela (bloco C, fatia B) — ÚNICO ponto de leitura da política de exibição
 * (regras/comum/conferencia.ts) para o Quadro, a página do ativo e os blocos preguiçosos.
 *
 * Arquivo SEM import de valor do servidor (só `import type` do Prisma): o cliente usa os mesmos
 * helpers (célula do Quadro, KPIs, fundamentos, valuation, gráfico, semáforo).
 *
 * COMPATIBILIDADE: só as flags 'conf:' (gravadas pela v2 do ScoringParams) mudam a tela. O legado
 * de proventos (origem 'legado') continua no caminho de hoje (valor + selo 'proventos em
 * conferência'), e por isso `conferenciaConf` descarta a origem 'legado'.
 *
 * Política:
 *  - exibicao 'ocultar' → Estado ausente {motivo 'em_conferencia:<grupo>', exibicao 'ocultar'} (sem
 *    valor; na PÁGINA o número calculado vai em `valorNaoPublicado`, só para o "Por quê?"; o Quadro
 *    nunca envia) — "—" + chip, e "—" vai para o fim da ordenação (consultaQuadro: ausente = null);
 *  - exibicao 'selo' → o Estado continua 'ok' (valor visível) e a tela põe o chip.
 */
import type { PrismaClient } from '@prisma/client';
import {
  DEF_GRUPO,
  GRUPOS_CONFERENCIA,
  campoEmConferencia,
  camposDoGrupo,
  componentesDoGrupo,
  ehGrupoConferencia,
  flagsConf,
  type CampoConferencia,
  type CampoTela,
  type ClasseConferencia,
  type ExibicaoConferencia,
  type FlagConf,
  type GrupoConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type {
  ClasseQuadro,
  ConferenciaTela,
  Estado,
  LinhaQuadroApi,
} from '@/types/analiseAtivosApi';

export const PREFIXO_MOTIVO_CONFERENCIA = 'em_conferencia:';

const TC = TEXTOS_TELA.conferencia;

/** Motivo do Estado oculto: 'em_conferencia:<grupo>'. */
export function motivoConferencia(grupo: GrupoConferencia): string {
  return `${PREFIXO_MOTIVO_CONFERENCIA}${grupo}`;
}

/** Grupo de um Estado oculto por conferência; null para qualquer outro Estado. */
export function grupoDoEstado(e: Estado<number> | null | undefined): GrupoConferencia | null {
  if (!e || e.estado !== 'ausente' || !e.motivo.startsWith(PREFIXO_MOTIVO_CONFERENCIA)) return null;
  const g = e.motivo.slice(PREFIXO_MOTIVO_CONFERENCIA.length);
  return ehGrupoConferencia(g) ? g : null;
}

export function ehEstadoEmConferencia(e: Estado<number> | null | undefined): boolean {
  return grupoDoEstado(e) !== null;
}

/** Estado oculto ('—' + chip). `valorNaoPublicado` só na página (nunca no Quadro). */
export function estadoOcultoConferencia(
  grupo: GrupoConferencia,
  valorNaoPublicado?: number | null,
): Estado<number> {
  const e: Estado<number> = {
    estado: 'ausente',
    motivo: motivoConferencia(grupo),
    texto: TC.motivosPorGrupo[grupo],
    exibicao: 'ocultar',
  };
  if (typeof valorNaoPublicado === 'number' && Number.isFinite(valorNaoPublicado)) {
    e.valorNaoPublicado = valorNaoPublicado;
  }
  return e;
}

/** Só a conferência das flags 'conf:' (o legado de proventos fica no caminho de hoje). */
export function conferenciaConf(
  flags: readonly string[],
  motivos: readonly string[],
  campo: CampoTela,
  classe: ClasseConferencia,
): CampoConferencia | null {
  const c = campoEmConferencia(flags, motivos, campo, classe);
  return c && c.origem === 'conf' ? c : null;
}

export interface AplicacaoConferencia {
  estado: Estado<number>;
  conf: CampoConferencia | null;
}

/**
 * Aplica a política de UM campo a um Estado já calculado. 'nao_se_aplica' nunca muda (o campo não
 * existe para o ativo). `pagina` = guarda o número calculado em valorNaoPublicado.
 */
export function aplicarConferenciaCampo(
  estado: Estado<number>,
  flags: readonly string[],
  motivos: readonly string[],
  campo: CampoTela,
  classe: ClasseConferencia,
  opts: { pagina?: boolean } = {},
): AplicacaoConferencia {
  if (estado.estado === 'nao_se_aplica') return { estado, conf: null };
  const conf = conferenciaConf(flags, motivos, campo, classe);
  if (!conf) return { estado, conf: null };
  if (conf.exibicao === 'ocultar') {
    const bruto = opts.pagina && estado.estado === 'ok' ? estado.valor : undefined;
    return { estado: estadoOcultoConferencia(conf.grupo, bruto), conf };
  }
  return { estado, conf };
}

/** Motivos do Índice da linha da API (o legado de proventos usa 'div:em_conferencia'). */
function motivosDaLinha(l: Pick<LinhaQuadroApi, 'indice'>): string[] {
  return l.indice.motivos.map((m) => m.codigo);
}

/** Campo em conferência (origem 'conf') de uma linha do Quadro já convertida (front e back). */
export function conferenciaDaLinha(
  l: Pick<LinhaQuadroApi, 'flags' | 'classe' | 'indice'>,
  campo: CampoTela,
): CampoConferencia | null {
  return conferenciaConf(l.flags, motivosDaLinha(l), campo, l.classe as ClasseConferencia);
}

// ---------------------------------------------------------------------------
// Página: ConferenciaTela[] (o "Por quê?")
// ---------------------------------------------------------------------------

const RE_ANO = /^\d{4}$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;

/** Ano da chave da flag ('2022', '2022-12-31', '2022-12'); null se não for data/ano. */
export function anoDaChave(chave: string | null | undefined): number | null {
  if (!chave) return null;
  if (RE_ANO.test(chave) || RE_DATA.test(chave) || RE_MES.test(chave)) {
    return Number(chave.slice(0, 4));
  }
  return null;
}

/** Anos (ponto anual) em conferência pelo grupo, lidos das flags (linha + linhas anuais). */
export function anosEmConferencia(
  flags: readonly string[],
  grupo: GrupoConferencia = 'historico',
): Set<number> {
  const out = new Set<number>();
  for (const f of flagsConf(flags)) {
    if (f.grupo !== grupo) continue;
    const ano = anoDaChave(f.chave);
    if (ano !== null) out.add(ano);
  }
  return out;
}

/** Flags 'conf:' de várias linhas anuais (AssetMultiplesYearly.flags) com o ano na chave. */
export function flagsAnuaisConf(
  anuais: ReadonlyArray<{ anoFiscal: number; flags?: readonly string[] | null }>,
): string[] {
  const out: string[] = [];
  for (const a of anuais) {
    for (const f of flagsConf(a.flags ?? [])) {
      // a flag anual do histórico carrega o ano na chave; se não carregar, vale o ano da linha
      const chave = anoDaChave(f.chave) !== null ? f.chave : String(a.anoFiscal);
      out.push(`conf:${f.grupo}:${f.regra}@${chave}`);
    }
  }
  return out;
}

export interface CasoAbertoTela {
  grupo: string;
  status: 'aberto' | 'em_analise';
  atualizadoEm: string;
}

/**
 * Casos de curadoria ABERTOS do symbol (SOMENTE LEITURA; nada do autor). Falha (tabela ainda sem
 * migration, banco fora) = [] — a tela nunca quebra por causa da curadoria.
 */
export async function lerCasosAbertos(
  prisma: PrismaClient,
  symbol: string,
): Promise<CasoAbertoTela[]> {
  try {
    const casos = await prisma.analiseCasoDado.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        status: { in: ['aberto', 'em_analise'] },
        grupo: { in: [...GRUPOS_CONFERENCIA] },
      },
      select: { grupo: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return casos.map((c) => ({
      grupo: c.grupo,
      status: c.status === 'em_analise' ? 'em_analise' : 'aberto',
      atualizadoEm: c.updatedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

function exibicaoDoGrupo(grupo: GrupoConferencia): ExibicaoConferencia {
  return Object.values(DEF_GRUPO[grupo].campos).includes('ocultar') ? 'ocultar' : 'selo';
}

/** 'O Índice MF fica incompleto: preço e proventos fora da conta.'; null = só exibição. */
export function efeitoIndiceDoGrupo(
  grupo: GrupoConferencia,
  classe: ClasseConferencia,
  regua?: string | null,
): string | null {
  // histórico: o motor recalcula a média de 10 anos SEM o ponto (o Índice não fica incompleto)
  if (grupo === 'historico') return null;
  const comps = componentesDoGrupo(grupo, classe);
  if (comps.length === 0) return null;
  const chaveRegua = regua === 'fii_papel' ? 'fii_papel' : classe === 'fii' ? 'fii_tijolo' : 'acao';
  const rotulos: Record<string, string> = TEXTOS_TELA.ativo.rotulosComponentes[chaveRegua];
  const nomes = comps.map((c) => (rotulos[c] ?? c).toLowerCase());
  const valor = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0];
  return formatarTexto(TC.porQue.efeitoIndice, { valor });
}

function textoMotivoConf(f: FlagConf): string {
  return TC.motivos[`${f.grupo}:${f.regra}`] ?? TC.motivosPorGrupo[f.grupo];
}

function desdeDaChave(grupo: GrupoConferencia, chave: string): string | null {
  if (grupo === 'historico') {
    // o ponto do histórico é o exercício: a data de referência é o fim do ano fiscal marcado
    const ano = anoDaChave(chave);
    return ano === null ? null : `${ano}-12-31`;
  }
  if (RE_DATA.test(chave)) return chave;
  if (RE_MES.test(chave)) return `${chave}-01`;
  if (RE_ANO.test(chave)) return `${chave}-12-31`;
  return null;
}

export interface EntradaConferenciasTela {
  /** flags da linha do Quadro (+ flagsAnuaisConf das linhas anuais, quando lidas) */
  flags: readonly string[];
  classe: ClasseQuadro;
  regua?: string | null;
  casos?: readonly CasoAbertoTela[];
}

/**
 * ConferenciaTela[] da página: uma por grupo 'conf:' (o histórico, uma por ANO marcado), na ordem
 * de GRUPOS_CONFERENCIA. Sem flag 'conf:' ⇒ [] (v1: página idêntica).
 */
export function montarConferenciasTela(e: EntradaConferenciasTela): ConferenciaTela[] {
  const classe = e.classe as ClasseConferencia;
  const todas = flagsConf(e.flags).filter((f) => DEF_GRUPO[f.grupo].classes.includes(classe));
  const out: ConferenciaTela[] = [];
  const vistos = new Set<string>();
  for (const grupo of GRUPOS_CONFERENCIA) {
    const doGrupo = todas.filter((f) => f.grupo === grupo);
    if (doGrupo.length === 0) continue;
    const caso = e.casos?.find((c) => c.grupo === grupo) ?? null;
    // histórico: uma entrada por ano; os demais grupos: uma entrada (a 1ª detecção)
    const lista = grupo === 'historico' ? doGrupo : [doGrupo[0]];
    for (const f of lista) {
      const desde = desdeDaChave(grupo, f.chave);
      const chaveUnica = `${grupo}|${grupo === 'historico' ? desde : ''}`;
      if (vistos.has(chaveUnica)) continue;
      vistos.add(chaveUnica);
      out.push({
        grupo,
        campos: camposDoGrupo(grupo),
        exibicao: exibicaoDoGrupo(grupo),
        motivo: textoMotivoConf(f),
        desde,
        efeitoIndice: efeitoIndiceDoGrupo(grupo, classe, e.regua),
        origem: 'regra',
        caso: caso ? { status: caso.status, atualizadoEm: caso.atualizadoEm } : null,
      });
    }
  }
  return out;
}

/**
 * Conferência da página que marca o campo (a mais severa: 'ocultar' antes de 'selo'). `ano` filtra
 * o histórico pelo exercício.
 */
export function conferenciaDoCampo(
  conferencias: readonly ConferenciaTela[] | null | undefined,
  campo: CampoTela | string,
  ano?: number | null,
): ConferenciaTela | null {
  if (!conferencias?.length) return null;
  let melhor: ConferenciaTela | null = null;
  for (const c of conferencias) {
    if (!c.campos.includes(campo)) continue;
    if (c.grupo === 'historico' && ano != null && anoDaConferencia(c) !== ano) continue;
    const exib = ehGrupoConferencia(c.grupo)
      ? (DEF_GRUPO[c.grupo].campos[campo as CampoTela] ?? c.exibicao)
      : c.exibicao;
    if (!melhor || (exib === 'ocultar' && melhor.exibicao !== 'ocultar')) {
      melhor = { ...c, exibicao: exib };
    }
  }
  return melhor;
}

/** Ano do ponto anual de uma conferência do histórico (desde = fim do exercício). */
export function anoDaConferencia(c: Pick<ConferenciaTela, 'grupo' | 'desde'>): number | null {
  return c.desde ? Number(c.desde.slice(0, 4)) : null;
}

/** Componentes do Índice (nomes) em conferência pelas conferências da página. */
export function componentesEmConferencia(
  conferencias: readonly ConferenciaTela[] | null | undefined,
  classe: ClasseQuadro,
): Set<string> {
  const out = new Set<string>();
  for (const c of conferencias ?? []) {
    if (!ehGrupoConferencia(c.grupo) || c.grupo === 'historico') continue;
    for (const comp of componentesDoGrupo(c.grupo, classe as ClasseConferencia)) out.add(comp);
  }
  return out;
}

/** Critérios do semáforo que viram 'Sem dado' (DEF_GRUPO[g].criteriosSemaforo). */
export function criteriosEmConferencia(grupos: readonly string[]): Map<string, GrupoConferencia> {
  const out = new Map<string, GrupoConferencia>();
  for (const g of grupos) {
    // histórico: só o ponto anual sai da média (o critério continua calculado pelo motor)
    if (!ehGrupoConferencia(g) || g === 'historico') continue;
    for (const c of DEF_GRUPO[g].criteriosSemaforo) if (!out.has(c)) out.set(c, g);
  }
  return out;
}

/** Grupos (distintos) das conferências da página. */
export function gruposDasConferencias(
  conferencias: readonly ConferenciaTela[] | null | undefined,
): GrupoConferencia[] {
  const set = new Set((conferencias ?? []).map((c) => c.grupo));
  return GRUPOS_CONFERENCIA.filter((g) => set.has(g));
}

// ---------------------------------------------------------------------------
// Colunas das tabelas da análise → campos de tela (fundamentos e valuation)
// ---------------------------------------------------------------------------

/** Fundamentos · Essencial: coluna → campo de tela (linha 'Últ. 12m' e anos). */
export const CAMPO_COLUNA_FUNDAMENTOS: Record<ClasseQuadro, Readonly<Record<string, CampoTela>>> = {
  acao: {
    receita: 'receita',
    lucro: 'lucroLiquido',
    margem: 'margemLiquida',
    roe: 'roe',
    lpa: 'lpa',
    dpa: 'dpa12m',
    payout: 'payout',
    pl: 'pl',
    pvp: 'pvp',
    dy: 'dy12m',
  },
  fii: {
    rendCota: 'rendCota12m',
    dy: 'dy12m',
    vpCota: 'vpCota',
    pvp: 'pvp',
    vacancia: 'vacanciaCvm',
  },
};

/** Ponto anual do histórico de múltiplos: coluna/código → campo do grupo 'historico'. */
export const CAMPO_HISTORICO: Readonly<Record<string, CampoTela>> = {
  pl: 'historicoPl',
  pvp: 'historicoPvp',
  pReceita: 'historicoPReceita',
};

/** Flags 'conf:' de um ANO (chave com o ano) dos grupos de ponto anual. */
export function flagsConfDoAno(
  flags: readonly string[],
  ano: number,
  grupos: readonly GrupoConferencia[] = ['historico', 'fundamentos_escala'],
): string[] {
  return flagsConf(flags)
    .filter((f) => grupos.includes(f.grupo) && anoDaChave(f.chave) === ano)
    .map((f) => `conf:${f.grupo}:${f.regra}@${f.chave}`);
}

/**
 * Aplica a política a um mapa de valores (linha de tabela). Devolve os valores e se algum campo
 * ficou com 'selo' (valor visível + chip).
 */
export function aplicarConferenciaValores(
  valores: Readonly<Record<string, Estado<number>>>,
  mapa: Readonly<Record<string, CampoTela>>,
  flags: readonly string[],
  motivos: readonly string[],
  classe: ClasseConferencia,
): { valores: Record<string, Estado<number>>; selo: boolean; algum: boolean } {
  const out: Record<string, Estado<number>> = { ...valores };
  let selo = false;
  let algum = false;
  for (const [coluna, campo] of Object.entries(mapa)) {
    const v = out[coluna];
    if (!v) continue;
    const r = aplicarConferenciaCampo(v, flags, motivos, campo, classe, { pagina: true });
    if (!r.conf) continue;
    algum = true;
    out[coluna] = r.estado;
    if (r.conf.exibicao === 'selo') selo = true;
  }
  return { valores: out, selo, algum };
}
