'use client';

/**
 * Banner do beta (fatia 0b; decisão 12): só dentro da área, dispensável com "Entendi". Dispensado,
 * não volta por 30 dias (localStorage, por navegador). A palavra "Suporte" do texto vira link para
 * o e-mail do suporte (canal para avisar número errado, no lugar do "reportar dado").
 * Antes de ler o localStorage (SSR/hidratação) não renderiza nada, para não piscar para quem já
 * dispensou. localStorage indisponível (aba privada, bloqueio) = mostra o banner.
 */
import { useEffect, useState } from 'react';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BannerNovidadeProps } from '@/types/analiseAtivosApi';

export type { BannerNovidadeProps };

export const CHAVE_BANNER_DISPENSADO = 'mf.analiseAtivos.bannerBetaDispensadoEm';
export const DIAS_BANNER_DISPENSADO = 30;
export const LINK_SUPORTE = 'mailto:suporte@appmyfinance.com.br';

const MS_DIA = 24 * 60 * 60 * 1000;

/** true se o banner foi dispensado há menos de 30 dias. */
export function bannerDispensadoRecente(agora: number = Date.now()): boolean {
  try {
    const bruto = window.localStorage.getItem(CHAVE_BANNER_DISPENSADO);
    if (!bruto) return false;
    const em = Number(bruto);
    if (!Number.isFinite(em)) return false;
    return agora - em < DIAS_BANNER_DISPENSADO * MS_DIA;
  } catch {
    return false;
  }
}

function TextoComSuporte({ texto }: { texto: string }) {
  const palavra = TEXTOS_TELA.comum.banner.suporte;
  const i = texto.lastIndexOf(palavra);
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <a
        href={LINK_SUPORTE}
        className={`font-medium underline underline-offset-2 ${COR_LINK.classes}`}
      >
        {palavra}
      </a>
      {texto.slice(i + palavra.length)}
    </>
  );
}

export default function BannerNovidade({ className }: BannerNovidadeProps) {
  const t = TEXTOS_TELA.banner;
  // null = ainda não leu o localStorage (SSR e primeiro render no cliente).
  const [visivel, setVisivel] = useState<boolean | null>(null);

  useEffect(() => {
    setVisivel(!bannerDispensadoRecente());
  }, []);

  if (!visivel) return null;

  const dispensar = () => {
    try {
      window.localStorage.setItem(CHAVE_BANNER_DISPENSADO, String(Date.now()));
    } catch {
      // sem localStorage: some só nesta visita
    }
    setVisivel(false);
  };

  return (
    <div
      role="region"
      aria-label={t.rotuloRegiao}
      data-banner-beta
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-gray-200 bg-[#EDF2F8] py-2 pr-2 pl-4 text-sm text-[#314666] dark:border-gray-800 dark:bg-[#396CAA]/15 dark:text-[#EAEAEA] ${className ?? ''}`}
    >
      <p className="min-w-[200px] flex-1 py-1">
        <b className="font-semibold">{t.titulo}</b> <TextoComSuporte texto={t.texto} />
      </p>
      <button
        type="button"
        onClick={dispensar}
        className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-[#314666] hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-[#0079F2] focus-visible:outline-none dark:text-[#EAEAEA] dark:hover:bg-white/10"
      >
        {t.dispensar}
      </button>
    </div>
  );
}
