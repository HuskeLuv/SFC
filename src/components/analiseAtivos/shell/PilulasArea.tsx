'use client';

/**
 * Pílulas "Quadro | Comparador" do topo da área (Bloco D, fatia D). Só aparecem com
 * config.recursos.comparador (decisão 15); sem o recurso, não renderizam nada (a casca fica igual à
 * de hoje). Links com aria-current="page" na página atual e 44px em todos os tamanhos (decisão 13).
 */
import Link from 'next/link';
import { useAnaliseAtivosConfig } from '@/hooks/useAnaliseAtivos';
import { ROTAS_BLOCO_D } from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import type { PilulasAreaProps } from '@/types/analiseAtivosBlocoD';

const T = TEXTOS_ENTRADAS_COMPARADOR.pilulas;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

const ITENS = [
  { id: 'quadro', href: '/analise-ativos', rotulo: T.quadro },
  { id: 'comparador', href: ROTAS_BLOCO_D.comparador, rotulo: T.comparador },
] as const;

export default function PilulasArea({ ativa, className = '' }: PilulasAreaProps) {
  const config = useAnaliseAtivosConfig();
  if (config.data?.recursos?.comparador !== true) return null;
  return (
    <nav
      aria-label={T.rotulo}
      data-pilulas-area={ativa}
      className={`inline-flex w-fit gap-0.5 rounded-xl bg-gray-100 p-[3px] dark:bg-white/[0.06] ${className}`}
    >
      {ITENS.map((item) => {
        const atual = item.id === ativa;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={atual ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 text-sm font-semibold ${FOCO} ${
              atual
                ? 'bg-white text-gray-900 shadow-sm dark:bg-[#26262A] dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
