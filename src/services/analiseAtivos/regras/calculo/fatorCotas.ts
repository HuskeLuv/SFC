/**
 * Fator de desdobramento de cotas de FII (puro, sem dependências). Fica fora de
 * leitura/ativo/fundamentosEssencial para o motor de critérios (seriesFii → fonteCvm → registro)
 * não importar o Essencial, que importa o registro de fontes: o ciclo quebrava a inicialização
 * de FONTE_CVM no seed/tsx (ReferenceError antes da inicialização).
 */

/**
 * Fator de desdobramento de cotas de FII depois de `data` (Π dos fatores dos meses posteriores):
 * valor por cota da data ÷ fator = valor na base de cotas de hoje.
 */
export function fatorCotasApos(
  data: string,
  desdobramentos: ReadonlyArray<{ refMonth: string; fator: number }>,
): number {
  return desdobramentos
    .filter((d) => d.refMonth > data && Number.isFinite(d.fator) && d.fator > 0)
    .reduce((acc, d) => acc * d.fator, 1);
}
