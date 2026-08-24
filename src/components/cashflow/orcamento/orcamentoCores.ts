import { MYFINANCE_BRAND } from '@/constants/brandColors';

/**
 * Cores POR NOME de categoria do Orçamento vs Real na paleta oficial My
 * Finance (ticket 24/08/2026 — antes vinham do tema da planilha modelo).
 *
 * Mesma regra da carteira (`carteiraCategoryColors`): o manual só tem azuis e
 * cinzas, então as categorias usam as âncoras oficiais + tons derivados da
 * MESMA família (azuis clareados/escurecidos — nunca outro matiz). Na ordem
 * do template do fluxo, vizinhos alternam claro/escuro para fatias adjacentes
 * do donut não se confundirem. #CCCCCC (transparencia) fica reservado à barra
 * "Orçado" do gráfico de barras — nenhuma categoria o usa.
 *
 * Compartilhadas entre o donut e o gráfico de barras para a categoria manter
 * a MESMA cor nos dois gráficos.
 */
export const CORES_CATEGORIA: Record<string, string> = {
  Habitação: MYFINANCE_BRAND.outside, // #0079F2 azul-assinatura
  Transporte: '#9DBEDC', // tranquilidade clareado
  Saúde: MYFINANCE_BRAND.seguranca, // #314666
  Educação: '#80BCF8', // outside clareado
  'Animais de Estimação': MYFINANCE_BRAND.patrimonio, // #396CAA
  'Despesas Pessoais': '#C7D9EA', // azul pálido (tranquilidade→escolha)
  Lazer: '#0056AC', // outside escurecido
  Impostos: '#4E7CA6', // tranquilidade escurecido
  'Despesas com Dependentes': '#4D9FF5', // outside médio-claro
  'Despesas Empresa': MYFINANCE_BRAND.escolha, // #EAEAEA
  'Despesas Financeiras': '#3A5C8F', // seguranca→patrimonio
  'Planejamento Financeiro': MYFINANCE_BRAND.tranquilidade, // #6E9DC4
  'Despesas Variáveis': '#1C2A40', // seguranca escurecido
  Agradecimentos: '#B4CCE3', // tranquilidade pálido
};

/** Tons derivados da mesma família para categorias criadas pelo usuário. */
export const CORES_FALLBACK = ['#5589C7', '#264D80', '#A9C6E0', '#3E6FA3', '#DDE7F0', '#7FA8CF'];

/** Cor de cada nome, na ordem — fallback estável pela posição entre os sem cor. */
export function coresPorNome(nomes: string[]): string[] {
  let fallbackIdx = 0;
  return nomes.map(
    (nome) => CORES_CATEGORIA[nome] ?? CORES_FALLBACK[fallbackIdx++ % CORES_FALLBACK.length],
  );
}
