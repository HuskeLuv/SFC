import type { IconeCategoria as ChaveIcone } from '@/lib/orcamento/catalogo';

/** Paths SVG (24×24, traço) do protótipo v.8 para as chaves de `catalogo.IconeCategoria`. */
const PATHS: Record<ChaveIcone, string> = {
  casa: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  carro: 'M5 16l1.5-5h11L19 16M4 16h16M7 16v2M17 16v2M8 11l.5-3h7l.5 3',
  saude: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  edu: 'M3 9l9-4 9 4-9 4zM7 11v4c0 1.5 2.5 3 5 3s5-1.5 5-3v-4',
  pet: 'M12 20c-3 0-4.5-1.5-4.5-3 0-1.5 2-3.5 4.5-3.5s4.5 2 4.5 3.5c0 1.5-1.5 3-4.5 3zM7.5 11a1.5 1.8 0 1 0 0-.1M16.5 11a1.5 1.8 0 1 0 0-.1M10 7a1.5 1.8 0 1 0 0-.1M14 7a1.5 1.8 0 1 0 0-.1',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  lazer: 'M8 3v7a2 2 0 0 0 4 0V3M10 10v11M16 3c-2 0-2 6-2 7a2 2 0 0 0 2 2v9',
  imp: 'M6 3h9l4 4v14H6zM9 15l6-6M9.5 9.5h.01M14.5 14.5h.01',
  dep: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-5-5.9',
  emp: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
  fin: 'M3 7h18v10H3zM3 11h18M7 15h3',
  plan: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  var: 'M4 7h4l8 10h4M4 17h4l2-2.5M14 9.5L16 7h4M18 5l2 2-2 2M18 15l2 2-2 2',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
};

/** Ícone da categoria (chave do catálogo; desconhecida → genérico `tag`). Decorativo. */
export default function IconeCategoria({
  icone,
  className = 'h-4 w-4',
}: {
  icone: string;
  className?: string;
}) {
  const d = PATHS[icone as ChaveIcone] ?? PATHS.tag;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}
