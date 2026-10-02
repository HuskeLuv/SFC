/**
 * Selos de estado (fatia 0b), sempre com texto e forma própria (nunca só cor):
 * - planejado, data_estimada, sem_negociacao_recente: borda TRACEJADA (algo ainda não firme);
 * - na_carteira: fundo azul suave (patrimonio a 10%) com texto seguranca;
 * - proventos_em_conferencia: fundo cinza com borda tracejada;
 * - criterios_provisorios, baixa_liquidez: contorno cinza.
 * Texto padrão em textosTela.selosEstado; `texto` substitui (ex.: 'Planejado · 5%').
 */
import { textoSeloEstado } from '@/services/analiseAtivos/textosTela';
import type { SeloEstadoProps, TipoSeloEstado } from '@/types/analiseAtivosApi';

export type { SeloEstadoProps };

const TRACEJADO =
  'border-dashed border-gray-400 text-gray-700 dark:border-gray-500 dark:text-gray-300';
const CONTORNO =
  'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-transparent dark:text-gray-300';

const ESTILO: Record<TipoSeloEstado, string> = {
  planejado: TRACEJADO,
  data_estimada: TRACEJADO,
  sem_negociacao_recente: TRACEJADO,
  na_carteira:
    'border-transparent bg-[#EDF2F8] text-[#314666] dark:bg-[#396CAA]/20 dark:text-[#EAEAEA]',
  proventos_em_conferencia: `${TRACEJADO} bg-gray-100 dark:bg-white/5`,
  criterios_provisorios: CONTORNO,
  baixa_liquidez: CONTORNO,
};

export default function SeloEstado({ tipo, texto, className }: SeloEstadoProps) {
  return (
    <span
      data-selo={tipo}
      className={`inline-flex items-center rounded-full border px-2 py-px text-[11.5px] leading-[18px] font-medium whitespace-nowrap ${ESTILO[tipo]} ${className ?? ''}`}
    >
      {texto ?? textoSeloEstado(tipo)}
    </span>
  );
}
