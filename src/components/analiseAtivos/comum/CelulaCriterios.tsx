'use client';

/**
 * CelulaCriterios (v2.4, fatia 0) — célula "Critérios" do Quadro (B), dos cartões do celular (B) e
 * dos pares (C2): k quadradinhos NEUTROS + 'n de k'.
 *  - cheio (gray-700 / gray-300) = atende; vazio com contorno = não atende OU sem dado;
 *    tracejado = não se aplica (só se os params religarem o D4). Nunca verde/vermelho (§9, D1).
 *  - v2.5: marca com `obs` (lucro sem o descontado na fonte, dados incompletos) acrescenta ao
 *    tooltip a frase de textosCriterios.obs, uma vez por observação.
 *  - é um <button> com min-h-11 (44 px, também no computador), aria-label completo
 *    ('Critérios em 5 anos: 3 de 6 atendidos. Ver detalhes.') e tooltip em hover (mouse), foco e
 *    toque (o clique abre). NÃO abre a linha: clique e Enter/Espaço param a propagação.
 *  - Esc ou clique fora fecham. Sem avaliação (null) = '—' com aria-label próprio, sem botão.
 * `rotulos` (id → rótulo) vem de QuadroResposta.definicoes; sem ele, o tooltip usa o id.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import MarcaCriterio from '@/components/analiseAtivos/comum/MarcaCriterio';
import { TEXTOS_CRITERIOS, formatarTexto } from '@/services/analiseAtivos/textosCriterios';
import type {
  CelulaCriteriosProps,
  EstadoCriterio,
  ObsCriterio,
} from '@/types/analiseAtivosCriterios';

export type { CelulaCriteriosProps };

const T = TEXTOS_CRITERIOS.celula;

const QUADRADO: Record<EstadoCriterio, string> = {
  atende: 'bg-gray-700 dark:bg-gray-300',
  nao_atende: 'border border-gray-500 dark:border-gray-400',
  sem_dado: 'border border-gray-500 dark:border-gray-400',
  nao_se_aplica: 'border border-dashed border-gray-400 dark:border-gray-500',
};

export default function CelulaCriterios({
  criterios,
  ticker,
  rotulos,
  observacaoPerfil,
  className = '',
}: CelulaCriteriosProps) {
  const [aberto, setAberto] = useState(false);
  const idTooltip = useId();
  const raiz = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);

  if (!criterios) {
    return (
      <span
        className={`inline-flex min-h-11 items-center text-gray-400 dark:text-gray-500 ${className}`}
        aria-label={formatarTexto(T.ariaSemAvaliacao, { ticker })}
        data-celula-criterios="sem_avaliacao"
      >
        <span aria-hidden="true">—</span>
      </span>
    );
  }

  const { n, de, janela, marcas } = criterios;
  const aria = formatarTexto(T.aria, { anos: janela, n, total: de });
  const observacoes = [...new Set(marcas.flatMap((m) => m.obs ?? []))] as ObsCriterio[];

  const aoClicar = (e: MouseEvent<HTMLButtonElement>) => {
    // abre (toque); fecha com Esc, clique fora ou saída do foco. Não abre a linha.
    e.stopPropagation();
    e.preventDefault();
    setAberto(true);
  };
  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      if (aberto) e.stopPropagation();
      setAberto(false);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  };

  return (
    <span
      ref={raiz}
      className={`relative inline-flex ${className}`}
      data-celula-criterios={`${n}/${de}`}
    >
      <button
        type="button"
        aria-label={aria}
        aria-expanded={aberto}
        aria-describedby={aberto ? idTooltip : undefined}
        onClick={aoClicar}
        onKeyDown={aoTeclar}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setAberto(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setAberto(false);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]"
      >
        <span aria-hidden="true" className="inline-flex items-center gap-[3px]">
          {marcas.map((m) => (
            <span
              key={m.id}
              data-quadrado={m.estado}
              className={`inline-block h-2.5 w-2.5 rounded-[2px] ${QUADRADO[m.estado]}`}
            />
          ))}
        </span>
        <span
          aria-hidden="true"
          className="text-[12.5px] whitespace-nowrap text-gray-700 tabular-nums dark:text-gray-300"
        >
          {formatarTexto(TEXTOS_CRITERIOS.contador.curto, { n, total: de })}
        </span>
      </button>
      {aberto ? (
        <span
          role="tooltip"
          id={idTooltip}
          className="absolute top-full left-0 z-30 mt-1 block w-72 max-w-[calc(100vw-32px)] rounded-lg border border-gray-200 bg-white p-3 text-left text-[12.5px] leading-snug whitespace-normal text-gray-700 shadow-lg dark:border-[#2E3440] dark:bg-[#1F1F22] dark:text-gray-300"
        >
          <span className="mb-1.5 block font-semibold text-gray-800 dark:text-white/90">
            {formatarTexto(T.tituloTooltip, { anos: janela })}
          </span>
          <span className="flex flex-col gap-1.5">
            {marcas.map((m) => (
              <span key={m.id} className="flex items-start gap-2">
                <MarcaCriterio estado={m.estado} tamanho="sm" decorativa className="mt-0.5" />
                <span>
                  {formatarTexto(T.linhaTooltip, {
                    rotulo: rotulos?.[m.id] ?? m.id,
                    // 'sem dado' já vem no fato: aqui só 'não atende'
                    estado:
                      TEXTOS_CRITERIOS.estados[m.estado === 'sem_dado' ? 'nao_atende' : m.estado],
                    fato: m.fato,
                  })}
                </span>
              </span>
            ))}
          </span>
          {observacoes.map((o) => (
            <span
              key={o}
              data-obs-criterio={o}
              className="mt-1.5 block text-gray-500 dark:text-gray-400"
            >
              {TEXTOS_CRITERIOS.obs[o]}
            </span>
          ))}
          {observacaoPerfil ? (
            <span className="mt-1.5 block text-gray-500 dark:text-gray-400">
              {observacaoPerfil}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
