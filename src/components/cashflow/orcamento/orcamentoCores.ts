/**
 * Cores POR NOME de categoria do Orçamento vs Real, extraídas do donut da
 * planilha modelo (xl/charts/chart1.xml — cada fatia tem cor explícita);
 * categorias fora do modelo caem nos accents do tema da mesma planilha.
 * Compartilhadas entre o donut e o gráfico de barras para a categoria manter
 * a MESMA cor nos dois gráficos.
 */

export const CORES_PLANILHA: Record<string, string> = {
  Habitação: '#9E8A58',
  Transporte: '#61D836',
  Saúde: '#929292',
  'Despesas Pessoais': '#4472C4',
  Lazer: '#FFC000',
  'Despesas Financeiras': '#E6E0D2',
  Agradecimentos: '#404040',
  'Despesas Empresa': '#E6E0D2',
  'Planejamento Financeiro': '#685B3A',
};

// Accents do tema da planilha (theme1.xml), para categorias fora do modelo.
export const CORES_FALLBACK = ['#00A2FF', '#16E7CF', '#FFD932', '#FF644E', '#FF42A1', '#5E5E5E'];

/** Cor de cada nome, na ordem — fallback estável pela posição entre os sem cor. */
export function coresPorNome(nomes: string[]): string[] {
  let fallbackIdx = 0;
  return nomes.map(
    (nome) => CORES_PLANILHA[nome] ?? CORES_FALLBACK[fallbackIdx++ % CORES_FALLBACK.length],
  );
}
