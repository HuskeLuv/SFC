/**
 * Status do salvamento automático da tese (fatia D): anunciado em aria-live="polite". O erro tem
 * role="alert" e o botão "Tentar de novo"; o texto digitado nunca é descartado.
 */
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';

export type EstadoSalvamento = 'ocioso' | 'pendente' | 'salvando' | 'salvo' | 'erro';

export interface StatusSalvamentoProps {
  estado: EstadoSalvamento;
  /** ISO do último salvamento (para 'Salvo automaticamente às 14:32') */
  salvoEm?: string | null;
  onTentarNovamente?: () => void;
  id?: string;
}

export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function StatusSalvamento({
  estado,
  salvoEm,
  onTentarNovamente,
  id,
}: StatusSalvamentoProps) {
  const t = TEXTOS_TELA.tese;
  let texto = '';
  if (estado === 'salvando') texto = t.salvando;
  else if (estado === 'pendente') texto = t.pendente;
  else if (estado === 'salvo' && salvoEm) {
    texto = formatarTexto(t.salvoAutomatico, { hora: horaCurta(salvoEm) });
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span
        id={id}
        aria-live="polite"
        data-estado-salvamento={estado}
        className="text-[13px] text-gray-500 dark:text-gray-400"
      >
        {texto}
      </span>
      {estado === 'erro' ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#D92D20]/30 bg-[#D92D20]/5 px-3 py-2 text-[13px] text-[#D92D20] dark:border-[#F97066]/30 dark:bg-[#F97066]/10 dark:text-[#F97066]"
        >
          <span>{t.erro}</span>
          {onTentarNovamente ? (
            <button
              type="button"
              onClick={onTentarNovamente}
              className={`inline-flex min-h-11 items-center font-semibold underline underline-offset-2 ${COR_LINK.classes}`}
            >
              {t.tentarNovamente}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
