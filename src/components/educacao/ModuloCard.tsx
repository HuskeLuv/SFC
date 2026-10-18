/**
 * Card de módulo da trilha da Educação (capa 16:9 + badge + progresso), extraído do EducacaoRoot
 * para ser reusado no card "Aprenda a analisar" da página do ativo. Markup e comportamento da
 * Educação idênticos; `descricao` (substitui a do módulo) e `className` (somada ao Link) são
 * opcionais.
 */
import Link from 'next/link';
import type { ModuloTrilha } from '@/hooks/useEducacao';
import { formatDuracaoCurta } from '@/utils/educacaoTrilha';
import { MYFINANCE_BRAND } from '@/constants/brandColors';

const OK_GREEN = '#1d9e6f';

export const PlayIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

const CheckIcon = () => (
  <svg
    viewBox="0 0 16 16"
    className="h-3 w-3"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

export const numeroModulo = (idx: number) => String(idx + 1).padStart(2, '0');

export interface ModuloCardProps {
  modulo: ModuloTrilha;
  index: number;
  slug: string;
  bloqueado: boolean;
  /** substitui modulo.description no parágrafo */
  descricao?: string;
  /** somada às classes do Link */
  className?: string;
}

/** Card de módulo da trilha (capa 16:9 + badge + progresso). */
export default function ModuloCard({
  modulo,
  index,
  slug,
  bloqueado,
  descricao,
  className,
}: ModuloCardProps) {
  const texto = descricao ?? modulo.description;
  const concluido = modulo.status === 'concluido';
  const emAndamento = modulo.status === 'em_andamento';
  const duracao = formatDuracaoCurta(modulo.duracaoSegundos);
  const meta = [`${modulo.totalAulas} ${modulo.totalAulas === 1 ? 'aula' : 'aulas'}`, duracao]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={`/educacao/${slug}?modulo=${modulo.id}`}
      className={`group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 transition-all hover:-translate-y-1 hover:shadow-[0_22px_44px_-18px_rgba(28,42,68,.35)] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90${className ? ` ${className}` : ''}`}
    >
      <div className="relative aspect-video overflow-hidden">
        {modulo.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={modulo.coverUrl}
            alt={`Capa do módulo ${numeroModulo(index)} — ${modulo.title}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div
            className="flex h-full w-full flex-col justify-end p-5 text-white"
            style={{
              background: `linear-gradient(118deg, #1c2a44 0%, ${MYFINANCE_BRAND.seguranca} 52%, ${MYFINANCE_BRAND.patrimonio} 100%)`,
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-[.2em] text-white/70">
              Módulo {numeroModulo(index)}
            </span>
            <span className="mt-1 text-xl font-bold">{modulo.title}</span>
          </div>
        )}
        {(concluido || emAndamento) && (
          <span
            className="absolute right-3 top-3 z-[2] inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: concluido ? OK_GREEN : MYFINANCE_BRAND.outside }}
          >
            {concluido && <CheckIcon />}
            {concluido ? 'Concluído' : 'Em andamento'}
          </span>
        )}
        {bloqueado && (
          <span
            className="absolute left-3 top-3 z-[2] rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: MYFINANCE_BRAND.seguranca }}
          >
            🔒
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-[rgba(20,32,54,.34)] opacity-0 transition-opacity group-hover:opacity-100">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_26px_rgba(10,20,40,.45)]"
            style={{ backgroundColor: 'rgba(0,121,242,.92)' }}
          >
            <PlayIcon className="h-7 w-7" />
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <h3 className="text-lg font-bold">{modulo.title}</h3>
        {texto && (
          <p className="mt-1.5 flex-1 text-[13.5px] font-light leading-relaxed text-gray-500 dark:text-gray-400">
            {texto}
          </p>
        )}
        <div className="mt-4 h-[5px] rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full"
            style={{
              width: `${modulo.progresso}%`,
              background: concluido
                ? OK_GREEN
                : `linear-gradient(90deg, ${MYFINANCE_BRAND.outside}, ${MYFINANCE_BRAND.tranquilidade})`,
            }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>{meta}</span>
          <span
            className="font-bold"
            style={{
              color: concluido ? OK_GREEN : emAndamento ? MYFINANCE_BRAND.outside : undefined,
            }}
          >
            {modulo.status === 'nao_iniciado' ? 'Começar' : `${modulo.progresso}%`}
          </span>
        </div>
      </div>
    </Link>
  );
}
