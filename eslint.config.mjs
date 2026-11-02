import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import {
  GLOBS_VALORES_OCULTOS,
  GLOBS_VALORES_OCULTOS_FASE2,
  GLOBS_VALORES_OCULTOS_FASE5,
  IGNORES_VALORES_OCULTOS,
  IGNORES_VALORES_OCULTOS_FASE2,
  IGNORES_VALORES_OCULTOS_FASE5,
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
  // Esconder valores: valor em dinheiro no JSX sem <Sensivel>/<ValorVisivel>. 'error' no app
  // logado inteiro desde o fechamento da Fase 6, com zero ocorrências (menos Comunidade, Admin e
  // Landing/páginas públicas — eslint/valoresOcultos.mjs).
  {
    files: GLOBS_VALORES_OCULTOS,
    ignores: IGNORES_VALORES_OCULTOS,
    plugins: { mf: pluginValoresOcultos },
    rules: {
      "mf/valor-sem-sensivel": "error",
    },
  },
  // Fase 2 (Fluxo de caixa e Orçamento v1/v2): bloco a mais só para a opção formattersExtras
  // (num() do Orçamento v2). Vem depois do bloco do app inteiro para a opção valer.
  {
    files: GLOBS_VALORES_OCULTOS_FASE2,
    ignores: IGNORES_VALORES_OCULTOS_FASE2,
    plugins: { mf: pluginValoresOcultos },
    rules: {
      "mf/valor-sem-sensivel": ["error", OPCOES_VALORES_OCULTOS_FASE2],
    },
  },
  // Fase 5 (Análise de Ativos — só arquivos com dado do usuário —, Relatórios e Conexões
  // bancárias): bloco a mais só para a opção formattersExtras (brl/usd/dinheiro* locais).
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
