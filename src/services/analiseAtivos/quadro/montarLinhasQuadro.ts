/**
 * Monta as linhas de analise_quadro_linhas (job 'quadro', Fase 1). Função PURA: recebe o que o
 * gerarQuadro carregou do banco (uma leitura por tabela) e devolve as linhas + alertas.
 *
 * Regras (spec fatia A + decisões 3, 4 e 5 do Wellington):
 * - UNIVERSO = cadastro: ações (CvmCompanyTicker vigente) ∪ FIIs (FiiTickerMap vigente). O
 *   AssetScore da dataRef é OPCIONAL (FII com múltiplos e sem score — HCTR11 — entra).
 * - noQuadro = negociado nos últimos 30 pregões E não é Fiagro. Fora do Quadro = só na busca.
 * - estadoIndice: fora_do_indice (FoF), sem_score, incompleto, zero_regra (componente zerado pela
 *   regra com incompleto=false — AURE3), calculado.
 * - Unit sem score próprio usa o Índice da empresa (score do ticker de referência do mesmo CNPJ).
 * - serie10a: ações = lucro FY (atribuível, lucroParaSequencia) de anos FECHADOS; FIIs =
 *   rendimento por cota de anos fechados com 12 meses de informe, com o salto > 2× marcado
 *   'suspeito'. O últ. 12m fica à parte (serieUlt12m).
 * - 'provento_suspeito': salto de provento (> 2× o ano anterior, filtrado pelo payout) num dos
 *   2 últimos anos fechados — o que contamina o DY 12m. Salto antigo só aparece no gráfico da
 *   página do ativo.
 * - Pares: até 5 do mesmo segmento (ações: B3, completando pelo subsetor; FIIs: segmento CVM e
 *   tipo), só entre linhas do Quadro, uma por empresa, por valor de mercado.
 *
 * Convenções de colunas de array: ver src/services/analiseAtivos/leitura/linhasQuadro.ts.
 */
import type { Prisma } from '@prisma/client';
import { anosFechados, detectarSaltoProvento } from '@/services/analiseAtivos/leitura/ativo/series';
import { selecionarPares, type ItemPar } from '@/services/analiseAtivos/regras/calculo/pares';
import { valorMercadoEmpresa } from '@/services/analiseAtivos/calculo/recalcularDerivados';
import type { AlertaJob, ContagemAcoes, TickerAcao } from '@/services/analiseAtivos/tipos';
import type { EstadoIndice, ForaDoQuadroMotivo, PontoSerieAnual } from '@/types/analiseAtivosApi';

export const N_PARES = 5;
export const ANOS_SERIE = 10;
/** Salto de provento nos N últimos anos fechados contamina o DY 12m (flag 'provento_suspeito'). */
export const ANOS_SALTO_RECENTE = 2;
export const FLAG_PROVENTO_SUSPEITO = 'provento_suspeito';

// ---------------------------------------------------------------------------
// Entrada (números já convertidos; datas civis como Date UTC)
// ---------------------------------------------------------------------------

export interface ScoreQuadro {
  symbol: string;
  cnpj: string;
  classe: string;
  regua: string;
  fiiTipo: string | null;
  tickerReferencia: string | null;
  indiceMf: number | null;
  componentes: unknown;
  checks: unknown;
  criteriosAplicaveis: number;
  criteriosAtendidos: number;
  incompleto: boolean;
  motivosIncompleto: string[];
  paramsVersion: number;
}

export interface MultiplosQuadro {
  symbol: string;
  preco: number | null;
  precoData: Date | null;
  lpaTtm: number | null;
  rend12m: number | null;
  pl: number | null;
  pvp: number | null;
  dy12mPct: number | null;
  payoutPct: number | null;
  margemLiquidaPct: number | null;
  roePct: number | null;
  divLiqEbitda: number | null;
  divLiqPl: number | null;
  obrigacoesPlPct: number | null;
  anosLucroConsecutivos: number | null;
  mesesComRendimento: number | null;
  naoSeAplica: string[];
  flags: string[];
}

export interface ResumoCotacaoQuadro {
  symbol: string;
  ultimoPregao: Date;
  closeRaw: number;
  volumeMedio21: number;
  baixaLiquidez: boolean;
  negociadoUltimos30: boolean;
}

export interface SetorQuadro {
  raiz: string;
  nomePregao: string | null;
  setor: string;
  subsetor: string;
  segmento: string;
  segmentoListagem: string | null;
}

export interface FiiMensalQuadro {
  cnpj: string;
  segmentoCvm: string | null;
  tipoVigente: string | null;
  cotistas: number | null;
  pl: number | null;
  cotas: number | null;
}

export interface FiiTrimestralQuadro {
  cnpj: string;
  vacanciaFisicaCvmPct: number | null;
  nImoveisRenda: number | null;
  nCri: number | null;
}

export interface PorAcaoAnoQuadro {
  symbol: string;
  anoFiscal: number;
  dpaAjHoje: number | null;
  rendCota: number | null;
  payoutDmplPct: number | null;
}

export interface EntradaQuadro {
  /** AAAA-MM-DD (define os anos fechados) */
  hoje: string;
  dataRef: Date;
  geradoEm: Date;
  acoes: TickerAcao[];
  fiis: Array<{ symbol: string; cnpj: string }>;
  scores: ScoreQuadro[];
  multiplos: MultiplosQuadro[];
  resumos: ResumoCotacaoQuadro[];
  setores: SetorQuadro[];
  nomesCia: Array<{ cnpj: string; nome: string }>;
  nomesFii: Array<{ ticker: string; nomeB3: string | null }>;
  assets: Array<{ id: string; symbol: string; name: string | null }>;
  fiiMensal: FiiMensalQuadro[];
  fiiTrimestral: FiiTrimestralQuadro[];
  /** fechamento dos 2 últimos pregões por símbolo (ordem 1 = último) */
  ultimosPregoes: Array<{ symbol: string; ordem: number; closeRaw: number }>;
  porAcaoAno: PorAcaoAnoQuadro[];
  /** lucro FY atribuível por emissor e ano (lucroParaSequencia; null = ausente) */
  lucrosFy: Array<{ cnpj: string; anoFiscal: number; lucro: number | null }>;
  /** meses com informe mensal por FII e ano */
  mesesInformeFii: Array<{ cnpj: string; ano: number; meses: number }>;
  /** contagem de ações mais recente por emissor (status ok) */
  contagens: ContagemAcoes[];
}

export type LinhaQuadroGravar = Prisma.AnaliseQuadroLinhaCreateManyInput;

export interface ResultadoMontagem {
  linhas: LinhaQuadroGravar[];
  alertas: AlertaJob[];
  noQuadroPorClasse: { acao: number; fii: number };
  foraDoQuadroPorClasse: { acao: number; fii: number };
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

const raiz = (s: string) => s.slice(0, 4);

/** Fiagro não entra no Quadro nesta fase (o cadastro de FIIs já exclui; dupla checagem pelo nome). */
export function ehFiagro(nome: string | null | undefined): boolean {
  return !!nome && /\bFI[\s-]?AGRO\b/i.test(nome);
}

interface ComponenteJson {
  estado?: string;
  motivo?: string;
}

/** Componentes zerados pela regra, como 'componente:motivo'. */
export function componentesZeroRegra(componentes: unknown): string[] {
  if (!componentes || typeof componentes !== 'object') return [];
  return Object.entries(componentes as Record<string, ComponenteJson>)
    .filter(([, c]) => c?.estado === 'zero_regra')
    .map(([nome, c]) => `${nome}:${c.motivo ?? 'regra'}`);
}

export function estadoIndiceDe(
  score: Pick<ScoreQuadro, 'regua' | 'incompleto'> | undefined,
  zeroRegra: string[],
  fiiTipo: string | null,
): EstadoIndice {
  if (!score) return fiiTipo === 'fof' ? 'fora_do_indice' : 'sem_score';
  if (score.regua === 'fora_do_indice') return 'fora_do_indice';
  if (score.incompleto) return 'incompleto';
  if (zeroRegra.length > 0) return 'zero_regra';
  return 'calculado';
}

function statusDosChecks(checks: unknown): string[] {
  if (!Array.isArray(checks)) return [];
  return checks.map((c) =>
    c && typeof c === 'object' && typeof (c as { status?: unknown }).status === 'string'
      ? (c as { status: string }).status
      : 'sem_dado',
  );
}

function agrupar<T, K>(itens: readonly T[], chave: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const i of itens) {
    const k = chave(i);
    const l = m.get(k);
    if (l) l.push(i);
    else m.set(k, [i]);
  }
  return m;
}

/** Anos fechados seguidos com provento > 0, do último para trás. */
export function anosSeguidosComProvento(serie: readonly PontoSerieAnual[]): number {
  let n = 0;
  for (let i = serie.length - 1; i >= 0; i--) {
    const v = serie[i].valor;
    if (typeof v !== 'number' || !(v > 0)) break;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export function montarLinhasQuadro(e: EntradaQuadro): ResultadoMontagem {
  const alertas: AlertaJob[] = [];
  const anoAtual = Number(e.hoje.slice(0, 4));

  const universo = [
    ...e.acoes.map((a) => ({ symbol: a.symbol, cnpj: a.cnpj, classe: 'acao' as const })),
    ...e.fiis.map((f) => ({ symbol: f.symbol, cnpj: f.cnpj, classe: 'fii' as const })),
  ];

  const scorePor = new Map(e.scores.map((s) => [s.symbol, s]));
  // unit/ticker sem score próprio: score de referência da empresa (mesmo CNPJ, classe ação)
  const scoreEmpresa = new Map<string, ScoreQuadro>();
  for (const s of e.scores) {
    if (s.classe !== 'acao') continue;
    const atual = scoreEmpresa.get(s.cnpj);
    if (!atual || s.symbol === s.tickerReferencia) scoreEmpresa.set(s.cnpj, s);
  }
  const multPor = new Map(e.multiplos.map((m) => [m.symbol, m]));
  const resumoPor = new Map(e.resumos.map((r) => [r.symbol, r]));
  const setorPor = new Map(e.setores.map((s) => [s.raiz, s]));
  const ciaPor = new Map(e.nomesCia.map((c) => [c.cnpj, c.nome]));
  const nomeB3Por = new Map(e.nomesFii.map((m) => [m.ticker, m.nomeB3]));
  const assetPor = new Map(e.assets.map((a) => [a.symbol, a]));
  const mensalPor = new Map(e.fiiMensal.map((m) => [m.cnpj, m]));
  const trimPor = new Map(e.fiiTrimestral.map((t) => [t.cnpj, t]));
  const porAcaoAno = agrupar(e.porAcaoAno, (p) => p.symbol);
  const lucrosPor = agrupar(e.lucrosFy, (l) => l.cnpj);
  const contagemPor = new Map(e.contagens.map((c) => [c.cnpj, c]));
  const tickersPorCnpj = agrupar(e.acoes, (a) => a.cnpj);
  const mesesPor = new Map<string, Record<number, number>>();
  for (const m of e.mesesInformeFii) {
    const r = mesesPor.get(m.cnpj) ?? {};
    r[m.ano] = m.meses;
    mesesPor.set(m.cnpj, r);
  }
  const precosPor = agrupar(e.ultimosPregoes, (q) => q.symbol);
  const precoResumo = new Map(e.resumos.map((r) => [r.symbol, r.closeRaw]));

  const variacaoDia = (symbol: string): number | null => {
    const l = precosPor.get(symbol) ?? [];
    const ult = l.find((q) => q.ordem === 1)?.closeRaw;
    const ant = l.find((q) => q.ordem === 2)?.closeRaw;
    return ult && ant && ult > 0 && ant > 0 ? (ult / ant - 1) * 100 : null;
  };

  const semSetor: string[] = [];
  const linhas: LinhaQuadroGravar[] = universo.map((u) => {
    const ehAcao = u.classe === 'acao';
    const score = scorePor.get(u.symbol) ?? (ehAcao ? scoreEmpresa.get(u.cnpj) : undefined);
    const m = multPor.get(u.symbol);
    const r = resumoPor.get(u.symbol);
    const setor = ehAcao ? setorPor.get(raiz(u.symbol)) : undefined;
    const mensal = ehAcao ? undefined : mensalPor.get(u.cnpj);
    const trim = ehAcao ? undefined : trimPor.get(u.cnpj);
    const asset = assetPor.get(u.symbol);
    const nomeB3 = ehAcao ? null : (nomeB3Por.get(u.symbol) ?? null);
    const fiiTipo = ehAcao ? null : (score?.fiiTipo ?? mensal?.tipoVigente ?? null);

    // universo e estado do Índice
    const fiagro = !ehAcao && ehFiagro(nomeB3);
    const negociado = r?.negociadoUltimos30 ?? false;
    const noQuadro = negociado && !fiagro;
    const foraDoQuadroMotivo: ForaDoQuadroMotivo | null = noQuadro
      ? null
      : fiagro
        ? 'fiagro'
        : 'sem_negociacao_30';
    const zeroRegra = componentesZeroRegra(score?.componentes);
    const estadoIndice = estadoIndiceDe(score, zeroRegra, fiiTipo);
    if (ehAcao && noQuadro && !setor) semSetor.push(u.symbol);

    // séries de anos fechados
    const porAno = (porAcaoAno.get(u.symbol) ?? []).map((p) => ({ ...p, ano: p.anoFiscal }));
    // FII: só anos com 12 meses de informe (o 1º ano parcial não vira "salto")
    const fechadosPorAcao = anosFechados(
      porAno,
      e.hoje,
      ehAcao ? {} : { mesesPorAno: mesesPor.get(u.cnpj) ?? {} },
    );
    const dpa: PontoSerieAnual[] = fechadosPorAcao.map((p) => ({
      ano: p.ano,
      valor: ehAcao ? p.dpaAjHoje : p.rendCota,
    }));
    const salto = detectarSaltoProvento(dpa, {
      payoutPorAno: ehAcao
        ? Object.fromEntries(fechadosPorAcao.map((p) => [p.ano, p.payoutDmplPct]))
        : undefined,
    });
    const saltoRecente = salto.anosSuspeitos.some((a) => a >= anoAtual - ANOS_SALTO_RECENTE);

    let serie10a: PontoSerieAnual[];
    if (ehAcao) {
      const lucros = (lucrosPor.get(u.cnpj) ?? []).map((l) => ({
        ano: l.anoFiscal,
        valor: l.lucro,
      }));
      serie10a = anosFechados(lucros, e.hoje)
        .slice(-ANOS_SERIE)
        .map((l) => ({ ano: l.ano, valor: l.valor }));
    } else {
      serie10a = salto.serie.slice(-ANOS_SERIE);
    }

    const flags = [...(m?.flags ?? [])];
    if (saltoRecente && !flags.includes(FLAG_PROVENTO_SUSPEITO)) flags.push(FLAG_PROVENTO_SUSPEITO);

    // valor de mercado
    const preco = m?.preco ?? r?.closeRaw ?? null;
    let valorMercado: number | null = null;
    if (ehAcao) {
      const tickers = tickersPorCnpj.get(u.cnpj) ?? [];
      const contagem = contagemPor.get(u.cnpj) ?? null;
      valorMercado = valorMercadoEmpresa(tickers, precoResumo, contagem);
      if (valorMercado === null && tickers.length === 1 && contagem?.total && preco !== null) {
        valorMercado = preco * contagem.total;
      }
    } else if (mensal?.cotas && preco !== null) {
      valorMercado = preco * mensal.cotas;
    }
    if (valorMercado !== null) valorMercado = Math.round(valorMercado * 100) / 100;

    // Asset.name de vários FIIs do catálogo é o próprio ticker: aí vale o nome do cadastro
    const nomeAsset =
      asset?.name && asset.name.trim().toUpperCase() !== u.symbol ? asset.name.trim() : null;
    const nome = ehAcao
      ? (nomeAsset ?? ciaPor.get(u.cnpj) ?? setor?.nomePregao ?? u.symbol)
      : (nomeAsset ?? nomeB3 ?? u.symbol);

    return {
      symbol: u.symbol,
      classe: u.classe,
      cnpj: u.cnpj,
      dataRef: e.dataRef,
      noQuadro,
      foraDoQuadroMotivo,
      temScore: !!score,
      estadoIndice,
      nome,
      nomeCurto: ehAcao ? (setor?.nomePregao ?? null) : nomeB3,
      setor: setor?.setor ?? null,
      subsetor: setor?.subsetor ?? null,
      segmento: setor?.segmento ?? null,
      segmentoListagem: setor?.segmentoListagem ?? null,
      fiiTipo,
      segmentoCvm: mensal?.segmentoCvm ?? null,
      regua: score?.regua ?? null,
      tickerReferencia: score?.tickerReferencia ?? null,
      preco,
      precoData: m?.precoData ?? r?.ultimoPregao ?? null,
      variacaoDiaPct: variacaoDia(u.symbol),
      volumeMedio21: r?.volumeMedio21 ?? null,
      baixaLiquidez: r?.baixaLiquidez ?? false,
      valorMercado,
      patrimonio: mensal?.pl ?? null,
      indiceMf: score?.indiceMf ?? null,
      criteriosAtendidos: score?.criteriosAtendidos ?? null,
      criteriosAplicaveis: score?.criteriosAplicaveis ?? null,
      statusCriterios: statusDosChecks(score?.checks),
      motivosIncompleto: score?.motivosIncompleto ?? [],
      componentesZeroRegra: zeroRegra,
      anosLucroConsecutivos: m?.anosLucroConsecutivos ?? null,
      mesesComRendimento: m?.mesesComRendimento ?? null,
      anosDividendo: ehAcao ? anosSeguidosComProvento(dpa) : null,
      roePct: m?.roePct ?? null,
      pl: m?.pl ?? null,
      pvp: m?.pvp ?? null,
      dy12mPct: m?.dy12mPct ?? null,
      margemLiquidaPct: m?.margemLiquidaPct ?? null,
      divLiqEbitda: m?.divLiqEbitda ?? null,
      divLiqPl: m?.divLiqPl ?? null,
      payoutPct: m?.payoutPct ?? null,
      vacanciaFisicaCvmPct: trim?.vacanciaFisicaCvmPct ?? null,
      nImoveisCvm: trim?.nImoveisRenda ?? null,
      nCri: trim?.nCri ?? null,
      obrigacoesPlPct: m?.obrigacoesPlPct ?? null,
      cotistas: mensal?.cotistas ?? null,
      naoSeAplica: m?.naoSeAplica ?? [],
      serie10a: serie10a as unknown as Prisma.InputJsonValue,
      serieUlt12m: (ehAcao ? m?.lpaTtm : m?.rend12m) ?? null,
      pares: [],
      assetId: asset?.id ?? null,
      flags,
      paramsVersion: score?.paramsVersion ?? null,
      geradoEm: e.geradoEm,
    };
  });

  preencherPares(linhas);

  if (semSetor.length > 0) {
    alertas.push({
      codigo: 'quadro_sem_setor',
      nivel: 'aviso',
      mensagem: `${semSetor.length} ações do Quadro sem setor B3 (filtro Setor e pares ficam sem elas): ${semSetor.slice(0, 20).join(', ')}`,
    });
  }

  const contar = (noQuadro: boolean) => ({
    acao: linhas.filter((l) => l.classe === 'acao' && l.noQuadro === noQuadro).length,
    fii: linhas.filter((l) => l.classe === 'fii' && l.noQuadro === noQuadro).length,
  });
  return {
    linhas,
    alertas,
    noQuadroPorClasse: contar(true),
    foraDoQuadroPorClasse: contar(false),
  };
}

/** Preenche `pares` (in place) só entre linhas do Quadro, uma por empresa. */
function preencherPares(linhas: LinhaQuadroGravar[]): void {
  const noQuadro = linhas.filter((l) => l.noQuadro);
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  for (const classe of ['acao', 'fii'] as const) {
    const daClasse = noQuadro.filter((l) => l.classe === classe);
    // uma linha por empresa: a de maior liquidez
    const porCnpj = new Map<string, LinhaQuadroGravar>();
    for (const l of daClasse) {
      const atual = porCnpj.get(l.cnpj);
      if (!atual || (num(l.volumeMedio21) ?? 0) > (num(atual.volumeMedio21) ?? 0)) {
        porCnpj.set(l.cnpj, l);
      }
    }
    const chave = (l: LinhaQuadroGravar) =>
      classe === 'acao'
        ? { segmento: l.segmento ?? null, subsetor: l.subsetor ?? null }
        : {
            segmento: l.segmentoCvm ? `${l.segmentoCvm}|${l.fiiTipo ?? ''}` : null,
            subsetor: l.segmentoCvm ?? null,
          };
    const universo: Array<ItemPar & { cnpj: string }> = [...porCnpj.values()].map((l) => ({
      symbol: l.symbol,
      cnpj: l.cnpj,
      ...chave(l),
      valorMercado: num(l.valorMercado),
    }));
    for (const l of daClasse) {
      const outros = universo.filter((u) => u.cnpj !== l.cnpj);
      l.pares = selecionarPares({ symbol: l.symbol, ...chave(l) }, outros, N_PARES);
    }
  }
}
