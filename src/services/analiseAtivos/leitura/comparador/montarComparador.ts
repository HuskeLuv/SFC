/**
 * Leitura do Comparador (Bloco D, fatia C). Só o banco: nenhum provedor externo.
 *
 * - normalizarTickers: maiúsculas, dedupe, formato (TICKER_RE). Inválido ⇒ ignorado 'formato'.
 * - A classe é a do 1º ticker existente (ordem dos slots); os de outra classe saem como
 *   'outra_classe', os inexistentes como 'inexistente' e os além do 4º como 'excesso'.
 * - Leitura em lote e em paralelo: linhas do Quadro (memória), AssetMultiplesCurrent (Dív. líq./PL,
 *   P/Receita, rendimento e VP/cota do FII), e no FII o último informe trimestral (≥ hoje − 9 meses),
 *   o VP/cota anual e os desdobramentos (mini-gráfico na base de cotas de hoje).
 * - Cache LIMITADO (getBoundedTtlCache 'analiseComparador', 300 chaves, 30 min) por classe + conjunto
 *   ORDENADO + versão do Quadro + dia; a resposta é reordenada pelos slots antes de sair.
 * - montarComparadorPuro é testável sem banco (★, conferência, n/a, misto, gráfico e resumo).
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
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import { paraData } from '@/services/analiseAtivos/repositorio/conversao';
import {
  campoEmConferencia,
  type ClasseConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import {
  calcularDestaque,
  type CandidatoDestaque,
} from '@/services/analiseAtivos/regras/comparador/destaque';
import {
  montarEscalaBase100,
  serieLucroAcao,
  serieVpCotaFii,
  type PontoBruto,
} from '@/services/analiseAtivos/regras/comparador/escala';
import {
  catalogoComparador,
  direcaoPvpFii,
  ehMisto,
  naoSeAplicaComparador,
  tipoDoAtivo,
  type DadosAtivoComparador,
  type DefIndicador,
  type TipoAtivoComparador,
} from '@/services/analiseAtivos/regras/comparador/indicadores';
import { montarResumo } from '@/services/analiseAtivos/regras/comparador/resumo';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type {
  AtivoComparador,
  ComparadorResposta,
  ConferenciaCelulaComparador,
  GrupoComparador,
  LinhaComparador,
  MotivoIgnorado,
} from '@/types/analiseAtivosBlocoD';
import type { ClasseQuadro, Estado } from '@/types/analiseAtivosApi';

/** Versão do formato da resposta (entra na chave do cache). */
export const VERSAO_COMPARADOR = 'c1';
/** Janela do informe trimestral do FII para imóveis/área/CRIs. */
export const MESES_INFORME_TRIMESTRAL = 9;
/** Tamanho máximo de um ticker ignorado devolvido (eco do pedido). */
const MAX_ECO = 20;

type Ignorado = { ticker: string; motivo: MotivoIgnorado };

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

export function normalizarTickers(brutos: readonly string[]): {
  validos: string[];
  ignorados: Ignorado[];
} {
  const validos: string[] = [];
  const ignorados: Ignorado[] = [];
  for (const b of brutos) {
    const t = b.trim().toUpperCase();
    if (!t) continue;
    if (!TICKER_RE.test(t)) {
      ignorados.push({ ticker: b.trim().slice(0, MAX_ECO), motivo: 'formato' });
      continue;
    }
    if (!validos.includes(t)) validos.push(t);
  }
  return { validos, ignorados };
}

// ---------------------------------------------------------------------------
// Montagem pura
// ---------------------------------------------------------------------------

export interface AtivoEntrada {
  dados: DadosAtivoComparador;
  /** flags e motivos da linha do Quadro (conferência) */
  flags: readonly string[];
  motivos: readonly string[];
  /** série bruta do mini-gráfico (lucro ou VP/cota) */
  serie: PontoBruto[];
}

export interface EntradaComparador {
  classe: ClasseQuadro;
  /** AAAA-MM-DD (São Paulo) */
  hoje: string;
  /** na ordem dos slots */
  ativos: AtivoEntrada[];
}

export type NucleoComparador = Pick<
  ComparadorResposta,
  'classe' | 'misto' | 'ativos' | 'grupos' | 'graficos' | 'resumo'
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
  a: AtivoEntrada,
  classe: ClasseQuadro,
  tipo: TipoAtivoComparador,
): { estado: Estado<number>; conf: ConferenciaCelulaComparador | null } {
  if (!def.aplicavel(tipo)) return { estado: naoSeAplicaComparador(), conf: null };
  const estado = def.extrator(a.dados);
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
  const { classe } = e;
  const tipos = e.ativos.map((a) => tipoDoAtivo(a.dados.linha));
  const tiposPresentes = new Set(tipos);
  const emConf = new Map<string, string[]>(e.ativos.map((a) => [a.dados.linha.ticker, []]));

  const grupos: GrupoComparador[] = [];
  for (const g of catalogoComparador(classe)) {
    if (!g.aplicavelA.some((t) => tiposPresentes.has(t))) continue;
    const linhas: LinhaComparador[] = g.linhas.map((def) => {
      const valores: Record<string, Estado<number>> = {};
      const conferencia: Record<string, ConferenciaCelulaComparador | null> = {};
      const candidatos: CandidatoDestaque[] = [];
      const tiposDaLinha: TipoAtivoComparador[] = [];
      e.ativos.forEach((a, i) => {
        const ticker = a.dados.linha.ticker;
        const { estado, conf } = celula(def, a, classe, tipos[i]);
        valores[ticker] = estado;
        conferencia[ticker] = conf;
        if (conf) emConf.get(ticker)?.push(def.rotulo);
        if (estado.estado !== 'nao_se_aplica') {
          candidatos.push({ ticker, valor: estado, conferencia: conf?.exibicao ?? null });
          tiposDaLinha.push(tipos[i]);
        }
      });
      let direcao = def.direcao;
      let tiposDiferentes = false;
      if (def.codigo === 'pvpFii') {
        ({ direcao, tiposDiferentes } = direcaoPvpFii(tiposDaLinha));
      }
      const r = calcularDestaque(candidatos, direcao, def.formato, {
        semValidacaoCvm: def.semValidacaoCvm,
        tiposDiferentes,
      });
      return {
        codigo: def.codigo,
        rotulo: def.rotulo,
        sub: def.sub,
        formato: def.formato,
        direcao,
        fonteCvmAviso: def.fonteCvmAviso,
        criterioProvisorio: def.criterioProvisorio,
        valores,
        conferencia,
        destaque: r.destaque,
        motivoSemDestaque: r.motivoSemDestaque,
      };
    });
    grupos.push({ codigo: g.codigo, rotulo: g.rotulo, aplicavelA: g.aplicavelA, linhas });
  }

  const ativos: AtivoComparador[] = e.ativos.map((a) => {
    const l = a.dados.linha;
    const grupos = new Set(l.conferencias ?? []);
    if (l.proventosEmConferencia) grupos.add('proventos');
    return {
      ticker: l.ticker,
      nome: l.nome,
      preco: l.preco,
      precoData: l.precoData,
      fiiTipo: l.fiiTipo,
      regua: a.dados.regua,
      indice: l.indice,
      noQuadro: l.noQuadro,
      foraDoQuadroMotivo: l.foraDoQuadroMotivo,
      conferencias: [...grupos],
      pares: l.pares.filter((p) => p !== l.ticker),
    };
  });

  const anoAtual = Number(e.hoje.slice(0, 4));
  let graficos: ComparadorResposta['graficos'] = null;
  if (e.ativos.length > 0) {
    const base = montarEscalaBase100(
      e.ativos.map((a) => ({ ticker: a.dados.linha.ticker, pontos: a.serie })),
      anoAtual,
    );
    const TGR = TEXTOS_COMPARADOR.graficos;
    graficos = {
      tipo: classe === 'acao' ? 'lucro' : 'vpCota',
      titulo:
        classe === 'acao'
          ? TGR.tituloAcao
          : formatarTexto(TGR.tituloFii, { ano: String(base.anos[0] ?? anoAtual - 1) }),
      ...base,
    };
  }

  const resumo = montarResumo(
    e.ativos.map((a) => ({
      ticker: a.dados.linha.ticker,
      indice: a.dados.linha.indice,
      emConferencia: emConf.get(a.dados.linha.ticker) ?? [],
    })),
  );

  return { classe, misto: classe === 'fii' && ehMisto(tipos), ativos, grupos, graficos, resumo };
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
    resumo: {
      ...n.resumo,
      indices: ord(n.resumo.indices, (x) => x.ticker),
      criteriosAtendidos: ord(n.resumo.criteriosAtendidos, (x) => x.ticker),
      emConferencia: ord(n.resumo.emConferencia, (x) => x.ticker),
    },
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

type LinhaDb = NonNullable<Awaited<ReturnType<typeof obterLinhaQuadro>>>;

async function lerNucleo(
  classe: ClasseQuadro,
  linhas: LinhaDb[],
  hoje: string,
): Promise<NucleoComparador> {
  const symbols = linhas.map((l) => l.symbol);
  const fii = classe === 'fii';
  const cnpjsFii = fii
    ? linhas.filter((l) => !l.flags.includes(FLAG_CNPJ_EM_CONFERENCIA)).map((l) => l.cnpj)
    : [];
  const anoInicio = Number(hoje.slice(0, 4)) - 12;
  const [atuais, trimestres, perShare, desdobramentos] = await Promise.all([
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
            maiorCriPct: true,
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
  ]);

  const atualPor = new Map(atuais.map((a) => [a.symbol, a]));
  const trimPor = new Map<string, (typeof trimestres)[number]>();
  for (const t of trimestres) if (!trimPor.has(t.cnpj)) trimPor.set(t.cnpj, t); // desc ⇒ o 1º é o último

  const ativos: AtivoEntrada[] = linhas.map((raw) => {
    const linha = paraLinhaQuadroApi(raw);
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
              maiorCriPct: tr.maiorCriPct,
            }
          : null,
        cnpjEmConferencia: cnpjConf,
      },
    };
  });
  return montarComparadorPuro({ classe, hoje, ativos });
}

export interface ResultadoComparador {
  dados: ComparadorResposta;
  cache: boolean;
}

/**
 * Monta a resposta para os tickers pedidos (na ordem dos slots). Sem nenhum ticker de formato
 * válido, devolve null (a rota responde 400).
 */
export async function montarComparador(
  brutos: readonly string[],
  hoje: string = hojeSaoPaulo(),
): Promise<ResultadoComparador | null> {
  const { validos, ignorados } = normalizarTickers(brutos);
  if (validos.length === 0) return null;

  const encontrados = await Promise.all(validos.map((t) => obterLinhaQuadro(t)));
  let classe: ClasseQuadro | null = null;
  const escolhidas: LinhaDb[] = [];
  validos.forEach((t, i) => {
    const l = encontrados[i];
    if (!l || (l.classe !== 'acao' && l.classe !== 'fii')) {
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

  const chave = `${VERSAO_COMPARADOR}|${classeFinal}|${[...tickers].sort().join(',')}|${versao}|${hoje}`;
  let nucleo = cache.get(chave);
  const doCache = nucleo !== undefined;
  if (!nucleo) {
    const ordenadas = [...escolhidas].sort((a, b) => a.symbol.localeCompare(b.symbol));
    nucleo = await lerNucleo(classeFinal, ordenadas, hoje);
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
