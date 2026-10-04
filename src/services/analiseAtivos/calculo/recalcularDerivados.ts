/**
 * Etapa "derivados" do job scores: per-share (AssetPerShareYearly) e múltiplos anuais
 * (AssetMultiplesYearly) das empresas e FIIs alterados desde o último run OK (ou de todos com
 * --tudo). Fundamentos, contagens, informes e preços chegam pelos repositórios da fatia 0.
 */
import type { Prisma } from '@prisma/client';
import {
  anoEmConferencia,
  gravarMultiplosAnuais,
  gravarPerShareAnual,
  type PlAnualPonto,
} from '@/services/analiseAtivos/calculo/gravarDerivados';
import type { EventoComCnpj } from '@/services/analiseAtivos/calculo/recalcularEventos';
import {
  agrupar,
  type DadosBase,
  type FiiMesEnxuto,
} from '@/services/analiseAtivos/calculo/universo';
import {
  achatarValores,
  multiplosAnuais,
  type MultiplosCalculados,
} from '@/services/analiseAtivos/regras/calculo/multiplos';
import { perShareAnual, perShareAnualFii } from '@/services/analiseAtivos/regras/calculo/perShare';
import { flagsDasDeteccoes } from '@/services/analiseAtivos/regras/calculo/sanidade/aplicarConferencia';
import { detectarHistoricoEscala } from '@/services/analiseAtivos/regras/calculo/sanidade/historicoEscala';
import {
  dpaNoAno,
  valorProventosComCobertura,
  type ProventoAuditadoCompleto,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import { ausente, deNumero, ok } from '@/services/analiseAtivos/regras/comum/valor';
import { fundamentosVigentes } from '@/services/analiseAtivos/repositorio/acoes';
import { deData } from '@/services/analiseAtivos/repositorio/conversao';
import { cotacaoFimDePeriodo } from '@/services/analiseAtivos/repositorio/cotacoes';
import { fiiTrimestralUltimos } from '@/services/analiseAtivos/repositorio/fii';
import type {
  CoberturaProventos,
  ContagemAcoes,
  CotacaoDia,
  FiiTrimestre,
  FundamentosPeriodo,
  JobContexto,
  ScoringParams,
  TickerAcao,
  Valor,
} from '@/services/analiseAtivos/tipos';

export interface MemoriaCalculo {
  eventos: Map<string, EventoComCnpj[]>;
  proventos: Map<string, ProventoAuditadoCompleto[]>;
  cobertura: Map<string, CoberturaProventos>;
  /** lastCheckedAt da cobertura por símbolo (frescor; ausente em memórias montadas sem ele) */
  verificadoEm?: Map<string, string | null>;
  /**
   * Bloco C: liberações da curadoria ('SYMBOL|regra|chave', repositorio/curadoria) — só lidas com
   * sanidade.conferencia.ligada; a mesma chave liberada não marca de novo.
   */
  liberacoes?: ReadonlySet<string>;
}

/** Fator de equivalência do ticker (units = ON + PN da composição do FCA). null = unit sem composição. */
export function fatorEquivalencia(t: TickerAcao): number | null {
  if (t.classeTitulo !== 'UNIT') return 1;
  const n = (t.unitQtdOn ?? 0) + (t.unitQtdPn ?? 0);
  return n > 0 ? n : null;
}

/**
 * Um FY por ano fiscal: empresa que mudou o fim do exercício (regra 19) tem dois "FY" no mesmo ano
 * (ex.: 30/09 e 31/12) — vale o de dtFim mais recente.
 */
export function umFyPorAno(fys: FundamentosPeriodo[]): FundamentosPeriodo[] {
  const porAno = new Map<number, FundamentosPeriodo>();
  for (const f of fys) {
    const atual = porAno.get(f.anoFiscal);
    if (!atual || f.dtFim > atual.dtFim) porAno.set(f.anoFiscal, f);
  }
  return [...porAno.values()].sort((a, b) => a.anoFiscal - b.anoFiscal);
}

/** Contagem de ações do fim do exercício (mesma data; senão a última do mesmo ano até dtFim). */
export function contagemNaData(contagens: ContagemAcoes[], dtFim: string): ContagemAcoes | null {
  const exata = contagens.find((c) => c.data === dtFim && c.total !== null);
  if (exata) return exata;
  const ano = dtFim.slice(0, 4);
  const candidatas = contagens
    .filter((c) => c.total !== null && c.data <= dtFim && c.data.startsWith(ano))
    .sort((a, b) => b.data.localeCompare(a.data));
  return candidatas[0] ?? null;
}

/**
 * Valor de mercado da EMPRESA = Σ classes (preço × ações da classe), com o preço da classe negociada
 * quando a outra não negocia (decisão 13). Sem ON/PN separados ⇒ null (o múltiplo usa preço × total).
 */
export function valorMercadoEmpresa(
  tickers: TickerAcao[],
  precoPorSimbolo: Map<string, number>,
  contagem: ContagemAcoes | null,
): number | null {
  if (!contagem || contagem.on === null || contagem.pn === null) return null;
  const preco = (classe: 'ON' | 'PN') =>
    tickers
      .filter((t) => t.classeTitulo === classe)
      .map((t) => precoPorSimbolo.get(t.symbol))
      .find((x) => x !== undefined) ?? null;
  const pOn = preco('ON');
  const pPn = preco('PN');
  const on = pOn ?? pPn;
  const pn = pPn ?? pOn;
  if (on === null || pn === null) return null;
  return on * contagem.on + pn * contagem.pn;
}

/**
 * DPA/rendimento de um ano com os três estados: sem nenhum provento na base, vale a cobertura
 * (EMPTY ⇒ zero); ano ANTERIOR ao primeiro provento da base ⇒ ausente (a base de proventos não
 * alcança o ano — nunca zero, senão o payout por ação vira 0% e dispara auditoria falsa).
 */
function proventosDoAno(
  v: Valor<number>,
  ano: number,
  proventos: ProventoAuditadoCompleto[],
  cobertura: CoberturaProventos | undefined,
): Valor<number> {
  const anos = proventos
    .filter((p) => p.dataComReal && p.status !== 'tipo_excluido' && p.status !== 'sem_data_com')
    .map((p) => Number(p.dataComReal!.slice(0, 4)));
  if (anos.length > 0 && ano < Math.min(...anos)) {
    return ausente('historico_curto', 'antes_da_base_de_proventos');
  }
  return valorProventosComCobertura(v, proventos.length > 0, cobertura ?? null);
}

/**
 * FII paga todo mês: o 1º ano da base de proventos começando depois de janeiro é parcial (HGLG11:
 * Yahoo só a partir de nov/2017 ⇒ "DY 2017" de 1,3%) — ausente, nunca uma soma parcial.
 */
function anoParcialDaBaseFii(
  proventos: ProventoAuditadoCompleto[],
  ano: number,
): Valor<number> | null {
  const datas = proventos
    .filter((p) => p.dataComReal && p.status === 'valido')
    .map((p) => p.dataComReal!)
    .sort();
  const primeira = datas[0];
  if (!primeira || Number(primeira.slice(0, 4)) !== ano || primeira.slice(5, 7) === '01')
    return null;
  return ausente('historico_curto', 'primeiro_ano_parcial_da_base');
}

type LinhaPerShare = Prisma.AssetPerShareYearlyCreateManyInput;
type LinhaMultiplos = Prisma.AssetMultiplesYearlyCreateManyInput;

function linhaMultiplos(
  base: { symbol: string; cnpj: string; classe: string; anoFiscal: number; dtFim: string },
  m: MultiplosCalculados,
  preco: CotacaoDia | null,
  extras: Partial<LinhaMultiplos>,
  params: { paramsVersion: number; agora: Date },
): LinhaMultiplos {
  const { colunas, naoSeAplica } = achatarValores({
    pl: m.pl,
    pvp: m.pvp,
    pReceita: m.pReceita,
    evEbitda: m.evEbitda,
    pFco: m.pFco,
    pFcl: m.pFcl,
    dyPct: m.dyPct,
    payoutPct: m.payoutPct,
    margemLiquidaPct: m.margemLiquidaPct,
    roePct: m.roePct,
    roaPct: m.roaPct,
    roicPct: m.roicPct,
    divLiqEbitda: m.divLiqEbitda,
    divLiqPl: m.divLiqPl,
    liquidezCorrente: m.liquidezCorrente,
    vpCota: m.vpCota,
    rendCota12m: m.rendCota,
    obrigacoesPlPct: m.obrigacoesPlPct,
    vacanciaFisicaCvmPct: m.vacanciaFisicaCvmPct,
  });
  const vm = m.valorMercadoEmpresa?.estado === 'ok' ? m.valorMercadoEmpresa.valor : null;
  return {
    ...base,
    dtFim: deData(base.dtFim),
    precoFimAno: preco ? preco.closeRaw : null,
    precoFimAnoData: preco ? deData(preco.date) : null,
    valorMercadoEmpresa: vm !== null ? vm.toFixed(2) : null,
    ...colunas,
    nImoveisCvm: m.nImoveisCvm?.estado === 'ok' ? Math.round(m.nImoveisCvm.valor) : null,
    naoSeAplica,
    flags: [...new Set(m.flags)],
    paramsVersion: params.paramsVersion,
    calculadoEm: params.agora,
    ...extras,
  };
}

export interface EntradaDerivadosAcao {
  cnpj: string;
  tickers: TickerAcao[];
  fys: FundamentosPeriodo[];
  contagens: ContagemAcoes[];
  precoFim: Map<string, CotacaoDia | null>;
  memoria: MemoriaCalculo;
  ehFinanceira: boolean;
}

/** Função pura: linhas de per-share e múltiplos anuais de uma empresa (todos os tickers × FY). */
export function linhasDerivadasAcao(
  e: EntradaDerivadosAcao,
  p: ScoringParams,
  meta: { paramsVersion: number; agora: Date },
): { perShare: LinhaPerShare[]; multiplos: LinhaMultiplos[]; flags: string[] } {
  const perShare: LinhaPerShare[] = [];
  const multiplos: LinhaMultiplos[] = [];
  const flagsEmpresa: string[] = [];
  const fys = umFyPorAno(e.fys);
  for (let i = 0; i < fys.length; i++) {
    const f = fys[i];
    const anterior = i > 0 ? fys[i - 1] : null;
    const cont = contagemNaData(e.contagens, f.dtFim);
    const contAnt = anterior ? contagemNaData(e.contagens, anterior.dtFim) : null;
    const precos = new Map<string, number>();
    for (const t of e.tickers) {
      const c = e.precoFim.get(`${t.symbol}|${f.dtFim}`);
      if (c) precos.set(t.symbol, c.closeRaw);
    }
    const vmEmpresa = valorMercadoEmpresa(e.tickers, precos, cont);
    const lucro: Valor<number> =
      f.lucroAtribuivel === null
        ? ausente(f.flags.includes('controladora_zero') ? 'controladora_zero' : 'sem_dado_fonte')
        : ok(f.lucroAtribuivel);
    for (const t of e.tickers) {
      const fator = fatorEquivalencia(t);
      if (fator === null) {
        if (!flagsEmpresa.includes('unit_sem_composicao')) flagsEmpresa.push('unit_sem_composicao');
        continue;
      }
      const provs = e.memoria.proventos.get(t.symbol) ?? [];
      const evs = e.memoria.eventos.get(t.symbol) ?? [];
      const cob = e.memoria.cobertura.get(t.symbol);
      const dpaFim = proventosDoAno(
        dpaNoAno(provs, f.anoFiscal, 'fim_do_ano', evs),
        f.anoFiscal,
        provs,
        cob,
      );
      const dpaHoje = proventosDoAno(
        dpaNoAno(provs, f.anoFiscal, 'hoje', evs),
        f.anoFiscal,
        provs,
        cob,
      );
      const ps = perShareAnual(
        {
          anoFiscal: f.anoFiscal,
          lucroAtribuivel: lucro,
          plControladora: deNumero(f.plControladora ?? f.pl),
          acoesFim: cont?.total ?? null,
          acoesAnterior: contAnt?.total ?? null,
          fatorEquivalencia: fator,
          eventos: evs,
          dpaFimDoAno: dpaFim,
          dpaHoje,
          dmplDeclarado: f.dmplDeclarado,
        },
        p,
      );
      const valoresPs = achatarValores({
        lpa: ps.lpa,
        vpa: ps.vpa,
        dpaDataCom: ps.dpaDataCom,
        lpaAjHoje: ps.lpaAjHoje,
        vpaAjHoje: ps.vpaAjHoje,
        dpaAjHoje: ps.dpaAjHoje,
        payoutDmplPct: ps.payoutDmplPct,
        payoutPorAcaoPct: ps.payoutPorAcaoPct,
      });
      const base = {
        symbol: t.symbol,
        cnpj: e.cnpj,
        classe: 'acao',
        anoFiscal: f.anoFiscal,
        dtFim: f.dtFim,
      };
      const flagsPs = [...ps.flags, ...(cont ? [] : ['sem_contagem_acoes'])];
      perShare.push({
        ...base,
        dtFim: deData(f.dtFim),
        acoesFim: cont?.total != null ? cont.total.toFixed(0) : null,
        fatorEquivalencia: fator,
        ...valoresPs.colunas,
        fatorAjusteHoje: ps.fatorAjusteHoje,
        rendCota: null,
        vpCotaFim: null,
        naoSeAplica: valoresPs.naoSeAplica,
        flags: flagsPs,
        paramsVersion: meta.paramsVersion,
        calculadoEm: meta.agora,
      });
      const preco = e.precoFim.get(`${t.symbol}|${f.dtFim}`) ?? null;
      const m = multiplosAnuais(
        {
          classe: 'acao',
          preco: preco?.closeRaw ?? null,
          acoesTotais: cont?.total ?? null,
          fatorEquivalencia: fator,
          valorMercadoEmpresa: vmEmpresa,
          fund: f,
          dpa: dpaFim,
          payoutPct: ps.payoutDmplPct,
          ehFinanceira: e.ehFinanceira,
        },
        p,
      );
      if (!preco) m.flags.push('sem_preco_fim_ano');
      for (const fl of ps.flags) if (!m.flags.includes(fl)) m.flags.push(fl);
      multiplos.push(linhaMultiplos(base, m, preco, {}, meta));
    }
  }
  if (p.sanidade.conferencia.ligada)
    marcarHistoricoForaDeEscala(multiplos, p, e.memoria.liberacoes);
  return { perShare, multiplos, flags: flagsEmpresa };
}

const numOuNull = (x: unknown): number | null =>
  typeof x === 'number' && Number.isFinite(x) ? x : null;

/**
 * Bloco C, R2 (regras/calculo/sanidade/historicoEscala): por ticker, o ano com ≥ 2 de {P/L, P/VP,
 * P/Receita} a ≥ 20× (ou ≤ 1/20) da mediana do ativo ganha a flag 'conf:historico:escala_ano@<ano>'
 * (salvo liberação). O ponto sai da média de 10 anos no job scores. Muta as linhas recebidas.
 */
export function marcarHistoricoForaDeEscala(
  multiplos: LinhaMultiplos[],
  p: ScoringParams,
  liberacoes?: ReadonlySet<string>,
): void {
  for (const [symbol, linhas] of agrupar(multiplos, (l) => l.symbol)) {
    const deteccoes = detectarHistoricoEscala(
      linhas.map((l) => ({
        anoFiscal: l.anoFiscal,
        pl: numOuNull(l.pl),
        pvp: numOuNull(l.pvp),
        pReceita: numOuNull(l.pReceita),
      })),
      p.sanidade.conferencia,
    );
    for (const d of deteccoes) {
      const [flag] = flagsDasDeteccoes(symbol, [d], liberacoes);
      if (!flag) continue;
      const linha = linhas.find((l) => String(l.anoFiscal) === d.chave);
      if (!linha) continue;
      const flags = (linha.flags as string[] | undefined) ?? [];
      if (!flags.includes(flag)) linha.flags = [...flags, flag];
    }
  }
}

export interface EntradaDerivadosFii {
  symbol: string;
  cnpj: string;
  meses: FiiMesEnxuto[];
  trimestres: FiiTrimestre[];
  precoFim: Map<string, CotacaoDia | null>;
  memoria: MemoriaCalculo;
}

/** Função pura: linhas anuais de um FII (VP/cota de dezembro; rendimento por data-com no ano). */
export function linhasDerivadasFii(
  e: EntradaDerivadosFii,
  p: ScoringParams,
  meta: { paramsVersion: number; agora: Date },
): { perShare: LinhaPerShare[]; multiplos: LinhaMultiplos[] } {
  const perShare: LinhaPerShare[] = [];
  const multiplos: LinhaMultiplos[] = [];
  const porAno = agrupar(e.meses, (m) => m.refMonth.slice(0, 4));
  const provs = e.memoria.proventos.get(e.symbol) ?? [];
  const evs = e.memoria.eventos.get(e.symbol) ?? [];
  const cob = e.memoria.cobertura.get(e.symbol);
  const tipos = p.sanidade.proventos.tiposFii;
  for (const [anoTxt, meses] of [...porAno].sort()) {
    const ano = Number(anoTxt);
    const mesFim = [...meses].sort((a, b) => b.refMonth.localeCompare(a.refMonth))[0];
    const dtFim = `${anoTxt}-12-31`;
    const tri = e.trimestres
      .filter((t) => t.refQuarter.startsWith(anoTxt))
      .sort((a, b) => b.refQuarter.localeCompare(a.refQuarter))[0];
    const parcial = anoParcialDaBaseFii(provs, ano);
    const rendAno =
      parcial ?? proventosDoAno(dpaNoAno(provs, ano, 'fim_do_ano', evs, tipos), ano, provs, cob);
    const rendHoje =
      parcial ?? proventosDoAno(dpaNoAno(provs, ano, 'hoje', evs, tipos), ano, provs, cob);
    const ps = perShareAnualFii({
      anoFiscal: ano,
      vpCotaFim: mesFim.vpCota,
      rendCotaAno: rendAno,
      rendCotaHoje: rendHoje,
      eventos: evs,
      pl: mesFim.pl,
    });
    const valoresPs = achatarValores({
      vpCotaFim: ps.vpCotaFim,
      rendCota: ps.rendCota,
      vpaAjHoje: ps.vpaAjHoje,
      dpaAjHoje: ps.dpaAjHoje,
    });
    const base = { symbol: e.symbol, cnpj: e.cnpj, classe: 'fii', anoFiscal: ano, dtFim };
    perShare.push({
      ...base,
      dtFim: deData(dtFim),
      acoesFim: mesFim.cotas !== null ? mesFim.cotas.toFixed(0) : null,
      fatorEquivalencia: 1,
      fatorAjusteHoje: ps.fatorAjusteHoje,
      ...valoresPs.colunas,
      naoSeAplica: valoresPs.naoSeAplica,
      flags: ps.flags,
      paramsVersion: meta.paramsVersion,
      calculadoEm: meta.agora,
    });
    const preco = e.precoFim.get(`${e.symbol}|${dtFim}`) ?? null;
    const m = multiplosAnuais(
      {
        classe: 'fii',
        preco: preco?.closeRaw ?? null,
        vpCota: mesFim.vpCota,
        rendCota: rendAno,
        obrigacoesPlPct: mesFim.obrigacoesPlPct,
        vacanciaFisicaCvmPct: tri?.vacanciaFisicaCvmPct ?? null,
        nImoveisCvm: tri?.nImoveisRenda ?? null,
        pl: mesFim.pl,
      },
      p,
    );
    if (!preco) m.flags.push('sem_preco_fim_ano');
    multiplos.push(linhaMultiplos(base, m, preco, {}, meta));
  }
  return { perShare, multiplos };
}

export interface ResultadoDerivados {
  empresas: number;
  fiis: number;
  linhasPerShare: number;
  linhasMultiplos: number;
  gravadas: number;
  flags: Record<string, number>;
  /** P/L anual recém-calculado por símbolo (para os múltiplos atuais sem reler o banco) */
  plAnual: Map<string, PlAnualPonto[]>;
}

const JANELA_PRECO_FIM = (p: ScoringParams) => p.sanidade.acoes.precoFimAnoMaxDias;

export async function recalcularDerivados(
  ctx: JobContexto,
  dados: DadosBase,
  memoria: MemoriaCalculo,
  alvo: { cnpjsAcoes: string[]; cnpjsFii: string[] },
  opts: { gravar: boolean },
): Promise<ResultadoDerivados> {
  const p = ctx.params;
  const meta = { paramsVersion: ctx.paramsVersion, agora: new Date() };
  const u = dados.universo;
  const flags: Record<string, number> = {};
  const plAnual: ResultadoDerivados['plAnual'] = new Map();
  let linhasPerShare = 0;
  let linhasMultiplos = 0;
  let gravadas = 0;
  const conta = (fs: string[]) => {
    for (const f of fs) flags[f] = (flags[f] ?? 0) + 1;
  };
  const guardarPl = (linhas: LinhaMultiplos[]) => {
    for (const l of linhas) {
      const lista = plAnual.get(l.symbol) ?? [];
      const vm = l.valorMercadoEmpresa;
      lista.push({
        anoFiscal: l.anoFiscal,
        pl: typeof l.pl === 'number' ? l.pl : null,
        plNaoSeAplica: (l.naoSeAplica as string[]).includes('pl'),
        emConferencia: anoEmConferencia((l.flags as string[] | undefined) ?? []),
        valorMercadoEmpresa: vm === null || vm === undefined ? null : Number(vm.toString()),
      });
      plAnual.set(l.symbol, lista);
    }
  };

  // Ações — por lotes de empresas (limita memória e o tamanho dos IN)
  const tickersPorCnpj = agrupar(u.acoes, (t) => t.cnpj);
  const LOTE = 40;
  // FIIs: 48 trimestres de informe por fundo — lote menor (pico de RSS do job scores, achado rodada 2)
  const LOTE_FII = 50;
  for (let i = 0; i < alvo.cnpjsAcoes.length; i += LOTE) {
    if (ctx.estourouPrazo()) break;
    const cnpjs = alvo.cnpjsAcoes.slice(i, i + LOTE);
    const emissores = cnpjs.map((c) => u.emissores.get(c)).filter((x) => x !== undefined);
    const fys = await fundamentosVigentes(ctx.prisma, cnpjs, {
      tipos: ['FY'],
      escopo: 'preferido',
      emissores,
    });
    ctx.contar('linhasLidas', fys.length);
    const fysPorCnpj = agrupar(fys, (f) => f.emissorId);
    const pares = cnpjs.flatMap((c) =>
      (tickersPorCnpj.get(c) ?? []).flatMap((t) =>
        (fysPorCnpj.get(c) ?? []).map((f) => ({ symbol: t.symbol, dtFim: f.dtFim })),
      ),
    );
    const precoFim = await cotacaoFimDePeriodo(ctx.prisma, pares, JANELA_PRECO_FIM(p));
    const perShare: LinhaPerShare[] = [];
    const multiplos: LinhaMultiplos[] = [];
    const simbolos: string[] = [];
    for (const cnpj of cnpjs) {
      const tickers = tickersPorCnpj.get(cnpj) ?? [];
      simbolos.push(...tickers.map((t) => t.symbol));
      const r = linhasDerivadasAcao(
        {
          cnpj,
          tickers,
          fys: fysPorCnpj.get(cnpj) ?? [],
          contagens: dados.contagensPorCnpj.get(cnpj) ?? [],
          precoFim,
          memoria,
          ehFinanceira: u.emissores.get(cnpj)?.ehFinanceira ?? false,
        },
        p,
        meta,
      );
      if (r.flags.includes('unit_sem_composicao')) {
        ctx.alertar({
          codigo: 'unit_sem_composicao',
          nivel: 'aviso',
          mensagem: 'unit sem composição ON/PN no FCA: múltiplos por ticker ausentes',
          ref: cnpj,
        });
      }
      perShare.push(...r.perShare);
      multiplos.push(...r.multiplos);
      conta(r.perShare.flatMap((l) => l.flags as string[]));
    }
    linhasPerShare += perShare.length;
    linhasMultiplos += multiplos.length;
    guardarPl(multiplos);
    if (opts.gravar && ctx.aplicar) {
      gravadas += await gravarPerShareAnual(ctx.prisma, simbolos, perShare);
      gravadas += await gravarMultiplosAnuais(ctx.prisma, simbolos, multiplos);
    }
  }

  // FIIs
  const fiisPorCnpj = agrupar(u.fiis, (f) => f.cnpj);
  for (let i = 0; i < alvo.cnpjsFii.length; i += LOTE_FII) {
    if (ctx.estourouPrazo()) break;
    const cnpjs = alvo.cnpjsFii.slice(i, i + LOTE_FII);
    const trimestres = await fiiTrimestralUltimos(ctx.prisma, cnpjs, 48);
    const triPorCnpj = agrupar(trimestres, (t) => t.cnpj);
    const pares = cnpjs.flatMap((c) =>
      (fiisPorCnpj.get(c) ?? []).flatMap((f) =>
        [...new Set((dados.fiiMensalPorCnpj.get(c) ?? []).map((m) => m.refMonth.slice(0, 4)))].map(
          (a) => ({ symbol: f.symbol, dtFim: `${a}-12-31` }),
        ),
      ),
    );
    const precoFim = await cotacaoFimDePeriodo(ctx.prisma, pares, JANELA_PRECO_FIM(p));
    const perShare: LinhaPerShare[] = [];
    const multiplos: LinhaMultiplos[] = [];
    const simbolos: string[] = [];
    for (const cnpj of cnpjs) {
      for (const f of fiisPorCnpj.get(cnpj) ?? []) {
        simbolos.push(f.symbol);
        const r = linhasDerivadasFii(
          {
            symbol: f.symbol,
            cnpj,
            meses: dados.fiiMensalPorCnpj.get(cnpj) ?? [],
            trimestres: triPorCnpj.get(cnpj) ?? [],
            precoFim,
            memoria,
          },
          p,
          meta,
        );
        perShare.push(...r.perShare);
        multiplos.push(...r.multiplos);
      }
    }
    linhasPerShare += perShare.length;
    linhasMultiplos += multiplos.length;
    if (opts.gravar && ctx.aplicar) {
      gravadas += await gravarPerShareAnual(ctx.prisma, simbolos, perShare);
      gravadas += await gravarMultiplosAnuais(ctx.prisma, simbolos, multiplos);
    }
  }

  ctx.contar('linhasGravadas', gravadas);
  if ((flags.auditoria_proventos ?? 0) > 0) {
    ctx.alertar({
      codigo: 'auditoria_proventos',
      nivel: 'aviso',
      mensagem: `${flags.auditoria_proventos} ano(s) com payout por ação divergindo > ${p.sanidade.acoes.payoutAuditoriaPp} p.p. da DMPL`,
    });
  }
  return {
    empresas: alvo.cnpjsAcoes.length,
    fiis: alvo.cnpjsFii.length,
    linhasPerShare,
    linhasMultiplos,
    gravadas,
    flags,
    plAnual,
  };
}
