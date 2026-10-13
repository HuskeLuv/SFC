/**
 * TEXTOS_LITERAIS_OBRIGATORIOS — registro ÚNICO dos textos jurídicos/regulatórios que a spec v2.4
 * manda reproduzir LITERALMENTE (dono: fatia 0). São as ÚNICAS exceções da varredura de linguagem
 * (linguagemV2): eles citam palavras proibidas para NEGÁ-LAS ("não há ranking, nota ou ativo
 * vencedor", "não calcula preço justo", "não significa ser melhor investimento").
 *
 * Regras (revisão (c) do desenho):
 * - casamento EXATO da string inteira (só espaços em sequência são colapsados), nunca por palavra:
 *   o mesmo texto com uma palavra a mais é acusado pela varredura;
 * - na tela, o nó que mostra o literal leva data-texto-legal="<id>" e o textContent desse nó TEM de
 *   ser igual a `texto` (varrerDom confere; o título "Aviso importante." fica FORA do nó);
 * - `origem` = seção da spec (ou da decisão) de onde o texto vem; `provisorio` = aguarda o jurídico.
 * - Mudança de texto = PR na fatia 0 (ou F) + OK do Wellington (D1/rec. 6).
 *
 * Ids = valores de data-texto-legal combinados com o designer (design.especificacao_visual):
 * rodape-quadro, aviso-legal-v2, instrucao-comparador-{acoes,fiis}, leitura-dos-dados,
 * rodape-cenarios, aviso-banner, disclaimer-desempenho (+ aviso-legal-v2-selo).
 */

export interface TextoLiteral {
  id: string;
  texto: string;
  /** 'spec v2.4 §…' (ou decisão) */
  origem: string;
  /** true = redação provisória, aguarda revisão jurídica */
  provisorio?: boolean;
}

function literal(id: string, texto: string, origem: string, provisorio?: true): TextoLiteral {
  return provisorio ? { id, texto, origem, provisorio } : { id, texto, origem };
}

/** Rodapé fixo do Quadro (§3.1, sem a SEC: Stocks/REITs fora pela D5). Cita "melhor" na negativa. */
export const RODAPE_QUADRO = literal(
  'rodape-quadro',
  'Os filtros e a coluna "Critérios" verificam, ano a ano, dados contábeis históricos das demonstrações financeiras públicas (DFP/ITR na CVM; informes mensais e trimestrais dos FIIs). Nenhum critério é opinião do My Finance, e atender a mais critérios não significa ser melhor investimento. Rentabilidade passada não é garantia de resultados futuros.',
  'spec v2.4 §3.1 (nota de rodapé fixa do Quadro), adaptada à D5 (sem 10-K/10-Q na SEC)',
);

/**
 * Aviso legal único da área (§9), adaptado à D5: sem ranking, notas, teses públicas e SEC.
 * PROVISÓRIO para o jurídico (rec. 6). Substituiu o rodapé legal antigo do textosTela (removido na fatia F).
 */
export const RODAPE_LEGAL_V2 = literal(
  'aviso-legal-v2',
  'O My Finance é uma ferramenta de organização financeira e de dados. Os filtros, as tabelas e os comparativos desta área reproduzem informações contábeis históricas das demonstrações financeiras públicas (DFP/ITR na CVM e informes de FIIs) e cotações de mercado. Nada nesta área constitui análise, consultoria ou recomendação de investimento (Resoluções CVM 19/2021 e 20/2021). Rentabilidade passada não é garantia de resultados futuros. Decisões de investimento são de responsabilidade exclusiva do usuário.',
  'spec v2.4 §9 (aviso legal), adaptado à D5; recomendação 6 de 13/10/2026',
  true,
);

/** Selo do aviso legal provisório (itálico, cor apagada; .legal-prov do protótipo). */
export const RODAPE_LEGAL_V2_SELO = literal(
  'aviso-legal-v2-selo',
  'Texto provisório, adaptado da §9 sem ranking, notas e teses (fora desta rodada); aguarda revisão jurídica.',
  'recomendação 6 de 13/10/2026 (selo do aviso legal provisório)',
  true,
);

/** Instrução do Comparador (§3.3) — uma por classe (casamento exato). */
export const INSTRUCAO_COMPARADOR_ACOES = literal(
  'instrucao-comparador-acoes',
  'Compare até 4 ações lado a lado · dados das demonstrações financeiras, sem ranking nem destaque',
  'spec v2.4 §3.3 (barra do Comparador)',
);
export const INSTRUCAO_COMPARADOR_FIIS = literal(
  'instrucao-comparador-fiis',
  'Compare até 4 FIIs lado a lado · dados das demonstrações financeiras, sem ranking nem destaque',
  'spec v2.4 §3.3 (barra do Comparador)',
);

/** Frase fixa do bloco "Leitura dos dados" do Comparador (§3.3). */
export const LEITURA_DOS_DADOS = literal(
  'leitura-dos-dados',
  'Os critérios são verificações factuais sobre demonstrações financeiras passadas, iguais para todos os ativos da classe. Não há ranking, nota ou ativo "vencedor": a comparação é um apoio à sua própria pesquisa e não constitui recomendação. Rentabilidade passada não é garantia de resultados futuros.',
  'spec v2.4 §3.3 (bloco "Leitura dos dados")',
);

/**
 * Rodapé fixo de Meus cenários (§3.2/§4.4). Idêntico a TEXTOS_ANALISE.rodapeValuation (o teste
 * confere): a C2 passa a renderizá-lo com data-texto-legal="rodape-cenarios".
 */
export const RODAPE_CENARIOS_V2 = literal(
  'rodape-cenarios',
  "Os cenários usam as premissas que você definiu. O My Finance não calcula 'preço justo' nem preço-alvo: o resultado é uma conta com os seus parâmetros, serve para estudo e não constitui recomendação de compra ou venda.",
  'spec v2.4 §3.2 (Valuation · Meus cenários, rodapé fixo)',
);

/** Aviso curto do banner da área (protótipo final, §9). */
export const AVISO_BANNER = literal(
  'aviso-banner',
  'Ferramenta de dados contábeis históricos — não é análise nem recomendação de investimento.',
  'spec v2.4 §9 (aviso em toda tela), texto do protótipo final',
);

/** Disclaimer de desempenho histórico (§9: toda tela que usa dado passado). */
export const DISCLAIMER_DESEMPENHO = literal(
  'disclaimer-desempenho',
  'Rentabilidade passada não é garantia de resultados futuros.',
  'spec v2.4 §9 (disclaimer de desempenho histórico)',
);

const LISTA: readonly TextoLiteral[] = [
  RODAPE_QUADRO,
  RODAPE_LEGAL_V2,
  RODAPE_LEGAL_V2_SELO,
  INSTRUCAO_COMPARADOR_ACOES,
  INSTRUCAO_COMPARADOR_FIIS,
  LEITURA_DOS_DADOS,
  RODAPE_CENARIOS_V2,
  AVISO_BANNER,
  DISCLAIMER_DESEMPENHO,
];

/** Registro por id (= valor de data-texto-legal). */
export const TEXTOS_LITERAIS_OBRIGATORIOS: Readonly<Record<string, TextoLiteral>> = Object.freeze(
  Object.fromEntries(LISTA.map((l) => [l.id, l])),
);

/** Colapsa espaços em sequência e apara as pontas (única normalização do casamento exato). */
export function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

const TEXTOS = new Set(LISTA.map((l) => normalizarEspacos(l.texto)));

/** true só quando `texto` é EXATAMENTE um literal registrado (string inteira). */
export function ehTextoLiteral(texto: string): boolean {
  return TEXTOS.has(normalizarEspacos(texto));
}

/** O literal do id, ou undefined (id não registrado). */
export function textoLiteral(id: string): string | undefined {
  return TEXTOS_LITERAIS_OBRIGATORIOS[id]?.texto;
}

/** Ids dos literais provisórios (lista para o jurídico). */
export function literaisProvisorios(): string[] {
  return LISTA.filter((l) => l.provisorio).map((l) => l.id);
}
