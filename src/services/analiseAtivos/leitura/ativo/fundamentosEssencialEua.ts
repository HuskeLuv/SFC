/**
 * Fundamentos EUA (Stocks e REITs) — leitura dos 10-K da SEC gravados pela fatia A em
 * AssetFundamentalsPeriod (source 'SEC', emissorId 'CIK:##########', FY, USD, UNIDADE) e o
 * Essencial EUA da página do ativo (GET /api/analise-ativos/ativos/[ticker]/fundamentos).
 *
 * Convenção de leitura (contrato da fatia A, desenho stocks-reits pipeline_dados):
 * - um FY por anoFiscal: a maior `versao` do último dtFim (10-K/A substitui por versão);
 * - EBITDA = ebit + D&A (D&A ausente = sem dado, como no criterios-eua), onde `ebit` é o degrau usado (lucro operacional; com a flag ebitda_pre_ir,
 *   lucro antes do IR + juros; com ebitda_lucro, lucro + IR + juros) — selo 'calculado';
 * - dívida líquida = dívida bruta (CP + LP) − caixa − aplicações de curto prazo (sem caixa = sem dado);
 * - LPA = lpaOn (diluído publicado) ou lucro ÷ média diluída; DPA = coluna dpa (dpaOrigem);
 * - REIT: caixa op./ação = FCO ÷ média diluída; Div./caixa op. = dividendos pagos ÷ FCO (FCO ≤ 0 =
 *   sem valor).
 *
 * Essencial EUA SÓ com as colunas que têm fonte (desenho final.apis): stocks = Receita, EBITDA,
 * Lucro, Margem, Dív. líq., Dív.líq/EBITDA, FCL/CAPEX, ROE, LPA, Div./ação, Payout; REITs = Receita,
 * Lucro, Caixa operacional, Caixa op./ação, Div./ação, Div./caixa op., Dív.líq/EBITDA. FFO, AFFO,
 * ocupação e imóveis vão em `colunasPendentes` (a tela esconde, com a observação). P/E, P/S e DY
 * só com a chave de preço — nesta versão sem cotação, nunca saem.
 *
 * Cache em memória por ticker:versão do Quadro (30 min), como o Essencial do Brasil.
 */
import type { AssetFundamentalsPeriod } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getTtlCache } from '@/lib/simpleTtlCache';
import { dividaLiquidaSec, ebitdaSec } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import { obterLinhaQuadro, versaoQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { TEXTOS_EUA_TELAS, formatarTexto } from '@/services/analiseAtivos/textosEuaTelas';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import {
  COLUNAS_PENDENTES_EUA,
  FONTE_PERIODO_SEC,
  type FlagFundamentoSec,
} from '@/types/analiseAtivosEua';
import {
  ehClasseEua,
  type ClasseEua,
  type ColunaFundamentos,
  type Estado,
  type FormatoAnalise,
  type FundamentosResposta,
  type LinhaFundamentos,
} from '@/types/analiseAtivosApi';

/** Anos fechados no Essencial (como o Brasil). */
export const MAX_ANOS_ESSENCIAL_EUA = 10;
const TTL_MS = 30 * 60_000;

/** Linha FY da SEC já convertida para número (o que as telas EUA leem). */
export interface PeriodoSec {
  anoFiscal: number;
  dtFim: string;
  receita: number | null;
  ebit: number | null;
  depreciacaoAmortizacao: number | null;
  lucroLiquido: number | null;
  pl: number | null;
  caixa: number | null;
  aplicacoesFinanceiras: number | null;
  dividaBrutaCp: number | null;
  dividaBrutaLp: number | null;
  fco: number | null;
  capex: number | null;
  dividendosPagos: number | null;
  acoesMediaDiluida: number | null;
  lpaOn: number | null;
  dpa: number | null;
  dpaOrigem: string | null;
  flags: string[];
}

const num = (d: unknown): number | null => {
  if (d === null || d === undefined) return null;
  const n = typeof d === 'number' ? d : Number(String(d));
  return Number.isFinite(n) ? n : null;
};
const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function periodoSecDaLinha(p: AssetFundamentalsPeriod): PeriodoSec {
  return {
    anoFiscal: p.anoFiscal,
    dtFim: p.dtFim.toISOString().slice(0, 10),
    receita: num(p.receita),
    ebit: num(p.ebit),
    depreciacaoAmortizacao: num(p.depreciacaoAmortizacao),
    lucroLiquido: num(p.lucroAtribuivel) ?? num(p.lucroLiquido),
    pl: num(p.plControladora) ?? num(p.pl),
    caixa: num(p.caixa),
    aplicacoesFinanceiras: num(p.aplicacoesFinanceiras),
    dividaBrutaCp: num(p.dividaBrutaCp),
    dividaBrutaLp: num(p.dividaBrutaLp),
    fco: num(p.fco),
    capex: num(p.capex),
    dividendosPagos: num(p.dividendosJcpPagos),
    acoesMediaDiluida: num(p.acoesMediaDiluida),
    lpaOn: num(p.lpaOn),
    dpa: num(p.dpa),
    dpaOrigem: p.dpaOrigem,
    flags: p.flags,
  };
}

/** Um FY por ano fiscal (último dtFim; maior versão), em ordem crescente. Pura. */
export function umPeriodoPorAno<T extends { anoFiscal: number; dtFim: string; versao?: number }>(
  linhas: readonly T[],
): T[] {
  const por = new Map<number, T>();
  for (const l of linhas) {
    const atual = por.get(l.anoFiscal);
    if (
      !atual ||
      l.dtFim > atual.dtFim ||
      (l.dtFim === atual.dtFim && (l.versao ?? 0) > (atual.versao ?? 0))
    ) {
      por.set(l.anoFiscal, l);
    }
  }
  return [...por.values()].sort((a, b) => a.anoFiscal - b.anoFiscal);
}

/** FYs SEC de um emissor ('CIK:…'), um por ano. */
export async function lerPeriodosSec(emissorId: string): Promise<PeriodoSec[]> {
  const linhas = await prisma.assetFundamentalsPeriod.findMany({
    where: { emissorId, source: FONTE_PERIODO_SEC, tipoPeriodo: 'FY' },
    orderBy: [{ dtFim: 'asc' }, { versao: 'asc' }],
  });
  return umPeriodoPorAno(linhas.map((l) => ({ ...periodoSecDaLinha(l), versao: l.versao }))).map(
    ({ versao: _v, ...p }) => p,
  );
}

/** Métricas de um FY (US$ — valores absolutos em US$, não em bi). Pura. */
export interface ValoresAnoSec {
  receita: number | null;
  ebitda: number | null;
  lucro: number | null;
  margemPct: number | null;
  dividaLiquida: number | null;
  divLiqEbitda: number | null;
  fcl: number | null;
  fclCapex: number | null;
  roePct: number | null;
  lpa: number | null;
  dpa: number | null;
  payoutPct: number | null;
  fco: number | null;
  fcoAcao: number | null;
  divFcoPct: number | null;
}

export function valoresAnoSec(p: PeriodoSec): ValoresAnoSec {
  // mesmas regras do criterios-eua (seriesStock): D&A ausente = sem EBITDA; sem caixa ou sem
  // dívida no relatório (financeiras) = sem dado, nunca 'caixa líquido'
  const ebitda = ebitdaSec(p);
  const dividaLiquida = dividaLiquidaSec(p);
  let divLiqEbitda: number | null = null;
  if (dividaLiquida !== null && ebitda !== null) {
    divLiqEbitda = ebitda > 0 ? dividaLiquida / ebitda : null;
  }
  const fcl = finito(p.fco) && finito(p.capex) ? p.fco - p.capex : null;
  const lucro = p.lucroLiquido;
  const acoes = finito(p.acoesMediaDiluida) && p.acoesMediaDiluida > 0 ? p.acoesMediaDiluida : null;
  return {
    receita: p.receita,
    ebitda,
    lucro,
    margemPct:
      finito(lucro) && finito(p.receita) && p.receita > 0 ? (lucro / p.receita) * 100 : null,
    dividaLiquida,
    divLiqEbitda,
    fcl,
    fclCapex: fcl !== null && finito(p.capex) && p.capex > 0 ? fcl / p.capex : null,
    roePct: finito(lucro) && finito(p.pl) && p.pl > 0 ? (lucro / p.pl) * 100 : null,
    lpa: finito(p.lpaOn) ? p.lpaOn : finito(lucro) && acoes ? lucro / acoes : null,
    dpa: finito(p.dpa) ? p.dpa : null,
    payoutPct:
      finito(p.dividendosPagos) && finito(lucro) && lucro > 0
        ? (p.dividendosPagos / lucro) * 100
        : null,
    fco: p.fco,
    fcoAcao: finito(p.fco) && acoes ? p.fco / acoes : null,
    divFcoPct:
      finito(p.dividendosPagos) && finito(p.fco) && p.fco > 0
        ? (p.dividendosPagos / p.fco) * 100
        : null,
  };
}

// ---------------------------------------------------------------------------
// Essencial EUA
// ---------------------------------------------------------------------------

type CodigoEua = keyof typeof TEXTOS_EUA_TELAS.essencial.colunas;

interface DefColunaEua {
  codigo: CodigoEua;
  formato: FormatoAnalise;
  /** valor exibido a partir das métricas do ano (US$ bi nos absolutos) */
  valor: (v: ValoresAnoSec) => number | null;
}

const BI = 1e9;
const emBi = (v: number | null) => (finito(v) ? v / BI : null);

const COL: Record<CodigoEua, Omit<DefColunaEua, 'codigo'>> = {
  receita: { formato: 'numero', valor: (v) => emBi(v.receita) },
  ebitda: { formato: 'numero', valor: (v) => emBi(v.ebitda) },
  lucro: { formato: 'numero', valor: (v) => emBi(v.lucro) },
  margem: { formato: 'pct', valor: (v) => v.margemPct },
  dividaLiquida: { formato: 'numero', valor: (v) => emBi(v.dividaLiquida) },
  divLiqEbitda: { formato: 'multiplo', valor: (v) => v.divLiqEbitda },
  fclCapex: { formato: 'multiplo', valor: (v) => v.fclCapex },
  roe: { formato: 'pct', valor: (v) => v.roePct },
  lpa: { formato: 'numero2', valor: (v) => v.lpa },
  dpa: { formato: 'numero2', valor: (v) => v.dpa },
  payout: { formato: 'pct', valor: (v) => v.payoutPct },
  fco: { formato: 'numero', valor: (v) => emBi(v.fco) },
  fcoAcao: { formato: 'numero2', valor: (v) => v.fcoAcao },
  divFco: { formato: 'pct', valor: (v) => v.divFcoPct },
};

/** Colunas do Essencial por classe (só as que têm fonte no XBRL). */
export const COLUNAS_ESSENCIAL_EUA: Record<ClasseEua, readonly CodigoEua[]> = {
  stock: [
    'receita',
    'ebitda',
    'lucro',
    'margem',
    'dividaLiquida',
    'divLiqEbitda',
    'fclCapex',
    'roe',
    'lpa',
    'dpa',
    'payout',
  ],
  reit: ['receita', 'lucro', 'fco', 'fcoAcao', 'dpa', 'divFco', 'divLiqEbitda'],
};

/** Valores em bi com menos de 10 (REITs menores) ganham 2 casas. */
function formatoDaColuna(def: DefColunaEua, valores: Array<number | null>): FormatoAnalise {
  if (def.formato !== 'numero') return def.formato;
  const max = Math.max(0, ...valores.filter(finito).map(Math.abs));
  return max < 10 ? 'numero2' : 'numero';
}

const semDado = (): Estado<number> => ({
  estado: 'ausente',
  motivo: 'sem_dado_fonte',
  texto: TEXTOS_TELA.ausentesPorCampo.semDado,
});

/** Anos (FY) com o EBITDA de um degrau de fallback, para a observação do card. */
function anosDoDegrau(periodos: readonly PeriodoSec[], flag: FlagFundamentoSec): number[] {
  return periodos.filter((p) => p.flags.includes(flag)).map((p) => p.anoFiscal);
}

function faixaAnos(anos: readonly number[]): string {
  if (anos.length === 0) return '';
  const ini = anos[0];
  const fim = anos[anos.length - 1];
  return ini === fim ? `${ini}` : `${ini}–FY${fim}`;
}

/** 'set' a partir do MMDD do fim do exercício ('0927'); inválido = null. */
export function mesDoExercicio(mmdd: string | null | undefined): string | null {
  if (!mmdd || !/^\d{4}$/.test(mmdd)) return null;
  return TEXTOS_EUA.exercicio.meses[Number(mmdd.slice(0, 2)) - 1] ?? null;
}

/** Monta o Essencial EUA (pura). `exercicioFimMmdd` = MMDD do fim do FY ('0927'). */
export function montarFundamentosEua(entrada: {
  classe: ClasseEua;
  periodos: readonly PeriodoSec[];
  exercicioFimMmdd: string | null;
}): FundamentosResposta {
  const { classe } = entrada;
  const periodos = entrada.periodos.slice(-MAX_ANOS_ESSENCIAL_EUA);
  const valores = periodos.map(valoresAnoSec);
  const defs = COLUNAS_ESSENCIAL_EUA[classe].map((codigo) => ({ codigo, ...COL[codigo] }));
  const TE = TEXTOS_EUA_TELAS.essencial;
  const colunas: ColunaFundamentos[] = defs.map((d) => ({
    codigo: d.codigo,
    rotulo: TE.colunas[d.codigo],
    formato: formatoDaColuna(
      d,
      valores.map((v) => d.valor(v)),
    ),
    fonteCvmAviso: false,
  }));
  const ultimo = periodos.length ? periodos[periodos.length - 1].anoFiscal : null;
  const linhas: LinhaFundamentos[] = periodos.map((p, i) => {
    const v = valores[i];
    const out: Record<string, Estado<number>> = {};
    for (const d of defs) {
      const x = d.valor(v);
      out[d.codigo] = finito(x) ? { estado: 'ok', valor: x } : semDado();
    }
    return {
      rotulo: `FY${p.anoFiscal}`,
      ano: p.anoFiscal,
      ultimoAno: p.anoFiscal === ultimo,
      valores: out,
      selos: [],
    };
  });
  const mes = mesDoExercicio(entrada.exercicioFimMmdd);
  const observacoes = [
    mes ? formatarTexto(TE.unidade, { mes }) : TE.unidadeSemMes,
    classe === 'stock' ? TE.notaStock : TE.notaReit,
  ];
  // término em jan/fev conta como o ano anterior (anoFiscalDoTermino): explica a diferença para o
  // 'Fiscal AAAA' do 10-K (NVDA FY2025 = exercício encerrado em jan/2026 = Fiscal 2026)
  const ultimoPeriodo = periodos[periodos.length - 1];
  const mesFim = ultimoPeriodo ? Number(ultimoPeriodo.dtFim.slice(5, 7)) : 0;
  const anoFim = ultimoPeriodo ? Number(ultimoPeriodo.dtFim.slice(0, 4)) : 0;
  if (ultimoPeriodo && mesFim <= 2 && anoFim > ultimoPeriodo.anoFiscal) {
    observacoes.push(
      formatarTexto(TE.anoFiscalAnterior, {
        ano: ultimoPeriodo.anoFiscal,
        mes: TEXTOS_EUA.exercicio.meses[mesFim - 1],
        anoSeguinte: anoFim,
      }),
    );
  }
  const degraus: Array<[FlagFundamentoSec, string]> = [
    ['ebitda_pre_ir', TEXTOS_EUA.ebitda.degrauPreIr],
    ['ebitda_lucro', TEXTOS_EUA.ebitda.degrauLucro],
  ];
  for (const [flag, texto] of degraus) {
    const anos = anosDoDegrau(periodos, flag);
    if (anos.length > 0) {
      observacoes.push(formatarTexto(texto, { anos: `FY${faixaAnos(anos)}` }));
    }
  }
  if (classe === 'reit') observacoes.push(TEXTOS_EUA.colunasPendentes.observacao);
  return {
    nivel: 'essencial',
    unidade: 'US$ bi',
    fonte: 'SEC',
    padraoContabil: 'US GAAP',
    escopo: null,
    variante: classe,
    colunas,
    linhas,
    observacoes,
    textoFonte: TEXTOS_EUA.fonte.card,
    ...(classe === 'reit' ? { colunasPendentes: [...COLUNAS_PENDENTES_EUA] } : {}),
  };
}

const cache = getTtlCache<FundamentosResposta>('analiseAtivosFundamentosEua');

/** Leitura do Essencial EUA; null = ticker fora da área EUA (a rota responde 404). */
export async function obterFundamentosEssencialEua(
  ticker: string,
): Promise<{ dados: FundamentosResposta; cache: boolean } | null> {
  const symbol = ticker.toUpperCase();
  const linha = await obterLinhaQuadro(symbol);
  if (!linha || !ehClasseEua(linha.classe)) return null;
  const versao = await versaoQuadro();
  const chave = `${symbol}:${versao}`;
  const emCache = cache.get(chave);
  if (emCache) return { dados: emCache, cache: true };
  const cik = linha.cnpj.replace(/^CIK:/, '');
  const [periodos, empresa] = await Promise.all([
    lerPeriodosSec(linha.cnpj),
    prisma.secCompany.findUnique({ where: { cik }, select: { exercicioFimMmdd: true } }),
  ]);
  const dados = montarFundamentosEua({
    classe: linha.classe,
    periodos,
    exercicioFimMmdd: empresa?.exercicioFimMmdd ?? null,
  });
  cache.set(chave, dados, TTL_MS);
  return { dados, cache: false };
}
