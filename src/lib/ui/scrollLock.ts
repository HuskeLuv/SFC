/**
 * Trava a rolagem do body enquanto houver ao menos um overlay aberto.
 *
 * Mantém um contador em módulo: o primeiro lock guarda o `overflow` anterior do body e aplica
 * `hidden`; o último release restaura o valor guardado. Cada release é idempotente.
 */
let lockCount = 0;
let previousOverflow = '';

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}
