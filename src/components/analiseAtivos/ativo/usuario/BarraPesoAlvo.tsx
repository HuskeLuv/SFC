/**
 * Barra "peso × referência" do bloco Na sua carteira (fatia D): o peso atual preenche a barra e a
 * referência (objetivo do ativo ou alvo da classe) é um traço vertical. Elemento NÃO textual em
 * patrimonio/tranquilidade; textos em cinza do app. role="img" com o rótulo completo para leitor
 * de tela.
 */
import { formatPct } from '@/utils/format';

export interface BarraPesoAlvoProps {
  /** ex.: 'Peso dentro de Ações' */
  rotulo: string;
  /** peso atual em pontos percentuais (17,2 = 17,2%) */
  valor: number;
  /** referência (objetivo/alvo) em p.p.; null = sem referência definida */
  referencia: number | null;
  /** ex.: 'objetivo do ativo: 20%' ou 'sem alvo definido no Planejamento' */
  rotuloReferencia: string;
  /** ex.: 'faltam 2,8 p.p. para o objetivo' */
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
}: BarraPesoAlvoProps) {
  const ref = referencia ?? 0;
  // Com referência: escala folgada em torno de valor e referência. Sem referência: 0–100%.
  const max = referencia === null ? 100 : Math.max(valor, ref, 0.0001) * 1.25;
  const largura = Math.min(100, Math.max(0, (valor / max) * 100));
  const posRef = Math.min(100, Math.max(0, (ref / max) * 100));
  const valorTxt = formatPct(valor);
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-barra-peso={rotulo}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[13px]">
        <span className="font-semibold text-gray-800 dark:text-white/90">
          {rotulo}: <span className="tabular-nums">{valorTxt}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">{rotuloReferencia}</span>
      </div>
      <div
        role="img"
        aria-label={ariaLabel ?? `${rotulo}: ${valorTxt}, ${rotuloReferencia}`}
        className="relative h-2.5 rounded-full bg-gray-100 dark:bg-white/10"
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
      {status ? <span className="text-xs text-gray-500 dark:text-gray-400">{status}</span> : null}
    </div>
  );
}
