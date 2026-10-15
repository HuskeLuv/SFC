/**
 * Motor puro dos Filtros de Fundamentos (v2.4): avalia os critérios do perfil nas janelas do params
 * (3 | 5 | 10) — port do evalCriteria/critCount do screen.js com as 3 correções da spec (ver
 * avaliarCriterio.ts). O job 'criterios' (executarCriterios) e os casos 24–29 (casos45.test.ts)
 * programam contra ele.
 *
 * Contagem (não é nota): 'sem_dado' conta como não atende e não entra em `atendidos`;
 * 'nao_se_aplica' (financeira, D4) sai de `aplicaveis` ("n de 3"). `semDado` = nenhum critério
 * aplicável com dado na janela. Função pura.
 */
import {
  criteriosDoPerfil,
  idsNaoSeAplica,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { anoInicioJanela } from '@/services/analiseAtivos/regras/criterios/ancoraJanela';
import { avaliarCriterio } from '@/services/analiseAtivos/regras/criterios/avaliarCriterio';
import type {
  AvaliacaoAtivo,
  AvaliacaoJanela,
  ChaveJanela,
  EntradaAvaliacaoAtivo,
  Janela,
  ResultadoCriterio,
} from '@/types/analiseAtivosCriterios';

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

export function avaliarJanela(
  entrada: EntradaAvaliacaoAtivo,
  janela: Janela,
  params: CriteriaParams,
): AvaliacaoJanela {
  const defs = criteriosDoPerfil(params, entrada.perfil);
  const nsa = new Set(idsNaoSeAplica(params, entrada.perfil));
  const resultados = defs.map((def) =>
    avaliarCriterio(
      {
        def,
        janela,
        anoFim: entrada.anoFim,
        classe: entrada.classe,
        serie: entrada.series[def.serie],
        meses: entrada.meses,
        naoSeAplica: nsa.has(def.id),
      },
      params,
    ),
  );
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
