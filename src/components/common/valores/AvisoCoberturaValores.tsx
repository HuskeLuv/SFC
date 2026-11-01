'use client';

import React from 'react';
import { useValoresOcultos } from '@/context/ValoresOcultosContext';
import { IconeOlhoValores } from './OlhoValoresButton';

/**
 * Faixa das telas ainda não cobertas (decisão 9): com o olho fechado numa rota fora de
 * rotasCobertas.ts, avisa que ali os valores continuam aparecendo — o olho não promete o que a
 * tela não cumpre. Fica no topo do [data-mf-content]; sem botão de fechar (o olho continua no
 * cabeçalho/rodapé para abrir de novo). Some sozinha quando a tela entra numa fase.
 */
export function AvisoCoberturaValores() {
  const { habilitado, ocultos, rotaCoberta } = useValoresOcultos();
  if (!habilitado || !ocultos || rotaCoberta) return null;
  return (
    <div
      role="note"
      data-mf-aviso-valores=""
      className="mb-4 flex min-h-10 items-center gap-2 rounded-xl bg-[#EDF2F8] px-3 py-2 text-[13px] leading-snug font-medium text-mf-seguranca dark:bg-mf-tranquilidade/14 dark:text-mf-escolha"
    >
      <IconeOlhoValores cortado size={18} />
      <span>Nesta tela os valores ainda aparecem.</span>
    </div>
  );
}

export default AvisoCoberturaValores;
