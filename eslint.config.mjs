import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import {
  GLOBS_VALORES_OCULTOS,
  GLOBS_VALORES_OCULTOS_FASE2,
  GLOBS_VALORES_OCULTOS_FASE3,
  GLOBS_VALORES_OCULTOS_FASE4,
  GLOBS_VALORES_OCULTOS_FASE5,
  GLOBS_VALORES_OCULTOS_FASE6,
  IGNORES_VALORES_OCULTOS,
  IGNORES_VALORES_OCULTOS_FASE2,
  IGNORES_VALORES_OCULTOS_FASE3,
  IGNORES_VALORES_OCULTOS_FASE4,
  IGNORES_VALORES_OCULTOS_FASE5,
  IGNORES_VALORES_OCULTOS_FASE6,
  OPCOES_VALORES_OCULTOS_FASE2,
  OPCOES_VALORES_OCULTOS_FASE5,
  pluginValoresOcultos,
} from "./eslint/valoresOcultos.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Fase 6 (o resto do app logado, menos Comunidade, Admin e Landing/públicas): 'warn' durante a
  // fase. Vem ANTES dos blocos das Fases 1–5 para que eles (depois) mantenham 'error' e as opções.
  {
    files: GLOBS_VALORES_OCULTOS_FASE6,
    ignores: IGNORES_VALORES_OCULTOS_FASE6,
    plugins: { mf: pluginValoresOcultos },
    rules: {
      "mf/valor-sem-sensivel": "warn",
    },
  },
  // Esconder valores: valor em dinheiro no JSX sem <Sensivel>/<ValorVisivel>. 'error' desde o
  // fechamento da Fase 1, com zero ocorrências nas pastas cobertas (eslint/valoresOcultos.mjs).
  {
    files: GLOBS_VALORES_OCULTOS,
    ignores: IGNORES_VALORES_OCULTOS,
    plugins: { mf: pluginValoresOcultos },
    rules: {
      "mf/valor-sem-sensivel": "error",
    },
  },
  // Fase 2 (Fluxo de caixa e Orçamento v1/v2): 'error' desde o fechamento da fase, com zero
  // ocorrências. Bloco próprio porque leva a opção formattersExtras (num() do Orçamento v2).
  {
    files: GLOBS_VALORES_OCULTOS_FASE2,
    ignores: IGNORES_VALORES_OCULTOS_FASE2,
    plugins: { mf: pluginValoresOcultos },
    rules: {
      "mf/valor-sem-sensivel": ["error", OPCOES_VALORES_OCULTOS_FASE2],
    },
  },
  // Fase 3 (Planejar: Sonhos e Aposentadoria): 'error' desde o fechamento da fase, com zero
  // ocorrências.
  {
    files: GLOBS_VALORES_OCULTOS_FASE3,
    ignores: IGNORES_VALORES_OCULTOS_FASE3,
    plugins: { mf: pluginValoresOcultos },
    rules: {
      "mf/valor-sem-sensivel": "error",
    },
  },
  // Fase 4 (Dívidas e Saúde Financeira): 'error' desde o fechamento da fase, com zero
  // ocorrências.
  {
    files: GLOBS_VALORES_OCULTOS_FASE4,
    ignores: IGNORES_VALORES_OCULTOS_FASE4,
    plugins: { mf: pluginValoresOcultos },
    rules: {
      "mf/valor-sem-sensivel": "error",
    },
  },
  // Fase 5 (Análise de Ativos — só arquivos com dado do usuário —, Relatórios e Conexões
  // bancárias): 'error' desde o fechamento da fase, com zero ocorrências.
  {
    files: GLOBS_VALORES_OCULTOS_FASE5,
    ignores: IGNORES_VALORES_OCULTOS_FASE5,
    plugins: { mf: pluginValoresOcultos },
    rules: {
      "mf/valor-sem-sensivel": ["error", OPCOES_VALORES_OCULTOS_FASE5],
    },
  },
];

export default eslintConfig;
