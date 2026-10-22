/**
 * Os 8 indicadores (KPIs) do topo da página do ativo, por classe (fatia B). Funções puras sobre a
 * linha do Quadro (Estado<number> com motivo pronto), os múltiplos atuais e as linhas dos pares.
 *
 * Ações: P/L (sub: média 10a se ≥ 5 pontos), P/VP, DY 12m, ROE e margem (sub: mediana dos pares,
 * mín. 3), Dív.líq./EBITDA (n/a em financeira; 'caixa líquido'), Payout (aviso acima de 150%) e
 * CAGR do lucro por ação em 5 anos FECHADOS (series.cagrJanela).
 * FIIs: DY 12m, P/VP, rendimento/cota 12m, patrimônio, cotistas, liquidez 21d, Obrigações/PL e
 * vacância (fonte CVM; papel = n/a). Sem cap rate.
 *
 * v2.5 (financeiras): margem e Dív.líq./EBITDA seguem os MESMOS params do card de critérios
 * (perfis.acao_financeira.naoSeAplica, vazio na v2). Fora dessa lista, o 'não se aplica a bancos…'
 * da linha do Quadro vira o último ponto da série do critério (mg / dl) ou '—' com 'sem dado nas
 * demonstrações' — a página não afirma e nega a mesma métrica.
 *
 * Bloco C (só flags 'conf:', params v2): a política de conferenciasAtivo.aplicarConferenciaCampo
 * vale para cada KPI cujo código é um campo de tela — 'ocultar' vira '—' (número calculado só em
 * valorNaoPublicado, para o "Por quê?") e sem a linha de apoio; 'selo' mantém o valor. Nos dois,
 * selo 'em_conferencia'. O legado de proventos continua com 'proventos_em_conferencia'.
 */
import { formatarNumeroBR, formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_TELA, textoMotivo, textoNaoSeAplica } from '@/services/analiseAtivos/textosTela';
import { cagrJanela } from '@/services/analiseAtivos/leitura/ativo/series';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import {
  aplicarConferenciaCampo,
  estadoOcultoConferencia,
  motivosDaLinha,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { ehCampoTela } from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { rotuloEuaEn } from '@/services/analiseAtivos/textosEuaEn';
import { TEXTOS_EUA_TELAS } from '@/services/analiseAtivos/textosEuaTelas';
import type { Estado, KpiAtivo, LinhaQuadroApi, PontoSerieAnual } from '@/types/analiseAtivosApi';
import type { IdCriterio, PontoCriterio } from '@/types/analiseAtivosCriterios';

export const PARES_MINIMOS_REFERENCIA = 3;
export const PONTOS_MINIMOS_MEDIA_PL = 5;
export const PAYOUT_LIMITE_AVISO = 150;

/** Campos dos múltiplos atuais (AssetMultiplesCurrent) usados nos KPIs. */
export interface MultiplosAtuaisKpi {
  plMedia10a: number | null;
  plPontosHistorico: number;
  dpa12m: number | null;
  rend12m: number | null;
  vpCota: number | null;
}

export interface EntradaKpis {
  linha: LinhaQuadroApi;
  atuais: MultiplosAtuaisKpi | null;
  pares: readonly LinhaQuadroApi[];
  /** ações: LPA ajustado por ano, só anos FECHADOS */
  lpaAnual?: readonly PontoSerieAnual[];
  /** FIIs: data (AAAA-MM-DD) do informe mensal do patrimônio */
  patrimonioData?: string | null;
  /** motivos do Índice da linha (AnaliseQuadroLinha.motivosIncompleto), para o legado */
  motivosIncompleto?: readonly string[];
  /**
   * Números brutos da linha do Quadro por código de KPI (a linha da API já esconde os campos
   * 'ocultar'): só para o "não publicado" do "Por quê?" da página.
   */
  brutos?: Partial<Record<string, number | null>>;
  /**
   * v2.5: só na ação financeira (régua acao_financeira). `naoSeAplica` = ids de
   * perfis.acao_financeira.naoSeAplica; `ultimos` = último ponto da série do critério (card).
   */
  financeira?: {
    naoSeAplica: readonly IdCriterio[];
    ultimos: Partial<Record<'mg' | 'dl', PontoCriterio | null>>;
  };
}

/** Motivos de n/a da linha do Quadro que a v2.5 religa na financeira (pelos params). */
const MOTIVOS_NA_FINANCEIRA = new Set(['financeira', 'receita_menor_que_lucro']);

/**
 * KPI da financeira pelos params (v2.5): critério fora de naoSeAplica ⇒ último ponto da série do
 * critério, ou '—' com 'sem dado nas demonstrações'. Dentro (D4 religado) ⇒ o n/a da linha.
 */
export function kpiFinanceira(
  v: Estado<number>,
  id: 'mg' | 'dl',
  fin: EntradaKpis['financeira'],
): Estado<number> {
  if (!fin || v.estado !== 'nao_se_aplica' || !MOTIVOS_NA_FINANCEIRA.has(v.motivo)) return v;
  if (fin.naoSeAplica.includes(id)) return v;
  const ultimo = fin.ultimos[id];
  if (ultimo && typeof ultimo.valor === 'number' && Number.isFinite(ultimo.valor)) {
    return { estado: 'ok', valor: ultimo.valor };
  }
  return { estado: 'ausente', motivo: 'sem_dado_fonte', texto: TEXTOS_CRITERIOS.fatos.semDado };
}

const R = TEXTOS_TELA.ativo.kpis;

function ok(valor: number | null | undefined, emConferencia = false): Estado<number> {
  if (typeof valor === 'number' && Number.isFinite(valor)) return { estado: 'ok', valor };
  const t = TEXTOS_TELA.ausentesPorCampo;
  return emConferencia
    ? { estado: 'ausente', motivo: 'fonte_defasada', texto: t.dyEmConferencia }
    : { estado: 'ausente', motivo: 'sem_dado_fonte', texto: t.semDado };
}

/**
 * P/L e payout com prejuízo: a linha do Quadro grava o campo em naoSeAplica sem motivo (vira
 * 'fora do escopo'); na página o motivo é o prejuízo (AURE3: P/L '—' com a frase do prejuízo).
 */
function comPrejuizo(linha: LinhaQuadroApi, campo: 'pl' | 'payout'): Estado<number> {
  const v = linha[campo];
  const prejuizo = linha.flags.some((f) => f === 'lucro_nao_positivo' || f === 'prejuizo');
  if (!prejuizo || v.estado !== 'nao_se_aplica' || v.motivo !== 'fora_do_escopo') return v;
  return campo === 'pl'
    ? { estado: 'ausente', motivo: 'prejuizo', texto: TEXTOS_TELA.ausentesPorCampo.plPrejuizo }
    : {
        estado: 'nao_se_aplica',
        motivo: 'base_nao_positiva',
        texto: textoNaoSeAplica('base_nao_positiva'),
      };
}

function moeda(v: number, casas = 2): string {
  return `R$ ${formatarNumeroBR(v, casas)}`;
}

function dataCurta(iso: string): string {
  const meses = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ];
  return `${meses[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
}

/** Mediana dos valores 'ok' de um campo nos pares; null com menos de PARES_MINIMOS_REFERENCIA. */
export function medianaPares(
  pares: readonly LinhaQuadroApi[],
  campo: 'roe' | 'margemLiquida' | 'pl' | 'pvp' | 'dy12m',
): { valor: number; n: number } | null {
  const vals = pares
    .map((p) => p[campo])
    .filter((e): e is { estado: 'ok'; valor: number } => e.estado === 'ok')
    .map((e) => e.valor)
    .sort((a, b) => a - b);
  if (vals.length < PARES_MINIMOS_REFERENCIA) return null;
  const meio = Math.floor(vals.length / 2);
  const valor = vals.length % 2 ? vals[meio] : (vals[meio - 1] + vals[meio]) / 2;
  return { valor, n: vals.length };
}

function subPares(
  linha: LinhaQuadroApi,
  pares: readonly LinhaQuadroApi[],
  campo: 'roe' | 'margemLiquida',
  sufixo: string,
): string | null {
  if (linha[campo].estado !== 'ok') return null;
  const m = medianaPares(pares, campo);
  if (!m) return null;
  return formatarTexto(R.medianaPares, {
    pares: m.n,
    valor: `${formatarNumeroBR(m.valor, 1)}${sufixo}`,
  });
}

function kpisAcao(e: EntradaKpis): KpiAtivo[] {
  const { linha, atuais, pares } = e;
  const conferencia = linha.proventosEmConferencia ? 'proventos_em_conferencia' : null;

  const subPl =
    atuais &&
    typeof atuais.plMedia10a === 'number' &&
    atuais.plPontosHistorico >= PONTOS_MINIMOS_MEDIA_PL
      ? formatarTexto(R.mediaDezAnos, { valor: `${formatarNumeroBR(atuais.plMedia10a, 1)}×` })
      : null;

  const div = kpiFinanceira(linha.divLiqEbitda, 'dl', e.financeira);
  const margem = kpiFinanceira(linha.margemLiquida, 'mg', e.financeira);
  const subDiv = div.estado === 'ok' && div.valor <= 0 ? R.caixaLiquido : null;

  const payout = comPrejuizo(linha, 'payout');
  const subPayout =
    payout.estado === 'ok' && payout.valor > PAYOUT_LIMITE_AVISO ? R.payoutAcima : null;

  const subDy =
    atuais && typeof atuais.dpa12m === 'number' && atuais.dpa12m > 0
      ? formatarTexto(R.dpa12m, { valor: moeda(atuais.dpa12m) })
      : null;

  const janela = cagrJanela(e.lpaAnual ?? [], 5);
  let cagr: Estado<number>;
  if (janela.pct !== null) cagr = { estado: 'ok', valor: janela.pct };
  else if (janela.motivo === 'base_nao_positiva') {
    cagr = {
      estado: 'nao_se_aplica',
      motivo: 'base_nao_positiva',
      texto: textoNaoSeAplica('base_nao_positiva'),
    };
  } else {
    const motivo = janela.motivo ?? 'historico_curto';
    cagr = { estado: 'ausente', motivo, texto: textoMotivo(motivo) };
  }
  const subCagr =
    janela.anoInicio !== null && janela.anoFim !== null
      ? formatarTexto(R.cagrLucroJanela, { valor: `${janela.anoInicio} a ${janela.anoFim}` })
      : null;

  return [
    {
      codigo: 'pl',
      rotulo: R.rotulos.pl,
      valor: comPrejuizo(linha, 'pl'),
      formato: 'multiplo',
      sub: subPl,
      selo: null,
    },
    {
      codigo: 'pvp',
      rotulo: R.rotulos.pvp,
      valor: linha.pvp,
      formato: 'numero2',
      sub: null,
      selo: null,
    },
    {
      codigo: 'dy12m',
      rotulo: R.rotulos.dy12m,
      valor: linha.dy12m,
      formato: 'pct',
      sub: subDy,
      selo: conferencia,
    },
    {
      codigo: 'roe',
      rotulo: R.rotulos.roe,
      valor: linha.roe,
      formato: 'pct',
      sub: subPares(linha, pares, 'roe', '%'),
      selo: null,
    },
    {
      codigo: 'margemLiquida',
      rotulo: R.rotulos.margemLiquida,
      valor: margem,
      formato: 'pct',
      sub: subPares({ ...linha, margemLiquida: margem }, pares, 'margemLiquida', '%'),
      selo: null,
    },
    {
      codigo: 'divLiqEbitda',
      rotulo: R.rotulos.divLiqEbitda,
      valor: div,
      formato: 'multiplo',
      sub: subDiv,
      selo: null,
    },
    {
      codigo: 'payout',
      rotulo: R.rotulos.payout,
      valor: payout,
      formato: 'pct',
      sub: subPayout,
      selo: conferencia,
    },
    {
      codigo: 'cagrLucro',
      rotulo: R.rotulos.cagrLucro,
      valor: cagr,
      formato: 'pctSinal',
      sub: subCagr,
      selo: null,
    },
  ];
}

function kpisFii(e: EntradaKpis): KpiAtivo[] {
  const { linha, atuais } = e;
  const conferencia = linha.proventosEmConferencia ? 'proventos_em_conferencia' : null;
  const rend = atuais?.rend12m ?? null;
  // ticker↔CNPJ não conferido: nada do informe CVM (VP/cota, patrimônio, cotistas, vacância...)
  const cnpjConf = linha.flags.includes(FLAG_CNPJ_EM_CONFERENCIA);
  const emConfCnpj: Estado<number> = {
    estado: 'ausente',
    motivo: 'cnpj_em_conferencia',
    texto: TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia,
  };
  const informe = (v: Estado<number>): Estado<number> => (cnpjConf ? emConfCnpj : v);
  const vpCota = cnpjConf ? null : (atuais?.vpCota ?? null);
  const vac: Estado<number> = cnpjConf
    ? emConfCnpj
    : linha.fiiTipo === 'papel'
      ? {
          estado: 'nao_se_aplica',
          motivo: 'papel_sem_imoveis',
          texto: textoNaoSeAplica('papel_sem_imoveis'),
        }
      : linha.vacanciaCvm;
  return [
    {
      codigo: 'dy12m',
      rotulo: R.rotulos.dy12m,
      valor: linha.dy12m,
      formato: 'pct',
      sub:
        typeof rend === 'number' && rend > 0
          ? formatarTexto(R.rend12m, { valor: moeda(rend) })
          : null,
      selo: conferencia,
    },
    {
      codigo: 'pvp',
      rotulo: R.rotulos.pvp,
      valor: informe(linha.pvp),
      formato: 'numero2',
      sub: typeof vpCota === 'number' ? formatarTexto(R.vpCota, { valor: moeda(vpCota) }) : null,
      selo: null,
    },
    {
      codigo: 'rendCota12m',
      rotulo: R.rotulos.rendCota12m,
      valor: ok(rend, linha.proventosEmConferencia),
      formato: 'moeda',
      sub: null,
      selo: conferencia,
    },
    {
      codigo: 'patrimonio',
      rotulo: R.rotulos.patrimonio,
      valor: informe(ok(linha.patrimonio)),
      formato: 'moedaCompacta',
      sub:
        !cnpjConf && e.patrimonioData
          ? formatarTexto(R.informeCvm, { data: dataCurta(e.patrimonioData) })
          : null,
      selo: null,
    },
    {
      codigo: 'cotistas',
      rotulo: R.rotulos.cotistas,
      valor: informe(ok(linha.cotistas)),
      formato: 'inteiro',
      sub: cnpjConf ? null : R.cotistasSub,
      selo: null,
    },
    {
      codigo: 'liquidez21',
      rotulo: R.rotulos.liquidez21,
      valor: ok(linha.liquidezMedia21),
      formato: 'moedaCompacta',
      sub: R.liquidezSub,
      selo: linha.baixaLiquidez ? 'baixa_liquidez' : null,
    },
    {
      codigo: 'obrigacoesPl',
      rotulo: R.rotulos.obrigacoesPl,
      valor: informe(linha.obrigacoesPl),
      formato: 'pct',
      sub: null,
      selo: null,
    },
    {
      codigo: 'vacanciaCvm',
      rotulo: R.rotulos.vacanciaCvm,
      valor: vac,
      formato: 'pct',
      sub: cnpjConf || linha.fiiTipo === 'papel' ? null : TEXTOS_TELA.selos.fonteCvm,
      selo: null,
    },
  ];
}

/** Política de conferência (bloco C) sobre os KPIs já montados. Sem 'conf:' ⇒ lista igual. */
function comConferencia(e: EntradaKpis, kpis: KpiAtivo[]): KpiAtivo[] {
  const { linha } = e;
  const motivos = e.motivosIncompleto ?? motivosDaLinha(linha);
  return kpis.map((k) => {
    if (!ehCampoTela(k.codigo)) return k;
    const r = aplicarConferenciaCampo(k.valor, linha.flags, motivos, k.codigo, linha.classe, {
      pagina: true,
    });
    if (!r.conf) return k;
    const oculto = r.conf.exibicao === 'ocultar';
    const bruto = e.brutos?.[k.codigo];
    const valor =
      oculto && r.estado.estado === 'ausente' && r.estado.valorNaoPublicado === undefined
        ? estadoOcultoConferencia(r.conf.grupo, bruto)
        : r.estado;
    return { ...k, valor, sub: oculto ? null : k.sub, selo: 'em_conferencia' };
  });
}

export function montarKpis(e: EntradaKpis): KpiAtivo[] {
  return comConferencia(e, e.linha.classe === 'fii' ? kpisFii(e) : kpisAcao(e));
}

// ---------------------------------------------------------------------------
// Stocks e REITs (fatia C): KPIs SEM cotação (decisão do Wellington de 17/10), do último FY da SEC
// ---------------------------------------------------------------------------

/** Último FY fechado (métricas do 10-K, em US$) e os anos seguidos da linha do Quadro. */
export interface EntradaKpisEua {
  classe: 'stock' | 'reit';
  /** SecCompany.ehFinanceira: sem o KPI de dívida líquida ÷ EBITDA (não se aplica) */
  financeira?: boolean;
  /** ano fiscal do último 10-K lido; null = sem 10-K */
  ano: number | null;
  valores: {
    roePct: number | null;
    margemPct: number | null;
    divLiqEbitda: number | null;
    dividaLiquida: number | null;
    lpa: number | null;
    dpa: number | null;
    payoutPct: number | null;
    fcoAcao: number | null;
    divFcoPct: number | null;
    receita: number | null;
    lucro: number | null;
    /**
     * F3 (REIT_FCO_AJUSTADO): caixa ajustado pela SBC por ação e dividendos ÷ ele, já com o
     * fallback do ano sem SBC (valoresReitAjustado); sbcIndisponivel = o ano caiu no sem ajuste
     */
    fcoAjustadoAcao?: number | null;
    divFcoAjustadoPct?: number | null;
    sbcIndisponivel?: boolean;
  } | null;
  /** o DPA do ano foi derivado (dividendos pagos ÷ média diluída) */
  dpaCalculado: boolean;
  anosLucroConsecutivos: number | null;
  anosDividendo: number | null;
}

/** F3: chaves de tela dos KPIs EUA (ausente = desligadas = KPIs de hoje). */
export interface OpcoesKpisEua {
  /** ANALISE_ATIVOS_REIT_FCO_AJUSTADO_HABILITADO */
  reitFcoAjustado?: boolean;
  /** ANALISE_ATIVOS_EUA_ROTULOS_EN_HABILITADO */
  rotulosEn?: boolean;
}

/**
 * 7 KPIs EUA. Stock: ROE, Margem líq., Dív.líq./EBITDA, LPA, Div./ação, Payout, Lucros seguidos.
 * REIT: Caixa op./ação, Div./ação, Div./caixa op., Dív.líq./EBITDA, Receita, Lucro líquido, Div.
 * crescendo. Valores em US$ com a unidade no rótulo; nada que dependa de cotação.
 *
 * fundamentei-regras (F3): com `reitFcoAjustado` o REIT troca Caixa op./ação e Div./caixa op. pelo
 * caixa ajustado pela remuneração em ações (ano sem SBC: o sem ajuste, com a linha de apoio
 * 'sem remuneração em ações no 10-K'); com `rotulosEn` os nomes vêm em inglês (textosEuaEn) e a
 * linha de apoio segue em português (Receita/Lucro: a unidade 'US$ bi' passa para a linha de apoio).
 */
export function montarKpisEua(e: EntradaKpisEua, opcoes: OpcoesKpisEua = {}): KpiAtivo[] {
  const E = TEXTOS_EUA_TELAS.ativo.kpis;
  const v = e.valores;
  const en = opcoes.rotulosEn === true;
  const sub = (modelo: string) => (e.ano === null ? null : formatarTexto(modelo, { ano: e.ano }));
  const kpi = (
    codigo: string,
    rotulo: string,
    valor: number | null | undefined,
    formato: KpiAtivo['formato'],
    linhaApoio: string | null,
  ): KpiAtivo => ({
    codigo,
    rotulo: (en ? rotuloEuaEn(codigo) : null) ?? rotulo,
    valor: ok(valor),
    formato,
    sub: linhaApoio,
    selo: null,
  });
  const bi = (x: number | null | undefined) =>
    typeof x === 'number' && Number.isFinite(x) ? x / 1e9 : null;
  const dl = v?.dividaLiquida ?? null;
  const subDl =
    dl === null
      ? E.subs.ebitdaCalculado
      : dl <= 0
        ? E.subs.caixaLiquido
        : formatarTexto(E.subs.dividaLiquida, { valor: formatarNumeroBR(dl / 1e9, 1) });
  const dpa = kpi(
    'dpa',
    E.rotulos.dpa,
    v?.dpa,
    'numero2',
    e.dpaCalculado ? sub(E.subs.dpaCalculado) : sub(E.subs.dpa),
  );
  const divLiq = kpi('divLiqEbitda', E.rotulos.divLiqEbitda, v?.divLiqEbitda, 'multiplo', subDl);
  if (e.classe === 'reit') {
    const ajustado = opcoes.reitFcoAjustado === true;
    const semSbc = ajustado && v?.sbcIndisponivel === true;
    const caixa = ajustado
      ? [
          kpi(
            'fcoAjustadoAcao',
            E.rotulos.fcoAjustadoAcao,
            v?.fcoAjustadoAcao,
            'numero2',
            semSbc ? E.subs.sbcIndisponivel : E.subs.fcoAjustadoAcao,
          ),
          dpa,
          kpi(
            'divFcoAjustado',
            E.rotulos.divFcoAjustado,
            v?.divFcoAjustadoPct,
            'pct',
            semSbc ? E.subs.sbcIndisponivel : E.subs.divFcoAjustado,
          ),
        ]
      : [
          kpi('fcoAcao', E.rotulos.fcoAcao, v?.fcoAcao, 'numero2', E.subs.fcoAcao),
          dpa,
          kpi('divFco', E.rotulos.divFco, v?.divFcoPct, 'pct', E.subs.divFco),
        ];
    return [
      ...caixa,
      divLiq,
      kpi(
        'receita',
        E.rotulos.receita,
        bi(v?.receita),
        'numero2',
        en ? sub(E.subs.receitaEn) : sub(E.subs.fy),
      ),
      kpi(
        'lucro',
        E.rotulos.lucro,
        bi(v?.lucro),
        'numero2',
        en ? E.subs.lucroEn : E.subs.lucroReit,
      ),
      kpi(
        'anosDividendo',
        E.rotulos.anosDividendo,
        e.anosDividendo,
        'inteiro',
        E.subs.anosDividendo,
      ),
    ];
  }
  return [
    kpi('roe', E.rotulos.roe, v?.roePct, 'pct', sub(E.subs.roe)),
    kpi('margemLiquida', E.rotulos.margemLiquida, v?.margemPct, 'pct', sub(E.subs.margem)),
    ...(e.financeira === true ? [] : [divLiq]),
    kpi('lpa', E.rotulos.lpa, v?.lpa, 'numero2', sub(E.subs.lpa)),
    dpa,
    kpi('payout', E.rotulos.payout, v?.payoutPct, 'pct', sub(E.subs.payout)),
    kpi(
      'lucrosSeguidos',
      E.rotulos.lucrosSeguidos,
      e.anosLucroConsecutivos,
      'inteiro',
      E.subs.lucrosSeguidos,
    ),
  ];
}
