import type { BlocoIr } from '@/types/relatorioFinanceiro';
import { useFormato } from '../FormatoProvider';

/**
 * Item dos Destaques do Resumo (seção 1) sobre o PGBL, só no Advanced: um <li> para a lista
 * .insights. Some com o ano encerrado. Entra por next/dynamic quando o plano é adv (os textos não
 * podem ir para os chunks do Basic/Pro). Export default (next/dynamic).
 */
export default function DestaquePgbl({ ir }: { ir: BlocoIr }) {
  const { fR0 } = useFormato();
  if (ir.encerrado) return null;
  if (ir.faltaNoLimite <= 0) {
    return <li>PGBL: você já usou todo o limite de 12% em {ir.ano}.</li>;
  }
  return (
    <li>
      PGBL: faltam {fR0(ir.faltaNoLimite)} para usar todo o limite de 12% em {ir.ano}.
      {ir.economiaFalta > 0
        ? ` Um aporte até 31/12 reduz o IR em cerca de ${fR0(ir.economiaFalta)}.`
        : ''}
    </li>
  );
}
