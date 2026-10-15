/**
 * Motor puro dos Filtros de Fundamentos (v2.4; v2.5 com a camada de fontes): avalia os critérios do perfil nas janelas do params
 * (3 | 5 | 10) — port do evalCriteria/critCount do screen.js com as 3 correções da spec (ver
 * avaliarCriterio.ts). O job 'criterios' (executarCriterios) e os casos 24–29 (casos45.test.ts)
 * programam contra ele.
 *
 * Contagem (não é nota): 'sem_dado' conta como não atende e não entra em `atendidos`;
 * 'nao_se_aplica' (financeira, D4) sai de `aplicaveis` ("n de 3"). `semDado` = nenhum critério
 * aplicável com dado na janela. Função pura.
 *
 * Margem de financeira sem receita comparável (holding de participações, banco no individual): se
 * NENHUM ano da janela tem margem (receita ausente, ≤ 0 ou ≤ lucro) e algum tem lucro, a margem
 * 'não se aplica' — a falta é da estrutura do balanço, não do dado. Lucro também ausente = sem dado.
 * v2.5: só quando params.perfis.acao_financeira.margemSemReceitaComparavel = 'nao_se_aplica' (a v2
 * usa 'sem_dado', literal da spec); o critério é achado pelo id 'mg'.
 *
 * v2.5 — séries por fonte: a entrada traz as séries resolvidas (resolverSeries) e, opcionalmente, as
 * origens. Por critério e janela, escolherSerieJanela decide a série (a principal ou a serieFallback
 * na janela INTEIRA — 'luc' = net_income_adjusted → net_income) e o resultado leva `obs`
 * ('lucro_sem_descontado', 'dados_incompletos') e, com origens, `fonte` (ids na ordem da prioridade).
 * 'months' com mesesPorAno (provedor) usa as contagens anuais; sem elas, a contagem da CVM.
 */
import {
  criteriosDoPerfil,
  idsNaoSeAplica,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import {
  anoInicioJanela,
  anosDaJanela,
} from '@/services/analiseAtivos/regras/criterios/ancoraJanela';
import { avaliarCriterio } from '@/services/analiseAtivos/regras/criterios/avaliarCriterio';
import { escolherSerieJanela } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import type {
  AvaliacaoAtivo,
  AvaliacaoJanela,
  ChaveJanela,
  EntradaAvaliacaoAtivo,
  Janela,
  ResultadoCriterio,
} from '@/types/analiseAtivosCriterios';
import type { IdFonte } from '@/types/analiseAtivosFontes';

/** Contagens de uma janela a partir dos resultados (mesma regra do card e do Quadro). */
export function contarResultados(resultados: readonly ResultadoCriterio[]): {
  atendidos: number;
  aplicaveis: number;
  semDado: boolean;
} {
  const aplicaveis = resultados.filter((r) => r.estado !== 'nao_se_aplica');
  return {
    atendidos: aplicaveis.filter((r) => r.estado === 'atende').length,
    aplicaveis: aplicaveis.length,
    semDado: aplicaveis.length > 0 && aplicaveis.every((r) => r.estado === 'sem_dado'),
  };
}

const temValor = (v: number | null | undefined): boolean =>
  typeof v === 'number' && Number.isFinite(v);

/** Financeira sem nenhuma margem na janela, mas com lucro: a receita não é comparável ao lucro. */
export function margemNaoComparavel(entrada: EntradaAvaliacaoAtivo, janela: Janela): boolean {
  if (entrada.perfil !== 'acao_financeira') return false;
  const anos = anosDaJanela(entrada.anoFim, janela, false);
  const margem = entrada.series.net_margin ?? {};
  const lucro = entrada.series.net_income ?? {};
  return anos.every((a) => !temValor(margem[a])) && anos.some((a) => temValor(lucro[a]));
}

/**
 * Fontes do critério 'months': as do provedor quando as contagens anuais dele cobrem a janela
 * (avaliarMesesPorAno), senão a CVM (proventos auditados). Vazio sem origens.
 */
function fontesDosMeses(entrada: EntradaAvaliacaoAtivo, janela: Janela): IdFonte[] {
  if (!entrada.origens) return [];
  const anos = anosDaJanela(entrada.anoFim, janela, false);
  const porAno = entrada.mesesPorAno;
  if (porAno && anos.every((a) => Object.prototype.hasOwnProperty.call(porAno, a))) {
    const origem = entrada.origens.months_with_income ?? {};
    const fontes = [...new Set(anos.map((a) => origem[a]?.fonte).filter((f) => !!f))] as IdFonte[];
    if (fontes.length > 0) return fontes;
  }
  return entrada.meses ? ['cvm'] : [];
}

export function avaliarJanela(
  entrada: EntradaAvaliacaoAtivo,
  janela: Janela,
  params: CriteriaParams,
): AvaliacaoJanela {
  const defs = criteriosDoPerfil(params, entrada.perfil);
  const nsa = new Set(idsNaoSeAplica(params, entrada.perfil));
  // v2.5: o religamento depende do params ('nao_se_aplica' = v2.4; a v2 usa 'sem_dado')
  const margemNsa =
    params.perfis.acao_financeira.margemSemReceitaComparavel === 'nao_se_aplica' &&
    margemNaoComparavel(entrada, janela);
  const resultados = defs.map((def) => {
    const naoSeAplica = nsa.has(def.id) || (margemNsa && def.id === 'mg');
    const escolha =
      def.tipo === 'months'
        ? null
        : escolherSerieJanela(
            entrada.series,
            entrada.origens,
            def,
            anosDaJanela(entrada.anoFim, janela, def.tipo === 'up'),
          );
    const r = avaliarCriterio(
      {
        def,
        janela,
        anoFim: entrada.anoFim,
        classe: entrada.classe,
        serie: escolha ? escolha.valores : entrada.series[def.serie],
        meses: entrada.meses,
        mesesPorAno: entrada.mesesPorAno,
        naoSeAplica,
      },
      params,
    );
    if (naoSeAplica || def.ativo === false) return r;
    const fonte = escolha ? escolha.fontes : fontesDosMeses(entrada, janela);
    const obs = escolha?.obs ?? [];
    return {
      ...r,
      ...(entrada.origens && fonte.length > 0 ? { fonte } : {}),
      ...(obs.length > 0 ? { obs } : {}),
    };
  });
  return {
    janela,
    anoInicio: anoInicioJanela(entrada.anoFim, janela),
    anoFim: entrada.anoFim,
    ...contarResultados(resultados),
    resultados,
  };
}

export function avaliarAtivo(
  entrada: EntradaAvaliacaoAtivo,
  params: CriteriaParams,
  paramsVersion: number,
): AvaliacaoAtivo {
  const janelas = {} as Record<ChaveJanela, AvaliacaoJanela>;
  for (const j of params.janelas) {
    janelas[String(j) as ChaveJanela] = avaliarJanela(entrada, j, params);
  }
  return {
    symbol: entrada.symbol,
    classe: entrada.classe,
    perfil: entrada.perfil,
    paramsVersion,
    janelas,
  };
}
