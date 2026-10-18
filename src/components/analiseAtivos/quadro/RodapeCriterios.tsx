/**
 * Rodapé do Quadro v2.4 (fatia B). Substitui o RodapeFormula (que a F remove).
 * - RodapeCriterios: nota fixa (§3.1) = o literal 'rodape-quadro' de TEXTOS_LITERAIS_OBRIGATORIOS,
 *   no nó com data-texto-legal (o textContent TEM de ser o literal exato; varrerDom confere). O
 *   disclaimer de desempenho vai em negrito DENTRO do mesmo nó (o textContent não muda).
 * - FrescorCotacoes: linha "Cotações: COTAHIST B3 de dd/mm/aaaa".
 * - FaixaFrescorAtrasado: cotação atrasada vira faixa com ícone + texto (não só cor).
 */
import {
  RODAPE_QUADRO,
  RODAPE_QUADRO_EUA,
  DISCLAIMER_DESEMPENHO,
} from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { FrescorCotacao } from '@/types/analiseAtivosApi';
import type { RodapeCriteriosProps } from '@/types/analiseAtivosCriterios';

export type { RodapeCriteriosProps };

const T = TEXTOS_TELA.quadro;

function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function IconeRelogio() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FaixaFrescorAtrasado({ frescor }: { frescor: FrescorCotacao | undefined }) {
  if (frescor?.status !== 'atrasado') return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-dashed border-[#98A2B3] px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
    >
      <IconeRelogio />
      <span>
        {T.frescorAtrasado}
        {frescor.data ? ` · ${formatarTexto(T.cotacoesDe, { data: dataBr(frescor.data) })}` : ''}
      </span>
    </div>
  );
}

export function FrescorCotacoes({ frescor }: { frescor: FrescorCotacao | undefined }) {
  if (!frescor?.data) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <IconeRelogio />
      {formatarTexto(T.cotacoesDe, { data: dataBr(frescor.data) })}
    </p>
  );
}

/**
 * Stocks e REITs (fatia C): `eua` troca o literal pelo 'rodape-quadro-eua' (10-K na SEC) e acrescenta
 * a regra do universo (QuadroResposta.universoDescricao), SEM nome de índice.
 */
export interface RodapeCriteriosEuaProps extends RodapeCriteriosProps {
  eua?: boolean;
  universoDescricao?: string;
}

export default function RodapeCriterios({
  className = '',
  eua = false,
  universoDescricao,
}: RodapeCriteriosEuaProps) {
  const literal = eua ? RODAPE_QUADRO_EUA : RODAPE_QUADRO;
  const texto = literal.texto;
  const i = texto.lastIndexOf(DISCLAIMER_DESEMPENHO.texto);
  const paragrafo = (
    <p
      data-texto-legal={literal.id}
      className={`text-[12px] leading-relaxed text-gray-500 dark:text-gray-400 ${className}`}
    >
      {i >= 0 ? (
        <>
          {texto.slice(0, i)}
          <b className="font-semibold text-gray-700 dark:text-gray-200">
            {texto.slice(i, i + DISCLAIMER_DESEMPENHO.texto.length)}
          </b>
          {texto.slice(i + DISCLAIMER_DESEMPENHO.texto.length)}
        </>
      ) : (
        texto
      )}
    </p>
  );
  if (!eua) return paragrafo;
  return (
    <>
      {paragrafo}
      {universoDescricao ? (
        <p
          data-universo-eua=""
          className="text-[12px] leading-relaxed text-gray-500 dark:text-gray-400"
        >
          {universoDescricao}
        </p>
      ) : null}
    </>
  );
}
