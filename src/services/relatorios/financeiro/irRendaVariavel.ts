/**
 * IR mensal de ações e FIIs da seção 4b (Advanced) do Relatório financeiro.
 *
 * A apuração é a MESMA da aba Análises > IR (rota api/analises/ir-mensal e Agenda):
 * carregarApuracaoRendaVariavel → apurarRendaVariavel (preço médio, isenção de R$ 20 mil em
 * vendas de ações, 15% ações/ETF, 20% FII, prejuízo compensado por pool). Aqui só:
 *  - agrupa ações + ETFs (mesma alíquota e mesmo pool de prejuízo) na coluna das ações;
 *  - aplica a regra de pagamento do DARF: imposto abaixo de R$ 10 não é recolhido e soma ao do
 *    mês seguinte, até a soma chegar a R$ 10 (corre todo o histórico, não só o período);
 *  - devolve um item por mês do período, com os meses sem venda zerados.
 *
 * Só leitura (uma consulta de StockTransaction do usuário). Memo por entrada de cache dos
 * insumos: os períodos 1/3/6/12 de uma mesma carga reaproveitam a apuração.
 */
import { carregarApuracaoRendaVariavel } from '@/services/ir/rendaVariavelLoader';
import type { ApuracaoResult, MonthlyCategoryResult } from '@/services/ir/rendaVariavelIR';
import type {
  BlocoIrRendaVariavelRelatorio,
  MesIrRendaVariavelRelatorio,
} from '@/types/relatorioFinanceiroIrRendaVariavel';
import type { ContextoMontador, Insumos } from './insumos';

/** Abaixo disso o DARF não é recolhido: soma ao do mês seguinte. */
export const DARF_MINIMO = 10;

const round2 = (v: number) => Math.round(v * 100) / 100;

const valor = (r: MonthlyCategoryResult | undefined, campo: keyof MonthlyCategoryResult) =>
  r ? Number(r[campo]) || 0 : 0;

function mesVazio(mes: string, acumuladoAnterior: number): MesIrRendaVariavelRelatorio {
  return {
    mes,
    vendasAcoes: 0,
    vendasEtf: 0,
    isentoAcoes: false,
    lucroAcoes: 0,
    prejuizoCompensadoAcoes: 0,
    irAcoes: 0,
    vendasFii: 0,
    lucroFii: 0,
    prejuizoCompensadoFii: 0,
    irFii: 0,
    irMes: 0,
    acumuladoAnterior,
    darf:
      acumuladoAnterior > 0
        ? { status: 'acumula', valor: acumuladoAnterior }
        : { status: 'sem', valor: 0 },
  };
}

/**
 * Bloco do período (puro) a partir da apuração completa do usuário. `meses` = os 'YYYY-MM' do
 * período, do mais antigo ao corrente.
 */
export function irRendaVariavelDoPeriodo(
  apuracao: ApuracaoResult,
  meses: string[],
): BlocoIrRendaVariavelRelatorio {
  const ultimoMes = meses[meses.length - 1];
  const porMes = new Map<string, MesIrRendaVariavelRelatorio>();
  // Acumulado < R$ 10 que passa adiante; corre a apuração inteira em ordem cronológica.
  let acumulado = 0;
  let acumuladoAntesDoPeriodo = 0;

  for (const m of apuracao.meses) {
    if (ultimoMes && m.yearMonth > ultimoMes) break;
    if (m.yearMonth < meses[0]) {
      // Antes do período: só corre a regra do DARF mínimo.
      const total = round2(m.irTotalDevido + acumulado);
      acumulado = total >= DARF_MINIMO ? 0 : total;
      acumuladoAntesDoPeriodo = acumulado;
      continue;
    }
    const acao = m.porCategoria.acao_br;
    const etf = m.porCategoria.etf_br;
    const fii = m.porCategoria.fii;
    const irAcoes = round2(valor(acao, 'irDevido') + valor(etf, 'irDevido'));
    const irFii = round2(valor(fii, 'irDevido'));
    const irMes = round2(irAcoes + irFii);
    const acumuladoAnterior = acumulado;
    const total = round2(irMes + acumuladoAnterior);

    let darf: MesIrRendaVariavelRelatorio['darf'];
    if (total >= DARF_MINIMO) {
      darf = { status: 'pagar', valor: total };
      acumulado = 0;
    } else if (total > 0) {
      darf = { status: 'acumula', valor: total };
      acumulado = total;
    } else {
      darf = { status: 'sem', valor: 0 };
    }

    porMes.set(m.yearMonth, {
      mes: m.yearMonth,
      vendasAcoes: round2(valor(acao, 'vendasTotal')),
      vendasEtf: round2(valor(etf, 'vendasTotal')),
      isentoAcoes: acao?.isento ?? false,
      lucroAcoes: round2(valor(acao, 'lucroBruto') + valor(etf, 'lucroBruto')),
      prejuizoCompensadoAcoes: round2(
        valor(acao, 'prejuizoCompensado') + valor(etf, 'prejuizoCompensado'),
      ),
      irAcoes,
      vendasFii: round2(valor(fii, 'vendasTotal')),
      lucroFii: round2(valor(fii, 'lucroBruto')),
      prejuizoCompensadoFii: round2(valor(fii, 'prejuizoCompensado')),
      irFii,
      irMes,
      acumuladoAnterior,
      darf,
    });
  }

  // Mês do período sem venda: zerado, levando o acumulado (< R$ 10) que vem de antes.
  let carregado = acumuladoAntesDoPeriodo;
  const saida = meses.map((mes) => {
    const item = porMes.get(mes) ?? mesVazio(mes, carregado);
    carregado = item.darf.status === 'acumula' ? item.darf.valor : 0;
    return item;
  });
  return { meses: saida };
}

const carregando = new WeakMap<Insumos, Promise<ApuracaoResult>>();

/** Apuração de renda variável do usuário (memo por insumos; falha não fica presa). */
function apuracaoDosInsumos(ctx: ContextoMontador): Promise<ApuracaoResult> {
  let p = carregando.get(ctx.insumos);
  if (!p) {
    p = carregarApuracaoRendaVariavel(ctx.userId).catch((erro: unknown) => {
      carregando.delete(ctx.insumos);
      throw erro;
    });
    carregando.set(ctx.insumos, p);
  }
  return p;
}

/**
 * IR mensal de ações e FIIs do período do relatório. Uma falha na apuração não derruba a 4b
 * inteira: vem null (o front avisa que não pôde ser carregado) e fica no log.
 */
export async function montarIrRendaVariavel(
  ctx: ContextoMontador,
): Promise<BlocoIrRendaVariavelRelatorio | null> {
  try {
    const apuracao = await apuracaoDosInsumos(ctx);
    return irRendaVariavelDoPeriodo(apuracao, ctx.mesesDoPeriodo);
  } catch (erro: unknown) {
    console.error(
      JSON.stringify({
        evento: 'relatorio-financeiro-ir-rv-erro',
        erro: erro instanceof Error ? erro.message : String(erro),
      }),
    );
    return null;
  }
}
