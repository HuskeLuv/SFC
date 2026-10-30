import { normalizarBusca, normalizarNomeInstituicao } from '@/lib/instituicoes/normalizarNome';

/**
 * Marcas comerciais → raiz do CNPJ de quem EMITE a renda fixa da marca (ClickUp 86e2xqh69).
 * O nome do Bacen é a razão social; sem isto, quem digita 'nubank' no emissor não acha a
 * Nu Financeira (quem emite o RDB), e sim a Nu Pagamentos (instituição de pagamento, não emite).
 *
 * Raízes conferidas no IF.data 202606 e na lista do STR (30/10/2026). Mantido à mão: uma raiz
 * errada leva a casamento errado no Pluggy (fatia E), então só entra marca com emissor claro.
 */
export const APELIDOS_POR_RAIZ: Readonly<Record<string, readonly string[]>> = {
  /** NU FINANCEIRA S.A. - SCFI (N1, conglomerado C0084693). A Nu Pagamentos (18236120) é N4. */
  '30680829': ['nubank', 'nu'],
  /** BANCO INTER S.A. (B1). */
  '00416968': ['inter', 'banco inter'],
  /** BANCO C6 S.A. (B1). */
  '31872495': ['c6', 'c6 bank'],
  /** PICPAY BANK - BANCO MÚLTIPLO S.A (B1). A PicPay IP (22896431) é N4. */
  '09516419': ['picpay'],
  /** MERCADO CRÉDITO SCFI S.A. (N1). O Mercado Pago IP (10573521) é N4. */
  '37679449': ['mercado pago'],
  /** BANCOSEGURO S.A. (B1, conglomerado PagBank C0084813). A PagSeguro IP (08561701) é N4. */
  '10264663': ['pagbank', 'pagseguro'],
  /** BANCO XP S.A. (B1). A XP CCTVM (02332886) é N2. */
  '33264668': ['xp', 'banco xp'],
  /** BANCO BTG PACTUAL S.A. (B1). */
  '30306294': ['btg', 'btg pactual'],
  /** BANCO ORIGINAL S.A. (B1). */
  '92894922': ['original'],
  /** BANCO SOFISA S.A. (B1). */
  '60889128': ['sofisa', 'sofisa direto'],
  /** BANCO DAYCOVAL S.A. (B1). */
  '62232889': ['daycoval'],
  /** BANCO BMG S.A. (B1). */
  '61186680': ['bmg'],
  /** BANCO PINE S.A. (B1). */
  '62144175': ['pine'],
  /** BANCO MASTER S/A (B1, em liquidação extrajudicial desde nov/2025: fora do IF.data ativo). */
  '33923798': ['master', 'banco master'],
  /** BANCO AGIBANK S.A. (B1). */
  '10664513': ['agibank'],
};

/** Junta frases de busca num texto só (minúsculas, sem acento), sem repetir frase já contida. */
export function juntarApelidos(
  atual: string | null | undefined,
  frases: readonly string[],
): string {
  let texto = normalizarBusca(atual);
  for (const f of frases) {
    const frase = normalizarBusca(f);
    if (!frase) continue;
    if (` ${texto} `.includes(` ${frase} `)) continue;
    texto = texto ? `${texto} ${frase}` : frase;
  }
  return texto;
}

/**
 * Frases de busca de uma raiz: o Nome_Reduzido do STR normalizado + o mapa de marcas. O nome
 * reduzido fica de fora quando já aparece literalmente no nome da linha (a busca por nome o
 * acha); com acento no nome ('Topázio') ele entra, porque a busca por nome não ignora acento.
 */
export function frasesDeApelido(
  raiz: string,
  nomeReduzidoStr: string | null | undefined,
  nomeLinha: string | null | undefined,
  apelidosPorRaiz: Readonly<Record<string, readonly string[]>> = APELIDOS_POR_RAIZ,
): string[] {
  const frases: string[] = [];
  const reduzido = normalizarNomeInstituicao(nomeReduzidoStr);
  if (reduzido && !(nomeLinha ?? '').toLowerCase().includes(reduzido)) frases.push(reduzido);
  frases.push(...(apelidosPorRaiz[raiz] ?? []));
  return frases;
}
