/** Utilitários puros de CNPJ para o catálogo de instituições (ClickUp 86e2xqh69). */

/** Só os dígitos. */
export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/**
 * Raiz (8 primeiros dígitos) do CNPJ. Aceita a raiz pura, o CNPJ completo (formatado ou não) e
 * CNPJ que perdeu zeros à esquerda (9 a 13 dígitos). null quando não dá para saber.
 */
export function cnpjRaiz(cnpj: string | null | undefined): string | null {
  const d = somenteDigitos(cnpj);
  if (d.length === 8) return d;
  if (d.length > 8 && d.length <= 14) return d.padStart(14, '0').slice(0, 8);
  return null;
}

function digitoModulo11(base: string): number {
  const pesos =
    base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = base.split('').reduce((acc, ch, i) => acc + Number(ch) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ da matriz (filial 0001) a partir da raiz, com os dígitos verificadores (módulo 11). */
export function cnpjMatriz(raiz: string): string {
  const r = somenteDigitos(raiz);
  if (r.length !== 8) throw new Error(`Raiz de CNPJ inválida: "${raiz}"`);
  const base = `${r}0001`;
  const dv1 = digitoModulo11(base);
  const dv2 = digitoModulo11(`${base}${dv1}`);
  return `${base}${dv1}${dv2}`;
}

/** '33264668000103' → '33.264.668/0001-03'; '33264668' → '33.264.668'. Outro tamanho volta igual. */
export function formatarCnpj(cnpj: string): string {
  const d = somenteDigitos(cnpj);
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}`;
  return cnpj;
}

/**
 * Rótulo do CNPJ para a tela: 'CNPJ 33.264.668/0001-03'. Quando o CNPJ foi calculado a partir da
 * raiz (import do Bacen), mostra só a raiz: 'CNPJ 33.264.668'. null quando não há CNPJ.
 */
export function rotuloCnpj(inst: {
  cnpj?: string | null;
  cnpjCalculado?: boolean | null;
}): string | null {
  const d = somenteDigitos(inst.cnpj);
  if (!d) return null;
  if (inst.cnpjCalculado) {
    const raiz = cnpjRaiz(d);
    return raiz ? `CNPJ ${formatarCnpj(raiz)}` : null;
  }
  const completo = d.length > 8 && d.length < 14 ? d.padStart(14, '0') : d;
  return `CNPJ ${formatarCnpj(completo)}`;
}
