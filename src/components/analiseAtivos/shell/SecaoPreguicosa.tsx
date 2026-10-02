'use client';

/**
 * Monta os filhos só quando a seção chega perto do viewport (IntersectionObserver, rootMargin
 * 400px) e mantém montados depois. Sem IntersectionObserver (SSR antigo/testes) monta direto.
 * Os blocos da fatia C buscam o próprio dado ao montar.
 */
import { useEffect, useRef, useState } from 'react';
import type { SecaoPreguicosaProps } from '@/types/analiseAtivosApi';

export default function SecaoPreguicosa({
  children,
  alturaMinima = 240,
  rootMargin = '400px',
  rotulo,
}: SecaoPreguicosaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (visivel) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisivel(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          obs.disconnect();
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visivel, rootMargin]);

  if (visivel) return <>{children}</>;
  return (
    <div
      ref={ref}
      aria-busy="true"
      aria-label={rotulo}
      style={{ minHeight: alturaMinima }}
      className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    />
  );
}
