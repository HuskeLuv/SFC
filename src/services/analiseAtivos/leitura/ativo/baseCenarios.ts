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
 * 'histórico com menos de 5 anos: informe o P/L alvo' (AURE3 tem 2 pontos). Cache limitado por
 * ticker:versão do Quadro, 30 min.
 *
 * v2.4 (fatia C2, spec §4.4): SEM premissas padrão do ScoringParams (yield 6, g 8, k 13…). A base
 * manda `premissasIniciais` EM BRANCO — ação {yield, g, k: null; margem 0; P/L alvo = média 10a
 * do ativo (fato) | null}; FII {yield, P/VP alvo, renda: null; margem 0}. `premissasPadrao` sai do
 * JSON (o tipo público só perde o campo na F).
 */
import { prisma } from '@/lib/prisma';
import { getBoundedTtlCache, LIMITES_CACHE_BLOCO_D } from '@/lib/boundedTtlCache';
import { LIMITES_CENARIO } from '@/services/analiseAtivos/cenarios/contrato';
import {
  premissasIniciaisAcao,
  premissasIniciaisFii,
} from '@/services/analiseAtivos/regras/valuation/cenario';
import { arredondar } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import {
  obterLinhaQuadro,
  paraLinhaQuadroApi,
  versaoQuadro,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  aplicarConferenciaCampo,
  motivosDaLinha,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { DEF_GRUPO } from '@/services/analiseAtivos/regras/comum/conferencia';
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
import type { CenariosResposta, ConferenciaCampoCenario } from '@/types/analiseAtivosBlocoD';
import type { PremissasAcaoV2, PremissasFiiV2 } from '@/types/analiseAtivosCriterios';
import type { Estado, LinhaQuadroApi } from '@/types/analiseAtivosApi';

type OmitirDistributivo<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * A resposta do GET sem a parte do usuário (salvo, podeSalvar, motivoSemSalvar). v2.4: sem
 * `premissasPadrao` e com `premissasIniciais` obrigatório.
 */
export type BaseCenariosResposta = OmitirDistributivo<
  CenariosResposta,
  'salvo' | 'podeSalvar' | 'motivoSemSalvar' | 'premissasPadrao' | 'premissasIniciais'
> &
  (
    | { classe: 'acao'; premissasIniciais: PremissasAcaoV2 }
    | { classe: 'fii'; premissasIniciais: PremissasFiiV2 }
  );

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
}

const TC = TEXTOS_TELA.conferencia;

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
      // "vs. cotação" = resultado ÷ cotação (Bazin ÷ cotação − 1 = DY 12m ÷ yield − 1): segue a
      // política do DY 12m do grupo (preco_base oculta o DY no Quadro/Comparador ⇒ oculta aqui)
      ...(campo === 'cotacao'
        ? { vsCotacao: DEF_GRUPO[r.conf.grupo].campos.dy12m ?? r.conf.exibicao }
        : {}),
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
  const { linha, atual } = e;
  const ctx: Contexto = {
    linha,
    flags: [...new Set([...linha.flags, ...(atual?.flags ?? [])])],
    motivos: motivosDaLinha(linha),
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
      premissasIniciais: premissasIniciaisFii(),
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
    premissasIniciais: premissasIniciaisAcao(
      plAlvoPadrao.estado === 'ok' ? plAlvoPadrao.valor : null,
    ),
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
