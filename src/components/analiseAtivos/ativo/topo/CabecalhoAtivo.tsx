/**
 * STUB da fatia 0a — dono: B (topo da página do ativo). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import type { CabecalhoAtivoProps } from '@/types/analiseAtivosApi';

export type { CabecalhoAtivoProps };

export default function CabecalhoAtivo({ ativo, seloCarteira, slotAcoes }: CabecalhoAtivoProps) {
  return (
    <header
      data-stub="CabecalhoAtivo"
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-gray-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-white/[0.03]"
    >
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
          {ativo.ticker} <span className="font-normal text-gray-500">{ativo.nome}</span>
        </h1>
        {seloCarteira}
      </div>
      {slotAcoes}
    </header>
  );
}
