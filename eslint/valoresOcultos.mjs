/**
 * Esconder valores — regra local `mf/valor-sem-sensivel` (crítica 5 da spec).
 *
 * Acusa valor em dinheiro formatado direto no JSX (texto, ternário, &&, template, chamadas
 * aninhadas) ou em title/aria-label/aria-description sem passar por <Sensivel>, <ValorVisivel>,
 * <TextoSensivel>, <ConteudoSensivel>, mascarar() ou renderSensivel(). Formatters reconhecidos:
 * formatBRL/USD/Currency/Moeda/BRLCompact/BRLCurto, formatarMoeda, *Formatter.format(...) e
 * toLocaleString com objeto de opções (pede para conferir).
 *
 * Strings devolvidas por render/getValue/cell (fora do JSX) não são acusadas: a autodetecção de
 * R$/US$ dos componentes compartilhados e os testes com sentinelas cobrem esses casos.
 *
 * Nível: 'error' nas pastas da Fase 1 (fechada com zero ocorrências). Cada fase acrescenta os
 * seus globs em GLOBS_VALORES_OCULTOS.
 */

const NOMES_FORMATTER = /^(format(BRL|USD|Currency|Moeda|BRLCompact|BRLCurto)|formatarMoeda)$/;
const METODOS_FORMATTER = /^(format(BRL|USD|Currency)|formatarMoeda)$/;
const OBJETO_FORMATTER = /[Ff]ormatter$/;
const ATRIBUTOS_TEXTO = new Set(['title', 'aria-label', 'aria-description']);
const COMPONENTES_SEGUROS = new Set([
  'Sensivel',
  'ValorVisivel',
  'TextoSensivel',
  'ConteudoSensivel',
]);
const CHAMADAS_SEGURAS = new Set(['mascarar', 'mascararTexto', 'mascararHtml', 'renderSensivel']);

const nomeDoCallee = (callee) => {
  if (!callee) return null;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return null;
};

/** É uma chamada que formata dinheiro? Devolve o tipo da mensagem ou null. */
function tipoDeChamada(node) {
  const { callee } = node;
  if (callee.type === 'Identifier' && NOMES_FORMATTER.test(callee.name)) return 'valor';
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return null;
  const metodo = callee.property.name;
  if (METODOS_FORMATTER.test(metodo)) return 'valor';
  if (
    metodo === 'format' &&
    callee.object.type === 'Identifier' &&
    OBJETO_FORMATTER.test(callee.object.name)
  ) {
    return 'valor';
  }
  if (metodo === 'toLocaleString') {
    const opcoes = node.arguments[1];
    if (opcoes && opcoes.type === 'ObjectExpression' && opcoes.properties.length > 0) {
      return 'conferir';
    }
  }
  return null;
}

const nomeJsx = (name) => {
  if (!name) return null;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return name.property.name;
  return null;
};

const nomeAtributo = (attr) =>
  attr.name.type === 'JSXIdentifier'
    ? attr.name.name
    : `${attr.name.namespace.name}:${attr.name.name.name}`;

const valorSemSensivel = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Valor em dinheiro no JSX precisa de <Sensivel>/<ValorVisivel> (esconder valores)',
    },
    schema: [],
    messages: {
      valor: 'Valor em dinheiro sem <Sensivel>/<ValorVisivel> — some quando o olho está ligado?',
      conferir:
        'toLocaleString com opções no JSX: se for dinheiro, quantidade ou preço médio, use <Sensivel>/<ValorVisivel> — some quando o olho está ligado?',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        const tipo = tipoDeChamada(node);
        if (!tipo) return;
        const ancestrais = sourceCode.getAncestors
          ? sourceCode.getAncestors(node)
          : context.getAncestors();
        // Contexto JSX mais próximo: 'texto' (filho do JSX ou title/aria-*) ou 'prop' (outras
        // props — value de input, props de componente — não são texto renderizado aqui).
        let contexto = null;
        for (let i = ancestrais.length - 1; i >= 0; i -= 1) {
          const a = ancestrais[i];
          if (a.type === 'CallExpression' && CHAMADAS_SEGURAS.has(nomeDoCallee(a.callee))) return;
          if (a.type === 'JSXElement' && COMPONENTES_SEGUROS.has(nomeJsx(a.openingElement.name))) {
            return;
          }
          if (contexto) continue;
          if (a.type === 'JSXAttribute') {
            contexto = ATRIBUTOS_TEXTO.has(nomeAtributo(a)) ? 'texto' : 'prop';
          } else if (a.type === 'JSXExpressionContainer' && a.parent?.type !== 'JSXAttribute') {
            contexto = 'texto';
          }
        }
        if (contexto === 'texto') context.report({ node, messageId: tipo });
      },
    };
  },
};

export const pluginValoresOcultos = {
  meta: { name: 'mf-valores-ocultos' },
  rules: { 'valor-sem-sensivel': valorSemSensivel },
};

/** Pastas cobertas (Fase 1). Formulários ficam visíveis (decisão 3), por isso saem. */
export const GLOBS_VALORES_OCULTOS = [
  'src/components/carteira/**/*.{ts,tsx}',
  'src/components/analises/**/*.{ts,tsx}',
  'src/components/consultor/**/*.{ts,tsx}',
  'src/components/consultant/**/*.{ts,tsx}',
  'src/components/charts/**/*.{ts,tsx}',
  'src/app/(admin)/(home)/ativos/[[]id]/page.tsx',
  'src/app/(admin)/(home)/consultor/**/*.{ts,tsx}',
];

export const IGNORES_VALORES_OCULTOS = [
  'src/components/carteira/**/wizard/**',
  'src/components/carteira/**/redeemWizard/**',
  'src/components/carteira/**/mover/**',
  'src/components/carteira/**/Add*.tsx',
  'src/components/carteira/**/AlocacaoMetaSheet.tsx',
  'src/components/carteira/**/MobileEditSheet.tsx',
  '**/__tests__/**',
];
