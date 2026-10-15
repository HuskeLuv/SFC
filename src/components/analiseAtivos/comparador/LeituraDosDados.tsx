'use client';

/**
 * LeituraDosDados (v2.4, fatia D) — fecha o Comparador com SÓ as contagens factuais, na ordem dos
 * slots ("WEGE3: 5 de 6 critérios em 5 anos · BBAS3: 2 de 3 critérios em 5 anos"), e o texto
 * literal 'leitura-dos-dados' (spec §3.3; registrado em TEXTOS_LITERAIS_OBRIGATORIOS, com
 * data-texto-legal — o nó tem EXATAMENTE o literal). Sem ordenar, somar ou apontar ativo.
 * `acao` = o "Copiar link da comparação" (opcional).
 */
import type { ReactNode } from 'react';
import { textoContagens } from '@/services/analiseAtivos/regras/comparador/resumo';
import { LEITURA_DOS_DADOS } from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import type { LeituraDosDadosProps } from '@/types/analiseAtivosCriterios';

export type { LeituraDosDadosProps };

export type LeituraDosDadosPropsD = LeituraDosDadosProps & { acao?: ReactNode };

export default function LeituraDosDados({
  leitura,
  acao = null,
  className = '',
}: LeituraDosDadosPropsD) {
  return (
    <section
      aria-labelledby="comparador-leitura"
      data-leitura-dos-dados=""
      className={`flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#EDF2F8] px-[18px] py-4 dark:bg-[#396CAA]/15 ${className}`}
    >
      <div className="min-w-0 flex-1 basis-[420px]">
        <h2
          id="comparador-leitura"
          className="m-0 text-[11.5px] font-semibold tracking-[0.1em] text-gray-600 uppercase dark:text-gray-300"
        >
          {TEXTOS_COMPARADOR.leitura.titulo}
        </h2>
        <p className="mt-1 mb-0 text-[15px] font-semibold text-gray-800 tabular-nums dark:text-white/90">
          {textoContagens(leitura)}
        </p>
        <p
          data-texto-legal={LEITURA_DOS_DADOS.id}
          className="mt-1.5 mb-0 max-w-[75ch] text-[13px] leading-normal text-gray-700 dark:text-gray-300"
        >
          {/* sempre o literal registrado (o `texto` da API é o mesmo; a tela não o recompõe) */}
          {LEITURA_DOS_DADOS.texto}
        </p>
      </div>
      {acao}
    </section>
  );
}
