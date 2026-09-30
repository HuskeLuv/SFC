/**
 * Mapa de contas CVM → fundamentos de um período (função pura, sem I/O).
 *
 * Entrada: as linhas de UM documento (cnpj, DT_REFER, versão), UM escopo (con|ind) e UM período, já
 * com ORDEM_EXERC = ÚLTIMO e valores em R$ (ESCALA_MOEDA=MIL aplicada; LPA 3.99 fica cru).
 *
 * Contas (layout CVM padrão, ST_CONTA_FIXA):
 *   receita 3.01 · lucroBruto 3.03 · ebit 3.05 (não financeiras) · lucro/controladora: regra 12
 *   D&A: /deprecia|amortiza|exaust/ nas filhas de 6.01.01 (positivo; sem amortização de dívida)
 *   ativoTotal 1 · AC 1.01 · caixa 1.01.01 · aplicações 1.01.02 · PC 2.01
 *   dívida bruta 2.01.04 + 2.02.01 (só se forem "Empréstimos e Financiamentos")
 *   PL = linha de 2º nível /^Patrimônio Líquido/ (2.03; 2.07/2.08 em bancos/seguradoras)
 *   plControladora = PL − filha /Não Controlador/ · FCO 6.01 · FCI 6.02 · FCF 6.03
 *   capex = −Σ 6.02.x /imobilizado|intangível/ (sem vendas/recebimentos; WEG: "Imobilizado") ·
 *   dividendos/JCP pagos = −Σ 6.03.x < 0 /dividend|juros s(obre|/) capital|JCP/
 *   dmplDeclarado (só FY): 5.04.06 + 5.04.07 + demais 5.04–5.06 de 3º nível negativas com
 *     /dividend|JCP/ sem /prescrit|revers|reclassif/, na coluna do PL da controladora (regra do spike:
 *     erro mediano 8,6% contra o FRE 3.5)
 * Layout financeiro (banco/seguradora): EBIT, D&A, AC/PC e dívida bruta ficam null e "não se aplica".
 * Demonstrativo presente sem a linha somada (capex, dividendos pagos, DMPL) = 0 de verdade; demonstrativo
 * ausente = null (ausente).
 */
import { metricasNaoAplicaveis } from '@/services/analiseAtivos/regras/acoes/financeiras';
import { lpaPublicado } from '@/services/analiseAtivos/regras/acoes/lpa';
import {
  compararContas,
  lucroDoPeriodo,
  nivelConta,
} from '@/services/analiseAtivos/regras/acoes/lucroDoPeriodo';
import { periodoFiscal } from '@/services/analiseAtivos/regras/acoes/periodoFiscal';
import { valorOuNull } from '@/services/analiseAtivos/regras/comum/valor';
import type {
  Escopo,
  FundamentosPeriodo,
  PadraoContabil,
  TipoPeriodo,
} from '@/services/analiseAtivos/tipos';

export type Demonstrativo = 'BPA' | 'BPP' | 'DRE' | 'DFC_MI' | 'DMPL';

export interface LinhaDemonstrativo {
  demonstrativo: Demonstrativo;
  cdConta: string;
  dsConta: string;
  /** R$ (escala aplicada); LPA (3.99) em R$/ação cru */
  valor: number;
  contaFixa?: boolean;
  /** só DMPL: coluna do PL ('Patrimônio Líquido', 'Reservas de Lucro'…) */
  colunaDf?: string | null;
}

export interface ContextoExtracao {
  demonstrativos: Set<string>;
  ehFinanceira: boolean;
  tipoPeriodo: TipoPeriodo;
  escopo: Escopo;
  dtIni: string;
  dtFim: string;
  mesFimExercicio: number | null;
}

export type FundamentosExtraidos = Omit<
  FundamentosPeriodo,
  'emissorId' | 'docTipo' | 'versao' | 'dtEntregaOriginal'
> & { codContaLucro: string | null };

const RE_DA = /deprecia|amortiza|exaust/i;
const RE_DA_EXCL = /capta[cç]|custo[s]? de transa|empr[eé]stim|financiament|deb[eê]nture|juros/i;
const RE_CAPEX = /imobilizad|intang[ií]v/i;
const RE_CAPEX_EXCL = /venda|aliena|baixa|recebiment/i;
export const RE_DIVIDENDOS = /dividend|juros (sobre|s\/) ?(o )?capital|\bJCP\b/i;
const RE_DIV_EXCL = /prescrit|revers|revert|reclassif/i;
const RE_PL = /^Patrim[oô]nio L[ií]quido/i;
const RE_NAO_CONTROLADOR = /N[aã]o Controlador/i;
const RE_CAIXA = /^Caixa e Equivalentes/i;
const RE_DIVIDA = /empr[eé]stimo|financiamento/i;
const COLUNA_PL = 'Patrimônio Líquido';

function soma(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}

export function extrairFundamentos(
  linhas: LinhaDemonstrativo[],
  ctx: ContextoExtracao,
): FundamentosExtraidos {
  const por = (d: Demonstrativo) => linhas.filter((l) => l.demonstrativo === d);
  const dre = por('DRE');
  const bpa = por('BPA');
  const bpp = por('BPP');
  const dfc = por('DFC_MI');
  const dmpl = por('DMPL');
  const conta = (ls: LinhaDemonstrativo[], cd: string) => ls.find((l) => l.cdConta === cd) ?? null;
  const valorConta = (ls: LinhaDemonstrativo[], cd: string) => conta(ls, cd)?.valor ?? null;
  const fin = ctx.ehFinanceira;

  // DRE
  const receita = valorConta(dre, '3.01');
  const lucroBruto = valorConta(dre, '3.03');
  const ebit = fin ? null : valorConta(dre, '3.05');
  const lucro = lucroDoPeriodo(dre, { escopo: ctx.escopo });
  const lucroLiquido = valorOuNull(lucro.lucroTotal);
  const lucroAtribuivel = valorOuNull(lucro.lucroAtribuivel);
  const lpa = lpaPublicado(dre);

  // Balanço
  const ativoTotal = valorConta(bpa, '1');
  const ativoCirculante = fin ? null : valorConta(bpa, '1.01');
  const caixa = fin
    ? ([...bpa]
        .sort((a, b) => compararContas(a.cdConta, b.cdConta))
        .find((l) => nivelConta(l.cdConta) <= 3 && RE_CAIXA.test(l.dsConta.trim()))?.valor ?? null)
    : valorConta(bpa, '1.01.01');
  const aplicacoesFinanceiras = fin ? null : valorConta(bpa, '1.01.02');
  const passivoCirculante = fin ? null : valorConta(bpp, '2.01');
  const linhaDivida = (cd: string) => {
    const l = conta(bpp, cd);
    return l && RE_DIVIDA.test(l.dsConta) ? l.valor : null;
  };
  const dividaBrutaCp = fin ? null : linhaDivida('2.01.04');
  const dividaBrutaLp = fin ? null : linhaDivida('2.02.01');
  const linhaPl = [...bpp]
    .sort((a, b) => compararContas(a.cdConta, b.cdConta))
    .find((l) => nivelConta(l.cdConta) === 2 && RE_PL.test(l.dsConta.trim()));
  const pl = linhaPl?.valor ?? null;
  let plControladora: number | null = null;
  if (linhaPl) {
    const nc = bpp.find(
      (l) =>
        l.cdConta.startsWith(`${linhaPl.cdConta}.`) &&
        nivelConta(l.cdConta) === 3 &&
        RE_NAO_CONTROLADOR.test(l.dsConta),
    );
    plControladora = linhaPl.valor - (nc?.valor ?? 0);
  }

  // Fluxo de caixa
  const temDfc = ctx.demonstrativos.has('DFC_MI') && dfc.length > 0;
  const fco = valorConta(dfc, '6.01');
  const fci = valorConta(dfc, '6.02');
  const fcf = valorConta(dfc, '6.03');
  let depreciacaoAmortizacao: number | null = null;
  if (!fin && temDfc) {
    const da = dfc.filter(
      (l) =>
        l.cdConta.startsWith('6.01.01.') &&
        nivelConta(l.cdConta) === 4 &&
        RE_DA.test(l.dsConta) &&
        !RE_DA_EXCL.test(l.dsConta),
    );
    depreciacaoAmortizacao = da.length > 0 ? Math.abs(soma(da.map((l) => l.valor))) : null;
  }
  const capex = temDfc
    ? -soma(
        dfc
          .filter(
            (l) =>
              l.cdConta.startsWith('6.02.') &&
              nivelConta(l.cdConta) === 3 &&
              RE_CAPEX.test(l.dsConta) &&
              !RE_CAPEX_EXCL.test(l.dsConta),
          )
          .map((l) => l.valor),
      ) || 0
    : null;
  const dividendosJcpPagos = temDfc
    ? -soma(
        dfc
          .filter(
            (l) =>
              l.cdConta.startsWith('6.03.') &&
              nivelConta(l.cdConta) === 3 &&
              RE_DIVIDENDOS.test(l.dsConta) &&
              l.valor < 0,
          )
          .map((l) => l.valor),
      ) || 0
    : null;

  // DMPL (só FY)
  let dmplDeclarado: number | null = null;
  if (ctx.tipoPeriodo === 'FY' && ctx.demonstrativos.has('DMPL') && dmpl.length > 0) {
    const candidatas = dmpl.filter(
      (l) => /^5\.0[456]\.\d+$/.test(l.cdConta) && RE_DIVIDENDOS.test(l.dsConta),
    );
    const naColunaPl = candidatas.filter((l) => l.colunaDf === COLUNA_PL);
    // BB e poucos outros publicam com a coluna em branco
    const usarColunaPl = naColunaPl.some((l) => l.valor < 0);
    const usadas = usarColunaPl ? naColunaPl : candidatas.filter((l) => !l.colunaDf);
    let total = 0;
    for (const l of usadas) {
      if (l.cdConta === '5.04.06' || l.cdConta === '5.04.07') total += l.valor;
      else if (l.valor < 0 && !RE_DIV_EXCL.test(l.dsConta)) total += l.valor;
    }
    dmplDeclarado = -total || 0;
  }

  const naoSeAplica = metricasNaoAplicaveis({
    layoutFinanceiro: fin,
    receita,
    lucro: lucroAtribuivel ?? lucroLiquido,
  });
  if (fin) {
    naoSeAplica.set('dividaBrutaCp', 'financeira');
    naoSeAplica.set('dividaBrutaLp', 'financeira');
  }
  const padraoContabil: PadraoContabil = ctx.escopo === 'ind' && fin ? 'BRGAAP' : 'IFRS';
  const fiscal = periodoFiscal(ctx.dtFim, ctx.mesFimExercicio);
  const ehAnual = ctx.tipoPeriodo === 'FY' || ctx.tipoPeriodo === 'TTM';

  return {
    tipoPeriodo: ctx.tipoPeriodo,
    escopo: ctx.escopo,
    padraoContabil,
    dtIni: ctx.dtIni,
    dtFim: ctx.dtFim,
    anoFiscal: fiscal.anoFiscal,
    trimestreFiscal: ehAnual ? null : fiscal.trimestreFiscal,
    receita,
    lucroBruto,
    ebit,
    depreciacaoAmortizacao,
    lucroLiquido,
    lucroAtribuivel,
    ativoTotal,
    ativoCirculante,
    passivoCirculante,
    caixa,
    aplicacoesFinanceiras,
    dividaBrutaCp,
    dividaBrutaLp,
    pl,
    plControladora,
    fco,
    fci,
    fcf,
    capex,
    dividendosJcpPagos,
    dmplDeclarado,
    lpaOn: lpa.on,
    lpaPn: lpa.pn,
    naoSeAplica: [...naoSeAplica.keys()].sort(),
    flags: [...lucro.flags],
    codContaLucro: lucro.codContaLucro,
  };
}
