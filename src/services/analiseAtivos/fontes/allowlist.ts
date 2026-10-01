/**
 * Allowlist de hosts de download da Análise de Ativos. Lista EXATA, sem curinga (um '*.b3.com.br'
 * aceitaria qualquer subdomínio). https obrigatório. O download revalida o host de cada redirect.
 * rad.cvm.gov.br (links do IPE) NÃO entra: é guardado como texto, nunca baixado.
 */
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';

export const HOSTS_PERMITIDOS: readonly string[] = [
  'dados.cvm.gov.br',
  'bvmf.bmfbovespa.com.br',
  'sistemaswebb3-listados.b3.com.br',
  'www.b3.com.br',
] as const;

export function assertUrlPermitida(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ErroFonte('url_invalida', `URL inválida: ${url}`);
  }
  if (u.protocol !== 'https:')
    throw new ErroFonte('https_obrigatorio', `https obrigatório: ${url}`);
  if (u.username || u.password || (u.port !== '' && u.port !== '443')) {
    throw new ErroFonte('host_nao_permitido', `URL com credenciais/porta não permitida: ${url}`);
  }
  if (!HOSTS_PERMITIDOS.includes(u.hostname.toLowerCase())) {
    throw new ErroFonte('host_nao_permitido', `Host fora da allowlist: ${u.hostname}`);
  }
}
