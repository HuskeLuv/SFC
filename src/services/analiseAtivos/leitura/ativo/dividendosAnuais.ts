/**
 * Bloco de proventos por ano (fatia B). Ações: DPA ajustado à base de hoje (dpaAjHoje); FIIs:
 * rendimento por cota na base de hoje (dpaAjHoje = rendCota ÷ desdobramentos).
 *
 * - Só anos FECHADOS (series.anosFechados; em FII, também o ano com menos de 12 informes): HGLG11
 *   2026 (5,5 de jan–ago) fica fora. O 'últ. 12m' é um ponto separado.
 * - Ano com salto (> 2× o anterior, filtrado por payout > 150% quando há payout —
 *   series.detectarSaltoProvento) ou com flag de proventos em conferência = suspeito: barra
 *   tracejada, selo 'proventos em conferência' e FORA do CAGR (cagrJanela devolve null com motivo
 *   se o extremo for suspeito). WEGE3 2025 (2,45 contra 0,76) é o caso de referência.
 */
import {
  anosFechados,
  cagrJanela,
  detectarSaltoProvento,
  pontoUlt12m,
} from '@/services/analiseAtivos/leitura/ativo/series';
import { TEXTOS_TELA, textoMotivo, textoNaoSeAplica } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, DividendosAtivo, PontoSerieAnual } from '@/types/analiseAtivosApi';

export const ANOS_DIVIDENDOS = 10;

export interface AnoProvento {
  ano: number;
  valor: number | null;
  /** payout do ano (%), quando houver (ações) */
  payoutPct?: number | null;
  flags?: readonly string[];
}

export interface EntradaDividendos {
  classe: ClasseQuadro;
  hoje: string;
  anos: readonly AnoProvento[];
  /** FII: nº de informes mensais por ano (ano com menos de 12 sai) */
  mesesPorAno?: Record<number, number>;
  ult12m: number | null;
  ult12mData: string | null;
  /** linha com proventos em conferência (flags da linha do Quadro) */
  proventosEmConferencia?: boolean;
}

function flagConferencia(flags: readonly string[] | undefined): boolean {
  return !!flags?.some((f) => f === 'provento_suspeito' || f.startsWith('proventos_defasados'));
}

export function montarDividendos(e: EntradaDividendos): DividendosAtivo {
  const fechados = anosFechados(e.anos, e.hoje, {
    mesesPorAno: e.classe === 'fii' ? e.mesesPorAno : undefined,
  }).slice(-ANOS_DIVIDENDOS);

  const payoutPorAno: Record<number, number | null | undefined> = {};
  for (const a of fechados) payoutPorAno[a.ano] = a.payoutPct;
  const base: PontoSerieAnual[] = fechados.map((a) => ({
    ano: a.ano,
    valor: typeof a.valor === 'number' && Number.isFinite(a.valor) ? a.valor : null,
  }));
  const { serie } = detectarSaltoProvento(base, { payoutPorAno });
  const porFlag = new Set(fechados.filter((a) => flagConferencia(a.flags)).map((a) => a.ano));
  const anos = serie.map((p) =>
    porFlag.has(p.ano) && p.valor !== null && !p.suspeito ? { ...p, suspeito: true } : p,
  );

  // decisão 5: ano final em conferência fica fora ⇒ a janela recua até o último ano sem suspeita
  const janela = cagrJanela(anos, 5, { recuarFimEmConferencia: true });
  let cagrMotivo: string | null = null;
  if (janela.pct === null) {
    if (janela.motivo === 'extremo_em_conferencia')
      cagrMotivo = TEXTOS_TELA.ativo.cagrForaConferencia;
    else if (janela.motivo === 'base_nao_positiva')
      cagrMotivo = textoNaoSeAplica('base_nao_positiva');
    else cagrMotivo = textoMotivo('historico_curto');
  }

  const temSuspeito = anos.some((a) => a.suspeito);
  return {
    anos,
    ult12m: pontoUlt12m(e.ult12m, e.ult12mData),
    cagr5aPct: janela.pct,
    cagrAnoInicio: janela.pct === null ? null : janela.anoInicio,
    cagrAnoFim: janela.pct === null ? null : janela.anoFim,
    cagrMotivo,
    selo: temSuspeito || e.proventosEmConferencia ? 'proventos_em_conferencia' : null,
    unidade: e.classe === 'fii' ? 'rendimento' : 'dpa',
  };
}
