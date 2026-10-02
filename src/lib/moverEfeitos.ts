/**
 * Efeitos de mover um item entre Reservas e Renda Fixa (mover fase 2, out/2026)
 * — o que a confirmação mostra ANTES de gravar. Puro: roda no cliente (Fatia D:
 * ConfirmarMoverCard / EfeitosMoverList) e nos testes.
 *
 * Marcadores (protótipo docs/carteira-mover/fase2-prototipo.html):
 *   'S' Saúde Financeira — prévia numérica antes → depois da reserva de
 *       emergência e o necessário (decisão 3). Sem dado da Saúde (carregando ou
 *       erro) → frase fixa AVISO_SAUDE_RESERVA;
 *   '!' Liquidez — título sem liquidez diária e vencimento além de 360 dias
 *       entrando na Reserva de Emergência (aviso, não bloqueio);
 *   'A' Alocação — meta da classe que o valor deixa e passa a contar
 *       (Emergência em R$, as outras em %);
 *   'F' Fluxo de Caixa — linha do Aporte/Resgate;
 *   '§' Seção automática na Renda Fixa;
 *   '=' O que não muda (valor, curva, vencimento, liquidez, IR e rentabilidade).
 *
 * Os números da Saúde vêm do cliente: reservaAtual = composição/porCategoria
 * .reservaEmergencia de useSaudeFinanceira(); necessario =
 * indicadores.benchmarks.reservaEmergencia.necessario; valorItem =
 * MoverOpcoesResponse.item.valorAtualBRL (valuatePortfolioItem, o mesmo da pizza).
 */
import {
  AVISO_OBJETIVO_ZERA,
  AVISO_SAUDE_RESERVA,
  envolveReservaEmergencia,
  isCategoriaCaixaRf,
  LIQUIDEZ_CONTA_INTEIRO,
  rotuloCategoria,
  type CategoriaCaixaRf,
  type CategoriaMovivel,
} from '@/lib/carteiraMover';
import { ROTULO_SECAO_RENDA_FIXA } from '@/lib/rendaFixaSecao';
import type { TipoRendaFixa } from '@/types/rendaFixa';

export type MarcadorEfeito = 'S' | '!' | 'A' | 'F' | '§' | '=';

export interface Efeito {
  marcador: MarcadorEfeito;
  texto: string;
  /** Linha de alerta (liquidez) — vermelho #D92D20/#F97066 na UI. */
  alerta?: boolean;
  /** Linha "não muda" (texto neutro). */
  igual?: boolean;
}

export interface SaudePrevia {
  /** Reserva de emergência atual (R$) na Saúde Financeira. */
  reservaAtual: number;
  /** Necessário (gasto mensal × multiplicador); null = sem gasto para calcular. */
  necessario: number | null;
}

export interface CalcularEfeitosInput {
  origem: CategoriaMovivel;
  destino: CategoriaMovivel;
  /** Valor atual do item em BRL (MoverOpcoesResponse.item.valorAtualBRL). */
  valorItem: number;
  /** null/undefined = Saúde carregando ou com erro → frase fixa. */
  saude?: SaudePrevia | null;
  /** Objetivo (%) da posição; ≠ 0 → ele volta a 0 na aba nova (como na fase 1). */
  objetivoPosicao?: number;
  /** Metas da Alocação por aba: Emergência em R$, as outras em % da carteira. */
  objetivoClasse?: Partial<Record<CategoriaCaixaRf, number>>;
  /** Seção que o item terá na RF (destino Renda Fixa). */
  secao?: { id: TipoRendaFixa; via: 'indexador' | 'titulo'; titulo?: string | null } | null;
  /** Liquidez do título quando vai para a Emergência e precisaAvisoLiquidez deu true. */
  liquidez?: { noVencimento?: boolean; vencimento?: string | null } | null;
  /** Saldo em conta (sem título): o "não muda" fala do saldo. */
  semTitulo?: boolean;
}

const brl = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const pct = (v: number): string =>
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v)}%`;

/** Linha do Aporte/Resgate no Fluxo de Caixa (cashflow/investimentos). */
export const LINHA_FLUXO_CAIXA_RF: Record<CategoriaCaixaRf, string> = {
  reservaEmergencia: 'Reserva Emergência',
  reservaOportunidade: 'Reserva Oportunidade',
  rendaFixaFundos: 'Renda Fixa & Fundos Renda Fixa',
};

export const ALERTA_RESERVA_ABAIXO = 'Reserva de emergência abaixo do necessário';

const textoMeta = (cat: CategoriaCaixaRf, metas: CalcularEfeitosInput['objetivoClasse']) => {
  const meta = metas?.[cat];
  const aba = rotuloCategoria(cat);
  if (meta == null) return `meta de ${aba}`;
  return cat === 'reservaEmergencia'
    ? `meta de ${brl(meta)} (em reais) de ${aba}`
    : `meta de ${pct(meta)} da carteira de ${aba}`;
};

/** Linha 'S': prévia numérica da Saúde; sem dado → frase fixa. */
export const efeitoSaude = (input: CalcularEfeitosInput): Efeito | null => {
  const { origem, destino, valorItem, saude } = input;
  if (!envolveReservaEmergencia(origem, destino)) return null;
  if (!saude || !Number.isFinite(saude.reservaAtual) || !Number.isFinite(valorItem)) {
    return { marcador: 'S', texto: `Saúde Financeira: ${AVISO_SAUDE_RESERVA}.` };
  }
  const antes = saude.reservaAtual;
  const depois =
    destino === 'reservaEmergencia' ? antes + valorItem : Math.max(0, antes - valorItem);
  let texto = `Saúde Financeira: reserva de emergência ${brl(antes)} → ${brl(depois)}`;
  const nec = saude.necessario;
  if (nec != null && Number.isFinite(nec) && nec > 0) {
    texto += ` (necessário ${brl(nec)})`;
    if (antes < nec && depois >= nec)
      texto += ` · o alerta “${ALERTA_RESERVA_ABAIXO}” deixa de aparecer`;
    else if (antes >= nec && depois < nec) {
      texto += ` · o alerta “${ALERTA_RESERVA_ABAIXO}” passa a aparecer`;
    }
  }
  return { marcador: 'S', texto: `${texto}.` };
};

/**
 * Efeitos da troca de aba no trio Reservas + Renda Fixa. Fora do trio (fase 1)
 * ou sem troca de aba → lista vazia (a confirmação da fase 1 não muda).
 */
export const calcularEfeitosMover = (input: CalcularEfeitosInput): Efeito[] => {
  const { origem, destino } = input;
  if (origem === destino || !isCategoriaCaixaRf(origem) || !isCategoriaCaixaRf(destino)) {
    return [];
  }
  const out: Efeito[] = [];

  const saude = efeitoSaude(input);
  if (saude) out.push(saude);

  if (destino === 'reservaEmergencia' && input.liquidez) {
    const { noVencimento, vencimento } = input.liquidez;
    const oque = noVencimento ? 'resgate só no vencimento' : 'sem liquidez diária';
    const quando = vencimento ? ` (vence ${vencimento})` : '';
    out.push({
      marcador: '!',
      alerta: true,
      texto: `Liquidez: ${oque}${quando}. ${LIQUIDEZ_CONTA_INTEIRO}.`,
    });
  }

  let alocacao = `Alocação: o valor sai da ${textoMeta(origem, input.objetivoClasse)} e passa a contar na ${textoMeta(destino, input.objetivoClasse)}.`;
  if (input.objetivoPosicao != null && input.objetivoPosicao !== 0) {
    alocacao += ` ${AVISO_OBJETIVO_ZERA}.`;
  }
  out.push({ marcador: 'A', texto: alocacao });

  out.push({
    marcador: 'F',
    texto: `Fluxo de Caixa: aportes e resgates passam da linha “${LINHA_FLUXO_CAIXA_RF[origem]}” para “${LINHA_FLUXO_CAIXA_RF[destino]}”, em todos os meses.`,
  });

  if (destino === 'rendaFixaFundos' && input.secao) {
    const via =
      input.secao.via === 'titulo'
        ? `pelo tipo do título${input.secao.titulo ? ` (${input.secao.titulo})` : ''}`
        : 'pelo indexador';
    out.push({
      marcador: '§',
      texto: `Seção: entra em ${ROTULO_SECAO_RENDA_FIXA[input.secao.id]}, ${via}. Na Renda Fixa a seção não é escolhida à mão.`,
    });
  }

  out.push({
    marcador: '=',
    igual: true,
    texto: input.semTitulo
      ? 'Não muda: valor e rendimento do saldo.'
      : 'Não muda: valor, curva, vencimento, liquidez, IR e rentabilidade do título.',
  });
  return out;
};
