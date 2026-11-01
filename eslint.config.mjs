import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import {
  GLOBS_VALORES_OCULTOS,
  IGNORES_VALORES_OCULTOS,
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
];

export default eslintConfig;
