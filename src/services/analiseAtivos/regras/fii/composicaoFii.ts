/**
 * Composição do FII sobre o ATIVO TOTAL (A6, item 2; fatia A). Função PURA sobre a linha do
 * último informe mensal (fii_monthly, gravada pelo fii-mensal; nenhuma coluna nova obrigatória).
 *
 * - 6 fatias em ordem fixa: Imóveis (inclui SPE) · CRI/CRA · LCI/LCA/LH/LIG · Cotas de FII · Caixa e
 *   renda fixa · Outros. Zero aparece como 0 (as mesmas fatias em todos os FIIs).
 * - Nulo com o ativo/passivo presente conta como 0 (o informe deixa a célula vazia quando não há).
 * - Outros = ativo total − soma das fatias (ações, debêntures, valores a receber e demais). Resíduo
 *   negativo além da tolerância de arredondamento ⇒ 'composição inconsistente no informe' (sem
 *   dado, nunca normaliza).
 * - Com valoresReceber preenchido (fii-mensal da fatia E), 'Outros' se divide em 'Aluguéis e valores
 *   a receber' + 'Outros investimentos'. valoresReceber maior que o resíduo (além da tolerância) ⇒
 *   fica o 'Outros' sem divisão (não inventa a parte negativa).
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

/** Resíduo negativo até 0,5% do ativo é arredondamento do informe (vira 0). */
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
    ['lci_lca', v0(e.lciLca)],
    ['cotas_fii', v0(e.cotasFii)],
    ['caixa_renda_fixa', v0(e.rendaFixa)],
  ];
  if (base.some(([, v]) => v < -tol)) return ausente('composicao_inconsistente');
  const soma = base.reduce((a, [, v]) => a + v, 0);
  let resto = ativo - soma;
  if (resto < -tol) return ausente('composicao_inconsistente');
  resto = Math.max(0, resto);

  const receber = e.valoresReceber;
  const detalhar = finito(receber) && receber >= 0 && receber <= resto + tol;
  const ultimas: Array<[CodigoFatiaComposicao, number]> = detalhar
    ? [
        ['alugueis_receber', Math.min(receber, resto)],
        ['outros_investimentos', Math.max(0, resto - receber)],
      ]
    : [['outros', resto]];

  // a fatia de resíduo fecha 100%: os percentuais somam o ativo total
  const fatias: FatiaComposicaoFiiApi[] = [...base, ...ultimas].map(([codigo, valor]) => ({
    codigo,
    valor: Math.round(Math.max(0, valor) * 100) / 100,
    pct: Math.round((Math.max(0, valor) / ativo) * 100 * 1e4) / 1e4,
  }));
  return {
    estado: 'ok',
    valor: {
      refMonth: e.refMonth,
      ativoTotal: Math.round(ativo * 100) / 100,
      fatias,
      outrosDetalhado: detalhar,
    },
  };
}
