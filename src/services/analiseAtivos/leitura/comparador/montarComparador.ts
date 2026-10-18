/**
 * Leitura do Comparador (v2.4, fatia D — Comparador isonômico). Só o banco: nenhum provedor externo.
 *
 * - normalizarTickers: maiúsculas, dedupe, formato (TICKER_RE). Inválido ⇒ ignorado 'formato'.
 * - A classe é a do 1º ticker existente (ordem dos slots); os de outra classe saem como
 *   'outra_classe', os inexistentes como 'inexistente' e os além do 4º como 'excesso'.
 * - Leitura em lote e em paralelo: linhas do Quadro (memória), critérios da janela pedida
 *   (obterCriteriosVarios, criteria_eval), rótulos dos critérios (criteria_params ativo),
 *   AssetMultiplesCurrent (Dív. líq./PL, P/Receita, rendimento e VP/cota do FII) e, no FII, o último
 *   informe trimestral (≥ hoje − 9 meses), o VP/cota anual e os desdobramentos (mini-gráfico).
 * - A resposta é ISONÔMICA: critérios primeiro (marcas neutras + 'n de k'), grupos de indicadores
 *   sem direção nem marca de valor, "Leitura dos dados" só com contagens + literal. Sem Índice MF,
 *   sem ★, sem resumo com placar (nenhuma chave /indice|semaforo|destaque/i).
 * - Misto (tijolo + papel) decidido pelo PERFIL de critérios (rec. 3), não pelo rótulo.
 * - Cache LIMITADO (getBoundedTtlCache 'analiseComparador', 300 chaves, 30 min) por classe + janela
 *   + conjunto ORDENADO + versão do Quadro + dia; a resposta é reordenada pelos slots antes de sair.
 * - montarComparadorPuro é testável sem banco (critérios, conferência, n/a, misto, gráfico, leitura).
 *
 * Stocks e REITs (fatia C): só com `opts.eua.habilitado` (ANALISE_ATIVOS_EUA_HABILITADO) o ticker EUA
 * é aceito (BRK-B = BRK.B); sem a chave, nada muda (formato inválido / inexistente). Até 4 da MESMA
 * classe stock|reit: misturar uma classe EUA com qualquer outra é ErroMisturaEua (a rota responde 400
 * com o texto de TEXTOS_EUA.comparador). Grupos EUA do catálogo (indicadores.ts), critérios do perfil
 * stock/reit, gráfico do lucro líquido (US$ mi, base 100) e, sem a chave de preço, cotação ausente.
 */
import { prisma } from '@/lib/prisma';
import { LIMITES_CACHE_BLOCO_D, getBoundedTtlCache } from '@/lib/boundedTtlCache';
import { MAX_ATIVOS_COMPARADOR, TICKER_RE } from '@/services/analiseAtivos/cenarios/contrato';
import {
  obterLinhaQuadro,
  paraLinhaQuadroApi,
  versaoQuadro,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  estadoOcultoConferencia,
  flagsConfDoAno,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import {
  TTL_ANALISE_MS,
  hojeSaoPaulo,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import { obterCriteriosVarios } from '@/services/analiseAtivos/leitura/criterios/lerCriterios';
import {
  criteriosDoPerfil,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_CODIGO } from '@/services/analiseAtivos/params/criteriaParamsCodigo';
import { obterCriteriaParams } from '@/services/analiseAtivos/params/obterCriteriaParams';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import { paraData } from '@/services/analiseAtivos/repositorio/conversao';
import {
  campoEmConferencia,
  type ClasseConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import {
  montarEscalaBase100,
  serieLucroAcao,
  serieVpCotaFii,
  type PontoBruto,
} from '@/services/analiseAtivos/regras/comparador/escala';
import {
  catalogoComparador,
  ehMisto,
  naoSeAplicaComparador,
  tipoDoAtivo,
  type DadosAtivoComparador,
  type DefIndicador,
} from '@/services/analiseAtivos/regras/comparador/indicadores';
import type {
  AtivoComparador,
  ComparadorResposta,
  ConferenciaCelulaComparador,
  CriteriosComparador,
  GrupoComparador,
  LinhaComparador,
  MotivoIgnorado,
  TipoAtivoComparador,
} from '@/types/analiseAtivosBlocoD';
import { montarLeitura } from '@/services/analiseAtivos/regras/comparador/resumo';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import { ehClasseEua, type ClasseQuadro, type Estado } from '@/types/analiseAtivosApi';
import { ehTickerEua, symbolAnaliseDaSec } from '@/types/analiseAtivosEua';
import { comCotacaoEua } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import {
  JANELA_PADRAO,
  type CriteriosLinhaApi,
  type IdCriterio,
  type Janela,
} from '@/types/analiseAtivosCriterios';

/** Versão do formato da resposta (entra na chave do cache). v2.4: 'c2' (isonômico). */
export const VERSAO_COMPARADOR = 'c2';
/** Janela do informe trimestral do FII para imóveis/área/CRIs. */
export const MESES_INFORME_TRIMESTRAL = 9;
/** Tamanho máximo de um ticker ignorado devolvido (eco do pedido). */
const MAX_ECO = 20;

type Ignorado = { ticker: string; motivo: MotivoIgnorado };

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

export function normalizarTickers(
  brutos: readonly string[],
  eua = false,
): {
  validos: string[];
  ignorados: Ignorado[];
} {
  const validos: string[] = [];
  const ignorados: Ignorado[] = [];
  for (const b of brutos) {
    const bruto = b.trim().toUpperCase();
    if (!bruto) continue;
    // EUA (só com a chave): BRK-B → BRK.B; ticker da B3 sempre tem dígito
    const t =
      eua && !TICKER_RE.test(bruto) && ehTickerEua(bruto) ? symbolAnaliseDaSec(bruto) : bruto;
    if (!TICKER_RE.test(t) && !(eua && ehTickerEua(t))) {
      ignorados.push({ ticker: b.trim().slice(0, MAX_ECO), motivo: 'formato' });
      continue;
    }
    if (!validos.includes(t)) validos.push(t);
  }
  return { validos, ignorados };
}

// ---------------------------------------------------------------------------
// Rótulos do bloco de critérios
// ---------------------------------------------------------------------------

/**
 * Linhas do bloco de critérios (id → rótulo, na ordem do perfil):
 * - ações (e financeiras, que usam a mesma lista com 3 'n/a'): a lista de 'acao';
 * - FIIs só de papel: a lista de papel; só de tijolo (ou sem tipo): a de tijolo;
 * - misto: a lista de tijolo, com o par de papel no rótulo ('Obrigações/PL ≤ 20% / LTV ≤ 60%') e
 *   as equivalências para achar a marca do fundo de papel.
 */
export function criteriosDoComparador(
  params: CriteriaParams,
  classe: ClasseQuadro,
  tipos: readonly TipoAtivoComparador[],
): CriteriosComparador {
  if (classe !== 'fii') {
    // ação, stock e REIT: a lista do perfil (a financeira usa a mesma, 'n de 6')
    return {
      rotulos: Object.fromEntries(criteriosDoPerfil(params, classe).map((c) => [c.id, c.rotulo])),
      equivalencias: {},
    };
  }
  const soPapel = tipos.length > 0 && tipos.every((t) => t === 'papel');
  if (soPapel) {
    return {
      rotulos: Object.fromEntries(params.perfis.fii_papel.map((c) => [c.id, c.rotulo])),
      equivalencias: {},
    };
  }
  const misto = ehMisto(tipos);
  const rotulos: Partial<Record<IdCriterio, string>> = {};
  const equivalencias: Partial<Record<IdCriterio, IdCriterio>> = {};
  for (const c of params.perfis.fii_tijolo) {
    const idPar = misto ? params.equivalencias[c.id] : undefined;
    const par = idPar ? params.perfis.fii_papel.find((p) => p.id === idPar) : undefined;
    rotulos[c.id] = par
      ? `${c.rotulo}${TEXTOS_CRITERIOS.chips.parSeparador}${par.rotulo}`
      : c.rotulo;
    if (par) equivalencias[c.id] = par.id;
  }
  return { rotulos, equivalencias };
}

// ---------------------------------------------------------------------------
// Montagem pura
// ---------------------------------------------------------------------------

export interface AtivoEntrada {
  /** linha do Quadro + dados do banco; `tipo` é recalculado aqui a partir dos critérios */
  dados: Omit<DadosAtivoComparador, 'tipo' | 'financeira'> & {
    /** régua gravada no Quadro (fallback do perfil sem avaliação de critérios) */
    regua: string | null;
  };
  /** flags e motivos da linha do Quadro (conferência) */
  flags: readonly string[];
  motivos: readonly string[];
  /** série bruta do mini-gráfico (lucro ou VP/cota) */
  serie: PontoBruto[];
  /** critérios na janela pedida; null = sem avaliação */
  criterios: CriteriosLinhaApi | null;
}

export interface EntradaComparador {
  classe: ClasseQuadro;
  /** AAAA-MM-DD (São Paulo) */
  hoje: string;
  janela: Janela;
  /** criteria_params ativo (rótulos dos critérios) */
  params: CriteriaParams;
  /** na ordem dos slots */
  ativos: AtivoEntrada[];
}

export type NucleoComparador = Pick<
  ComparadorResposta,
  'classe' | 'janela' | 'misto' | 'ativos' | 'criterios' | 'grupos' | 'graficos' | 'leitura'
>;

const TC = TEXTOS_TELA.conferencia;

function textoConferencia(grupo: string, regra: string, origem: 'conf' | 'legado'): string {
  if (origem === 'legado') return TC.motivosPorGrupo.proventos;
  return (
    TC.motivos[`${grupo}:${regra}`] ??
    (TC.motivosPorGrupo as Record<string, string>)[grupo] ??
    TC.chip
  );
}

/** Aplica a política de conferência a uma célula (ocultar ⇒ '—' sem número; selo ⇒ valor). */
function celula(
  def: DefIndicador,
  d: DadosAtivoComparador,
  a: AtivoEntrada,
  classe: ClasseQuadro,
): { estado: Estado<number>; conf: ConferenciaCelulaComparador | null } {
  if (!def.aplicavel(d.tipo)) return { estado: naoSeAplicaComparador(), conf: null };
  const estado = def.extrator(d);
  if (!def.campoTela || estado.estado === 'nao_se_aplica') return { estado, conf: null };
  const c = campoEmConferencia(a.flags, a.motivos, def.campoTela, classe as ClasseConferencia);
  if (!c) return { estado, conf: null };
  const conf: ConferenciaCelulaComparador = {
    exibicao: c.exibicao,
    motivo: textoConferencia(c.grupo, c.regra, c.origem),
  };
  if (c.exibicao === 'ocultar') return { estado: estadoOcultoConferencia(c.grupo), conf };
  return { estado, conf };
}

export function montarComparadorPuro(e: EntradaComparador): NucleoComparador {
  const { classe, janela } = e;
  const dados: DadosAtivoComparador[] = e.ativos.map((a) => {
    const tipo = tipoDoAtivo(a.dados.linha, a.criterios, a.dados.regua);
    const financeira =
      a.criterios?.perfil === 'acao_financeira' ||
      (a.criterios === null && a.dados.regua === 'acao_financeira');
    const { regua: _regua, ...resto } = a.dados;
    return { ...resto, tipo, financeira };
  });
  const tipos = dados.map((d) => d.tipo);
  const tiposPresentes = new Set(tipos);
  const misto = classe === 'fii' && ehMisto(tipos);

  const grupos: GrupoComparador[] = [];
  for (const g of catalogoComparador(classe)) {
    if (!g.aplicavelA.some((t) => tiposPresentes.has(t))) continue;
    const linhas: LinhaComparador[] = g.linhas.map((def) => {
      const valores: Record<string, Estado<number>> = {};
      const conferencia: Record<string, ConferenciaCelulaComparador | null> = {};
      e.ativos.forEach((a, i) => {
        const ticker = a.dados.linha.ticker;
        const { estado, conf } = celula(def, dados[i], a, classe);
        valores[ticker] = estado;
        conferencia[ticker] = conf;
      });
      return {
        codigo: def.codigo,
        rotulo: def.rotulo,
        sub: def.sub,
        formato: def.formato,
        fonteCvmAviso: def.fonteCvmAviso,
        valores,
        conferencia,
      };
    });
    grupos.push({
      codigo: g.codigo,
      rotulo: misto && g.rotuloMisto ? g.rotuloMisto : g.rotulo,
      aplicavelA: g.aplicavelA,
      linhas,
    });
  }

  const ativos: AtivoComparador[] = e.ativos.map((a, i) => {
    const l = a.dados.linha;
    const gruposConf = new Set(l.conferencias ?? []);
    if (l.proventosEmConferencia) gruposConf.add('proventos');
    return {
      ticker: l.ticker,
      nome: l.nome,
      preco: l.preco,
      precoData: l.precoData,
      // v2.5: tipo EXIBIDO (Tijolo | Papel, o mesmo da comparação); FoF/Híbrido só no segmento
      fiiTipo: classe === 'fii' ? (tipos[i] === 'tijolo' ? 'tijolo' : 'papel') : l.fiiTipo,
      tipoComparacao: tipos[i],
      criterios: a.criterios,
      noQuadro: l.noQuadro,
      foraDoQuadroMotivo: l.foraDoQuadroMotivo,
      conferencias: [...gruposConf],
      pares: l.pares.filter((p) => p !== l.ticker),
    };
  });

  const anoAtual = Number(e.hoje.slice(0, 4));
  let graficos: NucleoComparador['graficos'] = null;
  if (e.ativos.length > 0) {
    const base = montarEscalaBase100(
      e.ativos.map((a) => ({ ticker: a.dados.linha.ticker, pontos: a.serie })),
      anoAtual,
    );
    const TGR = TEXTOS_COMPARADOR.graficos;
    graficos = {
      tipo: classe !== 'fii' ? 'lucro' : 'vpCota',
      titulo:
        classe !== 'fii'
          ? TGR.tituloAcao
          : formatarTexto(TGR.tituloFii, { ano: String(base.anos[0] ?? anoAtual - 1) }),
      ...base,
    };
  }

  return {
    classe,
    janela,
    misto,
    ativos,
    criterios: criteriosDoComparador(e.params, classe, tipos),
    grupos,
    graficos,
    leitura: montarLeitura(
      janela,
      e.ativos.map((a) => ({ ticker: a.dados.linha.ticker, criterios: a.criterios })),
    ),
  };
}

// ---------------------------------------------------------------------------
// Ordem dos slots
// ---------------------------------------------------------------------------

/** Reordena o núcleo (vindo do cache, montado na ordem ordenada) pela ordem dos slots. */
export function ordenarPelosSlots(n: NucleoComparador, slots: readonly string[]): NucleoComparador {
  const pos = new Map(slots.map((t, i) => [t, i]));
  const k = (t: string) => pos.get(t) ?? Number.MAX_SAFE_INTEGER;
  const ord = <T>(lista: T[], tk: (x: T) => string) =>
    [...lista].sort((a, b) => k(tk(a)) - k(tk(b)));
  return {
    ...n,
    ativos: ord(n.ativos, (a) => a.ticker),
    graficos: n.graficos
      ? { ...n.graficos, series: ord(n.graficos.series, (s) => s.ticker) }
      : null,
    leitura: { ...n.leitura, contagens: ord(n.leitura.contagens, (c) => c.ticker) },
  };
}

// ---------------------------------------------------------------------------
// Leitura do banco
// ---------------------------------------------------------------------------

const cache = getBoundedTtlCache<NucleoComparador>('analiseComparador', {
  maxKeys: LIMITES_CACHE_BLOCO_D.analiseComparador,
});

/** Só para testes. */
export function _limparCacheComparador(): void {
  cache.limpar();
}

export function _tamanhoCacheComparador(): number {
  return cache.tamanho();
}

function mesesAtras(hoje: string, meses: number): Date {
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d;
}

/** criteria_params ativo; sem versão no banco (ou inválida), o vigente do código (só rótulos). */
async function paramsCriterios(): Promise<CriteriaParams> {
  try {
    return (await obterCriteriaParams(prisma)).params;
  } catch {
    return CRITERIA_PARAMS_CODIGO;
  }
}

type LinhaDb = NonNullable<Awaited<ReturnType<typeof obterLinhaQuadro>>>;

async function lerNucleo(
  classe: ClasseQuadro,
  linhas: LinhaDb[],
  hoje: string,
  janela: Janela,
  precoEua = false,
): Promise<NucleoComparador> {
  const symbols = linhas.map((l) => l.symbol);
  const fii = classe === 'fii';
  const cnpjsFii = fii
    ? linhas.filter((l) => !l.flags.includes(FLAG_CNPJ_EM_CONFERENCIA)).map((l) => l.cnpj)
    : [];
  const anoInicio = Number(hoje.slice(0, 4)) - 12;
  const [atuais, trimestres, perShare, desdobramentos, criterios, params] = await Promise.all([
    prisma.assetMultiplesCurrent.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true,
        divLiqPl: true,
        pReceita: true,
        rend12m: true,
        vpCota: true,
        naoSeAplica: true,
      },
    }),
    fii && cnpjsFii.length
      ? prisma.fiiQuarterly.findMany({
          where: {
            cnpj: { in: cnpjsFii },
            refQuarter: { gte: mesesAtras(hoje, MESES_INFORME_TRIMESTRAL) },
          },
          orderBy: { refQuarter: 'desc' },
          select: {
            cnpj: true,
            nImoveisRenda: true,
            nImoveisOutros: true,
            areaM2: true,
            nCri: true,
          },
        })
      : Promise.resolve([]),
    fii
      ? prisma.assetPerShareYearly.findMany({
          where: { symbol: { in: symbols }, anoFiscal: { gte: anoInicio } },
          select: { symbol: true, anoFiscal: true, vpCotaFim: true, flags: true },
        })
      : Promise.resolve([]),
    fii && cnpjsFii.length
      ? prisma.fiiMonthly.findMany({
          where: { cnpj: { in: cnpjsFii }, fatorDesdobramento: { not: null } },
          select: { cnpj: true, refMonth: true, fatorDesdobramento: true },
        })
      : Promise.resolve([]),
    obterCriteriosVarios(prisma, symbols, janela),
    paramsCriterios(),
  ]);

  const atualPor = new Map(atuais.map((a) => [a.symbol, a]));
  const trimPor = new Map<string, (typeof trimestres)[number]>();
  for (const t of trimestres) if (!trimPor.has(t.cnpj)) trimPor.set(t.cnpj, t); // desc ⇒ o 1º é o último

  const ativos: AtivoEntrada[] = linhas.map((raw) => {
    const linha = comCotacaoEua(paraLinhaQuadroApi(raw), precoEua);
    const cnpjConf = fii && raw.flags.includes(FLAG_CNPJ_EM_CONFERENCIA);
    const at = atualPor.get(raw.symbol);
    const tr = fii && !cnpjConf ? trimPor.get(raw.cnpj) : undefined;
    let serie: PontoBruto[];
    if (fii) {
      const desd = cnpjConf
        ? []
        : desdobramentos
            .filter((d) => d.cnpj === raw.cnpj)
            .map((d) => ({
              refMonth: paraData(d.refMonth),
              fator: d.fatorDesdobramento as number,
            }));
      serie = cnpjConf
        ? []
        : serieVpCotaFii(
            perShare.filter((p) => p.symbol === raw.symbol),
            desd,
          );
    } else {
      const ocultos = new Set(
        linha.serie10a
          .map((p) => p.ano)
          .filter((ano) => flagsConfDoAno(raw.flags, ano, ['fundamentos_escala']).length > 0),
      );
      serie = serieLucroAcao(linha.serie10a, ocultos);
    }
    return {
      flags: raw.flags,
      motivos: raw.motivosIncompleto,
      serie,
      criterios: criterios.get(raw.symbol) ?? null,
      dados: {
        linha,
        regua: raw.regua,
        atual: at
          ? {
              divLiqPl: at.divLiqPl,
              pReceita: at.pReceita,
              rend12m: at.rend12m,
              vpCota: at.vpCota,
              naoSeAplica: at.naoSeAplica,
            }
          : null,
        trimestre: tr
          ? {
              nImoveis:
                tr.nImoveisRenda == null ? null : tr.nImoveisRenda + (tr.nImoveisOutros ?? 0),
              areaM2: tr.areaM2,
              nCri: tr.nCri,
            }
          : null,
        cnpjEmConferencia: cnpjConf,
      },
    };
  });
  return montarComparadorPuro({ classe, hoje, janela, params, ativos });
}

/** Stock × REIT (ou EUA × Brasil) na mesma comparação: a rota responde 400. */
export class ErroMisturaEua extends Error {
  constructor() {
    super(TEXTOS_EUA.comparador.mistoBloqueado);
    this.name = 'ErroMisturaEua';
  }
}

export interface OpcoesComparador {
  /** chaves EUA resolvidas pela rota; ausente = desligadas (o Comparador de hoje) */
  eua?: { habilitado: boolean; preco: boolean };
}

export interface ResultadoComparador {
  dados: ComparadorResposta;
  cache: boolean;
}

/**
 * Monta a resposta para os tickers pedidos (na ordem dos slots) na janela pedida. Sem nenhum
 * ticker de formato válido, devolve null (a rota responde 400).
 */
export async function montarComparador(
  brutos: readonly string[],
  hoje: string = hojeSaoPaulo(),
  janela: Janela = JANELA_PADRAO,
  opts: OpcoesComparador = {},
): Promise<ResultadoComparador | null> {
  const eua = opts.eua?.habilitado === true;
  const precoEua = eua && opts.eua?.preco === true;
  const { validos, ignorados } = normalizarTickers(brutos, eua);
  if (validos.length === 0) return null;

  const encontrados = await Promise.all(validos.map((t) => obterLinhaQuadro(t)));
  // EUA: stock × REIT (ou EUA × Brasil) não se comparam — recusa em vez de ignorar
  const classesEncontradas = new Set(
    encontrados
      .filter((l): l is LinhaDb => !!l && (l.classe === 'acao' || l.classe === 'fii' || eua))
      .map((l) => l.classe),
  );
  if (classesEncontradas.size > 1 && [...classesEncontradas].some(ehClasseEua)) {
    throw new ErroMisturaEua();
  }
  let classe: ClasseQuadro | null = null;
  const escolhidas: LinhaDb[] = [];
  validos.forEach((t, i) => {
    const l = encontrados[i];
    const aceita =
      !!l && (l.classe === 'acao' || l.classe === 'fii' || (eua && ehClasseEua(l.classe)));
    if (!l || !aceita) {
      ignorados.push({ ticker: t, motivo: 'inexistente' });
      return;
    }
    classe ??= l.classe as ClasseQuadro;
    if (l.classe !== classe) ignorados.push({ ticker: t, motivo: 'outra_classe' });
    else if (escolhidas.length >= MAX_ATIVOS_COMPARADOR)
      ignorados.push({ ticker: t, motivo: 'excesso' });
    else escolhidas.push(l);
  });
  const classeFinal: ClasseQuadro = classe ?? 'acao';
  const tickers = escolhidas.map((l) => l.symbol);
  const versao = await versaoQuadro();

  const chave = `${VERSAO_COMPARADOR}|${classeFinal}|${janela}|${[...tickers].sort().join(',')}|${versao}|${hoje}${precoEua ? '|preco' : ''}`;
  let nucleo = cache.get(chave);
  const doCache = nucleo !== undefined;
  if (!nucleo) {
    const ordenadas = [...escolhidas].sort((a, b) => a.symbol.localeCompare(b.symbol));
    nucleo = await lerNucleo(classeFinal, ordenadas, hoje, janela, precoEua);
    cache.set(chave, nucleo, TTL_ANALISE_MS);
  }
  const n = ordenarPelosSlots(nucleo, tickers);
  return {
    cache: doCache,
    dados: {
      ...n,
      classe: classeFinal,
      tickers,
      ignorados,
      versao: `${VERSAO_COMPARADOR}:${versao}`,
    },
  };
}
