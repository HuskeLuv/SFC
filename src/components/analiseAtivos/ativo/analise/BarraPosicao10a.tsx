/**
 * Barra de posição de um múltiplo nos anos fiscais fechados (fatia C): trilho, traço da média,
 * marcador do valor atual (16px, outside — elemento não textual) e mín/média/máx rotulados.
 * Sem verde/vermelho: a barra só descreve a posição. role="meter" com aria-valuetext completo
 * (mín, média, máx, atual e a frase de status). Barra oculta = só o texto do motivo.
 * Bloco C: ano do histórico em conferência (já fora dos números da API) aparece como um traço
 * tracejado + '<ano> em conferência: fora da média'.
 */
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { BarraValuation, FormatoAnalise } from '@/types/analiseAtivosApi';

const TV = TEXTOS_TELA.analise.valuation;

export interface BarraPosicao10aProps {
  barra: BarraValuation;
  /** valor atual (ok); null = sem marcador */
  atual: number | null;
  formato: FormatoAnalise;
  rotulo: string;
  /** bloco C: anos do histórico em conferência (fora da média e da barra) */
  anosForaDaMedia?: readonly number[];
}

function AnosFora({ anos }: { anos: readonly number[] }) {
  if (anos.length === 0) return null;
  return (
    <p
      data-anos-fora=""
      className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-gray-600 dark:text-gray-300"
    >
      <span
        aria-hidden="true"
        className="inline-block h-0 w-4 border-t-2 border-dashed border-[#667085] dark:border-[#98A2B3]"
      />
      {anos
        .map((ano) => formatarTexto(TEXTOS_TELA.telaConferencia.anoEmConferencia, { ano }))
        .join(' · ')}
    </p>
  );
}

/** Formato dos rótulos da barra: percentuais sem o '%' repetido não ajudam; mantém o do cartão. */
function fmt(v: number, formato: FormatoAnalise): string {
  return formatarAnalise(v, formato === 'moeda' ? 'numero2' : formato);
}

export function textoAriaBarra(
  barra: BarraValuation,
  atual: number | null,
  formato: FormatoAnalise,
): string {
  const l = TV.legenda;
  const partes = [
    barra.min !== null ? `${l.min} ${fmt(barra.min, formato)}` : null,
    barra.media !== null ? `${l.media} ${fmt(barra.media, formato)}` : null,
    barra.max !== null ? `${l.max} ${fmt(barra.max, formato)}` : null,
    atual !== null ? `${l.atual} ${fmt(atual, formato)}` : null,
  ].filter(Boolean);
  return `${partes.join('; ')}${barra.statusTexto ? ` · ${barra.statusTexto}` : ''}`;
}

export default function BarraPosicao10a({
  barra,
  atual,
  formato,
  rotulo,
  anosForaDaMedia = [],
}: BarraPosicao10aProps) {
  if (!barra.visivel || barra.min === null || barra.max === null || barra.media === null) {
    return barra.statusTexto ? (
      <>
        <p
          className="text-[12.5px] font-medium text-gray-500 dark:text-gray-400"
          data-barra="oculta"
        >
          {barra.statusTexto}
        </p>
        <AnosFora anos={anosForaDaMedia} />
      </>
    ) : (
      <AnosFora anos={anosForaDaMedia} />
    );
  }
  const lo = Math.min(barra.min, atual ?? barra.min);
  const hi = Math.max(barra.max, atual ?? barra.max);
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const aria = textoAriaBarra(barra, atual, formato);
  return (
    <div className="flex flex-col gap-1" data-barra="visivel">
      <div
        role="meter"
        aria-label={`${rotulo}: ${formatarTexto(TV.ariaPosicao, { n: barra.nPontos })}`}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={atual ?? barra.media}
        aria-valuetext={aria}
        className="relative mt-0.5 h-[22px]"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-[9px] h-1 rounded-sm bg-gray-200 dark:bg-gray-700"
        />
        <span
          aria-hidden="true"
          style={{ left: `${pos(barra.media)}%` }}
          className="absolute top-1 h-3.5 w-0.5 -translate-x-1/2 bg-gray-500 dark:bg-gray-400"
        />
        {atual !== null ? (
          <span
            aria-hidden="true"
            data-marcador
            style={{ left: `${pos(atual)}%` }}
            className="absolute top-[3px] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#0079F2] shadow-[0_0_0_1px_#0079F2] dark:border-[#1F1F22] dark:bg-[#6E9DC4] dark:shadow-[0_0_0_1px_#6E9DC4]"
          />
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className="flex justify-between text-[11.5px] tabular-nums text-gray-500 dark:text-gray-400"
      >
        <span>
          {TV.legenda.min} {fmt(barra.min, formato)}
        </span>
        <span>
          {TV.legenda.media} {fmt(barra.media, formato)}
        </span>
        <span>
          {TV.legenda.max} {fmt(barra.max, formato)}
        </span>
      </div>
      <p className="text-[12.5px] font-semibold text-gray-800 dark:text-white/90">
        {barra.statusTexto}
      </p>
      <AnosFora anos={anosForaDaMedia} />
    </div>
  );
}
