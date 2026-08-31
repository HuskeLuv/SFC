/**
 * Parser/avaliador de fórmulas de célula do Fluxo de Caixa (ticket 31/08/2026).
 *
 * Estilo Excel mínimo: `=200+30+50*2`, `=(1200-300)/4`, decimais com vírgula
 * OU ponto (`=10,5+0.5`). Sem eval — tokenizer + shunting-yard + avaliação de
 * RPN. Escopo v1: literais e + - * / com parênteses; sem referências a células
 * nem funções.
 *
 * Usado nos DOIS lados: no CurrencyInput (preview ao digitar/blur) e no
 * batch-update (o servidor reavalia e grava o valor computado por ELE, para
 * fórmula e valor nunca divergirem).
 */

export const FORMULA_MAX_LENGTH = 500;

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string };

export function isFormula(raw: string): boolean {
  return raw.trimStart().startsWith('=');
}

type Op = '+' | '-' | '*' | '/' | 'u-';
type Token =
  | { type: 'num'; value: number }
  | { type: 'op'; op: Op }
  | { type: '(' }
  | { type: ')' };

// 'u-' = menos unário (=-10, =5*-2): precedência acima de * e /, associativo à
// direita — sem isso `=5*-2` avaliaria como (5*0)-2.
const PRECEDENCE: Record<Op, number> = { '+': 1, '-': 1, '*': 2, '/': 2, 'u-': 3 };

/**
 * Números aceitam os dois separadores decimais:
 * - `1.234,56` / `10,5` → vírgula decimal (pt-BR; pontos são milhar)
 * - `10.5` → ponto decimal (sem vírgula presente)
 * Ambiguidade tipo `1.234` sem vírgula é tratada como decimal (1.234) — na
 * digitação manual de fórmula ninguém usa separador de milhar isolado.
 */
function parseNumberToken(text: string): number {
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  return Number(normalized);
}

function tokenize(expr: string): Token[] | { error: string } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: ')' });
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', op: ch });
      i++;
      continue;
    }
    // × e ÷ por tolerância (teclados/copy-paste)
    if (ch === '×') {
      tokens.push({ type: 'op', op: '*' });
      i++;
      continue;
    }
    if (ch === '÷') {
      tokens.push({ type: 'op', op: '/' });
      i++;
      continue;
    }
    if (/[\d.,]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[\d.,]/.test(expr[j])) j++;
      const text = expr.slice(i, j);
      const value = parseNumberToken(text);
      if (!Number.isFinite(value)) {
        return { error: `Número inválido: "${text}"` };
      }
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }
    return { error: `Caractere inválido: "${ch}"` };
  }
  return tokens;
}

/**
 * Avalia uma fórmula (`=...`) ou expressão crua (sem `=`).
 * Retorna erro legível em pt-BR para exibição na célula.
 */
export function evaluateFormula(raw: string): FormulaResult {
  const trimmed = raw.trim();
  if (trimmed.length > FORMULA_MAX_LENGTH) {
    return { ok: false, error: 'Fórmula longa demais' };
  }
  const expr = trimmed.startsWith('=') ? trimmed.slice(1) : trimmed;
  if (!expr.trim()) {
    return { ok: false, error: 'Fórmula vazia' };
  }

  const tokens = tokenize(expr);
  if (!Array.isArray(tokens)) {
    return { ok: false, error: tokens.error };
  }

  // Shunting-yard com suporte a +/- unário (ex.: `=-10+20`, `=5*(-2)`).
  const output: Token[] = [];
  const ops: Token[] = [];
  let prev: Token | null = null;
  for (const token of tokens) {
    if (token.type === 'num') {
      output.push(token);
    } else if (token.type === 'op') {
      const isUnary = !prev || prev.type === 'op' || prev.type === '(';
      if (isUnary) {
        if (token.op === '+') {
          // +unário é no-op (Excel aceita `=1++2`)
          prev = token;
          continue;
        }
        if (token.op === '-') {
          // -unário: associativo à direita, só empilha (não desempilha nada).
          ops.push({ type: 'op', op: 'u-' });
          prev = token;
          continue;
        }
        return { ok: false, error: 'Expressão inválida' };
      }
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.type === 'op' && PRECEDENCE[top.op] >= PRECEDENCE[token.op]) {
          output.push(ops.pop()!);
        } else {
          break;
        }
      }
      ops.push(token);
    } else if (token.type === '(') {
      ops.push(token);
    } else {
      // ')'
      let found = false;
      while (ops.length > 0) {
        const top = ops.pop()!;
        if (top.type === '(') {
          found = true;
          break;
        }
        output.push(top);
      }
      if (!found) {
        return { ok: false, error: 'Parêntese sem par' };
      }
    }
    prev = token;
  }
  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === '(') {
      return { ok: false, error: 'Parêntese sem par' };
    }
    output.push(top);
  }

  // Avaliação da RPN.
  const stack: number[] = [];
  for (const token of output) {
    if (token.type === 'num') {
      stack.push(token.value);
    } else if (token.type === 'op') {
      if (token.op === 'u-') {
        const a = stack.pop();
        if (a === undefined) {
          return { ok: false, error: 'Expressão inválida' };
        }
        stack.push(-a);
        continue;
      }
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) {
        return { ok: false, error: 'Expressão inválida' };
      }
      switch (token.op) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          if (b === 0) {
            return { ok: false, error: 'Divisão por zero' };
          }
          stack.push(a / b);
          break;
      }
    }
  }
  if (stack.length !== 1) {
    return { ok: false, error: 'Expressão inválida' };
  }
  const value = stack[0];
  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Resultado inválido' };
  }
  // Duas casas, como o resto da planilha (Decimal(15,2) no banco).
  return { ok: true, value: Math.round(value * 100) / 100 };
}
