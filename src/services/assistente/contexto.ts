/**
 * "Retrato" compacto da conta que vai no prompt do assistente: carteira
 * (resumo + posições), fluxo de caixa do ano (totais mensais por linha),
 * orçamento, dívidas, saúde financeira e objetivos.
 *
 * As funções `compact*` são puras e compartilhadas com o harness
 * (scripts/assistente/build-contexto.ts). `buildContextoUsuario` roda no
 * servidor reaproveitando as rotas GET existentes (mesma autenticação e
 * mesmo contexto de consultor da requisição), com cache de 5 min por usuário.
 */
import { NextRequest } from 'next/server';
import { getTtlCache, deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';
import {
  abaDoAssetPlanejado,
  listarTodosPlanejados,
  ROTULO_ABA,
} from '@/services/portfolio/ativosPlanejados';
import { simplifyAssetName } from '@/utils/assetDisplayName';

export type Json = Record<string, unknown>;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const DROP_KEY =
  /(^id$|Id$|^userId$|createdAt|updatedAt|^isTemplate$|^templateId$|^hidden$|^orderIndex$)/;

const ATIVO_KEEP = [
  'ticker',
  'nome',
  'setor',
  'tipo',
  'quantidade',
  'precoAquisicao',
  'cotacaoAtual',
  'valorTotal',
  'valorAtualizado',
  'valorInicialAplicado',
  'rentabilidade',
  'percentualCarteira',
  'proventos',
  'benchmark',
  'vencimento',
  'cotizacaoResgate',
  'liquidacaoResgate',
  'estrategia',
  'objetivo',
  'instituicao',
  // Rebalanceamento por ativo (16/09/2026)
  'quantoFalta',
  'necessidadeAporte',
  // Previdência (modalidade/subclasse = VGBL, PGBL...), reservas e imóveis
  'modalidade',
  'subclasse',
  'carencia',
  'cotacaoResgate',
  'valorInicial',
  'cidade',
  'observacoes',
];

/** Chave de `distribuicao` no resumo da carteira → rota de posições. */
const CLASSE_POR_DISTRIBUICAO: Record<string, string> = {
  acoes: 'acoes',
  fiis: 'fii',
  etfs: 'etf',
  stocks: 'stocks',
  reits: 'reit',
  rendaFixaFundos: 'renda-fixa',
  fimFia: 'fim-fia',
  moedasCriptos: 'moedas-criptos',
  previdenciaSeguros: 'previdencia-seguros',
  imoveisBens: 'imoveis-bens',
  reservaEmergencia: 'reserva-emergencia',
  reservaOportunidade: 'reserva-oportunidade',
  opcoes: 'opcoes',
};

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Mantém só campos primitivos úteis; arredonda números; remove ids/datas técnicas. */
export function slim(obj: unknown, keep?: string[]): Json {
  if (!obj || typeof obj !== 'object') return {};
  const out: Json = {};
  for (const [k, v] of Object.entries(obj as Json)) {
    if (keep ? !keep.includes(k) : DROP_KEY.test(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number') out[k] = round(v);
    else if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** IR do resgate hoje: alíquota em % (o round de 2 casas fazia 0,175 virar 0,18). */
function compactIrResgate(ir: Json): Json {
  const { aliquota, ...resto } = ir;
  return {
    ...slim(resto),
    ...(typeof aliquota === 'number' ? { aliquotaPercentual: round(aliquota * 100) } : {}),
  };
}

export interface CashGroupLike {
  id?: string;
  name: string;
  type?: string;
  hidden?: boolean;
  items?: Array<{
    id?: string;
    name: string;
    hidden?: boolean;
    objetivoId?: string | null;
    dividaId?: string | null;
    values?: Array<{ month: number; value: number | string | null }>;
  }>;
  children?: CashGroupLike[];
}

export interface LinhaEditavel {
  itemId: string;
  itemNome: string;
  /** Trilha completa do grupo, ex.: "Despesas > Despesas Fixas > Transporte". */
  grupoNome: string;
  grupoTipo: string;
}

/**
 * Linhas em que o assistente pode lançar: grupos de entrada/despesa (em
 * qualquer nível), sem espelho de sonho/dívida e não ocultas. Inclui as
 * linhas ainda zeradas — é a lista completa, não só o que tem valor.
 */
export function listarLinhasEditaveis(groups: CashGroupLike[]): LinhaEditavel[] {
  const out: LinhaEditavel[] = [];
  const walk = (g: CashGroupLike, trail: string[]) => {
    if (g.hidden) return;
    const nome = [...trail, g.name].join(' > ');
    if (g.type === 'entrada' || g.type === 'despesa') {
      for (const item of g.items ?? []) {
        if (item.hidden || item.objetivoId || item.dividaId) continue;
        out.push({
          itemId: item.id ?? '',
          itemNome: item.name,
          grupoNome: nome,
          grupoTipo: g.type,
        });
      }
    }
    for (const c of g.children ?? []) walk(c, [...trail, g.name]);
  };
  for (const g of groups) walk(g, []);
  return out;
}

/**
 * Catálogo para o prompt: { "Despesas > Despesas Fixas > Transporte": ["Combustível", ...] }.
 * Só nomes (sem valores), para o modelo saber TODAS as linhas onde pode lançar —
 * `compactCashflow` mostra apenas as já preenchidas.
 */
export function catalogoLinhas(groups: CashGroupLike[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const l of listarLinhasEditaveis(groups)) {
    (out[l.grupoNome] ??= []).push(l.itemNome);
  }
  return out;
}

/** Valores por mês (12 posições, arredondados) de uma linha do fluxo. */
function valoresPorMes(item: NonNullable<CashGroupLike['items']>[number]): number[] {
  const porMes = Array<number>(12).fill(0);
  for (const v of item.values ?? []) {
    if (typeof v.month === 'number' && v.month >= 0 && v.month < 12) {
      porMes[v.month] = round(Number(v.value ?? 0));
    }
  }
  return porMes;
}

/** { jan: 10, mar: 5 } — só os meses com valor. */
function mesesNaoZerados(porMes: number[]): Json {
  const meses: Json = {};
  porMes.forEach((val, i) => {
    if (val !== 0) meses[MESES[i]] = val;
  });
  return meses;
}

/**
 * Árvore do fluxo → lista plana de grupos com linhas não zeradas e valores por mês.
 * Cada grupo traz também o SEU total (ano e por mês): sem isso o modelo somava
 * as linhas de cabeça ou pegava o total geral de despesas/anual do orçamento
 * quando perguntavam "quanto gasto com habitação" (ticket testers 15/09/2026).
 */
export function compactCashflow(groups: CashGroupLike[]): Json[] {
  const out: Json[] = [];
  const walk = (g: CashGroupLike, trail: string[]) => {
    const nome = [...trail, g.name].join(' > ');
    const grupoPorMes = Array<number>(12).fill(0);
    const linhas = (g.items ?? [])
      .map((it) => {
        const porMes = valoresPorMes(it);
        const total = round(porMes.reduce((a, b) => a + b, 0));
        if (total === 0) return null;
        porMes.forEach((val, i) => {
          grupoPorMes[i] = round(grupoPorMes[i] + val);
        });
        return { linha: it.name, totalAno: total, meses: mesesNaoZerados(porMes) };
      })
      .filter(Boolean);
    if (linhas.length > 0) {
      out.push({
        grupo: nome,
        tipo: g.type,
        totalAno: round(grupoPorMes.reduce((a, b) => a + b, 0)),
        totalPorMes: mesesNaoZerados(grupoPorMes),
        linhas,
      });
    }
    for (const c of g.children ?? []) walk(c, [...trail, g.name]);
  };
  for (const g of groups) walk(g, []);
  return out;
}

/**
 * Retrato de UM mês: entradas, despesas e o total de cada grupo de despesa
 * (nome curto, ex.: "Habitação"; a trilha inteira se o nome curto se repetir).
 * É o que responde "quanto gasto com habitação?" e "quanto gastei este mês?"
 * sem o modelo precisar somar nada.
 */
export function resumirMes(groups: CashGroupLike[], mesIndex: number): Json {
  let entradas = 0;
  let despesas = 0;
  const porGrupoTrilha: Array<{ curto: string; trilha: string; valor: number }> = [];
  const walk = (g: CashGroupLike, trail: string[]) => {
    const trilha = [...trail, g.name].join(' > ');
    let doGrupo = 0;
    for (const it of g.items ?? []) {
      doGrupo = round(doGrupo + valoresPorMes(it)[mesIndex]);
    }
    if (g.type === 'entrada') entradas = round(entradas + doGrupo);
    if (g.type === 'despesa') {
      despesas = round(despesas + doGrupo);
      if (doGrupo !== 0) porGrupoTrilha.push({ curto: g.name, trilha, valor: doGrupo });
    }
    for (const c of g.children ?? []) walk(c, [...trail, g.name]);
  };
  for (const g of groups) walk(g, []);

  const repetidos = new Set(
    porGrupoTrilha.map((p) => p.curto).filter((n, i, arr) => arr.indexOf(n) !== i),
  );
  const despesasPorGrupo: Json = {};
  for (const p of porGrupoTrilha) {
    despesasPorGrupo[repetidos.has(p.curto) ? p.trilha : p.curto] = p.valor;
  }
  return {
    mes: MESES_LONGOS[mesIndex],
    entradas,
    despesas,
    sobra: round(entradas - despesas),
    despesasPorGrupo,
  };
}

/**
 * Entradas, despesas e sobra de cada mês do ano até o mês atual, e o
 * acumulado. O modelo errava somando nove meses de cabeça ("quanto ganhei e
 * gastei este ano": 1% a 7% de erro, 21/09/2026) — agora o número vem pronto.
 */
export function resumirAno(groups: CashGroupLike[], mesAtualIndex: number): Json {
  const porMes: Json = {};
  let entradas = 0;
  let despesas = 0;
  for (let m = 0; m <= mesAtualIndex; m++) {
    const r = resumirMes(groups, m) as { entradas: number; despesas: number; sobra: number };
    porMes[MESES_LONGOS[m]] = { entradas: r.entradas, despesas: r.despesas, sobra: r.sobra };
    entradas = round(entradas + r.entradas);
    despesas = round(despesas + r.despesas);
  }
  return {
    acumuladoAteMesAtual: { entradas, despesas, sobra: round(entradas - despesas) },
    porMes,
  };
}

interface Secao {
  nome?: string;
  tipo?: string;
  ativos?: Json[];
  totalValorAtualizado?: number;
  totalObjetivo?: number;
  totalQuantoFalta?: number;
  totalNecessidadeAporte?: number;
}
export interface CarteiraClasseLike {
  resumo?: Json;
  secoes?: Secao[];
  /** Reservas e Imóveis & Bens não têm seções: a rota devolve `ativos` direto. */
  ativos?: Json[];
  totalGeral?: Json;
}

export function compactClasse(d: CarteiraClasseLike | null | undefined): Json | null {
  if (!d) return null;
  // Reservas (emergência/oportunidade) e Imóveis & Bens vêm sem `secoes` —
  // antes o compactador devolvia null e essas classes sumiam do contexto.
  const secoesBrutas: Secao[] =
    d.secoes && d.secoes.length > 0
      ? d.secoes
      : d.ativos && d.ativos.length > 0
        ? [{ nome: 'Ativos', ativos: d.ativos }]
        : [];
  const secoes = secoesBrutas
    .map((s) => ({
      secao: s.nome ?? s.tipo,
      total: s.totalValorAtualizado !== undefined ? round(s.totalValorAtualizado) : undefined,
      ...(s.totalObjetivo !== undefined ? { objetivoTotal: round(s.totalObjetivo) } : {}),
      ...(s.totalQuantoFalta !== undefined ? { quantoFaltaTotal: round(s.totalQuantoFalta) } : {}),
      ...(s.totalNecessidadeAporte !== undefined
        ? { necessidadeAporteTotal: round(s.totalNecessidadeAporte) }
        : {}),
      // Ativos PLANEJADOS (sem posição) vêm nas rotas das abas como linha
      // zerada; aqui saem das posições (o modelo os lia como carteira) e
      // entram só em `carteira.ativosPlanejadosSemPosicao`.
      ativos: (s.ativos ?? [])
        .filter((a) => !a.planejado)
        .map((a) => ({
          ...slim(a, ATIVO_KEEP),
          // Renda fixa: IR/IOF se resgatasse HOJE (dias, alíquota da tabela
          // regressiva, valor líquido), calculado pelo app. Sem isso o modelo
          // chutava o prazo da aplicação (21/09/2026).
          ...(a.ir && typeof a.ir === 'object' ? { ir: compactIrResgate(a.ir as Json) } : {}),
        })),
    }))
    .filter((s) => s.ativos.length > 0);
  if (secoes.length === 0) return null;
  return { resumo: slim(d.resumo), secoes, totalGeral: slim(d.totalGeral) };
}

// ---------------------------------------------------------------------------
// Proventos recebidos (dividendos, JCP, rendimentos) — de /api/analises/proventos
// ---------------------------------------------------------------------------

export interface ProventoLike {
  data?: string;
  symbol?: string;
  ativo?: string;
  tipo?: string;
  valor?: number;
  status?: string;
}
export interface ProventosLike {
  proventos?: ProventoLike[];
  kpis?: Json;
}

/** Normaliza o tipo textual do provento em 3 famílias. */
export function familiaProvento(tipo: string | undefined): 'JCP' | 'Rendimento' | 'Dividendo' {
  const t = (tipo ?? '').toLowerCase();
  if (t.includes('jcp') || t.includes('juros')) return 'JCP';
  if (t.includes('rendimento')) return 'Rendimento';
  return 'Dividendo';
}

/**
 * Resumo compacto dos proventos RECEBIDOS (status realizado, líquidos) e a
 * receber: totais por período, por família (dividendo/JCP/rendimento), por ano,
 * por mês (12 últimos), por ativo no ano e os últimos pagamentos. Pura.
 */
export function compactProventos(d: ProventosLike | null | undefined, hoje: Date = new Date()) {
  if (!d) return null;
  const lista = (d.proventos ?? []).filter((p) => p.status === 'realizado' && p.data);
  const kpis = (d.kpis ?? {}) as Json;
  if (lista.length === 0 && !kpis.rendaAcumulada) return null;

  const anoAtual = hoje.getFullYear();
  const mesAtualKey = `${anoAtual}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const limite12m = new Date(hoje);
  limite12m.setMonth(limite12m.getMonth() - 11);
  limite12m.setDate(1);
  limite12m.setHours(0, 0, 0, 0);

  const soma = (xs: ProventoLike[]) => round(xs.reduce((s, p) => s + Number(p.valor ?? 0), 0));
  const porChave = (xs: ProventoLike[], chave: (p: ProventoLike) => string) => {
    const out: Record<string, number> = {};
    for (const p of xs) {
      const k = chave(p);
      out[k] = (out[k] ?? 0) + Number(p.valor ?? 0);
    }
    for (const k of Object.keys(out)) out[k] = round(out[k]);
    return out;
  };

  const doAno = lista.filter((p) => p.data!.slice(0, 4) === String(anoAtual));
  const ult12m = lista.filter((p) => new Date(p.data!) >= limite12m);
  const porAtivoAno = Object.entries(porChave(doAno, (p) => p.symbol ?? p.ativo ?? '?'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const ultimos = [...lista]
    .sort((a, b) => (a.data! < b.data! ? 1 : -1))
    .slice(0, 8)
    .map((p) => ({
      data: p.data!.slice(0, 10),
      ativo: p.symbol ?? p.ativo,
      tipo: familiaProvento(p.tipo),
      valor: round(Number(p.valor ?? 0)),
    }));

  const renda = (kpis.rendaAcumulada ?? {}) as Json;
  const aReceber = (kpis.aReceber ?? {}) as Json;
  return {
    observacao:
      'Valores LÍQUIDOS já recebidos (data de pagamento). JCP = juros sobre capital próprio; ' +
      'Rendimento = FIIs. "aReceber" = anunciados e ainda não pagos.',
    totalDesdeOInicio: round(Number(renda.lifetime ?? soma(lista))),
    ultimos12Meses: round(Number(renda.ult12m ?? soma(ult12m))),
    mediaMensalUltimos12Meses: round(Number((kpis.mediaMensal as Json | undefined)?.ult12m ?? 0)),
    anoAtual: {
      ano: anoAtual,
      total: soma(doAno),
      porTipo: porChave(doAno, (p) => familiaProvento(p.tipo)),
    },
    mesAtual: {
      mes: mesAtualKey,
      total: soma(lista.filter((p) => p.data!.slice(0, 7) === mesAtualKey)),
    },
    porTipoDesdeOInicio: porChave(lista, (p) => familiaProvento(p.tipo)),
    porAno: porChave(lista, (p) => p.data!.slice(0, 4)),
    porMesUltimos12: porChave(ult12m, (p) => p.data!.slice(0, 7)),
    porAtivoNoAno: Object.fromEntries(porAtivoAno),
    ultimosPagamentos: ultimos,
    aReceber: {
      esteMes: round(Number(aReceber.esseMes ?? 0)),
      proximos12Meses: round(Number((aReceber.next12Months as Json | undefined)?.sum ?? 0)),
    },
  };
}

// ---------------------------------------------------------------------------
// Dívidas, objetivos, orçamento e histórico da carteira — campos que o `slim`
// descartava por serem objetos/arrays (auditoria 16/09/2026).
// ---------------------------------------------------------------------------

/** Dívida com o resumo calculado (saldo devedor, próxima parcela...). */
export function compactDivida(d: Json): Json {
  const resumo = (d.resumo ?? null) as Json | null;
  const proxima = (resumo?.proximaParcela ?? null) as Json | null;
  return {
    ...slim(d),
    ...(resumo
      ? {
          saldoDevedor: round(Number(resumo.saldoCorrigido ?? resumo.saldoDevedor ?? 0)),
          parcelasPagas: resumo.parcelasPagas ?? undefined,
          totalParcelas: resumo.totalParcelas ?? undefined,
          prazoRestanteMeses: resumo.prazoRestanteMeses ?? undefined,
          ...(proxima
            ? {
                proximaParcela: {
                  numero: proxima.numero,
                  mes: proxima.mes,
                  valor: round(Number(resumo.proximaParcelaCorrigida ?? proxima.parcela ?? 0)),
                },
              }
            : {}),
        }
      : {}),
  };
}

/** Objetivo (sonho) com progresso a partir dos aportes mensais registrados. */
export function compactObjetivo(o: Json): Json {
  const entries = ((o.entries ?? []) as Json[])
    .filter((e) => typeof e.month === 'string')
    .sort((a, b) => ((a.month as string) < (b.month as string) ? -1 : 1));
  const base = slim(o);
  if (entries.length === 0) return base;
  const aportado = entries.reduce((s, e) => s + Number(e.aporte ?? 0), 0);
  const ultimo = entries[entries.length - 1];
  const acumulado = Number(ultimo.balance ?? 0);
  const target = Number(o.target ?? 0);
  return {
    ...base,
    progresso: {
      aportadoTotal: round(aportado),
      acumulado: round(acumulado),
      ultimoMes: ultimo.month,
      mesesRegistrados: entries.length,
      ...(target > 0 ? { percentualDaMeta: round((acumulado / target) * 100) } : {}),
    },
  };
}

const MES_KEY = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * Evolução do patrimônio (último ponto de cada mês, 24 meses) e rentabilidade
 * TWR/MWR por janela, a partir das séries que o /api/carteira/resumo já
 * devolve (valores em %, acumulados desde o início).
 */
export function compactHistoricoCarteira(resumo: Json | null | undefined, hoje: Date = new Date()) {
  if (!resumo) return {};
  type Ponto = { data: number; value?: number; saldoBruto?: number; valorAplicado?: number };
  const patrimonio = (resumo.historicoPatrimonio ?? []) as Ponto[];
  const twr = (resumo.historicoTWR ?? []) as Ponto[];
  const mwr = (resumo.historicoMWR ?? []) as Ponto[];
  if (patrimonio.length === 0 && twr.length === 0) return {};

  const porMes = <T extends Ponto>(serie: T[]) => {
    const out = new Map<string, T>();
    for (const p of serie) out.set(MES_KEY(new Date(p.data)), p); // fica o último do mês
    return out;
  };
  const limite = new Date(hoje.getFullYear(), hoje.getMonth() - 23, 1).getTime();
  const evolucao: Record<string, { saldoBruto: number; valorAplicado: number }> = {};
  for (const [mes, p] of porMes(patrimonio)) {
    if (p.data < limite) continue;
    evolucao[mes] = {
      saldoBruto: round(p.saldoBruto ?? 0),
      valorAplicado: round(p.valorAplicado ?? 0),
    };
  }

  // Retorno de uma janela a partir da série acumulada: (1+fim)/(1+início) − 1.
  const janela = (serie: Ponto[], desde: Date): number | undefined => {
    if (serie.length === 0) return undefined;
    const fim = serie[serie.length - 1];
    let inicio: Ponto | undefined;
    for (const p of serie) {
      if (p.data < desde.getTime()) inicio = p;
      else break;
    }
    if (!inicio) return undefined;
    const r = (1 + Number(fim.value ?? 0) / 100) / (1 + Number(inicio.value ?? 0) / 100) - 1;
    return round(r * 100);
  };
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioAno = new Date(hoje.getFullYear(), 0, 1);
  const ha12m = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
  const rentabilidade = {
    observacao:
      'TWR em %, ignora aportes/resgates (compare com CDI); MWR pondera pelos aportes. Janelas = mês, ano e 12 meses.',
    twr: {
      desdeOInicio: twr.length ? round(Number(twr[twr.length - 1].value ?? 0)) : undefined,
      noMes: janela(twr, inicioMes),
      noAno: janela(twr, inicioAno),
      ultimos12Meses: janela(twr, ha12m),
    },
    mwrDesdeOInicio: mwr.length ? round(Number(mwr[mwr.length - 1].value ?? 0)) : undefined,
  };
  return {
    evolucaoPatrimonioPorMes: Object.keys(evolucao).length ? evolucao : undefined,
    rentabilidade,
  };
}

/** Orçamento: meta × realizado do mês atual por categoria (+ restante). */
export function compactOrcamento(orc: Json | null | undefined, mesIndex: number): Json | null {
  if (!orc) return null;
  const categorias = ((orc.categorias ?? []) as Json[]).map((c) => {
    const real = ((c.realPorMes as Json | undefined)?.lancado ?? []) as number[];
    const realMes = round(Number(real[mesIndex] ?? 0));
    const meta = c.metaMensal != null ? round(Number(c.metaMensal)) : null;
    return {
      ...slim(c, ['nome', 'parentNome', 'metaMensal']),
      realAnual: slim(c.realAnual),
      realMesAtual: realMes,
      ...(meta != null ? { restanteMesAtual: round(meta - realMes) } : {}),
    };
  });
  const inv = (orc.investimentos ?? null) as Json | null;
  const invMeta = ((inv?.metaPorMes as Json | undefined)?.lancado ?? []) as number[];
  const invReal = ((inv?.realPorMes ?? []) as number[]) ?? [];
  return {
    observacao:
      'metaMensal × realMesAtual por categoria (restanteMesAtual = quanto ainda pode gastar no mês).',
    categorias,
    totais: orc.totais,
    investimentos: inv
      ? {
          ...slim(inv, ['tipoMeta', 'valorMeta']),
          metaMesAtual: round(Number(invMeta[mesIndex] ?? 0)),
          realMesAtual: round(Number(invReal[mesIndex] ?? 0)),
        }
      : {},
  };
}

// ---------------------------------------------------------------------------
// Lote 2 (16/09/2026): agenda, aposentadoria, meta de patrimônio, alocação
// alvo, cobertura FGC e perfil — rotas pequenas, uma chamada cada.
// ---------------------------------------------------------------------------

/** Agenda dos próximos dias (parcelas, vencimentos de RF, proventos, IR, eventos manuais). */
export function compactAgenda(d: Json | null | undefined, max = 40): Json[] | null {
  const eventos = ((d?.eventos ?? []) as Json[]).slice(0, max);
  if (eventos.length === 0) return null;
  return eventos.map((e) => slim(e, ['tipo', 'titulo', 'data', 'dataFim', 'valor', 'descricao']));
}

/** Plano de aposentadoria: premissas + progresso real registrado. */
export function compactAposentadoria(d: Json | null | undefined): Json | null {
  const plano = (d?.plano ?? null) as Json | null;
  if (!plano) return null;
  const entries = ((plano.entries ?? []) as Json[]).filter((e) => typeof e.off === 'number');
  const ultimo = entries.length ? entries[entries.length - 1] : null;
  const aportadoReal = entries.reduce((s, e) => s + Number(e.aporteReal ?? 0), 0);
  return {
    idadeAtual: plano.idade,
    idadeAposentadoria: plano.apos,
    expectativaVida: plano.vida,
    patrimonioInicial: round(Number(plano.patrimonio ?? 0)),
    aporteMensalPlanejado: round(Number(plano.aporteM ?? 0)),
    rendaMensalAlvo: round(Number(plano.renda ?? 0)),
    rentabilidadeNominalAA: plano.rentNom,
    inflacaoAA: plano.inflacao,
    ...(ultimo
      ? {
          progresso: {
            mesesRegistrados: entries.length,
            aportadoReal: round(aportadoReal),
            patrimonioAtual: round(Number(ultimo.patFinal ?? 0)),
            ultimoMes: `${ultimo.year}-${String(ultimo.month).padStart(2, '0')}`,
          },
        }
      : {}),
  };
}

/** Alocação alvo por classe (Alocação de Ativos) cruzada com o % atual da distribuição. */
export function compactAlocacaoAlvo(
  cfg: Json | null | undefined,
  distribuicao: Record<string, Json> | null | undefined,
): Json[] | null {
  const configs = ((cfg?.configuracoes ?? []) as Json[]).filter(
    (c) => typeof c.categoria === 'string',
  );
  if (configs.length === 0) return null;
  return configs
    .map((c) => {
      const categoria = c.categoria as string;
      const alvo = Number(c.target ?? 0);
      const atual = Number(distribuicao?.[categoria]?.percentual ?? 0);
      return {
        classe: categoria,
        alvoPct: round(alvo),
        minimoPct: round(Number(c.minimo ?? 0)),
        maximoPct: round(Number(c.maximo ?? 0)),
        atualPct: round(atual),
        diferencaPontos: round(atual - alvo),
        ...(c.descricao ? { descricao: c.descricao } : {}),
      };
    })
    .filter((c) => c.alvoPct > 0 || c.atualPct > 0);
}

/** Cobertura do FGC da renda fixa: resumo + por instituição. */
export function compactFgc(d: Json | null | undefined): Json | null {
  if (!d?.resumo) return null;
  const resumo = slim(d.resumo);
  if (Number(resumo.totalValorRendaFixa ?? 0) === 0) return null;
  return {
    observacao: 'Limites do FGC por instituição e global; valores em R$.',
    ...resumo,
    instituicoes: ((d.instituicoes ?? []) as Json[]).slice(0, 20).map((i) => slim(i)),
  };
}

export interface ContextoBruto {
  ano: number;
  resumo: Json | null;
  posicoes: Record<string, CarteiraClasseLike | null>;
  cashflow: { groups: CashGroupLike[] } | null;
  orcamento: Json | null;
  dividas: { dividas: Json[] } | null;
  saude: Json | null;
  sonhos: { objetivos: Json[] } | null;
  /** Ativos planejados (sem posição): { aba, ativo, objetivoPercentualDaAba, secao?, observacoes? }. */
  planejados?: Json[];
  /** Resposta crua de /api/analises/proventos (histórico completo). */
  proventos?: ProventosLike | null;
  // Lote 2
  agenda?: Json | null;
  aposentadoria?: Json | null;
  metaPatrimonio?: Json | null;
  alocacaoConfig?: Json | null;
  fgc?: Json | null;
  perfil?: Json | null;
}

const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Monta o JSON compacto a partir das respostas cruas das rotas. Pura. */
export function montarContexto(raw: ContextoBruto, hoje: Date = new Date()): Json {
  const r = (raw.resumo ?? {}) as Json;
  const posicoes: Json = {};
  for (const [classe, d] of Object.entries(raw.posicoes)) {
    const c = compactClasse(d);
    if (c) posicoes[classe] = c;
  }
  const orc = raw.orcamento as Json | null;
  return {
    // A data fica AQUI (parte por usuário, cacheada 5 min) e não nas regras,
    // para o prefixo estável do prompt continuar cacheável entre usuários.
    hoje: hoje.toISOString().slice(0, 10),
    mesAtual: MESES_LONGOS[hoje.getMonth()],
    ano: raw.ano,
    ...(raw.perfil?.name ? { usuario: { nome: raw.perfil.name } } : {}),
    carteira: {
      saldoBruto: r.saldoBruto,
      valorAplicado: r.valorAplicado,
      rentabilidadePercentual: r.rentabilidade,
      caixaParaInvestir: r.caixaParaInvestir,
      metaPatrimonio: r.metaPatrimonio,
      totais: slim(r.totais),
      distribuicao: Object.fromEntries(
        Object.entries((r.distribuicao ?? {}) as Record<string, Json>)
          .filter(([, v]) => Number(v?.valor ?? 0) !== 0)
          .map(([k, v]) => [k, slim(v)]),
      ),
      posicoes,
      // O usuário AINDA NÃO TEM esses ativos: só definiu um objetivo (% da aba)
      // para planejar as próximas compras. Não somam no patrimônio.
      ...(raw.planejados && raw.planejados.length > 0
        ? { ativosPlanejadosSemPosicao: raw.planejados.map((p) => slim(p)) }
        : {}),
      // Dividendos, JCP e rendimentos recebidos — o modelo não tinha isso e
      // respondia que não sabia (16/09/2026).
      proventosRecebidos: compactProventos(raw.proventos, hoje),
      // Evolução mensal do patrimônio + TWR/MWR por janela (já vinham no resumo).
      ...compactHistoricoCarteira(r, hoje),
      // Meta de patrimônio com prazo, progresso e aporte mensal necessário.
      ...(raw.metaPatrimonio && (raw.metaPatrimonio as Json).hasGoal
        ? { metaPatrimonioStatus: slim(raw.metaPatrimonio) }
        : {}),
      // Alocação de Ativos: alvo × atual por classe (rebalanceamento).
      alocacaoAlvoPorClasse: compactAlocacaoAlvo(
        raw.alocacaoConfig,
        (r.distribuicao ?? null) as Record<string, Json> | null,
      ),
      coberturaFgc: compactFgc(raw.fgc),
    },
    // Próximos 60 dias: parcelas de dívida, vencimentos de renda fixa,
    // proventos anunciados, datas de IR e eventos manuais da Agenda.
    agendaProximos60Dias: compactAgenda(raw.agenda),
    aposentadoria: compactAposentadoria(raw.aposentadoria),
    // Retrato do mês atual: total por grupo de despesa, entradas, despesas e sobra.
    // Vem ANTES do fluxo detalhado para o modelo achar primeiro o número pronto.
    mesAtualResumo: raw.cashflow ? resumirMes(raw.cashflow.groups, hoje.getMonth()) : null,
    // Janeiro até o mês atual: por mês e acumulado ("quanto ganhei/gastei este ano").
    anoResumo: raw.cashflow ? resumirAno(raw.cashflow.groups, hoje.getMonth()) : null,
    // Só linhas com valor no ano (leitura), com o total de cada grupo por mês.
    // O catálogo completo vai em linhasDoFluxo.
    fluxoDeCaixa: raw.cashflow ? compactCashflow(raw.cashflow.groups) : null,
    // Todas as linhas editáveis, por grupo, para propor_lancamento acertar a linha/seção.
    linhasDoFluxo: raw.cashflow ? catalogoLinhas(raw.cashflow.groups) : null,
    orcamento: compactOrcamento(orc, hoje.getMonth()),
    // Com saldo devedor, próxima parcela e prazo restante (antes só o cadastro).
    dividas: (raw.dividas?.dividas ?? []).map((d) => compactDivida(d)),
    saudeFinanceira: raw.saude
      ? {
          indicadores: (raw.saude as Json).indicadores,
          config: (raw.saude as Json).config,
          // Setas vs. mês anterior: 'melhorou' | 'piorou' | 'estavel' | null.
          tendencias: (raw.saude as Json).tendencias ?? undefined,
        }
      : null,
    // Com progresso (aportes registrados e saldo acumulado).
    objetivos: (raw.sonhos?.objetivos ?? []).map((o) => compactObjetivo(o)),
  };
}

/** Classes de ativo com valor > 0 no resumo → rotas a consultar. */
export function classesComPosicao(resumo: Json | null): string[] {
  const dist = ((resumo ?? {}) as Json).distribuicao as Record<string, Json> | undefined;
  if (!dist) return [];
  return Object.entries(dist)
    .filter(([k, v]) => CLASSE_POR_DISTRIBUICAO[k] && Number(v?.valor ?? 0) !== 0)
    .map(([k]) => CLASSE_POR_DISTRIBUICAO[k]);
}

// ---------------------------------------------------------------------------
// Servidor: reaproveita as rotas GET existentes (mesmos cookies/consultor).
// ---------------------------------------------------------------------------

type RouteHandler = (req: NextRequest) => Promise<Response>;

/** Carregamento tardio das rotas para não puxar tudo no import do serviço. */
const ROTAS: Record<string, () => Promise<{ GET: RouteHandler }>> = {
  '/api/carteira/resumo': () => import('@/app/api/carteira/resumo/route'),
  '/api/analises/proventos': () => import('@/app/api/analises/proventos/route'),
  '/api/cashflow': () => import('@/app/api/cashflow/route'),
  '/api/cashflow/orcamento': () => import('@/app/api/cashflow/orcamento/route'),
  '/api/dividas': () => import('@/app/api/dividas/route'),
  '/api/saude-financeira': () => import('@/app/api/saude-financeira/route'),
  '/api/planejamento-sonhos': () => import('@/app/api/planejamento-sonhos/route'),
  '/api/carteira/acoes': () => import('@/app/api/carteira/acoes/route'),
  '/api/carteira/fii': () => import('@/app/api/carteira/fii/route'),
  '/api/carteira/etf': () => import('@/app/api/carteira/etf/route'),
  '/api/carteira/stocks': () => import('@/app/api/carteira/stocks/route'),
  '/api/carteira/reit': () => import('@/app/api/carteira/reit/route'),
  '/api/carteira/renda-fixa': () => import('@/app/api/carteira/renda-fixa/route'),
  '/api/carteira/fim-fia': () => import('@/app/api/carteira/fim-fia/route'),
  '/api/carteira/moedas-criptos': () => import('@/app/api/carteira/moedas-criptos/route'),
  '/api/carteira/previdencia-seguros': () => import('@/app/api/carteira/previdencia-seguros/route'),
  '/api/carteira/imoveis-bens': () => import('@/app/api/carteira/imoveis-bens/route'),
  '/api/carteira/reserva-emergencia': () => import('@/app/api/carteira/reserva-emergencia/route'),
  '/api/carteira/reserva-oportunidade': () =>
    import('@/app/api/carteira/reserva-oportunidade/route'),
  '/api/carteira/opcoes': () => import('@/app/api/carteira/opcoes/route'),
  '/api/calendar': () => import('@/app/api/calendar/route'),
  '/api/aposentadoria': () => import('@/app/api/aposentadoria/route'),
  '/api/analises/portfolio-goal': () => import('@/app/api/analises/portfolio-goal/route'),
  '/api/carteira/configuracao': () => import('@/app/api/carteira/configuracao/route'),
  '/api/analises/cobertura-fgc': () => import('@/app/api/analises/cobertura-fgc/route'),
  '/api/profile': () => import('@/app/api/profile/route'),
};

async function chamarRota<T = Json>(
  request: NextRequest,
  path: string,
  query?: Record<string, string>,
): Promise<T | null> {
  const loader = ROTAS[path];
  if (!loader) return null;
  try {
    const { GET } = await loader();
    const url = new URL(path, request.nextUrl.origin);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const res = await GET(new NextRequest(url, { headers: request.headers }));
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_NS = 'assistente-contexto';

export function invalidarContextoUsuario(userId: string): void {
  deleteTtlCacheKeyPrefix(CACHE_NS, `${userId}:`);
}

/** Contexto compacto do usuário-alvo da requisição, como string JSON (cacheado 5 min). */
export async function buildContextoUsuario(request: NextRequest, userId: string): Promise<string> {
  const ano = new Date().getFullYear();
  const cache = getTtlCache<string>(CACHE_NS);
  const key = `${userId}:${ano}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const resumo = await chamarRota(request, '/api/carteira/resumo');
  const classes = classesComPosicao(resumo);
  const [cashflow, orcamento, dividas, saude, sonhos, proventos, ...posicoesArr] =
    await Promise.all([
      chamarRota<{ groups: CashGroupLike[] }>(request, '/api/cashflow', { year: String(ano) }),
      chamarRota(request, '/api/cashflow/orcamento', { year: String(ano) }),
      chamarRota<{ dividas: Json[] }>(request, '/api/dividas'),
      chamarRota(request, '/api/saude-financeira'),
      chamarRota<{ objetivos: Json[] }>(request, '/api/planejamento-sonhos'),
      classes.length > 0
        ? chamarRota<ProventosLike>(request, '/api/analises/proventos')
        : Promise.resolve(null),
      ...classes.map((c) => chamarRota<CarteiraClasseLike>(request, `/api/carteira/${c}`)),
    ]);
  const hoje = new Date();
  const em60d = new Date(hoje.getTime() + 60 * 86400000);
  const isoDia = (d: Date) => d.toISOString().slice(0, 10);
  const [agenda, aposentadoria, metaPatrimonio, alocacaoConfig, fgc, perfil] = await Promise.all([
    chamarRota(request, '/api/calendar', { de: isoDia(hoje), ate: isoDia(em60d) }),
    chamarRota(request, '/api/aposentadoria'),
    chamarRota(request, '/api/analises/portfolio-goal'),
    chamarRota(request, '/api/carteira/configuracao'),
    classes.includes('renda-fixa')
      ? chamarRota(request, '/api/analises/cobertura-fgc')
      : Promise.resolve(null),
    chamarRota(request, '/api/profile'),
  ]);
  const posicoes: Record<string, CarteiraClasseLike | null> = {};
  classes.forEach((c, i) => {
    posicoes[c] = posicoesArr[i];
  });
  // Direto do banco (e não das abas): cobre classe sem posição alguma.
  const planejados = await listarTodosPlanejados(userId).catch(() => []);

  const contexto = montarContexto({
    ano,
    resumo,
    posicoes,
    cashflow,
    orcamento,
    dividas,
    saude,
    sonhos,
    proventos: proventos as ProventosLike | null,
    agenda,
    aposentadoria,
    metaPatrimonio,
    alocacaoConfig,
    fgc,
    perfil,
    planejados: planejados.map((p) => {
      const aba = abaDoAssetPlanejado(p.asset);
      return {
        aba: aba ? ROTULO_ABA[aba] : p.asset.type,
        ativo: simplifyAssetName(p.asset.name) || p.asset.symbol,
        objetivoPercentualDaAba: p.objetivo,
        secao: p.secao ?? undefined,
        observacoes: p.notes ?? undefined,
      };
    }),
  });
  const json = JSON.stringify(contexto);
  cache.set(key, json, CACHE_TTL_MS);
  return json;
}
