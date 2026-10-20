/**
 * Params VIGENTES NO CÓDIGO dos Filtros de Fundamentos (v2.5, achado alto 1 do desenho): a ÚNICA
 * constante que código de produção importa quando precisa de criteria_params sem o banco —
 * definições de fallback do Quadro e do Comparador, rótulos das telas, CRITERIOS_FILTRAVEIS. Os
 * params de verdade vêm do banco (obterCriteriaParams); esta é a cópia do código para fallback.
 *
 * Trocar a versão vigente do código = mudar o apontador abaixo (num PR), nunca importar
 * CRITERIA_PARAMS_V1/V2/V3 direto em produção. Os testes que exercitam uma versão específica (casos45
 * com v1 e v2) importam a constante da versão de propósito.
 *
 * Stocks e REITs (fatia 0): aponta para a v3 — os perfis BR da v3 são IDÊNTICOS aos da v2 (teste
 * criteriaParams.test), então as definições/rótulos de fallback do Brasil não mudam; os perfis EUA
 * passam a ter rótulos de fallback no código antes da v3 estar no banco.
 *
 * A6 (fatia E): a v4 (criteriaParamsV4: 'alav' do fii_tijolo sobre o ativo total) é REGISTRADA no
 * seed (seed-criteria-params --versao=4) e entra pelo banco com validFrom futuro; o apontador do
 * código CONTINUA na v3 até o OK da ativação (desenho ativacao_prod). Trocar aqui antes disso mudaria
 * os rótulos de fallback ('Alavancagem ≤ 20% do PL') com a chave desligada. Com a v4 vigente no
 * banco, o Quadro, o Comparador e o card de critérios já leem o rótulo novo dos params do banco.
 */
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import {
  CRITERIA_PARAMS_V3,
  CRITERIA_PARAMS_V3_JSON,
} from '@/services/analiseAtivos/params/criteriaParamsV3';

export const CRITERIA_PARAMS_CODIGO: CriteriaParams = CRITERIA_PARAMS_V3;

/** JSON da versão vigente do código, como é gravado em criteria_params (seed do CI). */
export const CRITERIA_PARAMS_CODIGO_JSON = CRITERIA_PARAMS_V3_JSON;
