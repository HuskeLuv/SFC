/**
 * Liquidez pelo COTAHIST (regra 29 + decisões 14 e 15) — função pura.
 *
 * - Volume médio = média do VOLTOT nos últimos `sanidade.b3.liquidezPregoes` (21) pregões do
 *   CALENDÁRIO (não do ativo): pregão sem negócio conta 0.
 * - Baixa liquidez = menos de `baixaLiquidezMinPregoes` (15) pregões com negócio nessa janela.
 * - Negociado nos últimos 30 = teve negócio em algum dos últimos `universo.fiiQuadroPregoes` (30)
 *   pregões (universo do Quadro de FIIs, decisão 14).
 *
 * `calendario` = pregões B3 em ordem crescente (regras/comum/pregoes.pregoesEntre), terminando no
 * pregão de referência. Linhas fora do calendário (fim de semana, data futura) são ignoradas.
 */
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

export interface ResultadoLiquidez {
  volumeMedio21: number;
  pregoesComNegocio21: number;
  baixaLiquidez: boolean;
  negociadoUltimos30: boolean;
}

export function liquidez(
  serie: Array<{ date: string; volumeFin: number }>,
  calendario: string[],
  p: ScoringParams,
): ResultadoLiquidez {
  const nLiq = p.sanidade.b3.liquidezPregoes;
  const nUniverso = p.universo.fiiQuadroPregoes;
  const janelaLiq = calendario.slice(-nLiq);
  const janelaUniverso = new Set(calendario.slice(-nUniverso));

  const volumePorDia = new Map<string, number>();
  for (const l of serie) {
    if (!Number.isFinite(l.volumeFin) || l.volumeFin <= 0) continue;
    volumePorDia.set(l.date, (volumePorDia.get(l.date) ?? 0) + l.volumeFin);
  }

  let soma = 0;
  let comNegocio = 0;
  for (const d of janelaLiq) {
    const v = volumePorDia.get(d);
    if (v !== undefined) {
      soma += v;
      comNegocio++;
    }
  }
  let negociadoUltimos30 = false;
  for (const d of volumePorDia.keys()) {
    if (janelaUniverso.has(d)) {
      negociadoUltimos30 = true;
      break;
    }
  }

  return {
    volumeMedio21: janelaLiq.length > 0 ? soma / janelaLiq.length : 0,
    pregoesComNegocio21: comNegocio,
    baixaLiquidez: comNegocio < p.sanidade.b3.baixaLiquidezMinPregoes,
    negociadoUltimos30,
  };
}
