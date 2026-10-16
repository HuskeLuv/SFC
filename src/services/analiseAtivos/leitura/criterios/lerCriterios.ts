/**
 * Leitura dos critérios de fundamentos (criteria_eval) — CONTRATO da fatia 0, CORPO da fatia A.
 *
 * Assinaturas FINAIS (as fatias B, C1, C2 e D programam contra elas):
 *  - obterCriteriosAtivo(prisma, symbol) → CriteriosAtivo | null — as 3 janelas de UM ativo, com
 *    rótulo/definição/formato/unidade dos critérios do perfil (criteria_params da paramsVersion da
 *    avaliação), para AtivoTopoResposta.criterios (C2). null = ativo sem avaliação. Cache em memória
 *    com TTL (CRITERIOS_TTL_MS) por symbol.
 *  - obterCriteriosVarios(prisma, symbols, janela) → Map<symbol, CriteriosLinhaApi> — UMA janela de
 *    vários ativos (pares da C2, sugestões do Comparar da C1, Comparador da D). Symbol sem avaliação
 *    não entra no Map.
 *  - projetarCriteriosCompactos(compactos, janela, perfil) → CriteriosLinhaApi | null — projeção PURA
 *    da cópia compacta de AnaliseQuadroLinha.criterios (B: linhasQuadro). Implementada na fatia 0
 *    porque o formato compacto é contrato.
 *
 * Nenhuma função chama provedor externo; só o banco (criteria_eval / criteria_params e, quando o
 * client tem, o tipo do FII em analise_quadro_linhas para a nota de perfil).
 *
 * v2.5 (fatia A): itens, marcas e a projeção compacta expõem `fonte` (ids das fontes da janela) e
 * `obs` ('lucro_sem_descontado', 'dados_incompletos'); CriteriosAtivo ganha `fontes` (união, na ordem
 * da prioridade: provedores antes da CVM) e `dadosIncompletos` (selo §6). Avaliações v1 (sem fonte/obs
 * no JSON) seguem válidas: as definições vêm do criteria_params da paramsVersion, cujo parse já leva os
 * nomes de série legados aos nomes da spec (MAPA_SERIE_LEGADA); nada da avaliação gravada depende do
 * nome da série.
 */
import type { PrismaClient } from '@prisma/client';
import { getTtlCache } from '@/lib/simpleTtlCache';
import {
  criteriosDoPerfil,
  type CriteriaParams,
  type DefCriterio,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { validarCriteriaParams } from '@/services/analiseAtivos/params/obterCriteriaParams';
import { observacaoPerfil } from '@/services/analiseAtivos/regras/criterios/perfilCriterios';
import type { FiiTipoTela } from '@/types/analiseAtivosApi';
import {
  ehIdCriterio,
  ehJanela,
  ehObsCriterio,
  PERFIS_CRITERIO,
  type ChaveJanela,
  type CriteriosAtivo,
  type CriteriosCompactos,
  type CriteriosLinhaApi,
  type ItemCriterioApi,
  type Janela,
  type JanelaCriteriosApi,
  type PerfilCriterio,
  type ObsCriterio,
  type ResultadoCriterio,
} from '@/types/analiseAtivosCriterios';
import type { IdFonte } from '@/types/analiseAtivosFontes';

/** TTL do cache de obterCriteriosAtivo (o job grava 1×/dia). */
export const CRITERIOS_TTL_MS = 10 * 60 * 1000;

export type PrismaCriterios = Pick<PrismaClient, 'criteriaEval' | 'criteriaParams'>;

/** Fonte exibida no card (contrato CriteriosAtivo.fonte). */
export const FONTE_CRITERIOS = {
  acao: 'DFP/ITR (CVM)',
  fii: 'informes de FIIs (CVM)',
} as const;

const cacheAtivo = getTtlCache<CriteriosAtivo | null>('analiseAtivosCriterios');
const cacheParams = getTtlCache<CriteriaParams>('analiseAtivosCriteriaParams');
const chavesAtivo = new Set<string>();

function ehPerfil(s: string): s is PerfilCriterio {
  return (PERFIS_CRITERIO as readonly string[]).includes(s);
}

function resultadosValidos(json: unknown): ResultadoCriterio[] {
  if (!Array.isArray(json)) return [];
  return (json as ResultadoCriterio[]).filter((r) => r && ehIdCriterio(r.id));
}

/** Params da versão (imutável: cache sem pressa de expirar). */
async function paramsDaVersao(
  prisma: PrismaCriterios,
  versao: number,
): Promise<CriteriaParams | null> {
  const chave = String(versao);
  const emCache = cacheParams.get(chave);
  if (emCache) return emCache;
  const linha = await prisma.criteriaParams.findUnique({ where: { version: versao } });
  if (!linha) return null;
  const p = validarCriteriaParams(linha.params, `CriteriaParams v${versao}`);
  cacheParams.set(chave, p, 24 * 60 * 60 * 1000);
  return p;
}

/** Tipo do FII na linha do Quadro (só para a nota de perfil; ausente = null). */
async function fiiTipoDaLinha(
  prisma: PrismaCriterios,
  symbol: string,
): Promise<FiiTipoTela | null> {
  const delegado = (prisma as Partial<Pick<PrismaClient, 'analiseQuadroLinha'>>).analiseQuadroLinha;
  if (!delegado) return null;
  try {
    const l = await delegado.findUnique({ where: { symbol }, select: { fiiTipo: true } });
    return (l?.fiiTipo as FiiTipoTela | null | undefined) ?? null;
  } catch {
    return null;
  }
}

/** obs válidas de um resultado gravado (JSON pode ter lixo). */
function obsDe(r: ResultadoCriterio): ObsCriterio[] {
  return Array.isArray(r.obs) ? r.obs.filter(ehObsCriterio) : [];
}

/** ids de fonte de um resultado gravado (ausente = só CVM, avaliação v1). */
function fonteDe(r: ResultadoCriterio): IdFonte[] {
  return Array.isArray(r.fonte) ? r.fonte.filter((f) => typeof f === 'string' && f.length > 0) : [];
}

/** União das fontes na ordem em que aparecem, provedores antes da CVM. Pura. */
export function uniaoFontes(listas: ReadonlyArray<readonly IdFonte[]>): IdFonte[] {
  const vistas: IdFonte[] = [];
  for (const l of listas) for (const f of l) if (!vistas.includes(f)) vistas.push(f);
  return [...vistas.filter((f) => f !== 'cvm'), ...vistas.filter((f) => f === 'cvm')];
}

/** Item da API a partir do resultado gravado + definição do params. Pura. */
export function itemApi(r: ResultadoCriterio, def: DefCriterio | undefined): ItemCriterioApi {
  const fonte = fonteDe(r);
  const obs = obsDe(r);
  return {
    id: r.id,
    rotulo: def?.rotulo ?? r.id,
    definicao: def?.definicao ?? '',
    estado: r.estado,
    n: r.n,
    de: r.de,
    fato: r.fato,
    ...(r.motivo ? { motivo: r.motivo } : {}),
    serie: r.serie,
    formato: def?.formato ?? 'n',
    ...(def?.unidade ? { unidade: def.unidade } : {}),
    ...(fonte.length > 0 ? { fonte } : {}),
    ...(obs.length > 0 ? { obs } : {}),
  };
}

/**
 * Monta o CriteriosAtivo a partir das linhas de criteria_eval de UM ativo. Pura (testada sem
 * banco). null sem linhas ou com perfil desconhecido.
 */
export function montarCriteriosAtivo(
  linhas: ReadonlyArray<{
    classe: string;
    perfil: string;
    janela: number;
    anoInicio: number;
    anoFim: number;
    atendidos: number;
    aplicaveis: number;
    resultados: unknown;
    paramsVersion: number;
  }>,
  params: CriteriaParams | null,
  fiiTipo: FiiTipoTela | null,
): CriteriosAtivo | null {
  const validas = linhas.filter((l) => ehJanela(l.janela));
  if (validas.length === 0) return null;
  const base = validas[0];
  if (!ehPerfil(base.perfil)) return null;
  const perfil = base.perfil;
  const classe = base.classe === 'fii' ? 'fii' : 'acao';
  const defs = new Map(
    (params ? criteriosDoPerfil(params, perfil) : []).map((d) => [d.id, d] as const),
  );
  const janelas = {} as Record<ChaveJanela, JanelaCriteriosApi>;
  for (const l of validas) {
    janelas[String(l.janela) as ChaveJanela] = {
      anoInicio: l.anoInicio,
      anoFim: l.anoFim,
      atendidos: l.atendidos,
      aplicaveis: l.aplicaveis,
      itens: resultadosValidos(l.resultados).map((r) => itemApi(r, defs.get(r.id))),
    };
  }
  const itens = Object.values(janelas).flatMap((j) => j.itens);
  const fontes = uniaoFontes(itens.map((i) => i.fonte ?? []));
  const dadosIncompletos = itens.some((i) => i.obs?.includes('dados_incompletos'));
  return {
    perfil,
    fonte: FONTE_CRITERIOS[classe],
    ...(fontes.length > 0 ? { fontes } : {}),
    ...(dadosIncompletos ? { dadosIncompletos } : {}),
    anoFim: Math.max(...validas.map((l) => l.anoFim)),
    paramsVersion: base.paramsVersion,
    observacaoPerfil: observacaoPerfil(fiiTipo, perfil, classe),
    janelas,
  };
}

/** Critérios das 3 janelas de um ativo (cache TTL por symbol). */
export async function obterCriteriosAtivo(
  prisma: PrismaCriterios,
  symbol: string,
): Promise<CriteriosAtivo | null> {
  const s = symbol.toUpperCase();
  const emCache = cacheAtivo.get(s);
  if (emCache !== undefined) return emCache;
  const linhas = await prisma.criteriaEval.findMany({
    where: { symbol: s },
    select: {
      classe: true,
      perfil: true,
      janela: true,
      anoInicio: true,
      anoFim: true,
      atendidos: true,
      aplicaveis: true,
      resultados: true,
      paramsVersion: true,
    },
    orderBy: { janela: 'asc' },
  });
  let dados: CriteriosAtivo | null = null;
  if (linhas.length > 0) {
    const [params, fiiTipo] = await Promise.all([
      paramsDaVersao(prisma, linhas[0].paramsVersion),
      linhas[0].classe === 'fii' ? fiiTipoDaLinha(prisma, s) : Promise.resolve(null),
    ]);
    dados = montarCriteriosAtivo(linhas, params, fiiTipo);
  }
  cacheAtivo.set(s, dados, CRITERIOS_TTL_MS);
  chavesAtivo.add(s);
  return dados;
}

/** Uma janela de vários ativos (symbol sem avaliação não entra no Map). */
export async function obterCriteriosVarios(
  prisma: PrismaCriterios,
  symbols: readonly string[],
  janela: Janela,
): Promise<Map<string, CriteriosLinhaApi>> {
  const out = new Map<string, CriteriosLinhaApi>();
  const lista = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (lista.length === 0) return out;
  const linhas = await prisma.criteriaEval.findMany({
    where: { symbol: { in: lista }, janela },
    select: { symbol: true, perfil: true, atendidos: true, aplicaveis: true, resultados: true },
  });
  for (const l of linhas) {
    if (!ehPerfil(l.perfil)) continue;
    out.set(l.symbol, {
      janela,
      perfil: l.perfil,
      n: l.atendidos,
      de: l.aplicaveis,
      marcas: resultadosValidos(l.resultados).map((r) => {
        const obs = obsDe(r);
        return { id: r.id, estado: r.estado, fato: r.fato, ...(obs.length > 0 ? { obs } : {}) };
      }),
    });
  }
  return out;
}

/** Limpa o cache em memória (testes e job 'criterios' ao terminar). */
export function limparCacheCriterios(): void {
  for (const s of chavesAtivo) cacheAtivo.del(s);
  chavesAtivo.clear();
}

/**
 * Projeção pura da cópia compacta (AnaliseQuadroLinha.criterios) numa janela. Devolve null quando a
 * linha não tem a janela (job ainda não rodou ou JSON inválido).
 */
export function projetarCriteriosCompactos(
  compactos: unknown,
  janela: Janela,
  perfil: PerfilCriterio | null,
): CriteriosLinhaApi | null {
  if (!perfil || !compactos || typeof compactos !== 'object') return null;
  const j = (compactos as CriteriosCompactos)[String(janela) as ChaveJanela];
  if (!j || !Array.isArray(j.m)) return null;
  return {
    janela,
    perfil,
    n: j.n,
    de: j.de,
    marcas: j.m.map((m) => {
      const [id, estado, fato] = m;
      const obs = m.length > 3 && Array.isArray(m[3]) ? m[3].filter(ehObsCriterio) : [];
      return { id, estado, fato, ...(obs.length > 0 ? { obs } : {}) };
    }),
  };
}
