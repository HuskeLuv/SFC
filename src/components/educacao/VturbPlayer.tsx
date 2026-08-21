'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Renderiza o snippet de embed da VTurb (copiado do painel: Meus Vídeos →
 * Embed → código JS). O snippet vem do banco (CourseLesson.vturbEmbed),
 * gravado só por admin/seed — nunca por input de usuário final.
 *
 * `innerHTML` não executa <script>, então os scripts do snippet são
 * recriados manualmente como elementos reais. O CSP do middleware libera
 * https://*.converteai.net (domínio da VTurb) para script/mídia.
 */
export default function VturbPlayer({ embed }: { embed: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';
    const template = document.createElement('template');
    template.innerHTML = embed;

    const scripts = Array.from(template.content.querySelectorAll('script'));
    scripts.forEach((s) => s.remove());
    container.appendChild(template.content);

    const created = scripts.map((original) => {
      const script = document.createElement('script');
      Array.from(original.attributes).forEach((attr) => script.setAttribute(attr.name, attr.value));
      script.text = original.text;
      container.appendChild(script);
      return script;
    });

    return () => {
      created.forEach((s) => s.remove());
      container.innerHTML = '';
    };
  }, [embed]);

  return <div ref={containerRef} className="w-full" data-testid="vturb-player" />;
}
