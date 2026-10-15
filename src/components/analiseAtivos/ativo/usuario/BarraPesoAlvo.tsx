/**
 * Barra "posição × alvo" do card "Na sua carteira": a posição preenche a barra e o alvo planejado é
 * um traço vertical. v2.4 (fatia C1): posição e alvo na MESMA base (% da aba, rec. 1); o texto ao
 * lado fala em DESVIO (TEXTOS_CRITERIOS.desvio), nunca em "faltam". Elemento NÃO textual em
 * patrimonio/tranquilidade; textos em cinza do app. role="img" com o rótulo completo para leitor de
 * tela. Textos de textosAcoesCarteira.
 */
import type { ReactNode } from 'react';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_ACOES_CARTEIRA } from '@/services/analiseAtivos/textosAcoesCarteira';
import { formatNumber } from '@/utils/format';

export interface BarraPesoAlvoProps {
  /** ex.: 'posição atual 20,4% de Ações' */
  rotulo: string;
  /** posição em pontos percentuais da base (20,4 = 20,4%) */
  valor: number;
  /** alvo em p.p. da MESMA base; null = sem alvo planejado */
  referencia: number | null;
  /** ex.: 'alvo planejado por você: 25,0% de Ações · desvio −4,6 p.p. (R$ 1.349)' */
  rotuloReferencia: string;
  /** ação ao lado do texto do alvo (ex.: botão "planejar na carteira" quando não há alvo) */
  acaoReferencia?: ReactNode;
  /** linha de apoio embaixo (ex.: equivalência informativa em % da carteira) */
  status?: string;
  /** rótulo acessível completo (padrão: rótulo, valor e referência) */
  ariaLabel?: string;
}

export default function BarraPesoAlvo({
  rotulo,
  valor,
  referencia,
  rotuloReferencia,
  status,
  ariaLabel,
  acaoReferencia,
}: BarraPesoAlvoProps) {
  const ref = referencia ?? 0;
  // Com alvo: escala folgada em torno de posição e alvo. Sem alvo: 0–100%.
  const max = referencia === null ? 100 : Math.max(valor, ref, 0.0001) * 1.3;
  const largura = Math.min(100, Math.max(0, (valor / max) * 100));
  const posRef = Math.min(100, Math.max(0, (ref / max) * 100));
  const valorTxt = `${formatNumber(valor, 1)}%`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-barra-peso="">
      <div
        role="img"
        aria-label={
          ariaLabel ??
          formatarTexto(TEXTOS_ACOES_CARTEIRA.barraPeso.aria, {
            rotulo,
            valor: valorTxt,
            referencia: rotuloReferencia,
          })
        }
        className="relative mt-1 h-2 rounded-full bg-gray-100 dark:bg-white/10"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-full bg-[#396CAA] dark:bg-[#6E9DC4]"
          style={{ width: `${largura}%` }}
        />
        {referencia !== null ? (
          <span
            aria-hidden="true"
            data-marcador-referencia=""
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-sm bg-gray-800 dark:bg-white/90"
            style={{ left: `${posRef}%` }}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap justify-between gap-x-2.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{rotulo}</span>
        <span>
          {rotuloReferencia}
          {acaoReferencia ? <> · {acaoReferencia}</> : null}
        </span>
      </div>
      {status ? <span className="text-xs text-gray-500 dark:text-gray-400">{status}</span> : null}
    </div>
  );
}
