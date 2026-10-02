/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura. Stub: banner fixo; a 0b faz o "Entendi" com localStorage por 30 dias e o link do Suporte.
 */
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BannerNovidadeProps } from '@/types/analiseAtivosApi';

export type { BannerNovidadeProps };

export default function BannerNovidade({ className }: BannerNovidadeProps) {
  const t = TEXTOS_TELA.banner;
  return (
    <div
      role="region"
      aria-label={t.rotuloRegiao}
      data-stub="BannerNovidade"
      className={`rounded-2xl border border-gray-200 bg-[#EDF2F8] px-4 py-3 text-sm text-[#314666] dark:border-gray-800 dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4] ${className ?? ''}`}
    >
      <b className="font-semibold">{t.titulo}</b> {t.texto}
    </div>
  );
}
