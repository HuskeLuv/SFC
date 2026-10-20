/**
 * Arquivos do Formulário de Referência (FRE) da CVM dados abertos usados pelo job
 * 'cvm-fre-societario' (A6, item 6; fatia D): URLs, entradas lidas de cada zip e colunas
 * obrigatórias por CSV (se sumir uma coluna, o job falha alto com ErroLayoutFonte em vez de gravar
 * vazio).
 *
 * Só dados.cvm.gov.br (allowlist). O LINK_DOC do índice aponta para rad.cvm.gov.br, que NÃO entra na
 * allowlist: é guardado como texto (linkFreSeguro) e nunca baixado.
 *
 *   FRE do ano e do ano anterior: índice (DT_RECEB, LINK_DOC) + posicao_acionaria (só os diretos) +
 *   distribuicao_capital. FRE 2022 (ANO_FRE_DIREITOS): direito_acao (tag along declarado e o texto
 *   do dividendo; a seção não existe nos FREs de 2023 em diante).
 *
 * As colunas de CPF/CNPJ do acionista NÃO são obrigatórias nem lidas (decisão 5 do Wellington).
 */
import { BASE_CVM } from '@/services/analiseAtivos/acoes/cvmArquivos';
import { ANO_FRE_DIREITOS } from '@/types/analiseAtivosComplementos';

export function nomeArquivoFre(ano: number): string {
  return `fre_cia_aberta_${ano}.zip`;
}

export function urlArquivoFre(ano: number): string {
  return `${BASE_CVM}/FRE/DADOS/${nomeArquivoFre(ano)}`;
}

export type EntradaFre = 'indice' | 'posicao_acionaria' | 'distribuicao_capital' | 'direito_acao';

export function entradaFre(parte: EntradaFre, ano: number): string {
  return parte === 'indice' ? `fre_cia_aberta_${ano}.csv` : `fre_cia_aberta_${parte}_${ano}.csv`;
}

/** Entradas lidas de cada zip: o direito_acao só no FRE 2022. */
export function entradasDoAno(ano: number): EntradaFre[] {
  return ano === ANO_FRE_DIREITOS
    ? ['indice', 'direito_acao']
    : ['indice', 'posicao_acionaria', 'distribuicao_capital'];
}

/**
 * Janela do job: o FRE do ano corrente e do anterior (a companhia entrega até maio; até lá o
 * vigente é o do ano anterior) e o FRE 2022 (direitos por espécie).
 */
export function janelaFre(hoje: string): { societario: number[]; direitos: number } {
  const ano = Number(hoje.slice(0, 4));
  return { societario: [ano - 1, ano], direitos: ANO_FRE_DIREITOS };
}

// ---------------------------------------------------------------- colunas obrigatórias

export const COLUNAS_FRE_INDICE = [
  'CNPJ_CIA',
  'DT_REFER',
  'VERSAO',
  'ID_DOC',
  'DT_RECEB',
  'LINK_DOC',
];

export const COLUNAS_FRE_POSICAO = [
  'CNPJ_Companhia',
  'Data_Referencia',
  'Versao',
  'ID_Acionista',
  'Acionista',
  'Tipo_Pessoa_Acionista',
  'ID_Acionista_Relacionado',
  'Percentual_Acao_Ordinaria_Circulacao',
  'Percentual_Acao_Preferencial_Circulacao',
  'Percentual_Total_Acoes_Circulacao',
  'Data_Ultima_Alteracao',
  'Acionista_Controlador',
  'Participante_Acordo_Acionistas',
];

export const COLUNAS_FRE_DISTRIBUICAO = [
  'CNPJ_Companhia',
  'Data_Referencia',
  'Versao',
  'Quantidade_Acionistas_PF',
  'Quantidade_Acionistas_PJ',
  'Quantidade_Acionistas_Investidores_Institucionais',
  'Percentual_Acoes_Ordinarias_Circulacao',
  'Percentual_Acoes_Preferenciais_Circulacao',
  'Percentual_Total_Acoes_Circulacao',
];

export const COLUNAS_FRE_DIREITO = [
  'CNPJ_Companhia',
  'Data_Referencia',
  'Versao',
  'Especie_Acao',
  'Classe_Acao_Preferencial',
  'Percentual_Tag_Along',
  'Direito_Dividendo',
  'Direito_Voto',
  'Conversibilidade',
];

// ---------------------------------------------------------------- limites

/** Os zips do FRE têm ~8–11 MB; o teto protege contra arquivo trocado. */
export const MAX_BYTES_ZIP_FRE = 60_000_000;
export const TIMEOUT_DOWNLOAD_FRE_MS = 120_000;
/** Texto do Direito_Dividendo guardado (o trecho exibido é MAX_TRECHO_FRE). */
export const MAX_TEXTO_DIREITO = 4_000;

// ---------------------------------------------------------------- link do FRE vigente

const HOSTS_LINK_FRE = new Set(['www.rad.cvm.gov.br', 'rad.cvm.gov.br']);

/**
 * LINK_DOC do índice como texto seguro para a tela: só rad.cvm.gov.br, sempre https (o índice traz
 * http://). Qualquer outra coisa ⇒ null (nunca vira href). Nunca é baixado.
 */
export function linkFreSeguro(link: string | null | undefined): string | null {
  const t = (link ?? '').trim();
  if (!t) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password || (u.port !== '' && u.port !== '80' && u.port !== '443')) {
    return null;
  }
  if (!HOSTS_LINK_FRE.has(u.hostname.toLowerCase())) return null;
  u.protocol = 'https:';
  u.port = '';
  return u.toString();
}
