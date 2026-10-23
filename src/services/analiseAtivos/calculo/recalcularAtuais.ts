/**
 * Etapa 'atuais' do job derivados (ex-'scores'): múltiplos atuais de todo o universo
 * (AssetMultiplesCurrent), o motor de sanidade do bloco C sobre eles e os alertas
 * sanidade_regra_acima_limite e proventos_defasados.
 *
 * D6-a (23/10/2026): o Índice MF, o semáforo e a régua saíram do pipeline — nada disso aparecia em
 * API/tela desde a v2.4. asset_scores não é mais gravado (a tabela fica até a D6-b); o Quadro deriva
 * régua, tipo, motivos de conferência e versão dos derivados.
 *
 * - dataRef = último pregão com cotação (max AssetQuoteResumo.ultimoPregao), nunca o dia do run.
 * - Relatório de sanidade: a base do percentual são as linhas do Quadro — ações com cotação e FIIs
 *   com cotação e (conferido no FiiTickerMap || !params.fii.exigirTickerConferido).
 * - fundamentei-regras (F2, A4.a/A4.b): com a scoring v3, payout do dia = proventos pagos na DFC TTM ÷
 *   lucro TTM (payout.regra 'dfc'; lucro ≤ 0 = ausente 'prejuizo') e DY 12m de ações pela data-ex
 *   (proventos.baseJanelaDy 'ex', em rendimento12m). v1/v2 = como antes.
 */
import type { Prisma } from '@prisma/client';
import type { EventoComCnpj } from '@/services/analiseAtivos/calculo/recalcularEventos';
import {
  gravarMultiplosAtuais,
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
  achatarValores,
  multiplosAtuais,
  payoutCaixaPct,
  type MultiplosCalculados,
  type HistoricoPl,
} from '@/services/analiseAtivos/regras/calculo/multiplos';
import { regrasCalculoDe } from '@/services/analiseAtivos/params/scoringParamsSchema';
import type { ContextoComColetor } from '@/services/analiseAtivos/calculo/recalcularDerivados';
import {
  motivoProventosDefasados,
  rendimento12m,
  temSomaSuspeitaNaJanela,
  ultimaDataCom,
  valorProventosComCobertura,
  type MotivoDefasagemProventos,
  type ProventoAuditadoCompleto,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import {
  acoesNegociadasDia,
  contagemVigente,
} from '@/services/analiseAtivos/regras/calculo/contagemVigente';
import {
  flagEmConferencia,
  motivoProventosEmConferencia,
  saltoProventoRecente,
  type DpaAnual,
} from '@/services/analiseAtivos/regras/calculo/plausibilidadeProventos';
import {
  chaveLiberacaoDe,
  contarRegras,
  flagsDasDeteccoes,
  regrasAcimaDoLimite,
  type ContagemRegra,
  type Deteccao,
} from '@/services/analiseAtivos/regras/calculo/sanidade/aplicarConferencia';
import { revisaoDpaDmpl } from '@/services/analiseAtivos/regras/calculo/sanidade/divergenciaFonte';
import type { VacanciaLiberada } from '@/services/analiseAtivos/regras/fii/saneamentoVacancia';
import { detectarEscalaAcoes } from '@/services/analiseAtivos/regras/calculo/sanidade/escalaAcoes';
import {
  detectarFiiObrigacoes,
  detectarFiiVacancia,
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
  AlertaJob,
  CoberturaProventos,
  ContagemAcoes,
  EmissorInfo,
  FiiTrimestre,
  FundamentosPeriodo,
  JobContexto,
  ResumoCotacao,
  ScoringParams,
  TickerAcao,
  Valor,
} from '@/services/analiseAtivos/tipos';

/** Último pregão com cotação (≤ hoje). Sem cotação nenhuma: pregão anterior a hoje. */
export function dataRefAtuais(
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
  lucroUltimoFy: Valor<number>;
  lpaTtm: Valor<number>;
  vpa: Valor<number>;
  dpa12m: Valor<number>;
  payoutPct: Valor<number>;
  plControladora: Valor<number>;
  flags: string[];
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
  // nº de ações vigente (regras/calculo/contagemVigente): a MESMA contagem do valor de mercado do
  // Quadro — sem 'alerta' desmentida pelo LPA, com os eventos posteriores à contagem e a escala de
  // milhares pelo volume; salto sem evento / não verificável ⇒ null (múltiplos por ação ausentes)
  const fator = fatorEquivalencia(e.ticker);
  const vigente = contagemVigente(
    {
      contagens: e.contagens,
      eventos: e.eventos,
      dataRef: e.dataRef,
      dataPreco: e.resumo.ultimoPregao,
      acoesNegociadasDia: acoesNegociadasDia(e.resumo, fator),
    },
    p,
  );
  flags.push(...vigente.flags);
  const contMaisRecente = vigente.maisRecente;
  const cont = vigente.contagem;
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
  let payoutPct: Valor<number>;
  if (regrasCalculoDe(p).payoutRegra === 'dfc') {
    // F2 (A4.a, scoring v3): proventos pagos na DFC TTM ÷ lucro TTM (número da empresa); lucro ≤ 0
    // ⇒ ausente 'prejuizo'
    payoutPct = fund ? payoutCaixaPct(fund) : ausente('sem_dado_fonte', 'sem_ttm');
  } else if (lpa.estado !== 'ok') payoutPct = lpa;
  // payout do TTM = DPA 12m ÷ LPA TTM (LPA ≤ 0 ⇒ n/a, regra 4)
  else if (dpa12m.estado !== 'ok') payoutPct = dpa12m;
  else if (!(lpa.valor > 0)) payoutPct = naoSeAplica('base_nao_positiva');
  else payoutPct = ok((dpa12m.valor / lpa.valor) * 100);
  m.payoutPct = payoutPct;
  // trava de plausibilidade (regras/calculo/plausibilidadeProventos): DY acima do teto ou salto de
  // provento recente ⇒ DY "em conferência" (flag proventos_em_conferencia_*)
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
      linhaSuspeita: temSomaSuspeitaNaJanela(e.proventos, e.dataRef, p),
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
    lucroUltimoFy: ultimoFy,
    lpaTtm: lpa,
    vpa: m.vpa ?? ausente('sem_dado_fonte'),
    dpa12m,
    payoutPct,
    plControladora: deNumero(fund?.plControladora ?? fund?.pl ?? null),
    flags: [...flags, ...m.flags],
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
  /**
   * bloco C: só lido com sanidade.conferencia.ligada (v2). `trimestres` = série trimestral inteira
   * do CNPJ (a vacância do último trimestre é conferida contra ela: saneamentoVacancia, A4).
   */
  sanidade?: EntradaSanidade & {
    symbol: string;
    meses: FiiMesEnxuto[];
    trimestres?: FiiTrimestre[];
  };
}

export interface CalculoAtualFii {
  m: MultiplosCalculados;
  rend12m: Valor<number>;
  meses: Valor<number>;
  flags: string[];
}

/** Liberações da curadoria ('SYMBOL|regra|chave') → consulta (regra, chave) do saneamentoVacancia. */
function vacanciaLiberadaDe(
  symbol: string | undefined,
  liberacoes: ReadonlySet<string> | undefined,
): VacanciaLiberada | undefined {
  if (!symbol || !liberacoes || liberacoes.size === 0) return undefined;
  return (regra, chave) => liberacoes.has(chaveLiberacaoDe(symbol, regra, chave));
}

/**
 * Bloco C: detecções do motor de sanidade de um FII (R3, R4, R5, R6, vacância A4; revisão fii_pl).
 * Pura.
 */
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
    detectarFiiVacancia(
      (e.sanidade?.trimestres ?? []).map((t) => ({
        refQuarter: t.refQuarter,
        vacanciaPct: t.flags.includes('nsa:vacanciaFisicaCvmPct') ? null : t.vacanciaFisicaCvmPct,
        receitaAluguel: t.receitaAluguel,
      })),
      p.sanidade.fii,
      vacanciaLiberadaDe(e.sanidade?.symbol, e.sanidade?.liberacoes),
    ),
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
      obrigacoesAtivoPct: e.mesAtual?.obrigacoesAtivoPct ?? null,
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
  // bloco C (só v2): regras de sanidade do próprio FII — flags conf:/rev:/info:, salvo liberação
  if (p.sanidade.conferencia.ligada && e.sanidade) {
    const symbol = e.sanidade.symbol;
    flags.push(...flagsDasDeteccoes(symbol, deteccoesFii(e, m, p), e.sanidade.liberacoes));
  }
  return { m, rend12m, meses, flags };
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
    // A6 (fatia E): obrigações ÷ ativo total (FII); ação = null
    obrigacoesAtivoPct: m.obrigacoesAtivoPct,
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

export interface ResultadoAtuais {
  dataRef: string;
  multiplosAtuais: number;
  gravadas: number;
  acoes: {
    tickers: number;
    comPreco: number;
    comFy: number;
    comFyEPreco: number;
    /** tickers com cotação (linhas do Quadro) */
    noQuadro: number;
  };
  fiis: {
    listados: number;
    naoConferidos: number;
    conferidosComPreco: number;
    fof: number;
    comInformeEPreco: number;
    /** FIIs com cotação e (conferido || !exigirTickerConferido) (linhas do Quadro) */
    noQuadro: number;
  };
  /** bloco C: relatório do motor de sanidade (só com sanidade.conferencia.ligada) */
  sanidade?: RelatorioSanidade;
  /**
   * acoesPct/fiisPct: % das linhas do Quadro com linha de múltiplos atuais (alerta
   * cobertura_multiplos). comMultiploPct: % com P/L ou P/VP (só informativo: prejuízo com PL negativo
   * e número de ações sem validação ficam legitimamente sem os dois).
   */
  cobertura: {
    acoesPct: number | null;
    fiisPct: number | null;
    acoesComMultiploPct: number | null;
    fiisComMultiploPct: number | null;
  };
}

/** Abaixo disso o job alerta: parte do universo ficou sem múltiplos (antes: cobertura_scores). */
export const COBERTURA_MULTIPLOS_MIN_PCT = 95;

type CoberturaMultiplos = ResultadoAtuais['cobertura'];

/**
 * D6-b: substitui o cobertura_scores — o sinal de que o job deixou de gerar derivados para parte do
 * universo: linha do Quadro (ticker com preço; FII conferido) sem linha de múltiplos atuais.
 */
export function coberturaMultiplos(
  atuais: Pick<Prisma.AssetMultiplesCurrentCreateManyInput, 'symbol' | 'classe' | 'pl' | 'pvp'>[],
  noQuadro: ReadonlySet<string>,
  totais: { acao: number; fii: number },
): CoberturaMultiplos {
  const pct = (n: number, base: number) =>
    base > 0 ? Math.round(Math.min(100, (n / base) * 100) * 10) / 10 : null;
  const linhasDe = (classe: 'acao' | 'fii') =>
    atuais.filter((a) => a.classe === classe && noQuadro.has(a.symbol));
  const comMultiplo = (classe: 'acao' | 'fii') =>
    linhasDe(classe).filter((a) => a.pvp != null || a.pl != null).length;
  return {
    acoesPct: pct(linhasDe('acao').length, totais.acao),
    fiisPct: pct(linhasDe('fii').length, totais.fii),
    acoesComMultiploPct: pct(comMultiplo('acao'), totais.acao),
    fiisComMultiploPct: pct(comMultiplo('fii'), totais.fii),
  };
}

export function alertasCobertura(c: CoberturaMultiplos): AlertaJob[] {
  const out: AlertaJob[] = [];
  for (const [rotulo, v] of [
    ['ações', c.acoesPct],
    ['FIIs', c.fiisPct],
  ] as const) {
    if (v !== null && v < COBERTURA_MULTIPLOS_MIN_PCT) {
      out.push({
        codigo: 'cobertura_multiplos',
        nivel: 'aviso',
        mensagem: `cobertura de múltiplos de ${rotulo} ${v.toFixed(1)}% (< ${COBERTURA_MULTIPLOS_MIN_PCT}%)`,
      });
    }
  }
  return out;
}

export interface RelatorioSanidade {
  /** símbolos por regra ('conf:<grupo>:<regra>' | 'rev:<regra>' | 'info:<codigo>') e classe */
  regras: ContagemRegra[];
  /** linhas do Quadro por classe — base do percentual do alerta */
  totais: { acao: number; fii: number };
  /** regras bloqueantes acima de alertaPctQuadro% do Quadro de uma classe */
  acimaDoLimite: Array<{ regra: string; classe: 'acao' | 'fii'; n: number; pct: number }>;
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

export async function recalcularAtuais(
  ctx: JobContexto,
  dados: DadosBase,
  memoria: MemoriaCalculo,
  plAnualFresco: Map<string, PlAnualPonto[]>,
  opts: { gravar: boolean },
): Promise<ResultadoAtuais> {
  const p = ctx.params;
  const u = dados.universo;
  const meta = { paramsVersion: ctx.paramsVersion, agora: new Date() };
  const resumos = await resumoCotacoes(ctx.prisma);
  const resumoPor = new Map(resumos.map((r) => [r.symbol, r]));
  const dataRef = dataRefAtuais(resumos, ctx.hoje);
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
  // (FII esporádico): manter o job derivados dentro de +20% de prazo
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

  const simbolosAcao = u.acoes.map((a) => a.symbol);
  const plGravado = await lerPlAnualGravado(ctx.prisma, simbolosAcao);
  for (const [s, l] of plAnualFresco) plGravado.set(s, l);

  const atuais: Prisma.AssetMultiplesCurrentCreateManyInput[] = [];
  /** linhas do Quadro (base do relatório de sanidade): o mesmo conjunto que recebia score */
  const noQuadro = new Set<string>();
  const res: ResultadoAtuais['acoes'] = {
    tickers: u.acoes.length,
    comPreco: 0,
    comFy: 0,
    comFyEPreco: 0,
    noQuadro: 0,
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
        // F2: relatório antes × depois do recalcular-analise (só com o coletor no contexto)
        const coletor = (ctx as ContextoComColetor).coletorPayoutDy;
        if (coletor && (!coletor.simbolos || coletor.simbolos.has(t.symbol))) {
          const v = (x: Valor<number> | undefined) => (x?.estado === 'ok' ? x.valor : null);
          coletor.atuais.push({
            symbol: t.symbol,
            payoutPct: v(c.payoutPct),
            dy12mPct: v(c.m.dyPct),
            dpa12m: v(c.dpa12m),
          });
        }
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
        noQuadro.add(t.symbol);
        res.noQuadro++;
      }
    }
  }

  // FIIs
  const fiisRes: ResultadoAtuais['fiis'] = {
    listados: u.fiis.length,
    naoConferidos: 0,
    conferidosComPreco: 0,
    fof: 0,
    comInformeEPreco: 0,
    noQuadro: 0,
  };
  const cnpjsFii = [...new Set(u.fiis.map((f) => f.cnpj))];
  // bloco C: a série trimestral inteira (vacância conferida contra ela, A4); sem ele, só o último
  const trimestres = await fiiTrimestralUltimos(
    ctx.prisma,
    cnpjsFii,
    conferenciaLigada ? Number.MAX_SAFE_INTEGER : 1,
  );
  const triPor = new Map<string, FiiTrimestre>();
  const triSeriePor = new Map<string, FiiTrimestre[]>();
  for (const t of trimestres) {
    // fiiTrimestralUltimos: mais recente primeiro
    if (!triPor.has(t.cnpj)) triPor.set(t.cnpj, t);
    const lista = triSeriePor.get(t.cnpj);
    if (lista) lista.push(t);
    else triSeriePor.set(t.cnpj, [t]);
  }
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
            ? {
                symbol: f.symbol,
                meses,
                trimestres: triSeriePor.get(f.cnpj) ?? [],
                serie: seriesFii.get(f.symbol) ?? [],
                liberacoes,
              }
            : undefined,
        }
      : null;
    if (entrada) {
      const calc = calcularAtualFii(entrada, p);
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
    if (!entrada) continue;
    fiisRes.conferidosComPreco++;
    const fora = mesAtual?.tipoVigente === 'fof' || mesAtual?.reguaVigente === 'fora_do_indice';
    if (fora) fiisRes.fof++;
    else if (mesAtual) fiisRes.comInformeEPreco++;
    noQuadro.add(f.symbol);
    fiisRes.noQuadro++;
  }

  let sanidade: RelatorioSanidade | undefined;
  if (conferenciaLigada) {
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
    const totais = { acao: res.noQuadro, fii: fiisRes.noQuadro };
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
    sanidade = { regras, totais, acimaDoLimite: acima, liberacoes: liberacoes?.size ?? 0 };
  }

  let gravadas = 0;
  if (opts.gravar && ctx.aplicar) {
    gravadas += await gravarMultiplosAtuais(ctx.prisma, atuais);
    ctx.contar('linhasGravadas', gravadas);
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

  const cobertura = coberturaMultiplos(atuais, noQuadro, {
    acao: res.noQuadro,
    fii: fiisRes.noQuadro,
  });
  for (const a of alertasCobertura(cobertura)) ctx.alertar(a);
  return {
    dataRef,
    multiplosAtuais: atuais.length,
    gravadas,
    acoes: res,
    fiis: fiisRes,
    ...(sanidade ? { sanidade } : {}),
    cobertura,
  };
}
