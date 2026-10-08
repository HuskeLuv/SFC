/**
 * Fundamentos · Raio-X (Bloco D, fatia A) — catálogo de linhas por variante e montagem PURA da
 * resposta (sem I/O). A leitura do banco fica em leitura/ativo/raioX.ts.
 *
 * Variantes: 'acao', 'acao_financeira', 'fii_tijolo', 'fii_papel', 'fii_outro' (híbrido, FoF,
 * indefinido: mesmos blocos do tijolo, como no Essencial). Só as linhas 'mostra' de
 * spec.cobertura_raio_x, com as decisões que prevalecem (decisoes.md):
 *  - D3: 'Taxa de adm. (% do PL no ano)' = Σ dos 12 taxaAdmPct do ano; < 12 meses informados (mês
 *    com taxa 0 conta como não informado) ⇒ '—'; soma acima
 *    de LIMIAR_TAXA_ADM_ANO_PCT ⇒ 'em conferência' (ocultar).
 *  - D4: sem inadimplência, prazo médio, vencimentos e indexadores.
 *  - D5: rendimento distribuído = rendimentosDeclarados do 2º tri + 4º tri (o informe vem acumulado
 *    no semestre) e payout do resultado = distribuído ÷ resultado.
 *  - D1: base por ação quebrada ⇒ LPA/nº de ações (FII: VP/cota, rendimento/cota, nº de cotas) em
 *    conferência, pela MESMA regra do Essencial (regras/conferencia/conferenciaAnual.ts).
 *
 * REGRA DE OURO: toda célula que o Essencial também mostra (receita, lucro, margem líquida, ROE, LPA,
 * payout; FII: receita, resultado, rendimento/cota, DY, VP/cota, P/VP, vacância, nº de imóveis, área,
 * nº de CRIs, maior CRI) vem LITERALMENTE da resposta do Essencial do mesmo ano (montarFundamentos*
 * com a mesma entrada) — mesmo Estado, mesma conferência. As demais linhas passam por
 * conferirValoresDoAno (CAMPO_LINHA_RAIOX) + decisão 1, como o Essencial.
 *
 * Outras regras: o campo `fcf` do banco é o fluxo de FINANCIAMENTO (DFC 6.03) e sai como
 * 'Caixa de financiamento' (nunca "FCF"); financeira ⇒ dívida, EBITDA, margens, caixa, liquidez e
 * ROIC 'não se aplica'; linha 'n/a' em todos os anos sai e o rótulo vai para linhasNaoAplicaveis;
 * linha sem nenhum valor (nem em conferência) sai; bloco sem linha sai. Valores em R$ mi; por
 * ação/cota em R$; nº de ações/cotas em milhões; cotistas em mil; área em mil m².
 */
import { dividaLiquida, ebitda } from '@/services/analiseAtivos/regras/calculo/multiplos';
import { fatorCotasApos } from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import {
  anosPerShareEmConferencia,
  aplicarPerShareNosCodigos,
  conferirValoresDoAno,
  ehEstadoPerShareEmConferencia,
  type ConferenciaEntrada,
  type PerShareFlagsAno,
} from '@/services/analiseAtivos/regras/conferencia/conferenciaAnual';
import type { CampoTela } from '@/services/analiseAtivos/regras/comum/conferencia';
import {
  LIMIAR_TAXA_ADM_ANO_PCT,
  MESES_TAXA_ADM_ANO,
} from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { TEXTOS_TELA, formatarTexto, textoNaoSeAplica } from '@/services/analiseAtivos/textosTela';
import type { FundamentosPeriodo, Valor } from '@/services/analiseAtivos/tipos';
import type {
  Estado,
  FiiTipoTela,
  FundamentosResposta,
  LinhaFundamentos,
  TipoSeloEstado,
} from '@/types/analiseAtivosApi';
import type {
  BlocoRaioX,
  CodigoBlocoRaioX,
  CodigoLinhaRaioX,
  CodigoLinhaRaioXAcao,
  CodigoLinhaRaioXFii,
  ConferenciaCelulaRaioX,
  FormatoRaioX,
  LinhaRaioX,
  RaioXResposta,
  VarianteRaioX,
} from '@/types/analiseAtivosBlocoD';

const TR = TEXTOS_RAIO_X;
const TF = TEXTOS_TELA.analise.fundamentos;
const SELO_PROVENTOS: TipoSeloEstado = 'proventos_em_conferencia';
const SELO_CONF: TipoSeloEstado = 'em_conferencia';

export const MAX_ANOS_RAIO_X = 10;

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

function ok(valor: number): Estado<number> {
  return { estado: 'ok', valor: Math.round(valor * 1e4) / 1e4 };
}
function semDado(texto: string = TEXTOS_TELA.ausentesPorCampo.semDado): Estado<number> {
  return { estado: 'ausente', motivo: 'sem_dado_fonte', texto };
}
function ausente(motivo: string, texto: string): Estado<number> {
  return { estado: 'ausente', motivo, texto };
}
function naoSeAplica(motivo: string): Estado<number> {
  return { estado: 'nao_se_aplica', motivo, texto: textoNaoSeAplica(motivo) };
}
function num(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}
function estadoDe(n: number | null | undefined, escala = 1): Estado<number> {
  return num(n) ? ok(n / escala) : semDado();
}
/** Valor<number> do motor → Estado na escala dada (n/a sempre 'financeira'). */
function deValor(v: Valor<number>, escala = 1): Estado<number> {
  if (v.estado === 'ok') return ok(v.valor / escala);
  if (v.estado === 'nao_se_aplica') return naoSeAplica('financeira');
  return semDado();
}
function valorOk(e: Estado<number> | undefined): number | null {
  return e?.estado === 'ok' ? e.valor : null;
}
/** a ÷ b × 100 com b > 0; senão '—'. */
function razaoPct(a: number | null, b: number | null): Estado<number> {
  return a !== null && b !== null && b > 0 ? ok((a / b) * 100) : semDado();
}
/** Muda a escala de um Estado (ok e o valor não publicado). */
function escalar(e: Estado<number>, fator: number): Estado<number> {
  if (e.estado === 'ok') return ok(e.valor / fator);
  if (e.estado === 'ausente' && num(e.valorNaoPublicado)) {
    return { ...e, valorNaoPublicado: e.valorNaoPublicado / fator };
  }
  return e;
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export interface DefLinhaRaioX {
  codigo: CodigoLinhaRaioX;
  bloco: CodigoBlocoRaioX;
  tipo: 'valor' | 'razao';
  formato: FormatoRaioX;
  fonteCvmAviso?: boolean;
  /** código da mesma célula no Essencial (regra de ouro) */
  essencial?: string;
  /** escala aplicada ao Estado do Essencial (área: m² → mil m²) */
  escalaEssencial?: number;
  /** linha por ação/cota (decisão 1) que NÃO vem do Essencial */
  perShare?: boolean;
}

const L = (
  codigo: CodigoLinhaRaioX,
  bloco: CodigoBlocoRaioX,
  tipo: 'valor' | 'razao',
  formato: FormatoRaioX,
  extra: Partial<DefLinhaRaioX> = {},
): DefLinhaRaioX => ({ codigo, bloco, tipo, formato, ...extra });

export const LINHAS_ACAO: readonly DefLinhaRaioX[] = [
  L('receita', 'lucro_caixa', 'valor', 'moedaMi', { essencial: 'receita' }),
  L('lucroBruto', 'lucro_caixa', 'valor', 'moedaMi'),
  L('margemBrutaPct', 'lucro_caixa', 'razao', 'pct'),
  L('ebitda', 'lucro_caixa', 'valor', 'moedaMi'),
  L('margemEbitdaPct', 'lucro_caixa', 'razao', 'pct'),
  L('ebit', 'lucro_caixa', 'valor', 'moedaMi'),
  L('lucroLiquido', 'lucro_caixa', 'valor', 'moedaMi', { essencial: 'lucro' }),
  L('margemLiquidaPct', 'lucro_caixa', 'razao', 'pct', { essencial: 'margem' }),
  L('lpa', 'lucro_caixa', 'valor', 'moeda', { essencial: 'lpa' }),
  L('roePct', 'lucro_caixa', 'razao', 'pct', { essencial: 'roe' }),
  L('roicPct', 'lucro_caixa', 'razao', 'pct'),
  L('payoutPct', 'lucro_caixa', 'razao', 'pct', { essencial: 'payout' }),
  L('patrimonioLiquido', 'caixa_divida', 'valor', 'moedaMi'),
  L('caixaAplicacoes', 'caixa_divida', 'valor', 'moedaMi'),
  L('dividaBruta', 'caixa_divida', 'valor', 'moedaMi'),
  L('dividaLiquida', 'caixa_divida', 'valor', 'moedaMi'),
  L('divLiqEbitda', 'caixa_divida', 'razao', 'multiplo'),
  L('divLiqPl', 'caixa_divida', 'razao', 'multiplo'),
  L('liquidezCorrente', 'caixa_divida', 'razao', 'multiplo'),
  L('nAcoesMi', 'caixa_divida', 'valor', 'milhoes', { perShare: true }),
  L('fco', 'fluxo_caixa', 'valor', 'moedaMi'),
  L('fci', 'fluxo_caixa', 'valor', 'moedaMi'),
  L('caixaFinanciamento', 'fluxo_caixa', 'valor', 'moedaMi'),
  L('capex', 'fluxo_caixa', 'valor', 'moedaMi'),
  L('fcl', 'fluxo_caixa', 'valor', 'moedaMi'),
  L('fclLucroPct', 'fluxo_caixa', 'razao', 'pct'),
  L('dividendosJcpPagos', 'fluxo_caixa', 'valor', 'moedaMi'),
];

/** Linhas que não se aplicam a bancos/financeiras (todas 'n/a'). */
export const LINHAS_NAO_APLICAVEIS_FINANCEIRA: ReadonlySet<CodigoLinhaRaioXAcao> = new Set([
  'lucroBruto',
  'margemBrutaPct',
  'ebitda',
  'margemEbitdaPct',
  'ebit',
  'roicPct',
  'caixaAplicacoes',
  'dividaBruta',
  'dividaLiquida',
  'divLiqEbitda',
  'divLiqPl',
  'liquidezCorrente',
]);

const LINHAS_FII_BASE: readonly DefLinhaRaioX[] = [
  L('receitaAluguel', 'resultado_distribuicao', 'valor', 'moedaMi', { essencial: 'receita' }),
  L('resultado', 'resultado_distribuicao', 'valor', 'moedaMi', { essencial: 'resultado' }),
  L('rendimentoDistribuido', 'resultado_distribuicao', 'valor', 'moedaMi'),
  L('rendimentoCota', 'resultado_distribuicao', 'valor', 'moeda', { essencial: 'rendCota' }),
  L('dyPct', 'resultado_distribuicao', 'razao', 'pct', { essencial: 'dy' }),
  L('payoutResultadoPct', 'resultado_distribuicao', 'razao', 'pct'),
  L('resultadoCota', 'resultado_distribuicao', 'valor', 'moeda'),
  L('patrimonioLiquido', 'patrimonio_cota', 'valor', 'moedaMi'),
  L('vpCota', 'patrimonio_cota', 'valor', 'moeda', { essencial: 'vpCota' }),
  L('pvp', 'patrimonio_cota', 'razao', 'multiplo', { essencial: 'pvp' }),
  L('nCotasMi', 'patrimonio_cota', 'valor', 'milhoes', { perShare: true }),
  L('cotistas', 'patrimonio_cota', 'valor', 'milhoes'),
];
const LINHAS_FII_IMOVEIS: readonly DefLinhaRaioX[] = [
  L('nImoveis', 'carteira_imoveis', 'valor', 'inteiro', {
    essencial: 'nImoveis',
    fonteCvmAviso: true,
  }),
  L('areaInformadaMilM2', 'carteira_imoveis', 'valor', 'areaMilM2', {
    essencial: 'area',
    escalaEssencial: 1000,
    fonteCvmAviso: true,
  }),
  L('vacanciaFisicaPct', 'carteira_imoveis', 'razao', 'pct', {
    essencial: 'vacancia',
    fonteCvmAviso: true,
  }),
];
const LINHAS_FII_RECEBIVEIS: readonly DefLinhaRaioX[] = [
  L('nCri', 'carteira_recebiveis', 'valor', 'inteiro', { essencial: 'nCri', fonteCvmAviso: true }),
  L('maiorCriPct', 'carteira_recebiveis', 'razao', 'pct', {
    essencial: 'maiorCri',
    fonteCvmAviso: true,
  }),
];
const LINHAS_FII_CUSTOS: readonly DefLinhaRaioX[] = [
  L('obrigacoesPlPct', 'alavancagem_custos', 'razao', 'pct'),
  L('taxaAdmAnoPct', 'alavancagem_custos', 'razao', 'pct'),
  L('taxaPerformance', 'alavancagem_custos', 'valor', 'moedaMi'),
];

/** Catálogo por variante (ordem = ordem da tela e do CSV). */
export function catalogoRaioX(variante: VarianteRaioX): readonly DefLinhaRaioX[] {
  switch (variante) {
    case 'acao':
    case 'acao_financeira':
      return LINHAS_ACAO;
    case 'fii_papel':
      return [...LINHAS_FII_BASE, ...LINHAS_FII_RECEBIVEIS, ...LINHAS_FII_CUSTOS];
    default:
      return [...LINHAS_FII_BASE, ...LINHAS_FII_IMOVEIS, ...LINHAS_FII_CUSTOS];
  }
}

/**
 * Linha do Raio-X → CampoTela da conferência do Bloco C (grupo 'fundamentos_escala' por ano). As
 * linhas de demonstrativo sem campo próprio seguem o campo do grupo de que derivam (resultado ⇒
 * 'receita'/'lucroLiquido', balanço ⇒ 'patrimonioLiquido'): a escala quebrada de um ano vale para o
 * demonstrativo inteiro daquele ano.
 */
export const CAMPO_LINHA_RAIOX: Readonly<Record<CodigoLinhaRaioX, CampoTela | null>> = {
  receita: 'receita',
  lucroBruto: 'receita',
  margemBrutaPct: 'receita',
  ebitda: 'receita',
  margemEbitdaPct: 'receita',
  ebit: 'receita',
  lucroLiquido: 'lucroLiquido',
  margemLiquidaPct: 'margemLiquida',
  lpa: 'lpa',
  roePct: 'roe',
  roicPct: 'roe',
  payoutPct: 'payout',
  patrimonioLiquido: 'patrimonioLiquido',
  caixaAplicacoes: 'patrimonioLiquido',
  dividaBruta: 'patrimonioLiquido',
  dividaLiquida: 'divLiqPl',
  divLiqEbitda: 'divLiqEbitda',
  divLiqPl: 'divLiqPl',
  liquidezCorrente: 'patrimonioLiquido',
  nAcoesMi: 'nAcoes',
  fco: 'lucroLiquido',
  fci: 'lucroLiquido',
  caixaFinanciamento: 'lucroLiquido',
  capex: 'lucroLiquido',
  fcl: 'lucroLiquido',
  fclLucroPct: 'lucroLiquido',
  dividendosJcpPagos: 'lucroLiquido',
  receitaAluguel: null,
  resultado: null,
  rendimentoDistribuido: null,
  rendimentoCota: 'rendCota12m',
  dyPct: 'dy12m',
  payoutResultadoPct: null,
  resultadoCota: null,
  vpCota: 'vpCota',
  pvp: 'pvp',
  nCotasMi: null,
  cotistas: 'cotistas',
  nImoveis: 'nImoveisCvm',
  areaInformadaMilM2: null,
  vacanciaFisicaPct: 'vacanciaCvm',
  nCri: 'nCri',
  maiorCriPct: null,
  obrigacoesPlPct: 'obrigacoesPl',
  taxaAdmAnoPct: 'taxaAdm',
  taxaPerformance: null,
};

function mapaConferencia(codigos: readonly string[]): Record<string, CampoTela> {
  const out: Record<string, CampoTela> = {};
  for (const c of codigos) {
    const campo = CAMPO_LINHA_RAIOX[c as CodigoLinhaRaioX];
    if (campo) out[c] = campo;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Montagem comum
// ---------------------------------------------------------------------------

type CelulasAno = Partial<Record<CodigoLinhaRaioX, Estado<number>>>;

interface ResultadoMontagem {
  anos: number[];
  blocos: BlocoRaioX[];
  linhasNaoAplicaveis: string[];
  /** algum ano com a base por ação em conferência */
  perShareEmConferencia: boolean;
  /** algum ano com proventos em conferência (selo) */
  proventosEmConferencia: boolean;
}

interface EntradaMontagem {
  catalogo: readonly DefLinhaRaioX[];
  classe: 'acao' | 'fii';
  /** resposta do Essencial com a MESMA entrada (anos e células comuns) */
  essencial: FundamentosResposta;
  /** células próprias do Raio-X (sem as comuns), por ano */
  proprias: (ano: number, linhaEssencial: LinhaFundamentos) => CelulasAno;
  conferencia?: ConferenciaEntrada;
  /** anos com a base por ação em conferência → motivo (decisão 1) */
  perShare: ReadonlyMap<number, string>;
  /** selo de proventos do ano do Essencial vai para estas linhas */
  linhasSeloProventos: readonly CodigoLinhaRaioX[];
  /** conferências extras por (ano, código) — ex.: taxa de adm. fora da escala */
  extras?: (ano: number) => Partial<Record<CodigoLinhaRaioX, ConferenciaCelulaRaioX>>;
}

function rotuloDe(codigo: CodigoLinhaRaioX): { rotulo: string; sub: string | null } {
  const t = (TR.linhas as Record<string, { rotulo: string; sub: string }>)[codigo];
  return { rotulo: t.rotulo, sub: t.sub ? t.sub : null };
}

function montar(e: EntradaMontagem): ResultadoMontagem {
  const linhasEssencial = e.essencial.linhas.filter(
    (l): l is LinhaFundamentos & { ano: number } => l.ano !== null,
  );
  const anos = linhasEssencial
    .map((l) => l.ano)
    .sort((a, b) => b - a)
    .slice(0, MAX_ANOS_RAIO_X);
  const porAno = new Map(linhasEssencial.map((l) => [l.ano, l]));
  const codigosProprios = e.catalogo.filter((d) => !d.essencial).map((d) => d.codigo);
  const mapaConf = mapaConferencia(codigosProprios);
  const perShareCodigos = e.catalogo.filter((d) => d.perShare).map((d) => d.codigo);

  const valores = new Map<CodigoLinhaRaioX, Record<number, Estado<number>>>();
  const selos = new Map<CodigoLinhaRaioX, Record<number, TipoSeloEstado[]>>();
  const confs = new Map<CodigoLinhaRaioX, Record<number, ConferenciaCelulaRaioX>>();
  for (const d of e.catalogo) {
    valores.set(d.codigo, {});
    selos.set(d.codigo, {});
    confs.set(d.codigo, {});
  }
  let perShareEmConferencia = false;
  let proventosEmConferencia = false;

  for (const ano of anos) {
    const le = porAno.get(ano)!;
    // 1) células próprias + conferência do ano (Bloco C) + decisão 1
    const proprias = e.proprias(ano, le) as Record<string, Estado<number>>;
    const r = conferirValoresDoAno(proprias, mapaConf, e.conferencia, ano, e.classe, {});
    const motivoPs = e.perShare.get(ano);
    const comPs = aplicarPerShareNosCodigos(r.valores, perShareCodigos, motivoPs);
    const extras = e.extras?.(ano) ?? {};
    for (const d of e.catalogo) {
      let v: Estado<number> | undefined;
      if (d.essencial) {
        const ve = le.valores[d.essencial];
        v = ve ? (d.escalaEssencial ? escalar(ve, d.escalaEssencial) : ve) : undefined;
      } else {
        v = comPs[d.codigo];
      }
      if (!v) continue;
      valores.get(d.codigo)![ano] = v;
      const conf =
        extras[d.codigo] ??
        (!d.essencial ? r.porCodigo[d.codigo] : undefined) ??
        (v.estado === 'ausente' && v.exibicao
          ? { exibicao: v.exibicao, motivo: v.texto }
          : undefined);
      if (conf) {
        confs.get(d.codigo)![ano] = { exibicao: conf.exibicao, motivo: conf.motivo };
        if (conf.exibicao === 'selo') selos.get(d.codigo)![ano] = [SELO_CONF];
      }
      if (ehEstadoPerShareEmConferencia(v)) perShareEmConferencia = true;
      if (
        e.linhasSeloProventos.includes(d.codigo) &&
        le.selos.includes(SELO_PROVENTOS) &&
        v.estado === 'ok'
      ) {
        selos.get(d.codigo)![ano] = [...(selos.get(d.codigo)![ano] ?? []), SELO_PROVENTOS];
        proventosEmConferencia = true;
      }
    }
  }

  const linhasNaoAplicaveis: string[] = [];
  const blocos: BlocoRaioX[] = [];
  for (const d of e.catalogo) {
    const vs = valores.get(d.codigo)!;
    const lista = anos.map((a) => vs[a]).filter((v): v is Estado<number> => !!v);
    const { rotulo, sub } = rotuloDe(d.codigo);
    if (lista.length > 0 && lista.every((v) => v.estado === 'nao_se_aplica')) {
      linhasNaoAplicaveis.push(rotulo);
      continue;
    }
    // fica a linha com algum valor, em conferência ou com o informe do CNPJ em conferência
    const temValor = lista.some(
      (v) =>
        v.estado === 'ok' ||
        (v.estado === 'ausente' && (!!v.exibicao || v.motivo === 'cnpj_em_conferencia')),
    );
    if (!temValor) continue;
    const linha: LinhaRaioX = {
      codigo: d.codigo,
      rotulo,
      sub,
      tipo: d.tipo,
      formato: d.formato,
      fonteCvmAviso: d.fonteCvmAviso === true,
      campoConferencia: CAMPO_LINHA_RAIOX[d.codigo],
      valores: vs,
      selos: selos.get(d.codigo)!,
      conferencias: confs.get(d.codigo)!,
      observacao: null,
    };
    let bloco = blocos.find((b) => b.codigo === d.bloco);
    if (!bloco) {
      bloco = { codigo: d.bloco, rotulo: TR.blocos[d.bloco], linhas: [] };
      blocos.push(bloco);
    }
    bloco.linhas.push(linha);
  }
  return { anos, blocos, linhasNaoAplicaveis, perShareEmConferencia, proventosEmConferencia };
}

type Parcial = Omit<RaioXResposta, 'ticker' | 'classe' | 'nome' | 'versao'>;

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export interface MultiplosAnoRaioXAcao {
  anoFiscal: number;
  roicPct: number | null;
  divLiqEbitda: number | null;
  divLiqPl: number | null;
  liquidezCorrente: number | null;
  flags?: string[] | null;
}

export interface EntradaRaioXAcao {
  financeira: boolean;
  /** montarFundamentosAcao com a mesma entrada */
  essencial: FundamentosResposta;
  /** FY no escopo preferido (fundamentosVigentes) */
  fys: FundamentosPeriodo[];
  perShare: ReadonlyArray<PerShareFlagsAno & { fatorEquivalencia?: number | null }>;
  multiplos: ReadonlyArray<MultiplosAnoRaioXAcao>;
  conferencia?: ConferenciaEntrada;
}

function soma(...xs: Array<number | null>): number | null {
  if (xs.every((x) => x === null)) return null;
  return xs.reduce<number>((s, x) => s + (x ?? 0), 0);
}

export function montarRaioXAcao(e: EntradaRaioXAcao): Parcial {
  const fyPorAno = new Map<number, FundamentosPeriodo>();
  for (const f of e.fys) {
    const atual = fyPorAno.get(f.anoFiscal);
    if (!atual || f.dtFim > atual.dtFim) fyPorAno.set(f.anoFiscal, f);
  }
  const psPorAno = new Map(e.perShare.map((p) => [p.anoFiscal, p]));
  const mPorAno = new Map(e.multiplos.map((m) => [m.anoFiscal, m]));
  const fin = e.financeira;
  const naFin = naoSeAplica('financeira');
  const perShare = anosPerShareEmConferencia(e.perShare, e.multiplos, { mediana: true });
  let capexNaoIdentificado = false;

  const proprias = (ano: number, le: LinhaFundamentos): CelulasAno => {
    const f = fyPorAno.get(ano);
    const m = mPorAno.get(ano);
    const ps = psPorAno.get(ano);
    if (!f) return {};
    const receita = num(f.receita) ? f.receita / 1e6 : null;
    const lucroBruto = num(f.lucroBruto) ? f.lucroBruto / 1e6 : null;
    const eb = ebitda(f, fin);
    const ebitdaMi = eb.estado === 'ok' ? eb.valor / 1e6 : null;
    const lucro = valorOk(le.valores.lucro);
    const fco = num(f.fco) ? f.fco / 1e6 : null;
    // banco: no plano COSIF (BR GAAP) a DFC não separa imobilizado/intangível e o capex sai 0 (ou
    // migalhas) — conta não mapeada, não ausência de investimento ⇒ CAPEX, FCL e FCL/lucro '—'
    const capexNaoId = fin && (f.padraoContabil === 'BRGAAP' || f.capex === 0);
    if (capexNaoId) capexNaoIdentificado = true;
    const capex = !capexNaoId && num(f.capex) ? f.capex / 1e6 : null;
    const fcl = fco !== null && capex !== null ? fco - capex : null;
    const caixa = soma(f.caixa, f.aplicacoesFinanceiras);
    const divida = soma(f.dividaBrutaCp, f.dividaBrutaLp);
    const pl = f.plControladora ?? f.pl;
    const c: CelulasAno = {
      lucroBruto: estadoDe(f.lucroBruto, 1e6),
      margemBrutaPct: razaoPct(lucroBruto, receita),
      ebitda: deValor(eb, 1e6),
      margemEbitdaPct: razaoPct(ebitdaMi, receita),
      ebit: f.naoSeAplica.includes('ebit') ? naFin : estadoDe(f.ebit, 1e6),
      roicPct: estadoDe(m?.roicPct),
      patrimonioLiquido: estadoDe(pl, 1e6),
      caixaAplicacoes: caixa === null ? semDado() : ok(caixa / 1e6),
      dividaBruta: divida === null ? semDado() : ok(divida / 1e6),
      dividaLiquida: deValor(dividaLiquida(f), 1e6),
      divLiqEbitda: estadoDe(m?.divLiqEbitda),
      divLiqPl: estadoDe(m?.divLiqPl),
      liquidezCorrente: estadoDe(m?.liquidezCorrente),
      nAcoesMi: estadoDe(ps?.acoesFim, 1e6),
      fco: estadoDe(f.fco, 1e6),
      fci: estadoDe(f.fci, 1e6),
      caixaFinanciamento: estadoDe(f.fcf, 1e6),
      capex: capexNaoId ? semDado() : estadoDe(f.capex, 1e6),
      fcl: fcl === null ? semDado() : ok(fcl),
      fclLucroPct:
        fcl === null
          ? semDado()
          : lucro !== null && lucro <= 0
            ? ausente('lucro_nao_positivo', TR.conferencia.lucroNaoPositivo)
            : razaoPct(fcl, lucro),
      dividendosJcpPagos: estadoDe(f.dividendosJcpPagos, 1e6),
    };
    if (fin) for (const k of LINHAS_NAO_APLICAVEIS_FINANCEIRA) c[k] = naFin;
    return c;
  };

  const r = montar({
    catalogo: LINHAS_ACAO,
    classe: 'acao',
    essencial: e.essencial,
    proprias,
    conferencia: e.conferencia,
    perShare,
    // sem linha de DPA no Raio-X: o selo de proventos do ano fica no Essencial (Div./ação) e a
    // flag da linha inteira só no 'Últ. 12m' (design final: o payout de 2025 da WEGE3 sem selo)
    linhasSeloProventos: [],
  });

  const padraoContabil = e.essencial.padraoContabil;
  const escopo = (
    e.essencial.escopo === 'con' || e.essencial.escopo === 'ind' ? e.essencial.escopo : null
  ) as 'con' | 'ind' | null;
  const so = TR.sobreOsDados;
  const obs: string[] = [];
  if (padraoContabil === 'BRGAAP' || escopo === 'ind') {
    const t = textoPadraoContabil(escopo, padraoContabil);
    if (t) obs.push(formatarTexto(so.padraoContabil, { valor: t }));
  }
  if (fin && r.linhasNaoAplicaveis.length > 0) {
    obs.push(formatarTexto(so.naoSeAplicamBancos, { valor: r.linhasNaoAplicaveis.join(', ') }));
  }
  if (capexNaoIdentificado) obs.push(so.capexBanco);
  const temPayout = r.blocos.some((b) => b.linhas.some((l) => l.codigo === 'payoutPct'));
  const dmplZero =
    e.perShare.some((p) => p.flags?.includes('dmpl_zero_com_proventos')) ||
    e.multiplos.some((m) => m.flags?.includes('dmpl_zero_com_proventos'));
  if (!temPayout && dmplZero) obs.push(so.payoutSemProventos);
  obs.push(so.lpaBaseHoje);
  // unit: LPA por unit, nº de ações = total da companhia (lucro ÷ nº de ações × fator = LPA)
  const fatorUnit = [...e.perShare]
    .sort((a, b) => b.anoFiscal - a.anoFiscal)
    .find((p) => num(p.fatorEquivalencia))?.fatorEquivalencia;
  if (num(fatorUnit) && fatorUnit > 1) {
    obs.push(formatarTexto(so.unit, { n: String(fatorUnit).replace('.', ',') }));
  }
  if (r.perShareEmConferencia) obs.push(so.perShareConferencia);
  if (r.proventosEmConferencia) obs.push(TF.notaProventosConferencia);
  if (r.blocos.some((b) => b.linhas.some((l) => l.codigo === 'caixaFinanciamento'))) {
    obs.push(so.fcfFinanciamento);
  }
  if (r.anos.length > 0 && r.anos.length < MAX_ANOS_RAIO_X) {
    obs.push(formatarTexto(so.semAnosAntes, { ano: r.anos[r.anos.length - 1] }));
  }
  return {
    variante: fin ? 'acao_financeira' : 'acao',
    unidade: 'R$ mi',
    base: 'ano fiscal',
    fonte: 'CVM',
    padraoContabil,
    escopo,
    anos: r.anos,
    blocos: r.blocos,
    observacoes: obs,
    linhasNaoAplicaveis: r.linhasNaoAplicaveis,
  };
}

/** 'individual BR GAAP' (mesmos rótulos do Essencial). */
export function textoPadraoContabil(escopo: string | null, padrao: string | null): string | null {
  if (!escopo || !padrao) return null;
  const e = (TF.escopo as Record<string, string>)[escopo] ?? escopo;
  const p = (TF.padrao as Record<string, string>)[padrao] ?? padrao;
  return `${e} ${p}`;
}

// ---------------------------------------------------------------------------
// FIIs
// ---------------------------------------------------------------------------

export interface TrimestreRaioXFii {
  /** último dia do trimestre (AAAA-MM-DD) */
  refQuarter: string;
  rendimentosDeclarados: number | null;
  taxaPerformance: number | null;
}

export interface MesRaioXFii {
  /** 1º dia do mês (AAAA-MM-DD) */
  refMonth: string;
  pl: number | null;
  cotas: number | null;
  cotistas: number | null;
  taxaAdmPct: number | null;
}

export interface EntradaRaioXFii {
  fiiTipo: FiiTipoTela | null;
  /** montarFundamentosFii com a mesma entrada */
  essencial: FundamentosResposta;
  trimestres: TrimestreRaioXFii[];
  meses: MesRaioXFii[];
  /** meses com desdobramento de cotas (fii_monthly.fatorDesdobramento) */
  desdobramentos: Array<{ refMonth: string; fator: number }>;
  perShare: ReadonlyArray<PerShareFlagsAno>;
  multiplos: ReadonlyArray<{
    anoFiscal: number;
    obrigacoesPlPct: number | null;
    flags?: string[] | null;
  }>;
  /** ticker↔CNPJ não conferido: tudo que vem do informe do CNPJ sai em conferência */
  cnpjEmConferencia?: boolean;
  conferencia?: ConferenciaEntrada;
}

/** Linhas do FII que vêm do informe CVM do CNPJ (cnpj_em_conferencia). */
const LINHAS_INFORME_FII: ReadonlySet<CodigoLinhaRaioXFii> = new Set([
  'rendimentoDistribuido',
  'payoutResultadoPct',
  'resultadoCota',
  'patrimonioLiquido',
  'nCotasMi',
  'cotistas',
  'obrigacoesPlPct',
  'taxaAdmAnoPct',
  'taxaPerformance',
]);

export function montarRaioXFii(e: EntradaRaioXFii): Parcial {
  const papel = e.fiiTipo === 'papel';
  const variante: VarianteRaioX = papel
    ? 'fii_papel'
    : e.fiiTipo === 'tijolo'
      ? 'fii_tijolo'
      : 'fii_outro';
  const cnpjConf = e.cnpjEmConferencia === true;
  const desd = cnpjConf ? [] : e.desdobramentos;
  const trimPorAno = new Map<number, TrimestreRaioXFii[]>();
  for (const t of cnpjConf ? [] : e.trimestres) {
    const ano = Number(t.refQuarter.slice(0, 4));
    trimPorAno.set(ano, [...(trimPorAno.get(ano) ?? []), t]);
  }
  const mesesPorAno = new Map<number, MesRaioXFii[]>();
  for (const m of cnpjConf ? [] : e.meses) {
    const ano = Number(m.refMonth.slice(0, 4));
    mesesPorAno.set(ano, [...(mesesPorAno.get(ano) ?? []), m]);
  }
  const mPorAno = new Map(e.multiplos.map((m) => [m.anoFiscal, m]));
  const perShare = anosPerShareEmConferencia(e.perShare, e.multiplos, { mediana: false });
  const tc = TR.conferencia;
  const emConfCnpj = ausente('cnpj_em_conferencia', TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia);
  const textoTaxaFora = formatarTexto(tc.taxaAdmForaDaEscala, {
    valor: String(LIMIAR_TAXA_ADM_ANO_PCT).replace('.', ','),
  });
  const taxaForaPorAno = new Map<number, number>();

  const proprias = (ano: number, le: LinhaFundamentos): CelulasAno => {
    if (cnpjConf) {
      const c: CelulasAno = {};
      for (const k of LINHAS_INFORME_FII) c[k] = emConfCnpj;
      return c;
    }
    const ts = trimPorAno.get(ano) ?? [];
    const ms = (mesesPorAno.get(ano) ?? [])
      .slice()
      .sort((a, b) => a.refMonth.localeCompare(b.refMonth));
    const dez = ms.find((m) => m.refMonth.slice(5, 7) === '12');
    const tri = (mm: string) => ts.find((t) => t.refQuarter.slice(5, 7) === mm);
    const q2 = tri('06');
    const q4 = tri('12');
    let distribuido: Estado<number>;
    if (!q2 || !q4) distribuido = ausente('semestre_incompleto', tc.semestreIncompleto);
    else if (!num(q2.rendimentosDeclarados) || !num(q4.rendimentosDeclarados))
      distribuido = semDado();
    else distribuido = ok((q2.rendimentosDeclarados + q4.rendimentosDeclarados) / 1e6);

    const resultado = valorOk(le.valores.resultado);
    let payout: Estado<number>;
    if (distribuido.estado !== 'ok' || le.valores.resultado?.estado !== 'ok') payout = semDado();
    else if (resultado !== null && resultado <= 0) {
      payout = ausente('resultado_nao_positivo', tc.resultadoNaoPositivo);
    } else payout = razaoPct(distribuido.valor, resultado);

    const cotasAjustadas = ms
      .filter((m) => num(m.cotas) && m.cotas > 0)
      .map((m) => (m.cotas as number) * fatorCotasApos(m.refMonth, desd));
    let resultadoCota: Estado<number>;
    if (resultado === null) resultadoCota = semDado();
    else if (cotasAjustadas.length < 12) {
      resultadoCota = ausente('cotas_incompletas', tc.cotasIncompletas);
    } else {
      const media = cotasAjustadas.reduce((a, b) => a + b, 0) / cotasAjustadas.length;
      resultadoCota = ok((resultado * 1e6) / media);
    }

    // mês com taxa 0 = não informado na CVM (XPLG11 2019: 6 meses zerados somavam 0,05%)
    const taxas = ms.map((m) => m.taxaAdmPct).filter((t): t is number => num(t) && t > 0);
    let taxaAdm: Estado<number>;
    if (taxas.length < MESES_TAXA_ADM_ANO) {
      taxaAdm = ausente('meses_incompletos', tc.taxaAdmMesesIncompletos);
    } else {
      const s = taxas.reduce((a, b) => a + b, 0);
      if (s > LIMIAR_TAXA_ADM_ANO_PCT) {
        taxaForaPorAno.set(ano, s);
        taxaAdm = {
          estado: 'ausente',
          motivo: 'taxa_adm_fora_da_escala',
          texto: textoTaxaFora,
          exibicao: 'ocultar',
          valorNaoPublicado: Math.round(s * 1e4) / 1e4,
        };
      } else taxaAdm = ok(s);
    }

    const perf = ts.map((t) => t.taxaPerformance);
    const taxaPerformance =
      ts.length === 4 && perf.every(num)
        ? ok((perf as number[]).reduce((a, b) => a + b, 0) / 1e6)
        : semDado();

    return {
      rendimentoDistribuido: distribuido,
      payoutResultadoPct: payout,
      resultadoCota,
      patrimonioLiquido: estadoDe(dez?.pl, 1e6),
      nCotasMi:
        dez && num(dez.cotas)
          ? ok((dez.cotas * fatorCotasApos(`${ano}-12-31`, desd)) / 1e6)
          : semDado(),
      cotistas: estadoDe(dez?.cotistas, 1e3),
      obrigacoesPlPct: estadoDe(mPorAno.get(ano)?.obrigacoesPlPct),
      taxaAdmAnoPct: taxaAdm,
      taxaPerformance,
    };
  };

  const r = montar({
    catalogo: catalogoRaioX(variante),
    classe: 'fii',
    essencial: e.essencial,
    proprias,
    conferencia: e.conferencia,
    perShare,
    linhasSeloProventos: ['rendimentoCota'],
    extras: (ano) =>
      taxaForaPorAno.has(ano)
        ? { taxaAdmAnoPct: { exibicao: 'ocultar', motivo: textoTaxaFora } }
        : {},
  });

  const so = TR.sobreOsDados;
  const obs: string[] = [];
  if (cnpjConf) obs.push(TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia);
  if (papel && r.linhasNaoAplicaveis.includes(TR.linhas.receitaAluguel.rotulo)) {
    obs.push(so.receitaPapel);
  }
  obs.push(so.regrasFii);
  const maisAntigo = r.anos[r.anos.length - 1];
  const ultimoDesd = [...desd]
    .filter((d) => maisAntigo !== undefined && d.refMonth > `${maisAntigo}-12-31`)
    .sort((a, b) => b.refMonth.localeCompare(a.refMonth))[0];
  if (ultimoDesd) {
    const data = `${ultimoDesd.refMonth.slice(5, 7)}/${ultimoDesd.refMonth.slice(0, 4)}`;
    obs.push(formatarTexto(so.baseCotasHoje, { data }));
  }
  if (r.blocos.some((b) => b.linhas.some((l) => l.codigo === 'taxaAdmAnoPct'))) {
    obs.push(so.taxaAdm);
  }
  if (r.perShareEmConferencia) obs.push(so.perShareConferencia);
  if (r.proventosEmConferencia) obs.push(TF.notaProventosConferencia);
  return {
    variante,
    unidade: 'R$ mi',
    base: 'ano fiscal',
    fonte: 'CVM',
    padraoContabil: null,
    escopo: null,
    anos: r.anos,
    blocos: r.blocos,
    observacoes: obs,
    linhasNaoAplicaveis: r.linhasNaoAplicaveis,
  };
}
