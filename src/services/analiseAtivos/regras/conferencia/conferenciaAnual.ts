/**
 * Conferência ANUAL compartilhada pelo Fundamentos · Essencial e pelo Raio-X (Bloco D, fatia A).
 * Puro e isomórfico (sem I/O; roda no servidor e no cliente).
 *
 * 1) conferirValoresDoAno — a `conferirLinha` do Essencial (Bloco C) extraída sem mudar nada:
 *    - ano fechado: só as flags 'conf:' do PRÓPRIO ano dos grupos de ponto anual — 'historico'
 *      sobre CAMPO_HISTORICO (P/L, P/VP e P/Receita do ano) e 'fundamentos_escala' sobre o mapa de
 *      colunas/linhas;
 *    - ano === null ('Últ. 12m'): todas as flags da linha do Quadro sobre o mapa;
 *    - as flags da linha (acoes_escala, fii_vp, fii_obrigacoes, preco_*) NUNCA entram numa coluna
 *      anual.
 *    Devolve também a conferência de cada código (grupo, política e motivo) para o chip do Raio-X.
 *
 * 2) Decisão 1 do Bloco D (vale no Raio-X E no Essencial): ano com a base por ação quebrada fica
 *    "em conferência" com política 'ocultar' nas linhas por ação (LPA, nº de ações, P/L e P/VP do ano;
 *    no FII, VP/cota, rendimento/cota e nº de cotas). Critérios:
 *    - 'salto_acoes_sem_evento' ou 'dados_incompletos' em asset_per_share_yearly.flags ou em
 *      asset_multiples_yearly.flags do ano (conferirPerShareDoAno);
 *    - SÓ AÇÕES: nº de ações do ano abaixo de 1/10 da mediana dos anos lidos (pega a CBAV3 2025, em
 *      que não houve salto em relação a 2024). Não vale para FII: emissões de cotas multiplicam o
 *      nº de cotas ao longo dos anos sem que a base esteja errada.
 *    Só células 'ok' mudam (o número calculado vai em valorNaoPublicado, para o "Por quê?"); uma
 *    célula já oculta por um grupo do Bloco C fica como está.
 */
import {
  CAMPO_HISTORICO,
  aplicarConferenciaCampo,
  flagsConfDoAno,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import type {
  CampoTela,
  ClasseConferencia,
  GrupoConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import type { ConferenciaTela, Estado, ExibicaoConferenciaTela } from '@/types/analiseAtivosApi';

/** Flags e motivos da linha do Quadro (Bloco C). Ausente = sem conferência (como hoje). */
export interface ConferenciaEntrada {
  flags: readonly string[];
  motivos: readonly string[];
}

/** Conferência aplicada a um código (coluna do Essencial ou linha do Raio-X) num ano. */
export interface ConferenciaCodigo {
  grupo: GrupoConferencia;
  exibicao: ExibicaoConferenciaTela;
  /** texto pronto (textosTela.conferencia.motivos / motivosPorGrupo) */
  motivo: string;
}

export interface ResultadoConferenciaAno {
  valores: Record<string, Estado<number>>;
  /** algum código ficou com política 'selo' (valor visível + chip) */
  selo: boolean;
  /** algum código foi afetado */
  algum: boolean;
  porCodigo: Record<string, ConferenciaCodigo>;
}

const TC = TEXTOS_TELA.conferencia;

function textoMotivo(grupo: GrupoConferencia, regra: string): string {
  return (TC.motivos as Record<string, string>)[`${grupo}:${regra}`] ?? TC.motivosPorGrupo[grupo];
}

/**
 * Aplica a conferência de um ano (ou do 'Últ. 12m', ano === null) a um mapa código → Estado.
 * `mapaCampos` = código → CampoTela (CAMPO_COLUNA_FUNDAMENTOS no Essencial, CAMPO_LINHA_RAIOX no
 * Raio-X); `mapaHistorico` = código → campo do grupo 'historico' (padrão CAMPO_HISTORICO).
 */
export function conferirValoresDoAno(
  valores: Readonly<Record<string, Estado<number>>>,
  mapaCampos: Readonly<Record<string, CampoTela | string>>,
  conf: ConferenciaEntrada | undefined,
  ano: number | null,
  classe: ClasseConferencia,
  mapaHistorico: Readonly<Record<string, CampoTela | string>> = CAMPO_HISTORICO,
): ResultadoConferenciaAno {
  const r: ResultadoConferenciaAno = {
    valores: { ...valores },
    selo: false,
    algum: false,
    porCodigo: {},
  };
  if (!conf || conf.flags.length === 0) return r;
  const aplicar = (mapa: Readonly<Record<string, string>>, flags: readonly string[]) => {
    if (flags.length === 0) return;
    for (const [codigo, campo] of Object.entries(mapa)) {
      const v = r.valores[codigo];
      if (!v) continue;
      const a = aplicarConferenciaCampo(v, flags, conf.motivos, campo as CampoTela, classe, {
        pagina: true,
      });
      if (!a.conf) continue;
      r.algum = true;
      r.valores[codigo] = a.estado;
      r.porCodigo[codigo] = {
        grupo: a.conf.grupo,
        exibicao: a.conf.exibicao,
        motivo: textoMotivo(a.conf.grupo, a.conf.regra),
      };
      if (a.conf.exibicao === 'selo') r.selo = true;
    }
  };
  if (ano !== null) {
    aplicar(mapaHistorico, flagsConfDoAno(conf.flags, ano, ['historico']));
    aplicar(mapaCampos, flagsConfDoAno(conf.flags, ano, ['fundamentos_escala']));
  } else {
    aplicar(mapaCampos, conf.flags);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Decisão 1: base por ação quebrada
// ---------------------------------------------------------------------------

/** Flags do ano (per-share ou múltiplos) que põem os valores por ação em conferência. */
export const FLAGS_PER_SHARE_CONFERENCIA: readonly string[] = [
  'salto_acoes_sem_evento',
  'dados_incompletos',
];

/** Motivo do Estado oculto por base por ação quebrada (sem grupo do Bloco C). */
export const MOTIVO_PER_SHARE = 'per_share_em_conferencia';

/** Fração da mediana abaixo da qual o nº de ações do ano entra em conferência (decisão 1). */
export const FRACAO_MEDIANA_ACOES = 0.1;
/** Mínimo de anos com nº de ações para a mediana valer. */
export const MIN_ANOS_MEDIANA_ACOES = 3;

/** 'ocultar' quando o ano tem salto de ações sem evento ou dados incompletos; senão null. */
export function conferirPerShareDoAno(
  flagsPerShare: readonly string[] | null | undefined,
  flagsMultiplosAno: readonly string[] | null | undefined,
): 'ocultar' | null {
  const todas = [...(flagsPerShare ?? []), ...(flagsMultiplosAno ?? [])];
  return todas.some((f) => FLAGS_PER_SHARE_CONFERENCIA.includes(f)) ? 'ocultar' : null;
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Anos com nº de ações abaixo de 1/10 da mediana dos anos (com pelo menos 3 anos). */
export function anosAcoesAbaixoDaMediana(
  serie: ReadonlyArray<{ anoFiscal: number; acoesFim?: number | null }>,
): Set<number> {
  const pontos = serie.filter(
    (p): p is { anoFiscal: number; acoesFim: number } =>
      typeof p.acoesFim === 'number' && Number.isFinite(p.acoesFim) && p.acoesFim > 0,
  );
  const out = new Set<number>();
  if (pontos.length < MIN_ANOS_MEDIANA_ACOES) return out;
  const corte = mediana(pontos.map((p) => p.acoesFim)) * FRACAO_MEDIANA_ACOES;
  for (const p of pontos) if (p.acoesFim < corte) out.add(p.anoFiscal);
  return out;
}

export interface PerShareFlagsAno {
  anoFiscal: number;
  acoesFim?: number | null;
  flags?: readonly string[] | null;
}

/**
 * Anos com a base por ação em conferência → motivo (texto pronto). `mediana` liga o critério de
 * 1/10 da mediana (só ações).
 */
export function anosPerShareEmConferencia(
  perShare: ReadonlyArray<PerShareFlagsAno>,
  multiplos: ReadonlyArray<{ anoFiscal: number; flags?: readonly string[] | null }>,
  opts: { mediana: boolean },
): Map<number, string> {
  const out = new Map<number, string>();
  const flagsMult = new Map(multiplos.map((m) => [m.anoFiscal, m.flags ?? []]));
  const anos = new Set<number>([...perShare.map((p) => p.anoFiscal), ...flagsMult.keys()]);
  const psPorAno = new Map(perShare.map((p) => [p.anoFiscal, p]));
  for (const ano of anos) {
    if (conferirPerShareDoAno(psPorAno.get(ano)?.flags, flagsMult.get(ano))) {
      out.set(ano, TEXTOS_RAIO_X.conferencia.saltoAcoes);
    }
  }
  if (opts.mediana) {
    for (const ano of anosAcoesAbaixoDaMediana(perShare)) {
      if (!out.has(ano)) out.set(ano, TEXTOS_RAIO_X.conferencia.acoesAbaixoMediana);
    }
  }
  return out;
}

/** O Estado está oculto pela decisão 1 (base por ação)? */
export function ehEstadoPerShareEmConferencia(e: Estado<number> | null | undefined): boolean {
  return !!e && e.estado === 'ausente' && e.motivo === MOTIVO_PER_SHARE;
}

/** Oculta um valor por ação em conferência (só células 'ok'; o resto fica como está). */
export function ocultarPerShare(e: Estado<number>, motivo: string): Estado<number> {
  if (e.estado !== 'ok') return e;
  return {
    estado: 'ausente',
    motivo: MOTIVO_PER_SHARE,
    texto: motivo,
    exibicao: 'ocultar',
    valorNaoPublicado: e.valor,
  };
}

/** Aplica a decisão 1 aos códigos dados de um mapa de valores. */
export function aplicarPerShareNosCodigos(
  valores: Readonly<Record<string, Estado<number>>>,
  codigos: readonly string[],
  motivo: string | undefined,
): Record<string, Estado<number>> {
  if (!motivo) return { ...valores };
  const out = { ...valores };
  for (const c of codigos) if (out[c]) out[c] = ocultarPerShare(out[c], motivo);
  return out;
}

/**
 * "Por quê?" de uma célula oculta pela decisão 1 (não há grupo do Bloco C para ela): a conferência
 * da página é montada aqui, no grupo 'acoes_escala' (o mais próximo: nº de ações). O ano vai no
 * rótulo do campo ('LPA (R$) · 2024'); sem data de detecção.
 */
export function conferenciaTelaPerShare(
  motivo: string,
  campos: readonly string[],
): ConferenciaTela {
  return {
    grupo: 'acoes_escala',
    campos: [...campos],
    exibicao: 'ocultar',
    motivo,
    desde: null,
    efeitoIndice: null,
    origem: 'regra',
    caso: null,
  };
}
