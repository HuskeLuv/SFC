'use client';

import React, { type RefObject } from 'react';

/**
 * Barra de teclas de fórmula do sheet da célula (PWA fase 2): o teclado decimal do celular não tem
 * "=" nem "+". Sete teclas de 44px: = + − × ÷ ( ).
 *
 * - "=" só entra na posição 0 (se o texto já é fórmula, não faz nada);
 * - as outras teclas inserem no cursor e, se o texto ainda não é fórmula, põem o "=" na frente;
 * - a tecla "−" MOSTRA o sinal de menos, mas INSERE o hífen ASCII "-" (o `formulaParser` não aceita
 *   U+2212); × e ÷ inserem os próprios caracteres, que o parser aceita.
 * - `pointerdown.preventDefault` mantém o foco no campo (o teclado não fecha).
 */

export interface FormulaKey {
  label: string;
  insert: string;
  name: string;
}

export const FORMULA_KEYS: readonly FormulaKey[] = [
  { label: '=', insert: '=', name: 'Começar fórmula' },
  { label: '+', insert: '+', name: 'Mais' },
  { label: '−', insert: '-', name: 'Menos' },
  { label: '×', insert: '×', name: 'Vezes' },
  { label: '÷', insert: '÷', name: 'Dividido' },
  { label: '(', insert: '(', name: 'Abre parêntese' },
  { label: ')', insert: ')', name: 'Fecha parêntese' },
];

/**
 * Texto e cursor depois de tocar a tecla. `selStart`/`selEnd` = seleção atual (null = fim).
 */
export function applyFormulaKey(
  text: string,
  insert: string,
  selStart: number | null,
  selEnd: number | null,
): { text: string; caret: number } {
  const isFormulaText = text.trimStart().startsWith('=');
  if (insert === '=') {
    if (isFormulaText) return { text, caret: selEnd ?? text.length };
    const next = `=${text.trimStart()}`;
    return { text: next, caret: next.length };
  }
  let base = text;
  let start = selStart ?? base.length;
  let end = selEnd ?? start;
  if (!isFormulaText) {
    const trimmed = base.trimStart();
    const shift = 1 - (base.length - trimmed.length);
    base = `=${trimmed}`;
    start = Math.max(1, start + shift);
    end = Math.max(1, end + shift);
  }
  const next = base.slice(0, start) + insert + base.slice(end);
  return { text: next, caret: start + insert.length };
}

export interface FormulaKeyBarProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function FormulaKeyBar({ inputRef, value, onChange, disabled }: FormulaKeyBarProps) {
  const press = (key: FormulaKey) => {
    const input = inputRef.current;
    const focused = !!input && typeof document !== 'undefined' && document.activeElement === input;
    const { text, caret } = applyFormulaKey(
      value,
      key.insert,
      focused ? input.selectionStart : null,
      focused ? input.selectionEnd : null,
    );
    onChange(text);
    if (input) {
      input.focus();
      requestAnimationFrame(() => {
        try {
          input.setSelectionRange(caret, caret);
        } catch {
          // campo sem suporte a seleção — o cursor fica onde o navegador deixar
        }
      });
    }
  };

  return (
    <div role="group" aria-label="Teclas de fórmula" className="grid grid-cols-7 gap-1.5">
      {FORMULA_KEYS.map((key, i) => (
        <button
          key={key.label}
          type="button"
          aria-label={key.name}
          disabled={disabled}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => press(key)}
          className={
            i === 0
              ? 'min-h-11 rounded-[10px] bg-mf-tranquilidade/20 font-mono text-[17px] font-semibold text-mf-seguranca outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2]/40 disabled:opacity-50 dark:bg-mf-tranquilidade/20 dark:text-mf-escolha'
              : 'min-h-11 rounded-[10px] border border-gray-200 bg-white font-mono text-[17px] text-gray-800 outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2]/40 active:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:active:bg-white/5'
          }
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}

export default FormulaKeyBar;
