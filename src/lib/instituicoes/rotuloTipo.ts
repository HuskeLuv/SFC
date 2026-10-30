/** Rótulo curto do tipo da instituição (Tcb do Bacen) para a tela (ClickUp 86e2xqh69). */
export function rotuloTipoInstituicao(tipoBacen: string | null | undefined): string | null {
  switch (tipoBacen?.trim().toUpperCase()) {
    case 'B1':
    case 'B2':
    case 'B4':
      return 'Banco';
    case 'N1':
      return 'Financeira';
    case 'B3S':
    case 'B3C':
      return 'Cooperativa';
    case 'N2':
      return 'Corretora';
    case 'N4':
      return 'Instituição de pagamento';
    default:
      return null;
  }
}
