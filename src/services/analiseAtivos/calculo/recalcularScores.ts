/**
 * Etapas 4–6 do job scores: múltiplos atuais de todo o universo (AssetMultiplesCurrent), Índice MF +
 * semáforo (AssetScore) e retenção de asset_scores.
 *
 * - dataRef = último pregão com cotação (max AssetQuoteResumo.ultimoPregao), nunca o dia do run: runs
 *   de sábado/domingo regravam a mesma chave (symbol, dataRef).
 * - Ações (decisão 13): Índice POR EMPRESA, calculado no ticker de referência (maior volume médio de
 *   21 pregões) e replicado aos demais; DY e P/L por ticker ficam em AssetMultiplesCurrent.
 * - FIIs: régua = FiiMonthly.reguaVigente (fatia B); FoF e PL ≤ 0 fora do Índice; ticker não conferido
 *   no FiiTickerMap não recebe score (params.fii.exigirTickerConferido) e entra na contagem do run.
 */
import type { Prisma } from '@prisma/client';
import type { EventoComCnpj } from '@/services/analiseAtivos/calculo/recalcularEventos';
import {
  aplicarRetencaoScores,
  gravarMultiplosAtuais,
  gravarScores,
  lerDpaAnualGravado,
  lerPlAnualGravado,
  type DpaAnualGravado,
  type PlAnualPonto,
} from '@/services/analiseAtivos/calculo/gravarDerivados';
import {
  fatorEquivalencia,
  umFyPorAno,
  valorMercadoEmpresa,
  type MemoriaCalculo,
} from '@/services/analiseAtivos/calculo/recalcularDerivados';
import {
  agrupar,
  type DadosBase,
  type FiiMesEnxuto,
} from '@/services/analiseAtivos/calculo/universo';
import {
  calcularIndiceComParams,
  componentesIndiceAcao,
  componentesIndiceFii,
  NOMES_COMPONENTES,
  type ComponentesIndice,
  type ResultadoIndiceCalc,
} from '@/services/analiseAtivos/regras/calculo/indiceMf';
import {
  achatarValores,
  multiplosAtuais,
  type MultiplosCalculados,
  type HistoricoPl,
} from '@/services/analiseAtivos/regras/calculo/multiplos';
import {
  motivoProventosDefasados,
  rendimento12m,
  ultimaDataCom,
  valorProventosComCobertura,
  type MotivoDefasagemProventos,
  type ProventoAuditadoCompleto,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import {
  fatorEventosEntre,
  saltoAcoesSemEvento,
} from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import {
  dyParaIndice,
  flagEmConferencia,
  motivoProventosEmConferencia,
  PREFIXO_FLAG_EM_CONFERENCIA,
  saltoProventoRecente,
  type DpaAnual,
} from '@/services/analiseAtivos/regras/calculo/plausibilidadeProventos';
import {
  aplicarConferenciaComponentes,
  aplicarConferenciaSemaforo,
  componentesEmConferencia,
  conferenciasDaEmpresa,
  contarRegras,
  flagsDasDeteccoes,
  regrasAcimaDoLimite,
  type ConferenciaAplicada,
  type ContagemRegra,
  type Deteccao,
  type MetricaPorComponente,
} from '@/services/analiseAtivos/regras/calculo/sanidade/aplicarConferencia';
import { revisaoDpaDmpl } from '@/services/analiseAtivos/regras/calculo/sanidade/divergenciaFonte';
import { detectarEscalaAcoes } from '@/services/analiseAtivos/regras/calculo/sanidade/escalaAcoes';
import {
  detectarFiiObrigacoes,
  detectarFiiVp,
  revisaoFiiPl,
} from '@/services/analiseAtivos/regras/calculo/sanidade/fii';
import {
  detectarSaltoEscalaFundamentos,
  revisaoVariacaoLucro,
  revisaoVariacaoNivel,
} from '@/services/analiseAtivos/regras/calculo/sanidade/fundamentosRevisao';
import {
  detectarPrecoBase,
  menosDias,
  type PregaoSerie,
} from '@/services/analiseAtivos/regras/calculo/sanidade/precoBase';
import { detectarPrecoEsporadico } from '@/services/analiseAtivos/regras/calculo/sanidade/precoEsporadico';
import {
  criteriosDaRegua,
  semaforo,
  type ResultadoSemaforo,
} from '@/services/analiseAtivos/regras/calculo/semaforo';
import {
  anosLucroConsecutivosDetalhado,
  lucroParaSequencia,
  mesesComRendimentoDetalhado,
} from '@/services/analiseAtivos/regras/calculo/sequencias';
import { pregaoAnterior } from '@/services/analiseAtivos/regras/comum/pregoes';
import { ausente, deNumero, naoSeAplica, ok } from '@/services/analiseAtivos/regras/comum/valor';
import { fundamentosVigentes } from '@/services/analiseAtivos/repositorio/acoes';
import { deData } from '@/services/analiseAtivos/repositorio/conversao';
import {
  resumoCotacoes,
  serieRecenteCotacoes,
  simbolosComSaltoDePreco,
} from '@/services/analiseAtivos/repositorio/cotacoes';
import { fiiTrimestralUltimos } from '@/services/analiseAtivos/repositorio/fii';
import { menosMeses } from '@/services/analiseAtivos/regras/calculo/proventos';
import type {
  CoberturaProventos,
  ContagemAcoes,
  EmissorInfo,
  FiiTrimestre,
  FundamentosPeriodo,
  JobContexto,
  MotivoNaoSeAplica,
  NomeComponente,
  Regua,
  ResumoCotacao,
  ScoringParams,
  TickerAcao,
  Valor,
} from '@/services/analiseAtivos/tipos';

/** Último pregão com cotação (≤ hoje). Sem cotação nenhuma: pregão anterior a hoje. */
export function dataRefScores(
  resumos: Pick<ResumoCotacao, 'ultimoPregao'>[],
  hoje: string,
): string {
  let max: string | null = null;
  for (const r of resumos)
    if (r.ultimoPregao <= hoje && (!max || r.ultimoPregao > max)) max = r.ultimoPregao;
  return max ?? pregaoAnterior(hoje);
}

/** TTM (fatia A) com os saldos de balanço completados pelo período de mesma data-fim. */
export function mesclarTtm(
  ttm: FundamentosPeriodo | null,
  balanco: FundamentosPeriodo | null,
): FundamentosPeriodo | null {
  if (!ttm) return balanco;
  if (!balanco) return ttm;
  const saldos = [
    'ativoTotal',
    'ativoCirculante',
    'passivoCirculante',
    'caixa',
    'aplicacoesFinanceiras',
    'dividaBrutaCp',
    'dividaBrutaLp',
    'pl',
    'plControladora',
  ] as const;
  const out: FundamentosPeriodo = { ...ttm };
  for (const k of saldos) if (out[k] === null) out[k] = balanco[k];
  return out;
}

/**
 * Histórico do P/L para a média de 10 anos. `honrarConferencia` (só com
 * sanidade.conferencia.ligada): o ano com 'conf:historico:*' vira ausente('em_conferencia') — sai da
 * média sem deslocar a janela de 10 exercícios (R2 do bloco C).
 */
function historicoPlValor(
  lista: PlAnualPonto[],
  honrarConferencia = false,
): Array<{ anoFiscal: number; pl: Valor<number> }> {
  return lista.map((l) => ({
    anoFiscal: l.anoFiscal,
    pl:
      honrarConferencia && l.emConferencia
        ? ausente('em_conferencia', 'historico')
        : l.pl !== null
          ? ok(l.pl)
          : l.plNaoSeAplica
            ? naoSeAplica('base_nao_positiva')
            : ausente('sem_dado_fonte'),
  }));
}

function comCobertura(
  v: Valor<number>,
  provs: ProventoAuditadoCompleto[],
  cob: CoberturaProventos | undefined,
): Valor<number> {
  return valorProventosComCobertura(v, provs.length > 0, cob ?? null);
}

/** Meses distintos com informe mensal por ano (mesma regra do Quadro para anos fechados de FII). */
export function mesesInformePorAno(
  meses: Array<Pick<FiiMesEnxuto, 'refMonth'>>,
): Record<number, number> {
  const porAno = new Map<number, Set<string>>();
  for (const m of meses) {
    const ano = Number(m.refMonth.slice(0, 4));
    const s = porAno.get(ano) ?? new Set<string>();
    s.add(m.refMonth.slice(0, 7));
    porAno.set(ano, s);
  }
  return Object.fromEntries([...porAno].map(([a, s]) => [a, s.size]));
}

function componentesJson(c: ComponentesIndice): Prisma.InputJsonValue {
  const out: Record<string, Record<string, unknown>> = {};
  for (const nome of NOMES_COMPONENTES) out[nome] = { ...c[nome] };
  return out as Prisma.InputJsonValue;
}

function notaComponente(
  r: ResultadoIndiceCalc,
  nome: (typeof NOMES_COMPONENTES)[number],
): number | null {
  const c = r.componentes[nome];
  return c.estado === 'nao_se_aplica' ? null : c.nota;
}

export interface EntradaAtualAcao {
  ticker: TickerAcao;
  resumo: ResumoCotacao;
  tickersEmpresa: TickerAcao[];
  resumosEmpresa: Map<string, number>;
  fundAtual: FundamentosPeriodo | null;
  fys: FundamentosPeriodo[];
  contagens: ContagemAcoes[];
  emissor: EmissorInfo | undefined;
  proventos: ProventoAuditadoCompleto[];
  eventos: EventoComCnpj[];
  cobertura: CoberturaProventos | undefined;
  historicoPl: PlAnualPonto[];
  dataRef: string;
  /** frescor da base de proventos (motivoProventosDefasados); sem ele, não confere */
  frescor?: FrescorProventos;
  /** DPA anual gravado (AssetPerShareYearly) para a trava de salto; sem ele, só o teto vale */
  dpaAnual?: Array<DpaAnual & Pick<DpaAnualGravado, 'payoutPorAcaoPct'>>;
  /** bloco C: só lido com sanidade.conferencia.ligada (v2) */
  sanidade?: EntradaSanidade;
}

/** Entrada do motor de sanidade do bloco C (regras/calculo/sanidade). */
export interface EntradaSanidade {
  /** série recente de cotações do ticker (janela precoBase.janelaDias) */
  serie: PregaoSerie[];
  /** liberações da curadoria ('SYMBOL|regra|chave') */
  liberacoes?: ReadonlySet<string>;
}

export interface FrescorProventos {
  /** lastCheckedAt do símbolo; undefined = sem linha de cobertura (não confere) */
  verificadoEm: string | null | undefined;
  ultimaDataComDaClasse: string | null;
}

/** Valor de proventos (DPA/rendimento 12m, meses) vira ausente('fonte_defasada') com base parada. */
function defasagemProventos(
  classe: 'acao' | 'fii',
  e: { proventos: ProventoAuditadoCompleto[]; dataRef: string; frescor?: FrescorProventos },
  p: ScoringParams,
): MotivoDefasagemProventos | null {
  if (!e.frescor) return null;
  return motivoProventosDefasados(
    {
      classe,
      proventos: e.proventos,
      verificadoEm: e.frescor.verificadoEm,
      ultimaDataComDaClasse: e.frescor.ultimaDataComDaClasse,
      hoje: e.dataRef,
    },
    p,
  );
}

export interface CalculoAtualAcao {
  m: MultiplosCalculados & Partial<HistoricoPl>;
  anos: Valor<number>;
  /** ano ausente que interrompeu a sequência de lucro (≠ prejuízo) ⇒ Índice incompleto */
  anosLacuna?: number | null;
  lucroUltimoFy: Valor<number>;
  lpaTtm: Valor<number>;
  vpa: Valor<number>;
  dpa12m: Valor<number>;
  payoutPct: Valor<number>;
  plControladora: Valor<number>;
  /** DY 12m que entra no Índice/semáforo (trava de plausibilidade aplicada) */
  dyIndice?: Valor<number>;
  flags: string[];
  /** bloco C: conferências ('conf:') que valem para o Índice da empresa (comConferenciasDaEmpresa) */
  conferenciasIndice?: ConferenciaAplicada[];
}

/**
 * Bloco C: detecções do motor de sanidade de um ticker de ação (R1 acoes_escala, R3 preco_base, R4
 * preco_esporadico, R7 fundamentos_escala; revisão R8 e dpa_dmpl). Pura.
 */
export function deteccoesAcao(
  e: EntradaAtualAcao,
  m: MultiplosCalculados,
  fys: FundamentosPeriodo[],
  contagem: { data: string | null; valorMercadoBruto?: Valor<number> },
  p: ScoringParams,
): Deteccao[] {
  const cfg = p.sanidade.conferencia;
  const serie = e.sanidade?.serie ?? [];
  const fyUltimo = fys[fys.length - 1];
  const vmUltimoFy = fyUltimo
    ? (e.historicoPl.find((h) => h.anoFiscal === fyUltimo.anoFiscal)?.valorMercadoEmpresa ?? null)
    : null;
  const eventoDesdeFy = fyUltimo
    ? e.eventos.some((ev) => ev.status === 'confirmado' && ev.dataEvento > fyUltimo.dtFim)
    : false;
  const out: Array<Deteccao | null> = [
    detectarEscalaAcoes(
      {
        pvp: m.pvp,
        pl: m.pl,
        valorMercado: contagem.valorMercadoBruto ?? m.valorMercadoEmpresa,
        valorMercadoUltimoFy: vmUltimoFy,
        eventoConfirmadoDesdeFy: eventoDesdeFy,
        dataContagem: contagem.data,
      },
      cfg,
    ),
    detectarPrecoBase(serie, e.eventos, e.dataRef, cfg.precoBase),
    detectarPrecoEsporadico(
      {
        classe: 'acao',
        pregoesComNegocio21: e.resumo.pregoesComNegocio21,
        ultimoPregao: e.resumo.ultimoPregao,
        pvp: m.pvp,
        serie,
      },
      cfg.esporadico,
    ),
    detectarSaltoEscalaFundamentos(fys, cfg),
    revisaoVariacaoNivel(fys, cfg.rev),
    revisaoVariacaoLucro(fys, cfg.rev),
    revisaoDpaDmpl(
      (e.dpaAnual ?? []).map((d) => ({
        anoFiscal: d.anoFiscal,
        payoutPorAcaoPct: d.payoutPorAcaoPct ?? null,
        payoutDmplPct: d.payoutDmplPct ?? null,
      })),
      e.dataRef,
      cfg.rev,
    ),
  ];
  return out.filter((d): d is Deteccao => d !== null);
}

/** Função pura: múltiplos do dia de um ticker de ação. */
export function calcularAtualAcao(e: EntradaAtualAcao, p: ScoringParams): CalculoAtualAcao {
  const flags: string[] = [];
  const conferenciaLigada = p.sanidade.conferencia.ligada;
  const fys = umFyPorAno(e.fys);
  const serieLucro = fys.map((f) => ({
    anoFiscal: f.anoFiscal,
    lucro: lucroParaSequencia(f),
  })) as Array<{ anoFiscal: number; lucro: Valor<number> }>;
  const seq = anosLucroConsecutivosDetalhado(serieLucro);
  const anos = seq.valor;
  if (seq.lacuna !== null) flags.push(`lucro_serie_com_lacuna_${seq.lacuna}`);
  // último FY: só o atribuível do escopo escolhido (o individual entra apenas na sequência)
  const fyUltimo = fys[fys.length - 1];
  const ultimoFy: Valor<number> = !fyUltimo
    ? ausente('sem_dado_fonte', 'sem_fy')
    : lucroParaSequencia({ ...fyUltimo, lucroAtribuivelIndividual: null });
  let fund = e.fundAtual;
  if (!fund && fys.length > 0) {
    fund = fys[fys.length - 1];
    flags.push('ttm_ausente_usou_fy');
  }
  // escala declarada ambígua no documento (regras/acoes/escalaDeclarada.ts): não corrigida ⇒ incompleto
  if (fund?.flags.includes('escala_ambigua') || fyUltimo?.flags.includes('escala_ambigua')) {
    flags.push('escala_ambigua');
  }
  const contMaisRecente =
    [...e.contagens]
      .filter((c) => c.total !== null)
      .sort((a, b) => b.data.localeCompare(a.data))[0] ?? null;
  // regra 13 também na contagem dos múltiplos do dia: salto contra o último DFP validado que os
  // eventos confirmados não explicam ⇒ sem nº de ações (múltiplos por ação ausentes, Índice
  // incompleto) em vez de múltiplos 1000× errados (PSSA3/BEES3/RAPT4 2026)
  const refDfp = contMaisRecente
    ? ([...e.contagens]
        .filter(
          (c) =>
            c.total !== null &&
            c.total > 0 &&
            c.data < contMaisRecente.data &&
            !c.fonte.startsWith('itr') &&
            c.status === 'ok',
        )
        .sort((a, b) => b.data.localeCompare(a.data))[0] ?? null)
    : null;
  const saltoSemEvento =
    contMaisRecente !== null &&
    refDfp !== null &&
    saltoAcoesSemEvento(
      refDfp.total!,
      contMaisRecente.total!,
      fatorEventosEntre(e.eventos, refDfp.data, contMaisRecente.data),
      p,
    );
  if (saltoSemEvento) flags.push('salto_acoes_sem_evento');
  // sem DFP anterior validado ('ok') para servir de referência (todos 'nao_verificavel'/'alerta',
  // ou nenhum): a contagem mais recente só vale se ela mesma bater com lucro × LPA publicado
  // (status 'ok' = razão dentro de ±razaoLpaAlertaPct); senão não há como verificar ⇒ sem nº de
  // ações (múltiplos por ação ausentes) e Índice incompleto
  const naoVerificavel =
    contMaisRecente !== null && refDfp === null && contMaisRecente.status !== 'ok';
  if (naoVerificavel) flags.push('acoes_nao_verificavel');
  const cont = saltoSemEvento || naoVerificavel ? null : contMaisRecente;
  const fator = fatorEquivalencia(e.ticker);
  if (fator === null) flags.push('unit_sem_composicao');
  const defasagem = defasagemProventos('acao', e, p);
  if (defasagem) flags.push(`proventos_defasados_${defasagem}`);
  const dpa12m: Valor<number> = defasagem
    ? ausente('fonte_defasada', defasagem)
    : comCobertura(
        rendimento12m(e.proventos, e.dataRef, 'acao', e.eventos, p),
        e.proventos,
        e.cobertura,
      );
  const vm = valorMercadoEmpresa(e.tickersEmpresa, e.resumosEmpresa, cont);
  const vazio: FundamentosPeriodo['naoSeAplica'] = [];
  const m = multiplosAtuais(
    {
      classe: 'acao',
      preco: e.resumo.closeRaw,
      acoesTotais: fator === null ? null : (cont?.total ?? null),
      fatorEquivalencia: fator ?? 1,
      valorMercadoEmpresa: vm,
      fund: fund ?? {
        receita: null,
        lucroLiquido: null,
        lucroAtribuivel: null,
        ebit: null,
        depreciacaoAmortizacao: null,
        ativoTotal: null,
        ativoCirculante: null,
        passivoCirculante: null,
        caixa: null,
        aplicacoesFinanceiras: null,
        dividaBrutaCp: null,
        dividaBrutaLp: null,
        pl: null,
        plControladora: null,
        fco: null,
        capex: null,
        naoSeAplica: vazio,
        flags: [],
      },
      dpa: dpa12m,
      ehFinanceira: e.emissor?.ehFinanceira ?? false,
      historicoPl: historicoPlValor(e.historicoPl, conferenciaLigada),
    },
    p,
  );
  const lpa = m.lpa ?? ausente('sem_dado_fonte');
  // payout do TTM = DPA 12m ÷ LPA TTM (LPA ≤ 0 ⇒ n/a, regra 4)
  let payoutPct: Valor<number>;
  if (lpa.estado !== 'ok') payoutPct = lpa;
  else if (dpa12m.estado !== 'ok') payoutPct = dpa12m;
  else if (!(lpa.valor > 0)) payoutPct = naoSeAplica('base_nao_positiva');
  else payoutPct = ok((dpa12m.valor / lpa.valor) * 100);
  m.payoutPct = payoutPct;
  // trava de plausibilidade (regras/calculo/plausibilidadeProventos): DY acima do teto ou salto de
  // provento recente ⇒ DY "em conferência", fora do Índice e do semáforo
  const motivoConf = motivoProventosEmConferencia(
    {
      classe: 'acao',
      dyPct: m.dyPct,
      saltoRecente: saltoProventoRecente(
        {
          classe: 'acao',
          porAno: e.dpaAnual ?? [],
          hoje: e.dataRef,
          dpa12m: dpa12m.estado === 'ok' ? dpa12m.valor : null,
          payoutTtmPct: payoutPct.estado === 'ok' ? payoutPct.valor : null,
        },
        p,
      ),
    },
    p,
  );
  if (motivoConf) flags.push(flagEmConferencia(motivoConf));
  // R1 (bloco C): sem nº de ações validado (salto sem evento / não verificável), a razão de VM usa a
  // contagem BRUTA mais recente — é exatamente o caso de escala que a regra procura (PDGR3, SEQL3,
  // SOJA3, AZEV3/4 no DEV); P/L e P/VP continuam ausentes
  const contagemParaEscala = (): { data: string | null; valorMercadoBruto?: Valor<number> } => {
    if (cont || !contMaisRecente?.total || !(contMaisRecente.total > 0) || fator === null) {
      return { data: cont?.data ?? null };
    }
    const vm =
      valorMercadoEmpresa(e.tickersEmpresa, e.resumosEmpresa, contMaisRecente) ??
      (e.resumo.closeRaw * contMaisRecente.total) / fator;
    return { data: contMaisRecente.data, valorMercadoBruto: vm > 0 ? ok(vm) : undefined };
  };
  // bloco C (só v2): regras de sanidade por grupo — flags conf:/rev:/info:, salvo liberação
  if (conferenciaLigada) {
    flags.push(
      ...flagsDasDeteccoes(
        e.ticker.symbol,
        deteccoesAcao(e, m, fys, contagemParaEscala(), p),
        e.sanidade?.liberacoes,
      ),
    );
  }
  return {
    m,
    anos,
    anosLacuna: seq.lacuna,
    lucroUltimoFy: ultimoFy,
    lpaTtm: lpa,
    vpa: m.vpa ?? ausente('sem_dado_fonte'),
    dpa12m,
    payoutPct,
    plControladora: deNumero(fund?.plControladora ?? fund?.pl ?? null),
    dyIndice: dyParaIndice(m.dyPct, motivoConf),
    flags: [...flags, ...m.flags],
  };
}

/**
 * Trava de plausibilidade POR EMPRESA (conferência de prod 02/10/2026, CEEB5): o Índice é da empresa
 * (calculado no ticker de referência, decisão 13) e replicado a todos os tickers, mas o DY em
 * conferência é por ticker (preço e proventos próprios). CEEB5 tinha `dy_acima_teto` e o Índice da
 * COELBA, calculado no CEEB3, ficava 'calculado' — o Quadro mostrava o DY em conferência numa linha
 * com Índice completo. Regra: se QUALQUER ticker da empresa tem o DY em conferência, o DY da
 * referência entra no Índice/semáforo como ausente('em_conferencia') (motivo do primeiro ticker
 * marcado). DY da referência já ausente (fonte defasada, sem dado) fica como está. Função pura.
 */
export function comConferenciaDaEmpresa(
  ref: CalculoAtualAcao,
  todos: Iterable<CalculoAtualAcao>,
): CalculoAtualAcao {
  const dyRef = ref.dyIndice ?? dyParaIndice(ref.m.dyPct, null);
  if (dyRef.estado !== 'ok') return ref;
  for (const c of todos) {
    const flag = c.flags.find((f) => f.startsWith(PREFIXO_FLAG_EM_CONFERENCIA));
    if (flag) {
      return {
        ...ref,
        dyIndice: ausente('em_conferencia', flag.slice(PREFIXO_FLAG_EM_CONFERENCIA.length)),
      };
    }
  }
  return ref;
}

/**
 * Bloco C — escopo empresa × ticker (spec fatia A item 1): além da trava do DY (acima), as flags
 * 'conf:' de QUALQUER ticker da empresa valem para o Índice calculado na referência quando
 * `deveContaminarEmpresa` (grupo de escopo 'empresa', ou o próprio ticker de referência). preco_base e
 * preco_esporadico de uma PN ilíquida NÃO tiram o C_preço da ON. Sem flag 'conf:' (v1) ⇒ idêntico a
 * comConferenciaDaEmpresa. Função pura.
 */
export function comConferenciasDaEmpresa(
  refSymbol: string,
  ref: CalculoAtualAcao,
  todos: ReadonlyMap<string, CalculoAtualAcao>,
): CalculoAtualAcao {
  const base = comConferenciaDaEmpresa(ref, todos.values());
  const conferencias = conferenciasDaEmpresa(
    refSymbol,
    [...todos].map(([s, c]) => [s, c.flags] as const),
  );
  return conferencias.length > 0 ? { ...base, conferenciasIndice: conferencias } : base;
}

/** Motivos de incompleto que scoreAcao acrescenta fora dos componentes. */
const EXTRAS_ACAO = [
  'acoes:salto_sem_evento',
  'fundamentos:escala_ambigua',
  'acoes:nao_verificavel',
];

function metricasDosComponentes(
  cfg: Partial<Record<NomeComponente, { metrica?: string }>>,
): MetricaPorComponente {
  const out: MetricaPorComponente = {};
  for (const nome of NOMES_COMPONENTES) {
    const m = cfg[nome]?.metrica;
    if (m) out[nome] = m;
  }
  return out;
}

function metricasDoSemaforo(regua: Regua, p: ScoringParams): Map<string, string> {
  return new Map(criteriosDaRegua(regua, p).map((c) => [c.codigo, c.metrica]));
}

export interface ScoreCalculado {
  regua: Regua;
  indice: ResultadoIndiceCalc;
  semaforo: ResultadoSemaforo;
  fiiTipo: string | null;
  motivosExtras: string[];
  /** bloco C: componentes que o motor de sanidade pôs em conferência (relatório; não é gravado) */
  emConferenciaBlocoC?: NomeComponente[];
  /** bloco C (só com a conferência ligada): o Índice estaria completo sem as conferências do bloco C */
  completoSemBlocoC?: boolean;
}

/** Componentes que mudaram de estado com a conferência (antes ≠ depois). */
function componentesTrocados(
  antes: ComponentesIndice,
  depois: ComponentesIndice,
): NomeComponente[] {
  return NOMES_COMPONENTES.filter((n) => antes[n] !== depois[n]);
}

/** Função pura: Índice + semáforo de uma empresa a partir do ticker de referência. */
export function scoreAcao(
  c: CalculoAtualAcao,
  ehFinanceira: boolean,
  p: ScoringParams,
): ScoreCalculado {
  const regua: Regua = ehFinanceira ? 'acao_financeira' : 'acao';
  const m = c.m;
  const comps = componentesIndiceAcao(
    {
      anosLucroConsecutivos: c.anos,
      lucroUltimoFy: c.lucroUltimoFy,
      ehFinanceira,
      dividaLiquida: m.dividaLiquida ?? ausente('sem_dado_fonte'),
      ebitda: m.ebitda ?? ausente('sem_dado_fonte'),
      roePct: m.roePct ?? ausente('sem_dado_fonte'),
      plControladora: c.plControladora,
      dy12mPct: c.dyIndice ?? dyParaIndice(m.dyPct, null),
      plVsMedia10aPct: m.plVsMedia10aPct ?? ausente('historico_curto'),
    },
    p,
  );
  const conf = c.conferenciasIndice ?? [];
  const afetados = componentesEmConferencia(
    conf,
    'acao',
    metricasDosComponentes(p.acao.componentes),
  );
  const compsConf = aplicarConferenciaComponentes(comps, afetados);
  const indice = calcularIndiceComParams(compsConf, regua, p);
  const incompletoSemBlocoC =
    afetados.size > 0 ? calcularIndiceComParams(comps, regua, p).incompleto : indice.incompleto;
  if (c.flags.includes('salto_acoes_sem_evento')) {
    indice.incompleto = true;
    indice.motivosIncompleto = [...indice.motivosIncompleto, 'acoes:salto_sem_evento'];
  }
  if (c.flags.includes('escala_ambigua')) {
    indice.incompleto = true;
    indice.motivosIncompleto = [...indice.motivosIncompleto, 'fundamentos:escala_ambigua'];
  }
  if (c.flags.includes('acoes_nao_verificavel')) {
    indice.incompleto = true;
    indice.motivosIncompleto = [...indice.motivosIncompleto, 'acoes:nao_verificavel'];
  }
  if (c.anosLacuna != null) {
    indice.incompleto = true;
    indice.motivosIncompleto = [
      ...indice.motivosIncompleto,
      `lucro:serie_com_lacuna_${c.anosLacuna}`,
    ];
  }
  const plNaoPositivo =
    (m.pl?.estado === 'nao_se_aplica' && m.pl.motivo === 'base_nao_positiva') ||
    (c.lucroUltimoFy.estado === 'ok' && c.lucroUltimoFy.valor <= 0);
  const sem = semaforo(
    {
      metricas: {
        anosLucroConsecutivos: c.anos,
        divLiqEbitda: m.divLiqEbitda ?? ausente('sem_dado_fonte'),
        roePct: m.roePct ?? ausente('sem_dado_fonte'),
        plVsMedia10aPct: m.plVsMedia10aPct ?? ausente('historico_curto'),
        dy12mPct: c.dyIndice ?? dyParaIndice(m.dyPct, null),
      },
      ehFinanceira,
      dividaLiquida: m.dividaLiquida,
      ebitda: m.ebitda,
      plControladora: c.plControladora,
      plNaoPositivo,
    },
    regua,
    p,
  );
  return {
    regua,
    indice,
    semaforo: aplicarConferenciaSemaforo(sem, conf, metricasDoSemaforo(regua, p)),
    fiiTipo: null,
    motivosExtras: [],
    ...(conf.length > 0 ? { emConferenciaBlocoC: componentesTrocados(comps, compsConf) } : {}),
    ...(p.sanidade.conferencia.ligada
      ? {
          completoSemBlocoC:
            !incompletoSemBlocoC &&
            !indice.motivosIncompleto.some(
              (m) => EXTRAS_ACAO.includes(m) || m.startsWith('lucro:'),
            ),
        }
      : {}),
  };
}

export interface EntradaAtualFii {
  resumo: ResumoCotacao;
  mesAtual: FiiMesEnxuto | null;
  trimestre: FiiTrimestre | null;
  proventos: ProventoAuditadoCompleto[];
  eventos: EntradaAtualAcao['eventos'];
  cobertura: CoberturaProventos | undefined;
  dataRef: string;
  frescor?: FrescorProventos;
  /** rendimento por cota anual gravado (AssetPerShareYearly) para a trava de salto */
  dpaAnual?: DpaAnual[];
  /** meses com informe mensal por ano (ano com < 12 sai da série, como no Quadro) */
  mesesInformePorAno?: Record<number, number>;
  /** bloco C: só lido com sanidade.conferencia.ligada (v2) */
  sanidade?: EntradaSanidade & { symbol: string; meses: FiiMesEnxuto[] };
}

export interface CalculoAtualFii {
  m: MultiplosCalculados;
  rend12m: Valor<number>;
  meses: Valor<number>;
  /** DY 12m que entra no Índice/semáforo (trava de plausibilidade aplicada) */
  dyIndice?: Valor<number>;
  flags: string[];
  /** bloco C: conferências ('conf:') do próprio FII que valem para o Índice */
  conferenciasIndice?: ConferenciaAplicada[];
}

/** Bloco C: detecções do motor de sanidade de um FII (R3, R4, R5, R6; revisão fii_pl). Pura. */
export function deteccoesFii(
  e: EntradaAtualFii,
  m: MultiplosCalculados,
  p: ScoringParams,
): Deteccao[] {
  const cfg = p.sanidade.conferencia;
  const serie = e.sanidade?.serie ?? [];
  const meses = (e.sanidade?.meses ?? []).map((x) => ({
    refMonth: x.refMonth,
    vpCota: x.vpCota,
    pl: x.pl,
    obrigacoesPlPct: x.obrigacoesPlPct,
    fatorDesdobramento: x.fatorDesdobramento,
  }));
  const out: Array<Deteccao | null> = [
    detectarPrecoBase(serie, e.eventos, e.dataRef, cfg.precoBase),
    detectarPrecoEsporadico(
      {
        classe: 'fii',
        pregoesComNegocio21: e.resumo.pregoesComNegocio21,
        ultimoPregao: e.resumo.ultimoPregao,
        pvp: m.pvp,
        serie,
        vps: meses,
      },
      cfg.esporadico,
    ),
    detectarFiiVp(meses, cfg),
    detectarFiiObrigacoes(e.mesAtual, cfg),
    revisaoFiiPl(meses, cfg.rev),
  ];
  return out.filter((d): d is Deteccao => d !== null);
}

export function calcularAtualFii(e: EntradaAtualFii, p: ScoringParams): CalculoAtualFii {
  const defasagem = defasagemProventos('fii', e, p);
  const rend12m: Valor<number> = defasagem
    ? ausente('fonte_defasada', defasagem)
    : comCobertura(
        rendimento12m(e.proventos, e.dataRef, 'fii', e.eventos, p),
        e.proventos,
        e.cobertura,
      );
  const det = mesesComRendimentoDetalhado(e.proventos, e.dataRef, p);
  const meses: Valor<number> = defasagem
    ? ausente('fonte_defasada', defasagem)
    : e.proventos.length > 0 || e.cobertura === 'EMPTY' || e.cobertura === 'OK'
      ? ok(det.meses)
      : ausente(e.cobertura === 'FETCH_FAIL' ? 'fonte_falhou' : 'sem_dado_fonte');
  const m = multiplosAtuais(
    {
      classe: 'fii',
      preco: e.resumo.closeRaw,
      vpCota: e.mesAtual?.vpCota ?? null,
      rendCota: rend12m,
      obrigacoesPlPct: e.mesAtual?.obrigacoesPlPct ?? null,
      vacanciaFisicaCvmPct: e.trimestre?.vacanciaFisicaCvmPct ?? null,
      nImoveisCvm: e.trimestre?.nImoveisRenda ?? null,
      pl: e.mesAtual?.pl ?? null,
    },
    p,
  );
  const flags = [...m.flags];
  if (defasagem) flags.push(`proventos_defasados_${defasagem}`);
  if (det.mesEstimado) flags.push('mes_estimado');
  if (!e.mesAtual) flags.push('sem_informe_mensal');
  const motivoConf = motivoProventosEmConferencia(
    {
      classe: 'fii',
      dyPct: m.dyPct,
      saltoRecente: saltoProventoRecente(
        {
          classe: 'fii',
          porAno: e.dpaAnual ?? [],
          hoje: e.dataRef,
          mesesPorAno: e.mesesInformePorAno,
          dpa12m: rend12m.estado === 'ok' ? rend12m.valor : null,
        },
        p,
      ),
    },
    p,
  );
  if (motivoConf) flags.push(flagEmConferencia(motivoConf));
  const out: CalculoAtualFii = {
    m,
    rend12m,
    meses,
    dyIndice: dyParaIndice(m.dyPct, motivoConf),
    flags,
  };
  // bloco C (só v2): o FII é o próprio ticker — as conferências valem direto para o Índice
  if (p.sanidade.conferencia.ligada && e.sanidade) {
    const symbol = e.sanidade.symbol;
    flags.push(...flagsDasDeteccoes(symbol, deteccoesFii(e, m, p), e.sanidade.liberacoes));
    const conf = conferenciasDaEmpresa(symbol, [[symbol, flags]]);
    if (conf.length > 0) out.conferenciasIndice = conf;
  }
  return out;
}

/** Régua do FII: reguaVigente da B; PL ≤ 0 ⇒ fora (regra 22); sem régua ⇒ tijolo + incompleto. */
export function reguaDoFii(
  mes: FiiMesEnxuto | null,
  p: ScoringParams,
): { regua: Regua; motivoFora: MotivoNaoSeAplica | null; motivosExtras: string[] } {
  if (mes?.pl !== null && mes?.pl !== undefined && mes.pl <= 0) {
    return { regua: 'fora_do_indice', motivoFora: 'base_nao_positiva', motivosExtras: [] };
  }
  const tipo = mes?.tipoVigente ?? null;
  if (tipo === 'fof' || mes?.reguaVigente === 'fora_do_indice') {
    return { regua: 'fora_do_indice', motivoFora: 'fof', motivosExtras: [] };
  }
  const extras: string[] = [];
  if (tipo === 'indefinido' && p.fii.indefinido.marcarIncompleto) extras.push('tipo:indefinido');
  if (mes?.reguaVigente === 'fii_tijolo' || mes?.reguaVigente === 'fii_papel') {
    return { regua: mes.reguaVigente, motivoFora: null, motivosExtras: extras };
  }
  return {
    regua: p.fii.indefinido.regua,
    motivoFora: null,
    motivosExtras: [...extras, 'regua:sem_informe'],
  };
}

export function scoreFii(c: CalculoAtualFii, e: EntradaAtualFii, p: ScoringParams): ScoreCalculado {
  const { regua, motivoFora, motivosExtras } = reguaDoFii(e.mesAtual, p);
  const nCri = deNumero(e.trimestre?.nCri ?? null);
  const maiorCri = deNumero(e.trimestre?.maiorCriPct ?? null);
  const compsBrutos = componentesIndiceFii(
    {
      mesesComRendimento: c.meses,
      obrigacoesPlPct: c.m.obrigacoesPlPct ?? ausente('sem_dado_fonte'),
      vacanciaFisicaCvmPct: c.m.vacanciaFisicaCvmPct ?? ausente('sem_dado_fonte'),
      dy12mPct: c.dyIndice ?? dyParaIndice(c.m.dyPct, null),
      pvp: c.m.pvp ?? ausente('sem_dado_fonte'),
      maiorCriPct: maiorCri,
      nCri,
    },
    regua,
    p,
    motivoFora ?? 'fof',
  );
  const conf = regua === 'fii_tijolo' || regua === 'fii_papel' ? (c.conferenciasIndice ?? []) : [];
  const cfgFii = regua === 'fii_papel' ? p.fii.papel.componentes : p.fii.tijolo.componentes;
  const comps = aplicarConferenciaComponentes(
    compsBrutos,
    componentesEmConferencia(conf, 'fii', metricasDosComponentes(cfgFii)),
  );
  const indice = calcularIndiceComParams(comps, regua, p, motivoFora ?? 'fof');
  const incompletoSemBlocoC =
    comps !== compsBrutos
      ? calcularIndiceComParams(compsBrutos, regua, p, motivoFora ?? 'fof').incompleto
      : indice.incompleto;
  if (motivosExtras.length > 0 && regua !== 'fora_do_indice') {
    indice.incompleto = true;
    indice.motivosIncompleto = [...indice.motivosIncompleto, ...motivosExtras];
  }
  const sem = semaforo(
    {
      metricas: {
        dy12mPct: c.dyIndice ?? dyParaIndice(c.m.dyPct, null),
        vacanciaFisicaCvmPct: c.m.vacanciaFisicaCvmPct ?? ausente('sem_dado_fonte'),
        nImoveisCvm: c.m.nImoveisCvm ?? ausente('sem_dado_fonte'),
        obrigacoesPlPct: c.m.obrigacoesPlPct ?? ausente('sem_dado_fonte'),
        pvp: c.m.pvp ?? ausente('sem_dado_fonte'),
        maiorCriPct: maiorCri,
        nCri,
      },
    },
    regua,
    p,
  );
  return {
    regua,
    indice,
    semaforo: aplicarConferenciaSemaforo(sem, conf, metricasDoSemaforo(regua, p)),
    fiiTipo: e.mesAtual?.tipoVigente ?? null,
    motivosExtras,
    ...(conf.length > 0 ? { emConferenciaBlocoC: componentesTrocados(compsBrutos, comps) } : {}),
    ...(p.sanidade.conferencia.ligada
      ? {
          completoSemBlocoC:
            !incompletoSemBlocoC && !(motivosExtras.length > 0 && regua !== 'fora_do_indice'),
        }
      : {}),
  };
}

function linhaScore(
  base: {
    symbol: string;
    cnpj: string;
    classe: 'acao' | 'fii';
    dataRef: string;
    tickerReferencia: string | null;
  },
  s: ScoreCalculado,
  meta: { paramsVersion: number; agora: Date },
): Prisma.AssetScoreCreateManyInput {
  const r = s.indice;
  return {
    symbol: base.symbol,
    cnpj: base.cnpj,
    dataRef: deData(base.dataRef),
    classe: base.classe,
    regua: s.regua,
    fiiTipo: s.fiiTipo,
    tickerReferencia: base.tickerReferencia,
    indiceMf: r.indice.estado === 'ok' ? r.indice.valor : null,
    cLucro: notaComponente(r, 'lucro'),
    cDivida: notaComponente(r, 'divida'),
    cRent: notaComponente(r, 'rent'),
    cDiv: notaComponente(r, 'div'),
    cPreco: notaComponente(r, 'preco'),
    componentes: componentesJson(r.componentes),
    pesosEfetivos: r.pesosEfetivos as Prisma.InputJsonValue,
    checks: s.semaforo.checks as unknown as Prisma.InputJsonValue,
    criteriosAplicaveis: s.semaforo.aplicaveis,
    criteriosAtendidos: s.semaforo.atendidos,
    incompleto: r.incompleto,
    motivosIncompleto: r.motivosIncompleto,
    paramsVersion: meta.paramsVersion,
    computedAt: meta.agora,
  };
}

function linhaAtual(
  base: { symbol: string; cnpj: string; classe: 'acao' | 'fii'; resumo: ResumoCotacao },
  m: MultiplosCalculados & Partial<HistoricoPl>,
  extras: {
    ttmDtFim?: string | null;
    lpaTtm?: Valor<number>;
    vpa?: Valor<number>;
    dpa12m?: Valor<number>;
    rend12m?: Valor<number>;
    anos?: Valor<number>;
    meses?: Valor<number>;
    flags: string[];
  },
  meta: { paramsVersion: number; agora: Date },
): Prisma.AssetMultiplesCurrentCreateManyInput {
  const { colunas, naoSeAplica: na } = achatarValores({
    lpaTtm: extras.lpaTtm,
    vpa: extras.vpa,
    dpa12m: extras.dpa12m,
    rend12m: extras.rend12m,
    vpCota: m.vpCota,
    pl: m.pl,
    pvp: m.pvp,
    pReceita: m.pReceita,
    evEbitda: m.evEbitda,
    pFco: m.pFco,
    pFcl: m.pFcl,
    dy12mPct: m.dyPct,
    payoutPct: m.payoutPct,
    margemLiquidaPct: m.margemLiquidaPct,
    roePct: m.roePct,
    roaPct: m.roaPct,
    roicPct: m.roicPct,
    divLiqEbitda: m.divLiqEbitda,
    divLiqPl: m.divLiqPl,
    liquidezCorrente: m.liquidezCorrente,
    obrigacoesPlPct: m.obrigacoesPlPct,
    plMedia10a: m.plMedia10a,
    plVsMedia10aPct: m.plVsMedia10aPct,
  });
  const inteiro = (v?: Valor<number>) => (v && v.estado === 'ok' ? Math.round(v.valor) : null);
  return {
    symbol: base.symbol,
    cnpj: base.cnpj,
    classe: base.classe,
    preco: base.resumo.closeRaw,
    precoData: deData(base.resumo.ultimoPregao),
    ttmDtFim: extras.ttmDtFim ? deData(extras.ttmDtFim) : null,
    ...colunas,
    anosLucroConsecutivos: inteiro(extras.anos),
    mesesComRendimento: inteiro(extras.meses),
    plPontosHistorico: m.plPontosHistorico ?? 0,
    naoSeAplica: na,
    flags: [...new Set(extras.flags)],
    paramsVersion: meta.paramsVersion,
    calculadoEm: meta.agora,
  };
}

export interface ResultadoScores {
  dataRef: string;
  multiplosAtuais: number;
  scores: number;
  gravadas: number;
  retencao: { apagadas: number; datas: string[] };
  acoes: {
    tickers: number;
    comPreco: number;
    comFy: number;
    comFyEPreco: number;
    comScore: number;
    scoreDeFyEPreco: number;
    incompletos: number;
  };
  fiis: {
    listados: number;
    naoConferidos: number;
    conferidosComPreco: number;
    fof: number;
    comInformeEPreco: number;
    comScore: number;
    incompletos: number;
  };
  pctIncompleto: number;
  coberturaAcoesPct: number | null;
  coberturaFiisPct: number | null;
  amostra: Array<Record<string, unknown>>;
  /** bloco C: relatório do motor de sanidade (só com sanidade.conferencia.ligada) */
  sanidade?: RelatorioSanidade;
}

export interface RelatorioSanidade {
  /** símbolos por regra ('conf:<grupo>:<regra>' | 'rev:<regra>' | 'info:<codigo>') e classe */
  regras: ContagemRegra[];
  /** linhas do Quadro (com score) por classe — base do percentual do alerta */
  totais: { acao: number; fii: number };
  /** regras bloqueantes acima de alertaPctQuadro% do Quadro de uma classe */
  acimaDoLimite: Array<{ regra: string; classe: 'acao' | 'fii'; n: number; pct: number }>;
  /** Índices (empresa/FII) com algum componente posto em conferência pelo bloco C */
  indicesEmConferencia: { acao: number; fii: number };
  /** Índices que estariam 'calculado' (completos) sem o bloco C */
  calculadosSemBlocoC: { acao: number; fii: number };
  /** desses, os que passam a incompletos por causa do bloco C (ações: ticker de referência) */
  calculadosQueCaem: { acao: string[]; fii: string[] };
  /** liberações da curadoria lidas no run */
  liberacoes: number;
}

const LOTE_FUND = 50;
/** FIIs por lote na leitura da série recente de cotações (bloco C) */
const LOTE_SERIE_FII = 100;

/** Fundamento "atual" por emissor: último TTM mesclado ao balanço do mesmo dtFim. */
function fundamentosAtuais(recentes: FundamentosPeriodo[]): Map<string, FundamentosPeriodo | null> {
  const out = new Map<string, FundamentosPeriodo | null>();
  for (const [cnpj, lista] of agrupar(recentes, (f) => f.emissorId)) {
    const ttm =
      lista
        .filter((f) => f.tipoPeriodo === 'TTM')
        .sort((a, b) => b.dtFim.localeCompare(a.dtFim))[0] ?? null;
    const balanco = ttm
      ? (lista.find((f) => f.dtFim === ttm.dtFim && f.tipoPeriodo !== 'TTM') ?? null)
      : null;
    out.set(cnpj, mesclarTtm(ttm, balanco));
  }
  return out;
}

export async function recalcularScores(
  ctx: JobContexto,
  dados: DadosBase,
  memoria: MemoriaCalculo,
  plAnualFresco: Map<string, PlAnualPonto[]>,
  opts: { gravar: boolean; retencao: boolean },
): Promise<ResultadoScores> {
  const p = ctx.params;
  const u = dados.universo;
  const meta = { paramsVersion: ctx.paramsVersion, agora: new Date() };
  const resumos = await resumoCotacoes(ctx.prisma);
  const resumoPor = new Map(resumos.map((r) => [r.symbol, r]));
  const dataRef = dataRefScores(resumos, ctx.hoje);
  // frescor da base de proventos por classe (data-com mais recente do universo da classe)
  const ultimaDataComClasse = (symbols: string[]) =>
    ultimaDataCom(
      symbols.flatMap((s) => memoria.proventos.get(s) ?? []),
      dataRef,
    );
  const ultimaDataComAcoes = ultimaDataComClasse(u.acoes.map((a) => a.symbol));
  const ultimaDataComFiis = ultimaDataComClasse(u.fiis.map((f) => f.symbol));
  const frescorDe = (symbol: string, ultima: string | null): FrescorProventos => ({
    verificadoEm: memoria.verificadoEm?.has(symbol) ? memoria.verificadoEm.get(symbol) : undefined,
    ultimaDataComDaClasse: ultima,
  });
  const defasados: Record<'acao' | 'fii', Record<string, number>> = { acao: {}, fii: {} };
  const contarDefasado = (classe: 'acao' | 'fii', flags: string[]) => {
    const f = flags.find((x) => x.startsWith('proventos_defasados_'));
    if (f) {
      const m = f.slice('proventos_defasados_'.length);
      defasados[classe][m] = (defasados[classe][m] ?? 0) + 1;
    }
  };

  // bloco C (só v2): série recente de cotações (precoBase/precoEsporadico) e liberações da curadoria
  const conferenciaLigada = p.sanidade.conferencia.ligada;
  const desdeSerie = menosDias(dataRef, p.sanidade.conferencia.precoBase.janelaDias);
  const liberacoes = memoria.liberacoes;
  const cfgConf = p.sanidade.conferencia;
  // só lê a série inteira de quem pode disparar R3 (pré-filtro do salto no banco) ou R4 com a mediana
  // (FII esporádico): manter o job scores dentro de +20% de prazo
  const comSalto = conferenciaLigada
    ? await simbolosComSaltoDePreco(
        ctx.prisma,
        desdeSerie,
        cfgConf.precoBase.salto,
        cfgConf.precoBase.negociosMin,
      )
    : new Set<string>();
  const precisaSerie = (symbol: string) =>
    comSalto.has(symbol) ||
    (u.classe.get(symbol) === 'fii' &&
      (resumoPor.get(symbol)?.pregoesComNegocio21 ?? Infinity) < cfgConf.esporadico.pregoesMin);
  const seriesDe = async (symbols: string[]) =>
    conferenciaLigada
      ? serieRecenteCotacoes(ctx.prisma, symbols.filter(precisaSerie), desdeSerie)
      : new Map<string, PregaoSerie[]>();
  const indicesEmConferencia = { acao: 0, fii: 0 };
  const calculadosSemBlocoC = { acao: 0, fii: 0 };
  const calculadosQueCaem: Record<'acao' | 'fii', string[]> = { acao: [], fii: [] };
  const contarIndiceEmConferencia = (classe: 'acao' | 'fii', s: ScoreCalculado, symbol: string) => {
    if (!conferenciaLigada) return;
    if ((s.emConferenciaBlocoC?.length ?? 0) > 0) indicesEmConferencia[classe]++;
    if (s.completoSemBlocoC && s.indice.indice.estado === 'ok') {
      calculadosSemBlocoC[classe]++;
      if (s.indice.incompleto) calculadosQueCaem[classe].push(symbol);
    }
  };

  const simbolosAcao = u.acoes.map((a) => a.symbol);
  const plGravado = await lerPlAnualGravado(ctx.prisma, simbolosAcao);
  for (const [s, l] of plAnualFresco) plGravado.set(s, l);

  const atuais: Prisma.AssetMultiplesCurrentCreateManyInput[] = [];
  const scores: Prisma.AssetScoreCreateManyInput[] = [];
  const res: ResultadoScores['acoes'] = {
    tickers: u.acoes.length,
    comPreco: 0,
    comFy: 0,
    comFyEPreco: 0,
    comScore: 0,
    scoreDeFyEPreco: 0,
    incompletos: 0,
  };

  // Ações, por empresa, em LOTES de LOTE_FUND emissores: os fundamentos (FY completo para a
  // sequência de lucro; TTM/YTD/FY recentes para o atual) de um lote por vez — carregar o universo
  // inteiro de uma vez somava ~200 MB de RSS no next-server (achado qa-operacao 30/09)
  const emissores = [...u.emissores.values()];
  const desdeRecente = menosMeses(ctx.hoje, 24);
  const empresas = [...agrupar(u.acoes, (t) => t.cnpj)];
  for (let i = 0; i < empresas.length; i += LOTE_FUND) {
    const loteEmpresas = empresas.slice(i, i + LOTE_FUND);
    const lote = loteEmpresas.map(([cnpj]) => cnpj);
    const noLote = new Set(lote);
    const em = emissores.filter((e) => noLote.has(e.cnpj));
    const fys = await fundamentosVigentes(ctx.prisma, lote, {
      tipos: ['FY'],
      escopo: 'preferido',
      emissores: em,
    });
    const recentes = await fundamentosVigentes(ctx.prisma, lote, {
      tipos: ['TTM', 'YTD', 'FY'],
      desde: desdeRecente,
      escopo: 'preferido',
      emissores: em,
    });
    const dpaAnual = await lerDpaAnualGravado(
      ctx.prisma,
      loteEmpresas.flatMap(([, ts]) => ts.map((t) => t.symbol)),
    );
    const series = await seriesDe(
      loteEmpresas.flatMap(([, ts]) => ts.map((t) => t.symbol)).filter((s) => resumoPor.has(s)),
    );
    ctx.contar('linhasLidas', fys.length + recentes.length);
    const fysPor = agrupar(fys, (f) => f.emissorId);
    const fundAtualPor = fundamentosAtuais(recentes);
    processarLoteAcoes(loteEmpresas, fysPor, fundAtualPor, dpaAnual, series);
  }

  function processarLoteAcoes(
    loteEmpresas: Array<[string, TickerAcao[]]>,
    fysPor: Map<string, FundamentosPeriodo[]>,
    fundAtualPor: Map<string, FundamentosPeriodo | null>,
    dpaAnual: Map<string, DpaAnualGravado[]>,
    series: Map<string, PregaoSerie[]>,
  ): void {
    for (const [cnpj, tickers] of loteEmpresas) {
      const comPreco = tickers.filter((t) => resumoPor.has(t.symbol));
      const temFy = (fysPor.get(cnpj) ?? []).length > 0;
      res.comPreco += comPreco.length;
      if (temFy) res.comFy += tickers.length;
      if (temFy) res.comFyEPreco += comPreco.length;
      if (comPreco.length === 0) continue;
      const precosEmpresa = new Map(
        comPreco.map((t) => [t.symbol, resumoPor.get(t.symbol)!.closeRaw]),
      );
      const emissor = u.emissores.get(cnpj);
      const calculos = new Map<string, CalculoAtualAcao>();
      for (const t of comPreco) {
        const c = calcularAtualAcao(
          {
            ticker: t,
            resumo: resumoPor.get(t.symbol)!,
            tickersEmpresa: tickers,
            resumosEmpresa: precosEmpresa,
            fundAtual: fundAtualPor.get(cnpj) ?? null,
            fys: fysPor.get(cnpj) ?? [],
            contagens: dados.contagensPorCnpj.get(cnpj) ?? [],
            emissor,
            proventos: memoria.proventos.get(t.symbol) ?? [],
            eventos: memoria.eventos.get(t.symbol) ?? [],
            cobertura: memoria.cobertura.get(t.symbol),
            historicoPl: plGravado.get(t.symbol) ?? [],
            dataRef,
            frescor: frescorDe(t.symbol, ultimaDataComAcoes),
            dpaAnual: dpaAnual.get(t.symbol) ?? [],
            sanidade: conferenciaLigada
              ? { serie: series.get(t.symbol) ?? [], liberacoes }
              : undefined,
          },
          p,
        );
        contarDefasado('acao', c.flags);
        calculos.set(t.symbol, c);
        atuais.push(
          linhaAtual(
            { symbol: t.symbol, cnpj, classe: 'acao', resumo: resumoPor.get(t.symbol)! },
            c.m,
            {
              ttmDtFim: fundAtualPor.get(cnpj)?.dtFim ?? null,
              lpaTtm: c.lpaTtm,
              vpa: c.vpa,
              dpa12m: c.dpa12m,
              anos: c.anos,
              flags: c.flags,
            },
            meta,
          ),
        );
      }
      // decisão 13: índice por empresa no ticker de maior volume médio
      const ref = [...comPreco].sort(
        (a, b) =>
          resumoPor.get(b.symbol)!.volumeMedio21 - resumoPor.get(a.symbol)!.volumeMedio21 ||
          a.symbol.localeCompare(b.symbol),
      )[0];
      // DY em conferência em qualquer ticker ⇒ fora do Índice da empresa (Quadro e Índice concordam);
      // bloco C: conferências 'conf:' com o escopo do grupo (empresa × ticker)
      const s = scoreAcao(
        comConferenciasDaEmpresa(ref.symbol, calculos.get(ref.symbol)!, calculos),
        emissor?.ehFinanceira ?? false,
        p,
      );
      contarIndiceEmConferencia('acao', s, ref.symbol);
      for (const t of comPreco) {
        scores.push(
          linhaScore(
            { symbol: t.symbol, cnpj, classe: 'acao', dataRef, tickerReferencia: ref.symbol },
            s,
            meta,
          ),
        );
        res.comScore++;
        if (temFy) res.scoreDeFyEPreco++;
        if (s.indice.incompleto) res.incompletos++;
      }
    }
  }

  // FIIs
  const fiisRes: ResultadoScores['fiis'] = {
    listados: u.fiis.length,
    naoConferidos: 0,
    conferidosComPreco: 0,
    fof: 0,
    comInformeEPreco: 0,
    comScore: 0,
    incompletos: 0,
  };
  const cnpjsFii = [...new Set(u.fiis.map((f) => f.cnpj))];
  const trimestres = await fiiTrimestralUltimos(ctx.prisma, cnpjsFii, 1);
  const triPor = new Map(trimestres.map((t) => [t.cnpj, t]));
  const rendAnualFii = await lerDpaAnualGravado(
    ctx.prisma,
    u.fiis.map((f) => f.symbol),
  );
  let seriesFii = new Map<string, PregaoSerie[]>();
  for (let iFii = 0; iFii < u.fiis.length; iFii++) {
    const f = u.fiis[iFii];
    if (conferenciaLigada && iFii % LOTE_SERIE_FII === 0) {
      seriesFii = await seriesDe(
        u.fiis
          .slice(iFii, iFii + LOTE_SERIE_FII)
          .map((x) => x.symbol)
          .filter((x) => resumoPor.has(x)),
      );
    }
    const resumo = resumoPor.get(f.symbol);
    const meses = dados.fiiMensalPorCnpj.get(f.cnpj) ?? [];
    const mesAtual = [...meses].sort((a, b) => b.refMonth.localeCompare(a.refMonth))[0] ?? null;
    const entrada: EntradaAtualFii | null = resumo
      ? {
          resumo,
          mesAtual,
          trimestre: triPor.get(f.cnpj) ?? null,
          proventos: memoria.proventos.get(f.symbol) ?? [],
          eventos: memoria.eventos.get(f.symbol) ?? [],
          cobertura: memoria.cobertura.get(f.symbol),
          dataRef,
          frescor: frescorDe(f.symbol, ultimaDataComFiis),
          dpaAnual: rendAnualFii.get(f.symbol) ?? [],
          mesesInformePorAno: mesesInformePorAno(meses),
          sanidade: conferenciaLigada
            ? { symbol: f.symbol, meses, serie: seriesFii.get(f.symbol) ?? [], liberacoes }
            : undefined,
        }
      : null;
    let calc: CalculoAtualFii | null = null;
    if (entrada) {
      calc = calcularAtualFii(entrada, p);
      contarDefasado('fii', calc.flags);
      atuais.push(
        linhaAtual(
          { symbol: f.symbol, cnpj: f.cnpj, classe: 'fii', resumo: entrada.resumo },
          calc.m,
          { rend12m: calc.rend12m, meses: calc.meses, flags: calc.flags },
          meta,
        ),
      );
    }
    if (!f.conferido && p.fii.exigirTickerConferido) {
      fiisRes.naoConferidos++;
      continue;
    }
    if (!entrada || !calc) continue;
    fiisRes.conferidosComPreco++;
    const fora = mesAtual?.tipoVigente === 'fof' || mesAtual?.reguaVigente === 'fora_do_indice';
    if (fora) fiisRes.fof++;
    else if (mesAtual) fiisRes.comInformeEPreco++;
    const s = scoreFii(calc, entrada, p);
    contarIndiceEmConferencia('fii', s, f.symbol);
    scores.push(
      linhaScore(
        { symbol: f.symbol, cnpj: f.cnpj, classe: 'fii', dataRef, tickerReferencia: null },
        s,
        meta,
      ),
    );
    fiisRes.comScore++;
    if (s.indice.incompleto) fiisRes.incompletos++;
  }

  let sanidade: RelatorioSanidade | undefined;
  if (conferenciaLigada) {
    const noQuadro = new Set(scores.map((x) => x.symbol));
    const regras = contarRegras(
      atuais
        .filter((a) => noQuadro.has(a.symbol))
        .map((a) => ({
          symbol: a.symbol,
          cnpj: a.cnpj,
          classe: a.classe,
          flags: (a.flags as string[]) ?? [],
        })),
    );
    const totais = {
      acao: scores.filter((x) => x.classe === 'acao').length,
      fii: scores.filter((x) => x.classe === 'fii').length,
    };
    const acima = regrasAcimaDoLimite(regras, totais, p.sanidade.conferencia.alertaPctQuadro);
    for (const a of acima) {
      ctx.alertar({
        codigo: 'sanidade_regra_acima_limite',
        nivel: 'aviso',
        mensagem:
          `regra ${a.regra} marcou ${a.n} ${a.classe === 'acao' ? 'ações' : 'FIIs'} ` +
          `(${a.pct.toFixed(1)}% do Quadro; limite ${p.sanidade.conferencia.alertaPctQuadro}%)`,
      });
    }
    sanidade = {
      regras,
      totais,
      acimaDoLimite: acima,
      indicesEmConferencia,
      calculadosSemBlocoC,
      calculadosQueCaem,
      liberacoes: liberacoes?.size ?? 0,
    };
  }

  let gravadas = 0;
  let retencao = { apagadas: 0, datas: [] as string[] };
  if (opts.gravar && ctx.aplicar) {
    gravadas += await gravarMultiplosAtuais(ctx.prisma, atuais);
    gravadas += await gravarScores(ctx.prisma, dataRef, scores);
    if (opts.retencao) retencao = await aplicarRetencaoScores(ctx.prisma, ctx.hoje);
    ctx.contar('linhasGravadas', gravadas);
  }

  const totalScores = scores.length;
  const incompletos = res.incompletos + fiisRes.incompletos;
  const coberturaAcoesPct =
    res.comFyEPreco > 0 ? (res.scoreDeFyEPreco / res.comFyEPreco) * 100 : null;
  const fiisElegiveis = fiisRes.comInformeEPreco;
  const fiisComScoreElegiveis = scores.filter(
    (s) => s.classe === 'fii' && s.regua !== 'fora_do_indice' && s.indiceMf !== null,
  ).length;
  const coberturaFiisPct =
    fiisElegiveis > 0 ? Math.min(100, (fiisComScoreElegiveis / fiisElegiveis) * 100) : null;
  for (const [rotulo, pct] of [
    ['ações', coberturaAcoesPct],
    ['FIIs', coberturaFiisPct],
  ] as const) {
    if (pct !== null && pct < 95) {
      ctx.alertar({
        codigo: 'cobertura_scores',
        nivel: 'aviso',
        mensagem: `cobertura de scores de ${rotulo} ${pct.toFixed(1)}% (< 95%)`,
      });
    }
  }
  for (const [classe, rotulo, ultima] of [
    ['acao', 'ações', ultimaDataComAcoes],
    ['fii', 'FIIs', ultimaDataComFiis],
  ] as const) {
    const porMotivo = defasados[classe];
    const total = Object.values(porMotivo).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    ctx.alertar({
      codigo: 'proventos_defasados',
      nivel: porMotivo.base_parada ? 'erro' : 'aviso',
      mensagem:
        `${total} ${rotulo} com base de proventos defasada (DY/rendimento 12m ausentes): ` +
        `${JSON.stringify(porMotivo)}; data-com mais recente da classe ${ultima ?? '—'}`,
    });
  }
  return {
    dataRef,
    multiplosAtuais: atuais.length,
    scores: totalScores,
    gravadas,
    retencao,
    acoes: res,
    fiis: fiisRes,
    pctIncompleto: totalScores > 0 ? (incompletos / totalScores) * 100 : 0,
    coberturaAcoesPct,
    coberturaFiisPct,
    amostra: scores.slice(0, 5).map((s) => ({
      symbol: s.symbol,
      regua: s.regua,
      indiceMf: s.indiceMf,
      componentes: [s.cLucro, s.cDivida, s.cRent, s.cDiv, s.cPreco],
      criterios: `${s.criteriosAtendidos} de ${s.criteriosAplicaveis}`,
      incompleto: s.incompleto,
      motivos: s.motivosIncompleto,
    })),
    ...(sanidade ? { sanidade } : {}),
  };
}
