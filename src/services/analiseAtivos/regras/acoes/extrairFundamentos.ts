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
 * DVA (A6, fatia B; só com ctx.dva = ANALISE_ATIVOS_CVM_DVA + CNPJ financeiro): receitaIntermediacaoDva
 *   7.01.01 /Intermediação Financeira/ e pdd 7.01.03 /provisão|perdas|crédito/ (plano de instituição
 *   financeira), como publicados (PDD negativa = despesa); 7.01.03 zerada ⇒ a filha de 7.01.04 com
 *   /perda esperada/ (ITUB 2019–2021); sem nenhuma ⇒ null. DVA no plano de empresa comum (7.01.03 =
 *   outra conta: RPAD, BRBI, BSLI) ⇒ null ('sem DVA de instituição financeira no documento').
 * Seguradora (A6, fatia B; ctx.seguradora = CNPJ do Set de seguradoras, INDEPENDENTE do layout
 *   financeiro): campos POR RÓTULO da DRE em qualquer nível até 4, como publicados —
 *   resultadoFinanceiro (2º nível /^Resultado Financeiro$/) · equivalenciaPatrimonial (a mais rasa
 *   /^Resultado de Equivalência Patrimonial/) · receitaComissoesServicos (Σ das folhas /^Receitas de
 *   comissões | prestação de serviços | acesso à rede/: BBSE 3.05.01, CXSE 3.04.04.01/02) ·
 *   receitaSeguro (3.01 /Atividades Seguradoras/ ou Σ /^Receita(s) de|com seguro(s)|resseguro(s)$/:
 *   PSSA 3.01.07, IFRS 17) · despesaSeguro (3.02 /Despesas da Atividade Seguradora/ ou Σ /^Despesa(s)
 *   de seguro$/: PSSA 3.04.05.11) · premiosGanhos (/Prêmios … Ganhos/: IRB 3.01.02.01; sem a linha,
 *   emitidos + cedidos + variação das provisões técnicas de seguros: PSSA 2022) · sinistrosRetidos
 *   (Σ das folhas /Sinistros Retidos/: IRB 3.02.02.01, PSSA 3.04.05.03). Sem a linha ⇒ null; o
 *   modelo IFRS 17 (2023+) ainda traz linhas antigas zeradas — a tela usa ANO_IFRS17, não o zero.
 * Demonstrativo presente sem a linha somada (capex, dividendos pagos, DMPL) = 0 de verdade; demonstrativo
 * ausente = null (ausente).
 * fundamentei-regras (F2, A4.a; só INGESTÃO, chave ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO, desligada): os
 *   proventos pagos da DFC passam a casar também 'Pagamento de Proventos', 'remuneração (paga) aos
 *   acionistas', 'Lucros distribuídos' e 'distribuição de lucros' (RE_DIVIDENDOS_DFC_AMPLO) e deixam
 *   de fora os pagos a NÃO CONTROLADORES (o payout é sobre o lucro dos controladores). Chave desligada
 *   = a regra de hoje, byte a byte. A DMPL não muda.
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
import { analiseAtivosDfcProventosAmplo } from '@/lib/analiseAtivosConfig';
import type {
  Escopo,
  FundamentosPeriodo,
  PadraoContabil,
  TipoPeriodo,
} from '@/services/analiseAtivos/tipos';

export type Demonstrativo = 'BPA' | 'BPP' | 'DRE' | 'DFC_MI' | 'DMPL' | 'DVA';

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
  /** A6: lê a DVA (PDD e intermediação) — ANALISE_ATIVOS_CVM_DVA e CNPJ do Set de financeiras */
  dva?: boolean;
  /** A6: CNPJ do Set de seguradoras (campos de seguradora por rótulo, nível até 4) */
  seguradora?: boolean;
  /**
   * F2 fundamentei-regras: regex ampliado dos proventos pagos na DFC (sem não controladores).
   * Ausente = ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO (chave de ingestão; só a ingestão CVM chama).
   */
  dfcProventosAmplo?: boolean;
}

export type FundamentosExtraidos = Omit<
  FundamentosPeriodo,
  'emissorId' | 'docTipo' | 'versao' | 'dtEntregaOriginal'
> & { codContaLucro: string | null };

/**
 * Campos de financeira (A6, colunas novas de asset_fundamentals_period): DVA das financeiras e DRE
 * das seguradoras por rótulo. Monetários (seguem a correção de escala) e de fluxo (TTM, regra 14).
 */
export const CAMPOS_FINANCEIRAS = [
  'pdd',
  'receitaIntermediacaoDva',
  'resultadoFinanceiro',
  'equivalenciaPatrimonial',
  'receitaComissoesServicos',
  'receitaSeguro',
  'despesaSeguro',
  'premiosGanhos',
  'sinistrosRetidos',
] as const;
export type CampoFinanceira = (typeof CAMPOS_FINANCEIRAS)[number];

const RE_DA = /deprecia|amortiza|exaust/i;
// Amortização/depreciação do direito de uso (IFRS 16) em linha PRÓPRIA fica fora do EBITDA, como no
// Fundamentei (CAML3 FY fev/26: Depreciações 198.624 + Amortizações Intangível 24.752 = 223.376; a
// linha "Amortizações Ativo de Direito de Uso" 62.547 não entra). Linha única que já inclui tudo
// (WEGE3 "Depreciação, Amortização e Exaustão") continua inteira. 72 de 404 cias na DFP 2025.
const RE_DA_EXCL =
  /capta[cç]|custo[s]? de transa|empr[eé]stim|financiament|deb[eê]nture|juros|direitos? de uso|arrendament/i;
const RE_CAPEX = /imobilizad|intang[ií]v/i;
const RE_CAPEX_EXCL = /venda|aliena|baixa|recebiment/i;
export const RE_DIVIDENDOS = /dividend|juros (sobre|s\/) ?(o )?capital|\bJCP\b/i;
const RE_DIV_EXCL = /prescrit|revers|revert|reclassif/i;
/**
 * F2 (A4.a, chave ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO): rótulos de proventos pagos na DFC que o
 * RE_DIVIDENDOS perde (93 FY com DFC = 0 e DMPL > 0 em 2021–2025).
 */
export const RE_DIVIDENDOS_DFC_AMPLO =
  /dividend|juros (sobre|s\/) ?(o )?capital|\bJCP\b|provento|remunera\S* (paga )?aos acionistas|lucros? distribu|distribui[cç][aã]o de lucros?/i;
const RE_PL = /^Patrim[oô]nio L[ií]quido/i;
const RE_NAO_CONTROLADOR = /N[aã]o Controlador/i;
const RE_CAIXA = /^Caixa e Equivalentes/i;
const RE_DIVIDA = /empr[eé]stimo|financiamento/i;
const COLUNA_PL = 'Patrimônio Líquido';
const RE_DVA_INTERMEDIACAO = /Intermedia[cç][aã]o Financeira/i;
const RE_DVA_PDD = /provis[aã]o|perdas?|cr[eé]dito|liquida[cç][aã]o duvidosa/i;
/**
 * PDD fora da 7.01.03: ITUB consolidado 2019–2021 publica a 7.01.03 zerada e a perda esperada numa
 * filha de 'Outras' (7.01.04.02 'Perda Esperada com Ativos Financeiros').
 */
export const RE_DVA_PDD_OUTRAS = /perda esperada|liquida[cç][aã]o duvidosa|risco de cr[eé]dito/i;

function soma(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}

// ---------------------------------------------------------------- seguradoras (A6, por rótulo)

const RE_RESULTADO_FINANCEIRO = /^Resultado Financeiro\s*$/i;
const RE_EQUIVALENCIA = /^Resultado de Equival[eê]ncia Patrimonial/i;
const RE_COMISSOES_SERVICOS =
  /^Receitas? (de |com |das? )?(comiss[õo]es|presta[cç][ãa]o(ões|oes)? de servi[cç]os?|presta[cç][õo]es de servi[cç]os?|acesso [àa] rede)/i;
const RE_RECEITA_ATIVIDADE_SEGURADORA = /Atividades? Segurad/i;
const RE_RECEITA_SEGURO = /^Receitas? (de|com) (seguros?|resseguros?)\s*$/i;
const RE_DESPESA_ATIVIDADE_SEGURADORA = /^Despesas? da Atividade Segurad/i;
const RE_DESPESA_SEGURO = /^Despesas? (de|com) (servi[cç]os de )?seguros?\s*$/i;
const RE_PREMIOS_GANHOS = /Pr[eê]mios.*Ganhos/i;
const RE_PREMIOS_EMITIDOS = /Pr[eê]mios de seguros emitidos/i;
const RE_PREMIOS_CEDIDOS = /Pr[eê]mios de resseguros cedidos/i;
const RE_VARIACAO_PROVISOES_SEGUROS = /Varia[cç][ãa]o das provis[õo]es t[ée]cnicas\s*-\s*seguros/i;
const RE_SINISTROS_RETIDOS = /Sinistros Retidos/i;

/** Linhas que casam com o rótulo, sem as que têm uma descendente que também casa (folhas). */
function folhasQueCasam(ls: LinhaDemonstrativo[], re: RegExp): LinhaDemonstrativo[] {
  const casam = ls.filter((l) => re.test(l.dsConta.trim()));
  return casam.filter((l) => !casam.some((o) => o.cdConta.startsWith(`${l.cdConta}.`)));
}

/** A linha mais rasa (menor nível, depois a primeira conta) que casa com o rótulo. */
function maisRasa(ls: LinhaDemonstrativo[], re: RegExp): LinhaDemonstrativo | null {
  return (
    [...ls]
      .filter((l) => re.test(l.dsConta.trim()))
      .sort(
        (a, b) =>
          nivelConta(a.cdConta) - nivelConta(b.cdConta) || compararContas(a.cdConta, b.cdConta),
      )[0] ?? null
  );
}

function somaOuNull(ls: LinhaDemonstrativo[]): number | null {
  return ls.length > 0 ? soma(ls.map((l) => l.valor)) : null;
}

export interface CamposSeguradora {
  resultadoFinanceiro: number | null;
  equivalenciaPatrimonial: number | null;
  receitaComissoesServicos: number | null;
  receitaSeguro: number | null;
  despesaSeguro: number | null;
  premiosGanhos: number | null;
  sinistrosRetidos: number | null;
}

/** Campos de seguradora do DRE de um período (por rótulo; como publicados; Σ das folhas). */
export function camposSeguradora(dre: LinhaDemonstrativo[]): CamposSeguradora {
  const doNivel = (n: number) => dre.filter((l) => nivelConta(l.cdConta) === n);
  const r301 = dre.find((l) => l.cdConta === '3.01');
  const r302 = dre.find((l) => l.cdConta === '3.02');
  const receitaSeguro =
    r301 && RE_RECEITA_ATIVIDADE_SEGURADORA.test(r301.dsConta)
      ? r301.valor
      : somaOuNull(folhasQueCasam(dre, RE_RECEITA_SEGURO));
  const despesaSeguro =
    r302 && RE_DESPESA_ATIVIDADE_SEGURADORA.test(r302.dsConta.trim())
      ? r302.valor
      : somaOuNull(folhasQueCasam(dre, RE_DESPESA_SEGURO));
  let premiosGanhos = somaOuNull(folhasQueCasam(dre, RE_PREMIOS_GANHOS));
  if (premiosGanhos === null) {
    const emitidos = folhasQueCasam(dre, RE_PREMIOS_EMITIDOS);
    if (emitidos.length > 0) {
      premiosGanhos = soma(
        [
          ...emitidos,
          ...folhasQueCasam(dre, RE_PREMIOS_CEDIDOS),
          ...folhasQueCasam(dre, RE_VARIACAO_PROVISOES_SEGUROS),
        ].map((l) => l.valor),
      );
    }
  }
  return {
    resultadoFinanceiro:
      doNivel(2).find((l) => RE_RESULTADO_FINANCEIRO.test(l.dsConta.trim()))?.valor ?? null,
    equivalenciaPatrimonial: maisRasa(dre, RE_EQUIVALENCIA)?.valor ?? null,
    receitaComissoesServicos: somaOuNull(folhasQueCasam(dre, RE_COMISSOES_SERVICOS)),
    receitaSeguro,
    despesaSeguro,
    premiosGanhos,
    sinistrosRetidos: somaOuNull(folhasQueCasam(dre, RE_SINISTROS_RETIDOS)),
  };
}

const SEGURADORA_NULA: CamposSeguradora = {
  resultadoFinanceiro: null,
  equivalenciaPatrimonial: null,
  receitaComissoesServicos: null,
  receitaSeguro: null,
  despesaSeguro: null,
  premiosGanhos: null,
  sinistrosRetidos: null,
};

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
  const dva = ctx.dva ? por('DVA') : [];
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
  // F2: regex ampliado e sem não controladores só com a chave de ingestão (desligada = hoje)
  const amplo = ctx.dfcProventosAmplo ?? analiseAtivosDfcProventosAmplo();
  const ehProventoPago = amplo
    ? (ds: string) => RE_DIVIDENDOS_DFC_AMPLO.test(ds) && !RE_NAO_CONTROLADOR.test(ds)
    : (ds: string) => RE_DIVIDENDOS.test(ds);
  const dividendosJcpPagos = temDfc
    ? -soma(
        dfc
          .filter(
            (l) =>
              l.cdConta.startsWith('6.03.') &&
              nivelConta(l.cdConta) === 3 &&
              ehProventoPago(l.dsConta) &&
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

  // DVA de instituição financeira (A6): só as duas contas, conferidas pelo rótulo
  const contaDva = (cd: string, re: RegExp) => {
    const l = conta(dva, cd);
    return l && re.test(l.dsConta) ? l.valor : null;
  };
  const receitaIntermediacaoDva = ctx.dva ? contaDva('7.01.01', RE_DVA_INTERMEDIACAO) : null;
  let pdd = ctx.dva && receitaIntermediacaoDva !== null ? contaDva('7.01.03', RE_DVA_PDD) : null;
  if (ctx.dva && receitaIntermediacaoDva !== null && !pdd) {
    // 7.01.03 zerada/ausente: a perda esperada publicada em 7.01.04.x; sem ela, não publicada (null)
    const outras = dva.filter(
      (l) => l.cdConta.startsWith('7.01.04.') && RE_DVA_PDD_OUTRAS.test(l.dsConta),
    );
    pdd = outras.length > 0 ? soma(outras.map((l) => l.valor)) || null : null;
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
    pdd,
    receitaIntermediacaoDva,
    ...(ctx.seguradora ? camposSeguradora(dre) : SEGURADORA_NULA),
    naoSeAplica: [...naoSeAplica.keys()].sort(),
    flags: [...lucro.flags],
    codContaLucro: lucro.codContaLucro,
  };
}
