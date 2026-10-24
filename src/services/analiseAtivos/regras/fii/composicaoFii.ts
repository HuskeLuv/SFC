/**
 * Composição do FII (A6, item 2; fatia A), igual ao Fundamentei (regra de 24/10/2026). Função PURA
 * sobre a linha do último informe mensal (fii_monthly, gravada pelo fii-mensal).
 *
 * - 4 fatias em ordem fixa: Imóveis (Direitos_Bens_Imoveis + sociedades/SPE) · Papéis (CRI/CRA) ·
 *   Fundos (cotas de FII) · Caixa e renda fixa (Total_Necessidades_Liquidez). Zero aparece como 0.
 * - Base = soma das 4 fatias, não o ativo total: aluguéis/valores a receber, LCI/LCA, ações e demais
 *   ativos ficam fora (como o Fundamentei).
 * - Nulo com o ativo/passivo presente conta como 0 (o informe deixa a célula vazia quando não há).
 * - Fatia negativa além da tolerância de arredondamento, ou base zero ⇒ 'composição inconsistente
 *   no informe' (sem dado, nunca normaliza).
 */
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import type { Estado } from '@/types/analiseAtivosApi';
import type {
  CodigoFatiaComposicao,
  ComposicaoFiiApi,
  FatiaComposicaoFiiApi,
  MotivoComposicaoFii,
} from '@/types/analiseAtivosComplementos';

/** Colunas de fii_monthly usadas (R$; Decimal já em number). */
export interface EntradaComposicaoFii {
  /** 1º dia do mês (AAAA-MM-DD) */
  refMonth: string;
  ativoTotal: number | null;
  imoveis: number | null;
  spe: number | null;
  cri: number | null;
  lciLca: number | null;
  cotasFii: number | null;
  rendaFixa: number | null;
  acoes: number | null;
  valoresReceber?: number | null;
}

/** Fatia negativa até 0,5% do ativo é arredondamento do informe (vira 0). */
export const TOLERANCIA_RESIDUO_PCT = 0.5;

const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);
const v0 = (n: number | null | undefined): number => (finito(n) ? n : 0);

/** true quando a linha traz a composição (alguma coluna do ativo/passivo preenchida). */
export function temComposicao(e: EntradaComposicaoFii): boolean {
  return [e.imoveis, e.spe, e.cri, e.lciLca, e.cotasFii, e.rendaFixa, e.acoes].some(finito);
}

function ausente(motivo: MotivoComposicaoFii): Estado<ComposicaoFiiApi> {
  return { estado: 'ausente', motivo, texto: TEXTOS_IMOVEIS_FII.motivos[motivo] };
}

export function montarComposicaoFii(e: EntradaComposicaoFii | null): Estado<ComposicaoFiiApi> {
  if (!e || !finito(e.ativoTotal) || e.ativoTotal <= 0 || !temComposicao(e)) {
    return ausente('sem_informe_mensal');
  }
  const ativo = e.ativoTotal;
  const tol = (ativo * TOLERANCIA_RESIDUO_PCT) / 100;
  const base: Array<[CodigoFatiaComposicao, number]> = [
    ['imoveis', v0(e.imoveis) + v0(e.spe)],
    ['cri_cra', v0(e.cri)],
    ['cotas_fii', v0(e.cotasFii)],
    ['caixa_renda_fixa', v0(e.rendaFixa)],
  ];
  if (base.some(([, v]) => v < -tol)) return ausente('composicao_inconsistente');
  const soma = base.reduce((a, [, v]) => a + Math.max(0, v), 0);
  if (soma <= 0) return ausente('composicao_inconsistente');

  const fatias: FatiaComposicaoFiiApi[] = base.map(([codigo, valor]) => ({
    codigo,
    valor: Math.round(Math.max(0, valor) * 100) / 100,
    pct: Math.round((Math.max(0, valor) / soma) * 100 * 1e4) / 1e4,
  }));
  return {
    estado: 'ok',
    valor: {
      refMonth: e.refMonth,
      ativoTotal: Math.round(ativo * 100) / 100,
      base: Math.round(soma * 100) / 100,
      fatias,
    },
  };
}
