/**
 * Templates de banco e seguradora do Fundamentos (A6, itens 3 e 4; fatia B) — funções PURAS, sem I/O
 * e sem texto (os rótulos e motivos ficam em textosFinanceiras/textosRaioX). Consumidas pelo
 * Essencial (leitura/ativo/fundamentosEssencial.ts) e, pela regra de ouro, pelo Raio-X.
 *
 * Qual template: segmento B3 'Bancos' ⇒ 'banco'; 'Seguradoras'/'Resseguradoras' ⇒ 'seguradora'
 * (BBSE3, CXSE3, PSSA3, IRBR3); o resto (inclusive holdings financeiras como ITSA4) fica no
 * template de hoje.
 *
 * Banco (por período): receita de intermediação = DRE 3.01 (receita); PDD em valor absoluto =
 * −pdd (DVA 7.01.03 publicada negativa como despesa); margem bancária = lucro ÷ receita de
 * intermediação; PDD ÷ lucro (×) só com lucro > 0; PL ÷ ativo. Sem DVA de instituição financeira
 * (RPAD, BRBI, BSLI) a PDD fica sem dado com o motivo 'sem_dva'.
 *
 * Seguradora (por período): a receita operacional é a de seguro/resseguro na OPERACIONAL — prêmios
 * ganhos até 2022, receita de seguro (IFRS 17) desde ANO_IFRS17 — e comissões + serviços na HOLDING
 * (BBSE3, CXSE3: sem receita de seguro própria). Equivalência patrimonial só na holding (na
 * operacional, 'não se aplica ao modelo de negócio'). Sinistralidade = sinistros retidos ÷ prêmios
 * ganhos só até 2022; despesa ÷ receita de seguro (IFRS 17) só desde 2023; no outro regime, o motivo
 * 'ifrs17'; na holding, 'holding_sem_operacao'. Margem = lucro ÷ receita operacional; na holding o
 * lucro supera a receita (equivalência) e a razão fica sem leitura.
 */
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';
import {
  ANO_IFRS17,
  type OrigemReceitaSeguradora,
  type TemplateFinanceira,
} from '@/types/analiseAtivosComplementos';

/** Segmentos B3 do template 'seguradora' (os bancos vêm de params.financeiras.segmentosBanco). */
export const SEGMENTOS_SEGURADORA: readonly string[] = ['Seguradoras', 'Resseguradoras'];

/** Motivos de célula sem número dos templates (texto em TEXTOS_FINANCEIRAS.*.motivos). */
export type MotivoTemplate =
  | 'sem_dado'
  | 'sem_dva'
  | 'lucro_nao_positivo'
  | 'ifrs17'
  | 'equivalencia_nao_se_aplica'
  | 'holding_sem_operacao'
  | 'margem_sem_leitura';

/** Número ou o motivo de não haver número. */
export type ValorTemplate = { valor: number } | { motivo: MotivoTemplate };

const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

export const v = (
  n: number | null | undefined,
  motivo: MotivoTemplate = 'sem_dado',
): ValorTemplate => (finito(n) ? { valor: n } : { motivo });

export function templateDoEmissor(e: {
  ehBanco: boolean;
  segmento: string | null;
}): TemplateFinanceira | null {
  if (e.ehBanco) return 'banco';
  if (e.segmento && SEGMENTOS_SEGURADORA.includes(e.segmento)) return 'seguradora';
  return null;
}

/** PL usado nos templates: o da controladora quando há, senão o total (como no Raio-X). */
export function patrimonioDe(f: Pick<FundamentosPeriodo, 'pl' | 'plControladora'>): number | null {
  return finito(f.plControladora) ? f.plControladora : finito(f.pl) ? f.pl : null;
}

// ---------------------------------------------------------------- banco

export interface ValoresBanco {
  receitaIntermediacao: ValorTemplate;
  /** valor absoluto (despesa de provisão positiva; reversão líquida sai negativa) */
  pdd: ValorTemplate;
  margemBancariaPct: ValorTemplate;
  /** PDD ÷ lucro (×) */
  pddLucro: ValorTemplate;
  ativoTotal: ValorTemplate;
  patrimonio: ValorTemplate;
  plAtivoPct: ValorTemplate;
  divJcp: ValorTemplate;
}

/** Valores de banco de um período; `lucro` = o mesmo lucro (R$) da célula de lucro da tela. */
export function valoresBanco(f: FundamentosPeriodo, lucro: number | null): ValoresBanco {
  const receita = finito(f.receita) ? f.receita : null;
  const pdd = finito(f.pdd) ? -f.pdd : null;
  const pl = patrimonioDe(f);
  let pddLucro: ValorTemplate;
  if (pdd === null) pddLucro = { motivo: 'sem_dva' };
  else if (!finito(lucro)) pddLucro = { motivo: 'sem_dado' };
  else if (lucro <= 0) pddLucro = { motivo: 'lucro_nao_positivo' };
  else pddLucro = { valor: pdd / lucro };
  return {
    receitaIntermediacao: receita !== null && receita > 0 ? { valor: receita } : v(null),
    pdd: v(pdd, 'sem_dva'),
    margemBancariaPct:
      receita !== null && receita > 0 && finito(lucro)
        ? { valor: (lucro / receita) * 100 }
        : v(null),
    pddLucro,
    ativoTotal: v(f.ativoTotal),
    patrimonio: v(pl),
    plAtivoPct:
      pl !== null && finito(f.ativoTotal) && f.ativoTotal > 0
        ? { valor: (pl / f.ativoTotal) * 100 }
        : v(null),
    divJcp: v(f.dividendosJcpPagos),
  };
}

// ---------------------------------------------------------------- seguradora

/** Holding de seguros: sem receita de seguro/prêmios próprios e com comissões + serviços. */
export function ehHoldingSeguradora(
  f: Pick<FundamentosPeriodo, 'receitaSeguro' | 'premiosGanhos' | 'receitaComissoesServicos'>,
): boolean {
  const seguro = finito(f.receitaSeguro) && f.receitaSeguro > 0;
  const premios = finito(f.premiosGanhos) && f.premiosGanhos > 0;
  return (
    !seguro && !premios && finito(f.receitaComissoesServicos) && f.receitaComissoesServicos > 0
  );
}

/**
 * Holding no emissor: algum período é holding e nenhum tem receita de seguro/prêmios — evita que um
 * ano sem a linha de comissões vire 'operacional'.
 */
export function emissorEhHoldingSeguradora(
  fs: ReadonlyArray<
    Pick<FundamentosPeriodo, 'receitaSeguro' | 'premiosGanhos' | 'receitaComissoesServicos'>
  >,
): boolean {
  const comSeguro = fs.some(
    (f) =>
      (finito(f.receitaSeguro) && f.receitaSeguro > 0) ||
      (finito(f.premiosGanhos) && f.premiosGanhos > 0),
  );
  return !comSeguro && fs.some(ehHoldingSeguradora);
}

/** Qual receita a seguradora usa no ano (null = nenhuma publicada). */
export function origemReceitaSeguradora(
  f: Pick<FundamentosPeriodo, 'receitaSeguro' | 'premiosGanhos' | 'receitaComissoesServicos'>,
  ano: number,
  holding: boolean,
): OrigemReceitaSeguradora | null {
  if (holding) return finito(f.receitaComissoesServicos) ? 'comissoes_servicos' : null;
  const seguro = finito(f.receitaSeguro) && f.receitaSeguro > 0;
  const premios = finito(f.premiosGanhos) && f.premiosGanhos > 0;
  if (ano >= ANO_IFRS17) return seguro ? 'receita_seguro' : premios ? 'premios_ganhos' : null;
  return premios ? 'premios_ganhos' : seguro ? 'receita_seguro' : null;
}

export interface ValoresSeguradora {
  origem: OrigemReceitaSeguradora | null;
  receitaOperacional: ValorTemplate;
  equivalencia: ValorTemplate;
  resultadoFinanceiro: ValorTemplate;
  margemPct: ValorTemplate;
  patrimonio: ValorTemplate;
  divJcp: ValorTemplate;
  sinistralidadePct: ValorTemplate;
  despesaReceitaSeguroPct: ValorTemplate;
}

/**
 * Valores de seguradora de um período. `ano` decide o regime (≤ 2022 sinistralidade; ≥ ANO_IFRS17
 * despesa ÷ receita de seguro); `lucro` = o mesmo lucro (R$) da célula de lucro da tela.
 */
export function valoresSeguradora(
  f: FundamentosPeriodo,
  ano: number,
  lucro: number | null,
  holding: boolean,
): ValoresSeguradora {
  const origem = origemReceitaSeguradora(f, ano, holding);
  const receita =
    origem === 'comissoes_servicos'
      ? (f.receitaComissoesServicos ?? null)
      : origem === 'receita_seguro'
        ? (f.receitaSeguro ?? null)
        : origem === 'premios_ganhos'
          ? (f.premiosGanhos ?? null)
          : null;
  let margemPct: ValorTemplate = v(null);
  if (finito(receita) && receita > 0 && finito(lucro)) {
    margemPct =
      lucro >= receita ? { motivo: 'margem_sem_leitura' } : { valor: (lucro / receita) * 100 };
  }
  const ifrs17 = ano >= ANO_IFRS17;
  let sinistralidadePct: ValorTemplate;
  let despesaReceitaSeguroPct: ValorTemplate;
  if (holding) {
    sinistralidadePct = { motivo: 'holding_sem_operacao' };
    despesaReceitaSeguroPct = { motivo: 'holding_sem_operacao' };
  } else {
    sinistralidadePct = ifrs17
      ? { motivo: 'ifrs17' }
      : finito(f.sinistrosRetidos) && finito(f.premiosGanhos) && f.premiosGanhos > 0
        ? { valor: (Math.abs(f.sinistrosRetidos) / f.premiosGanhos) * 100 }
        : v(null);
    despesaReceitaSeguroPct = !ifrs17
      ? { motivo: 'ifrs17' }
      : finito(f.despesaSeguro) && finito(f.receitaSeguro) && f.receitaSeguro > 0
        ? { valor: (Math.abs(f.despesaSeguro) / f.receitaSeguro) * 100 }
        : v(null);
  }
  return {
    origem,
    receitaOperacional: finito(receita) && receita > 0 ? { valor: receita } : v(null),
    equivalencia: holding ? v(f.equivalenciaPatrimonial) : { motivo: 'equivalencia_nao_se_aplica' },
    resultadoFinanceiro: v(f.resultadoFinanceiro),
    margemPct,
    patrimonio: v(patrimonioDe(f)),
    divJcp: v(f.dividendosJcpPagos),
    sinistralidadePct,
    despesaReceitaSeguroPct,
  };
}
