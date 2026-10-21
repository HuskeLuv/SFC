/**
 * Fundamentos · Raio-X da página do ativo (Bloco D, fatia A) — leitura do banco. Nenhuma fonte
 * externa no caminho da requisição.
 *
 * - obterLinhaQuadro: null ⇒ a rota responde 404.
 * - Cache em memória LIMITADO (getBoundedTtlCache 'analiseAtivosRaioX', LRU) por symbol:versão do
 *   Quadro, TTL_ANALISE_MS (30 min). Resposta sem nenhum dado de usuário.
 * - Ações: fundamentosVigentes (FY + TTM) + asset_per_share_yearly (com flags e nº de ações) +
 *   asset_multiples_yearly (com flags). FII: fii_quarterly + fii_monthly (todos os meses da janela) +
 *   per-share + múltiplos anuais. O cnpj_em_conferencia do FII vale como no Essencial (o informe do
 *   CNPJ nem é lido).
 * - REGRA DE OURO: a mesma entrada monta o Essencial (montarFundamentos*) e o Raio-X usa as células
 *   dele nas linhas comuns — o mesmo Estado no mesmo ano (testado célula a célula).
 * - A6 (fatia B): template de banco/seguradora pelo segmento B3 (listarEmissores) com
 *   ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO; FII com 'Alavancagem (% do ativo)' lida de
 *   asset_multiples_yearly.obrigacoesAtivoPct com ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO. Chaves
 *   desligadas ⇒ as mesmas leituras e a resposta de hoje.
 * - fundamentei-regras (F2): ANALISE_ATIVOS_ESSENCIAL_V2_HABILITADO (anos por dtFim com 'fev/2026',
 *   'L' com prejuízo, PDD ÷ lucro em %) vai ao Essencial e ao Raio-X da MESMA entrada (regra de
 *   ouro); o sub-rótulo do payout segue a payout.regra da scoring vigente (regraPayoutVigente).
 */
import { prisma } from '@/lib/prisma';
import {
  analiseAtivosAlavAtivoHabilitado,
  analiseAtivosEssencialV2Habilitado,
  analiseAtivosTemplatesFinanceirasHabilitado,
} from '@/lib/analiseAtivosConfig';
import type { RegraPayout } from '@/services/analiseAtivos/params/scoringParamsSchema';
import { listarEmissores } from '@/services/analiseAtivos/repositorio/universo';
import { templateDoEmissor } from '@/services/analiseAtivos/regras/acoes/templateFinanceira';
import type { TemplateFinanceira } from '@/types/analiseAtivosComplementos';
import { getBoundedTtlCache, LIMITES_CACHE_BLOCO_D } from '@/lib/boundedTtlCache';
import { fundamentosVigentes } from '@/services/analiseAtivos/repositorio/acoes';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import { proventosEmConferencia } from '@/services/analiseAtivos/regras/calculo/plausibilidadeProventos';
import { obterLinhaQuadro, versaoQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { flagsAnuaisConf } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import {
  TTL_ANALISE_MS,
  anoInicioLeitura,
  hojeSaoPaulo,
  montarFundamentosAcao,
  montarFundamentosFii,
  regraPayoutVigente,
  type EntradaFundamentosAcao,
  type EntradaFundamentosFii,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import {
  montarRaioXAcao,
  montarRaioXFii,
  type MesRaioXFii,
  type MultiplosAnoRaioXAcao,
  type TrimestreRaioXFii,
} from '@/services/analiseAtivos/regras/raioX/linhasRaioX';
import type { ClasseQuadro, FiiTipoTela } from '@/types/analiseAtivosApi';
import type { RaioXResposta } from '@/types/analiseAtivosBlocoD';

export interface ResultadoRaioX {
  dados: RaioXResposta;
  /** true quando veio do cache em memória */
  cache: boolean;
  /** versão do ScoringParams da linha do Quadro ('Parâmetros' do CSV) */
  paramsVersion: number;
}

interface EntradaCache {
  dados: RaioXResposta;
  paramsVersion: number;
}

const cache = getBoundedTtlCache<EntradaCache>('analiseAtivosRaioX', {
  maxKeys: LIMITES_CACHE_BLOCO_D.analiseAtivosRaioX,
});

/** Só para testes. */
export function _limparCacheRaioX(): void {
  cache.limpar();
}

// ---------------------------------------------------------------------------
// Entradas (puras) — compartilhadas com os testes de consistência
// ---------------------------------------------------------------------------

/** Linhas de ações já lidas do banco (números simples). */
export interface DadosBancoAcao {
  financeira: boolean;
  periodos: EntradaFundamentosAcao['fys'];
  perShare: Array<
    EntradaFundamentosAcao['perShare'][number] & {
      acoesFim: number | null;
      flags: string[];
      /** ações por unit (TAEE11 = 3); ausente = 1 */
      fatorEquivalencia?: number | null;
    }
  >;
  multiplos: Array<
    EntradaFundamentosAcao['multiplos'][number] & Omit<MultiplosAnoRaioXAcao, 'anoFiscal'>
  >;
  atual: EntradaFundamentosAcao['atual'];
  flagsLinha: string[];
  motivosLinha: string[];
  /** A6: template de banco/seguradora (só com a chave); ausente = o de hoje */
  template?: TemplateFinanceira | null;
}

/** F2: opções de leitura (chave ESSENCIAL_V2 e regra do payout vigente); ausente = como hoje. */
export interface OpcoesRaioXAcao {
  essencialV2?: boolean;
  regraPayout?: RegraPayout;
}

/** Monta Essencial e Raio-X de uma ação com a MESMA entrada. */
export function montarAcao(hoje: string, d: DadosBancoAcao, opts: OpcoesRaioXAcao = {}) {
  const ttms = d.periodos
    .filter((p) => p.tipoPeriodo === 'TTM')
    .sort((a, b) => a.dtFim.localeCompare(b.dtFim));
  const fys = d.periodos.filter((p) => p.tipoPeriodo === 'FY');
  const conferencia = {
    flags: [...d.flagsLinha, ...flagsAnuaisConf(d.multiplos)],
    motivos: d.motivosLinha,
  };
  const essencial = montarFundamentosAcao(
    {
      hoje,
      financeira: d.financeira,
      fys,
      ttm: ttms[ttms.length - 1] ?? null,
      perShare: d.perShare,
      multiplos: d.multiplos,
      atual: d.atual,
      proventosEmConferencia: proventosEmConferencia(d.flagsLinha, d.motivosLinha),
      conferencia,
      ...(d.template ? { template: d.template } : {}),
    },
    {
      ...(opts.essencialV2 ? { essencialV2: true } : {}),
      ...(opts.regraPayout ? { regraPayout: opts.regraPayout } : {}),
    },
  );
  const raioX = montarRaioXAcao({
    financeira: d.financeira,
    essencial,
    fys,
    perShare: d.perShare,
    multiplos: d.multiplos,
    conferencia,
    ...(d.template ? { template: d.template } : {}),
    ...(opts.essencialV2 ? { essencialV2: true } : {}),
    ...(opts.regraPayout ? { regraPayout: opts.regraPayout } : {}),
  });
  return { essencial, raioX };
}

export interface DadosBancoFii {
  fiiTipo: FiiTipoTela | null;
  trimestres: Array<EntradaFundamentosFii['trimestres'][number] & TrimestreRaioXFii>;
  meses: Array<MesRaioXFii & { fatorDesdobramento: number | null }>;
  perShare: Array<EntradaFundamentosFii['perShare'][number] & { flags: string[] }>;
  multiplos: Array<
    EntradaFundamentosFii['multiplos'][number] & {
      obrigacoesPlPct: number | null;
      /** A6: obrigações ÷ ativo (só lida com a chave ALAV_ATIVO) */
      obrigacoesAtivoPct?: number | null;
      flags: string[];
    }
  >;
  atual: EntradaFundamentosFii['atual'];
  flagsLinha: string[];
  motivosLinha: string[];
  /** A6: linha 'Alavancagem (% do ativo)' */
  alavAtivo?: boolean;
}

/** Monta Essencial e Raio-X de um FII com a MESMA entrada. */
export function montarFii(hoje: string, d: DadosBancoFii) {
  const cnpjEmConferencia = d.flagsLinha.includes(FLAG_CNPJ_EM_CONFERENCIA);
  const desdobramentos = d.meses
    .filter((m) => typeof m.fatorDesdobramento === 'number')
    .map((m) => ({ refMonth: m.refMonth, fator: m.fatorDesdobramento as number }));
  const conferencia = { flags: d.flagsLinha, motivos: d.motivosLinha };
  const essencial = montarFundamentosFii({
    hoje,
    fiiTipo: d.fiiTipo,
    trimestres: cnpjEmConferencia ? [] : d.trimestres,
    perShare: d.perShare,
    multiplos: d.multiplos,
    atual: d.atual,
    desdobramentos: cnpjEmConferencia ? [] : desdobramentos,
    proventosEmConferencia: proventosEmConferencia(d.flagsLinha, d.motivosLinha),
    cnpjEmConferencia,
    conferencia,
  });
  const raioX = montarRaioXFii({
    fiiTipo: d.fiiTipo,
    essencial,
    trimestres: d.trimestres,
    meses: d.meses,
    desdobramentos,
    perShare: d.perShare,
    multiplos: d.multiplos,
    cnpjEmConferencia,
    conferencia,
    ...(d.alavAtivo ? { alavAtivo: true } : {}),
  });
  return { essencial, raioX };
}

// ---------------------------------------------------------------------------
// Leitura do banco
// ---------------------------------------------------------------------------

async function lerAcao(
  symbol: string,
  cnpj: string,
  desdeAno: number,
): Promise<Omit<DadosBancoAcao, 'financeira' | 'flagsLinha' | 'motivosLinha'>> {
  const desde = `${desdeAno}-01-01`;
  // A6: o template de financeira sai do segmento B3 do emissor (só com a chave)
  const emissores = analiseAtivosTemplatesFinanceirasHabilitado()
    ? await listarEmissores(prisma, [cnpj])
    : undefined;
  const template = emissores?.[0] ? templateDoEmissor(emissores[0]) : null;
  const [periodos, ps, my, mc] = await Promise.all([
    fundamentosVigentes(prisma, [cnpj], {
      tipos: ['FY', 'TTM'],
      desde,
      ...(emissores ? { emissores } : {}),
    }),
    prisma.assetPerShareYearly.findMany({
      where: { symbol, anoFiscal: { gte: desdeAno } },
      select: {
        anoFiscal: true,
        lpaAjHoje: true,
        dpaAjHoje: true,
        payoutDmplPct: true,
        acoesFim: true,
        fatorEquivalencia: true,
        flags: true,
      },
    }),
    prisma.assetMultiplesYearly.findMany({
      where: { symbol, anoFiscal: { gte: desdeAno } },
      select: {
        anoFiscal: true,
        pl: true,
        pvp: true,
        dyPct: true,
        roePct: true,
        margemLiquidaPct: true,
        payoutPct: true,
        roicPct: true,
        divLiqEbitda: true,
        divLiqPl: true,
        liquidezCorrente: true,
        flags: true,
      },
    }),
    prisma.assetMultiplesCurrent.findUnique({
      where: { symbol },
      select: {
        pl: true,
        pvp: true,
        dy12mPct: true,
        roePct: true,
        margemLiquidaPct: true,
        payoutPct: true,
        lpaTtm: true,
        dpa12m: true,
      },
    }),
  ]);
  return {
    periodos,
    perShare: ps.map((p) => ({ ...p, acoesFim: paraNumero(p.acoesFim) })),
    multiplos: my,
    atual: mc,
    ...(template ? { template } : {}),
  };
}

async function lerFii(
  symbol: string,
  cnpj: string,
  desdeAno: number,
  cnpjEmConferencia: boolean,
): Promise<Omit<DadosBancoFii, 'fiiTipo' | 'flagsLinha' | 'motivosLinha'>> {
  const desde = new Date(`${desdeAno}-01-01T00:00:00Z`);
  const alavAtivo = analiseAtivosAlavAtivoHabilitado();
  const [trim, meses, ps, my, mc] = await Promise.all([
    cnpjEmConferencia
      ? Promise.resolve([])
      : prisma.fiiQuarterly.findMany({
          where: { cnpj, refQuarter: { gte: desde } },
          orderBy: { refQuarter: 'asc' },
          select: {
            refQuarter: true,
            receitaAluguel: true,
            resultadoTrimestral: true,
            rendimentosDeclarados: true,
            taxaPerformance: true,
            vacanciaFisicaCvmPct: true,
            nImoveisRenda: true,
            nImoveisOutros: true,
            areaM2: true,
            nCri: true,
            maiorCriPct: true,
            flags: true,
          },
        }),
    cnpjEmConferencia
      ? Promise.resolve([])
      : prisma.fiiMonthly.findMany({
          // desdobramentos de qualquer data (o fator vale para os anos anteriores) + meses da janela
          where: {
            cnpj,
            OR: [{ refMonth: { gte: desde } }, { fatorDesdobramento: { not: null } }],
          },
          orderBy: { refMonth: 'asc' },
          select: {
            refMonth: true,
            pl: true,
            cotas: true,
            cotistas: true,
            taxaAdmPct: true,
            fatorDesdobramento: true,
          },
        }),
    prisma.assetPerShareYearly.findMany({
      where: { symbol, anoFiscal: { gte: desdeAno } },
      select: { anoFiscal: true, rendCota: true, vpCotaFim: true, flags: true },
    }),
    prisma.assetMultiplesYearly.findMany({
      where: { symbol, anoFiscal: { gte: desdeAno } },
      select: {
        anoFiscal: true,
        pvp: true,
        dyPct: true,
        vacanciaFisicaCvmPct: true,
        nImoveisCvm: true,
        obrigacoesPlPct: true,
        // A6: mesma leitura da Obrigações/PL (regra de ouro), só com a chave
        ...(alavAtivo ? { obrigacoesAtivoPct: true } : {}),
        flags: true,
      },
    }),
    prisma.assetMultiplesCurrent.findUnique({
      where: { symbol },
      select: { pvp: true, dy12mPct: true, vpCota: true, rend12m: true },
    }),
  ]);
  return {
    trimestres: trim.map((t) => ({
      ...t,
      refQuarter: paraData(t.refQuarter),
      receitaAluguel: paraNumero(t.receitaAluguel),
      resultadoTrimestral: paraNumero(t.resultadoTrimestral),
      rendimentosDeclarados: paraNumero(t.rendimentosDeclarados),
      taxaPerformance: paraNumero(t.taxaPerformance),
    })),
    meses: meses.map((m) => ({
      refMonth: paraData(m.refMonth),
      pl: paraNumero(m.pl),
      cotas: paraNumero(m.cotas),
      cotistas: m.cotistas,
      taxaAdmPct: m.taxaAdmPct,
      fatorDesdobramento: m.fatorDesdobramento,
    })),
    perShare: ps,
    multiplos: my,
    atual: mc,
    ...(alavAtivo ? { alavAtivo: true } : {}),
  };
}

/** null = ticker fora da área (a rota responde 404). */
export async function obterRaioX(
  ticker: string,
  hoje: string = hojeSaoPaulo(),
): Promise<ResultadoRaioX | null> {
  const symbol = ticker.toUpperCase();
  const linha = await obterLinhaQuadro(symbol);
  if (!linha) return null;
  const versao = await versaoQuadro();
  const essencialV2 = analiseAtivosEssencialV2Habilitado();
  const chave = `${symbol}:${versao}:${hoje.slice(0, 4)}${essencialV2 ? ':v2' : ''}`;
  const emCache = cache.get(chave);
  if (emCache) return { ...emCache, cache: true };

  const desdeAno = anoInicioLeitura(hoje);
  const classe = linha.classe as ClasseQuadro;
  let parcial: ReturnType<typeof montarAcao>['raioX'];
  if (classe === 'fii') {
    const cnpjEmConferencia = linha.flags.includes(FLAG_CNPJ_EM_CONFERENCIA);
    const d = await lerFii(symbol, linha.cnpj, desdeAno, cnpjEmConferencia);
    parcial = montarFii(hoje, {
      ...d,
      fiiTipo: (linha.fiiTipo as FiiTipoTela | null) ?? null,
      flagsLinha: linha.flags,
      motivosLinha: linha.motivosIncompleto,
    }).raioX;
  } else {
    const [d, regraPayout] = await Promise.all([
      lerAcao(symbol, linha.cnpj, desdeAno),
      regraPayoutVigente(),
    ]);
    parcial = montarAcao(
      hoje,
      {
        ...d,
        financeira: linha.regua === 'acao_financeira',
        flagsLinha: linha.flags,
        motivosLinha: linha.motivosIncompleto,
      },
      { ...(essencialV2 ? { essencialV2 } : {}), regraPayout },
    ).raioX;
  }
  const dados: RaioXResposta = {
    ticker: symbol,
    classe,
    nome: linha.nome,
    ...parcial,
    versao,
  };
  const entrada: EntradaCache = { dados, paramsVersion: linha.paramsVersion ?? 1 };
  cache.set(chave, entrada, TTL_ANALISE_MS);
  return { ...entrada, cache: false };
}
