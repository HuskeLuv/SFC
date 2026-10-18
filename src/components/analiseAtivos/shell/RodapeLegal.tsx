/**
 * Rodapé legal da área — v2.4 (fatia B): aviso legal ÚNICO, adaptado da §9 à D5 (sem ranking,
 * notas e teses públicas), PROVISÓRIO para o jurídico (rec. 6). No fim de todas as telas da área,
 * inclusive na de beta fechado. O título "Aviso importante." fica FORA do nó do literal; o texto e
 * o selo de provisório ficam cada um no seu nó com data-texto-legal (o textContent TEM de ser o
 * literal exato de TEXTOS_LITERAIS_OBRIGATORIOS; varrerDom confere). Linha de cima + texto pequeno
 * em cinza (contraste AA nos dois temas); selo em itálico apagado. Stocks e REITs: o aviso EUA
 * (aviso-legal-eua, fonte SEC) no lugar do v2 (CVM), com o mesmo selo de provisório.
 */
import {
  RODAPE_LEGAL_V2_SELO,
  rodapeLegalDoMercado,
} from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';
import type { RodapeLegalProps } from '@/types/analiseAtivosApi';

export type { RodapeLegalProps };

export default function RodapeLegal({ className, mercado = 'br' }: RodapeLegalProps) {
  const aviso = rodapeLegalDoMercado(mercado);
  return (
    <footer
      data-rodape-legal
      className={`border-t border-gray-200 pt-3.5 text-xs leading-relaxed text-gray-500 dark:border-gray-800 dark:text-gray-400 ${className ?? ''}`}
    >
      <p>
        <b className="font-semibold text-gray-700 dark:text-gray-200">
          {TEXTOS_QUADRO.legal.avisoTitulo}
        </b>{' '}
        <span data-texto-legal={aviso.id}>{aviso.texto}</span>
      </p>
      <p data-texto-legal={RODAPE_LEGAL_V2_SELO.id} className="mt-1.5 italic">
        {RODAPE_LEGAL_V2_SELO.texto}
      </p>
    </footer>
  );
}
