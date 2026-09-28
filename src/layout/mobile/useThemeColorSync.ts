'use client';

import { useEffect } from 'react';

const THEME_COLOR_DARK = '#18181b';
const THEME_COLOR_LIGHT = '#FFFFFF';

/**
 * Mantém a cor da barra do navegador/app instalado (meta theme-color) igual ao tema escolhido
 * no app (classe `dark` no <html>), e não só à preferência do sistema.
 */
export function useThemeColorSync(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;

    const apply = () => {
      const color = html.classList.contains('dark') ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
      document
        .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
        .forEach((meta) => meta.setAttribute('content', color));
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
}
