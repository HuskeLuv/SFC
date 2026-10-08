/**
 * Base de "Meus cenários" (Bloco D, fatia B): os dados do ativo que pré-preenchem a calculadora,
 * sem NENHUM dado do usuário. Só o banco: a linha do Quadro (cotação, data do pregão, flags) e
 * asset_multiples_current (LPA 12m, VPA, DPA 12m, rendimento 12m, VP/cota, P/VP, P/L médio de 10
 * anos e quantos pontos ele tem).
 *
 * Conferência (decisão 6, mesma política do Bloco C, aplicarConferenciaCampo com pagina=false):
 *  - 'ocultar' ⇒ Estado ausente (em_conferencia) — o campo abre vazio, com o chip;
 *  - 'selo' ⇒ Estado ok + entrada em `conferencias` — o campo abre preenchido, com o chip, e os
 *    métodos que usam o dado dizem "usa <dado> em conferência";
 *  - legado de proventos (proventosEmConferencia da linha) ⇒ selo no DPA 12m / rendimento 12m;
 *  - FII com ticker↔CNPJ não conferido ⇒ VP/cota oculto (o informe pode ser de outro fundo).
 *
 * P/L alvo padrão = plMedia10a só com plPontosHistorico ≥ 5; senão ausente('historico_curto') com
 * 'histórico com menos de 5 anos: informe o P/L alvo' (AURE3 tem 2 pontos). Premissas padrão de
 * ScoringParams.valuation.premissasPadrao. Cache limitado por ticker:versão do Quadro, 30 min.
 */
import { prisma } from '@/lib/prisma';
import { getBoundedTtlCache, LIMITES_CACHE_BLOCO_D } from '@/lib/boundedTtlCache';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { LIMITES_CENARIO } from '@/services/analiseAtivos/cenarios/contrato';
import { arredondar } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import {
  obterLinhaQuadro,
  paraLinhaQuadroApi,
  versaoQuadro,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import { aplicarConferenciaCampo } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import {
  TTL_ANALISE_MS,
  ausenteCom,
  estadoDe,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import { PONTOS_MINIMOS_MEDIA_PL } from '@/services/analiseAtivos/leitura/ativo/kpisAtivo';
import { fiiCnpjEmConferencia } from '@/services/analiseAtivos/leitura/ativo/valuationMultiplos';
import type {
  CampoTela,
  ClasseConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';
import type { CenariosResposta, ConferenciaCampoCenario } from '@/types/analiseAtivosBlocoD';
import type { Estado, LinhaQuadroApi } from '@/types/analiseAtivosApi';

type OmitirDistributivo<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A resposta do GET sem a parte do usuário (salvo, podeSalvar, motivoSemSalvar). */
export type BaseCenariosResposta = OmitirDistributivo<
  CenariosResposta,
  'salvo' | 'podeSalvar' | 'motivoSemSalvar'
>;

/** Campos de asset_multiples_current que a base lê. */
export interface AtualCenarios {
  lpaTtm: number | null;
  vpa: number | null;
  dpa12m: number | null;
  rend12m: number | null;
  vpCota: number | null;
  pvp: number | null;
  plMedia10a: number | null;
  plPontosHistorico: number;
  flags: string[];
}

export interface EntradaBaseCenarios {
  linha: LinhaQuadroApi;
  atual: AtualCenarios | null;
  versao: string;
  params?: ScoringParams;
}

const TC = TEXTOS_TELA.conferencia;

/** Premissas da spec (metodos_cenarios) quando o ScoringParams não traz o campo. */
const PADRAO_ACAO = { yieldPct: 6, gPct: 8, kPct: 13, margemPct: 20 } as const;
const PADRAO_FII = { yieldPct: 8, margemPct: 10, rendaMensal: 1000, pvpAlvo: 1 } as const;

/** Campo dos cenários → campo de tela da política de conferência. */
const CAMPO_TELA: Record<ConferenciaCampoCenario['campo'], CampoTela> = {
  lpa: 'lpa',
  vpa: 'vpa',
  dpa: 'dpa12m',
  rend12m: 'rendCota12m',
  vpCota: 'vpCota',
  cotacao: 'preco',
};

interface Contexto {
  linha: LinhaQuadroApi;
  flags: string[];
  motivos: string[];
  conferencias: ConferenciaCampoCenario[];
}

function motivoConf(grupo: string, regra: string): string {
  return (
    TC.motivos[`${grupo}:${regra}`] ??
    (TC.motivosPorGrupo as Record<string, string>)[grupo] ??
    TEXTOS_CENARIOS.campos.emConferencia
  );
}

/** Aplica a política do campo; registra a conferência (selo ou ocultar) para a tela. */
function comConferencia(
  ctx: Contexto,
  campo: ConferenciaCampoCenario['campo'],
  estado: Estado<number>,
): Estado<number> {
  const r = aplicarConferenciaCampo(
    estado,
    ctx.flags,
    ctx.motivos,
    CAMPO_TELA[campo],
    ctx.linha.classe as ClasseConferencia,
    { pagina: false },
  );
  if (r.conf) {
    ctx.conferencias.push({
      campo,
      exibicao: r.conf.exibicao,
      motivo: motivoConf(r.conf.grupo, r.conf.regra),
    });
    return r.estado;
  }
  // legado de proventos: valor visível + selo (como o "Últ. 12m" do Essencial)
  if (
    (campo === 'dpa' || campo === 'rend12m') &&
    ctx.linha.proventosEmConferencia &&
    estado.estado === 'ok'
  ) {
    ctx.conferencias.push({ campo, exibicao: 'selo', motivo: TC.motivosPorGrupo.proventos });
  }
  return estado;
}

/** Monta a base (pura). */
export function montarBaseCenarios(e: EntradaBaseCenarios): BaseCenariosResposta {
  const params = e.params ?? SCORING_PARAMS_V1;
  const padrao = params.valuation.premissasPadrao;
  const { linha, atual } = e;
  const ctx: Contexto = {
    linha,
    flags: [...new Set([...linha.flags, ...(atual?.flags ?? [])])],
    motivos: linha.indice.motivos.map((m) => m.codigo),
    conferencias: [],
  };

  const cotacaoValor = comConferencia(ctx, 'cotacao', linha.preco);
  const confCotacao = ctx.conferencias.find((c) => c.campo === 'cotacao') ?? null;
  const comum = {
    ticker: linha.ticker,
    nome: linha.nome,
    cotacao: { valor: cotacaoValor, data: linha.precoData, conferencia: confCotacao },
    limites: LIMITES_CENARIO,
    versao: e.versao,
  };

  if (linha.classe === 'fii') {
    const rend12m = comConferencia(ctx, 'rend12m', estadoDe(atual?.rend12m));
    let vpCota: Estado<number>;
    if (fiiCnpjEmConferencia(linha)) {
      vpCota = ausenteCom('cnpj_em_conferencia', TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia);
      ctx.conferencias.push({
        campo: 'vpCota',
        exibicao: 'ocultar',
        motivo: TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia,
      });
    } else {
      vpCota = comConferencia(ctx, 'vpCota', estadoDe(atual?.vpCota));
    }
    const pvpAtual = vpCota.estado === 'ok' ? estadoDe(atual?.pvp) : vpCota;
    return {
      ...comum,
      classe: 'fii',
      base: {
        rend12m,
        vpCota,
        pvpAtual,
        conferencias: ctx.conferencias.filter((c) => c.campo !== 'cotacao'),
      },
      premissasPadrao: {
        yieldPct: padrao.fii.yieldPct ?? PADRAO_FII.yieldPct,
        margemPct: padrao.fii.margemPct ?? PADRAO_FII.margemPct,
        rendaMensal: padrao.fii.rendaMensal ?? PADRAO_FII.rendaMensal,
        pvpAlvo: padrao.fii.pvpAlvo ?? PADRAO_FII.pvpAlvo,
      },
    };
  }

  const lpa = comConferencia(ctx, 'lpa', estadoDe(atual?.lpaTtm));
  const vpa = comConferencia(ctx, 'vpa', estadoDe(atual?.vpa));
  const dpa = comConferencia(ctx, 'dpa', estadoDe(atual?.dpa12m));
  const media = atual?.plMedia10a;
  const plAlvoPadrao: Estado<number> =
    typeof media === 'number' &&
    Number.isFinite(media) &&
    media > 0 &&
    (atual?.plPontosHistorico ?? 0) >= PONTOS_MINIMOS_MEDIA_PL
      ? { estado: 'ok', valor: arredondar(media, 1) }
      : ausenteCom('historico_curto', TEXTOS_CENARIOS.campos.plAlvo.historicoCurto);
  return {
    ...comum,
    classe: 'acao',
    base: {
      lpa,
      vpa,
      dpa,
      plAlvoPadrao,
      conferencias: ctx.conferencias.filter((c) => c.campo !== 'cotacao'),
    },
    premissasPadrao: {
      yieldPct: padrao.acao.yieldPct ?? PADRAO_ACAO.yieldPct,
      gPct: padrao.acao.gPct ?? PADRAO_ACAO.gPct,
      kPct: padrao.acao.kPct ?? PADRAO_ACAO.kPct,
      margemPct: padrao.acao.margemPct ?? PADRAO_ACAO.margemPct,
      plAlvo: plAlvoPadrao.estado === 'ok' ? plAlvoPadrao.valor : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Leitura do banco (com cache limitado)
// ---------------------------------------------------------------------------

const cache = getBoundedTtlCache<BaseCenariosResposta>('analiseCenariosBase', {
  maxKeys: LIMITES_CACHE_BLOCO_D.analiseCenariosBase,
});

/** Só para testes. */
export function _limparCacheBaseCenarios(): void {
  cache.limpar();
}

const SELECT_ATUAL = {
  lpaTtm: true,
  vpa: true,
  dpa12m: true,
  rend12m: true,
  vpCota: true,
  pvp: true,
  plMedia10a: true,
  plPontosHistorico: true,
  flags: true,
} as const;

/** null = ticker fora da área (a rota responde 404) ou de outra classe. */
export async function obterBaseCenarios(ticker: string): Promise<BaseCenariosResposta | null> {
  const symbol = ticker.toUpperCase();
  const linhaDb = await obterLinhaQuadro(symbol);
  if (!linhaDb || (linhaDb.classe !== 'acao' && linhaDb.classe !== 'fii')) return null;
  const versao = await versaoQuadro();
  const chave = `${symbol}:${versao}`;
  const emCache = cache.get(chave);
  if (emCache) return emCache;

  const atual = await prisma.assetMultiplesCurrent.findUnique({
    where: { symbol },
    select: SELECT_ATUAL,
  });
  const dados = montarBaseCenarios({
    linha: paraLinhaQuadroApi(linhaDb),
    atual: atual ?? null,
    versao,
  });
  cache.set(chave, dados, TTL_ANALISE_MS);
  return dados;
}
