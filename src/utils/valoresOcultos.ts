/**
 * Esconder valores — o núcleo puro (roda em node, no edge e no browser).
 *
 * Contrato da fatia 0 (docs/esconder-valores/spec-desenho.json → arquitetura.mecanismo):
 * nome e opções do cookie de preferência, a máscara textual, a pílula HTML dos tooltips do Apex e
 * a detecção de valores em dinheiro (R$/US$) dentro de strings já formatadas.
 *
 * Quem desenha a pílula no React é `<Sensivel>` (src/components/common/valores/Sensivel.tsx);
 * aqui só ficam as funções sobre strings.
 */

/** Cookie da preferência (por aparelho, não-httpOnly, gravado pelo servidor). */
export const COOKIE_VALORES_OCULTOS = 'mf_valores_ocultos';

/** 1 ano, em segundos — renovado pelo middleware a cada navegação. */
export const MAX_AGE_VALORES_OCULTOS = 31536000;

/** Máscara textual (SVG dos gráficos, onde não cabe a pílula HTML). */
export const MASCARA_VALOR = '•••••';

/** Pílula para HTML injetado pelo ApexCharts (tooltips). Estilo em globals.css. */
export const PILULA_HTML =
  '<span class="mf-pilula-grafico" role="img" aria-label="valor oculto"></span>';

/**
 * Como um valor reage ao olho:
 *  - 'auto'           só strings com R$/US$ viram pílula (o resto passa intacto)
 *  - 'sensivel'       sempre pílula
 *  - 'sensivel-curto' sempre pílula curta (quantidades)
 *  - 'visivel'        nunca (cotação pública, indicador de mercado, valor digitado)
 */
export type SensibilidadeValor = 'auto' | 'sensivel' | 'sensivel-curto' | 'visivel';

/**
 * Valor em dinheiro dentro de um texto: sinal opcional, símbolo (R$ ou US$), número pt-BR e sufixo
 * compacto opcional (mil, mi, bi, K, M, B). `\s` cobre o NBSP do Intl. O sufixo não pode ser o
 * começo de uma palavra ("R$ 10 milhões" casa só "R$ 10").
 */
export const REGEX_VALOR_MONETARIO =
  /-?\s?(?:R\$|US\$)\s?-?\d[\d.]*(?:,\d+)?(?:\s?(?:mil|mi|bi|[KMB])(?![A-Za-zÀ-ÿ]))?/g;

const novaRegex = () => new RegExp(REGEX_VALOR_MONETARIO.source, 'g');

/** O texto tem algum valor em R$/US$? */
export function contemValorMonetario(texto: string): boolean {
  return novaRegex().test(texto);
}

const simboloDe = (trecho: string) => (trecho.includes('US$') ? 'US$' : 'R$');

/**
 * Separa do trecho casado o que não é valor: o espaço inicial e o hífen de separação seguido de
 * espaço ("PETR4 - R$ 10" mantém o " - "). O sinal colado ("-R$ 10") faz parte do valor.
 */
function separarPrefixo(trecho: string): [prefixo: string, valor: string] {
  const prefixo = trecho.match(/^(?:-\s|\s)/)?.[0] ?? '';
  return [prefixo, trecho.slice(prefixo.length)];
}

/** Troca cada valor por "R$ •••••" (mantém o símbolo). */
export function mascararTexto(texto: string): string {
  return texto.replace(novaRegex(), (trecho) => {
    const [prefixo, valor] = separarPrefixo(trecho);
    return `${prefixo}${simboloDe(valor)} ${MASCARA_VALOR}`;
  });
}

/** Troca cada valor por uma pílula HTML (tooltips do Apex). */
export function mascararHtml(html: string): string {
  return html.replace(novaRegex(), (trecho) => `${separarPrefixo(trecho)[0]}${PILULA_HTML}`);
}

export interface TrechoTexto {
  texto: string;
  sensivel: boolean;
}

/** Quebra o texto em trechos comuns e trechos com valor (o prefixo de separação fica fora). */
export function dividirPorValores(texto: string): TrechoTexto[] {
  const trechos: TrechoTexto[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(novaRegex())) {
    const [prefixo, valor] = separarPrefixo(m[0]);
    const inicio = (m.index ?? 0) + prefixo.length;
    if (inicio > ultimo) trechos.push({ texto: texto.slice(ultimo, inicio), sensivel: false });
    trechos.push({ texto: valor, sensivel: true });
    ultimo = inicio + valor.length;
  }
  if (ultimo < texto.length) trechos.push({ texto: texto.slice(ultimo), sensivel: false });
  return trechos;
}

/** O valor do cookie liga o modo oculto? */
export function lerCookieValoresOcultos(valor: string | undefined | null): boolean {
  return valor === '1';
}

export interface OpcoesCookieValoresOcultos {
  httpOnly: false;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

/**
 * Atributos do cookie, os mesmos na rota de preferência e na renovação do middleware. Não é
 * httpOnly (o provider grava uma cópia otimista por script); Max-Age 0 apaga.
 */
export function opcoesCookieValoresOcultos(
  ocultos: boolean,
  secure: boolean,
): OpcoesCookieValoresOcultos {
  return {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ocultos ? MAX_AGE_VALORES_OCULTOS : 0,
  };
}
