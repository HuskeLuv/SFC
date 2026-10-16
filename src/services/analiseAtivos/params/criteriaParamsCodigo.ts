/**
 * Params VIGENTES NO CÓDIGO dos Filtros de Fundamentos (v2.5, achado alto 1 do desenho): a ÚNICA
 * constante que código de produção importa quando precisa de criteria_params sem o banco —
 * definições de fallback do Quadro e do Comparador, rótulos das telas, CRITERIOS_FILTRAVEIS. Os
 * params de verdade vêm do banco (obterCriteriaParams); esta é a cópia do código para fallback.
 *
 * Trocar a versão vigente do código = mudar o apontador abaixo (num PR), nunca importar
 * CRITERIA_PARAMS_V1/V2 direto em produção. Os testes que exercitam uma versão específica (casos45
 * com v1 e v2) importam a constante da versão de propósito.
 */
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import {
  CRITERIA_PARAMS_V2,
  CRITERIA_PARAMS_V2_JSON,
} from '@/services/analiseAtivos/params/criteriaParamsV2';

export const CRITERIA_PARAMS_CODIGO: CriteriaParams = CRITERIA_PARAMS_V2;

/** JSON da versão vigente do código, como é gravado em criteria_params (seed do CI). */
export const CRITERIA_PARAMS_CODIGO_JSON = CRITERIA_PARAMS_V2_JSON;
