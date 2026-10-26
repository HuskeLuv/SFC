'use client';

/**
 * Aviso de primeira visita depois da ativação (`prefs.avisoGeralPendente`): a meta que cada
 * categoria tinha na tela antiga foi para a subcategoria Geral. "Entendi" marca
 * `avisoGeralVisto` nas prefs e o aviso some (otimista no hook).
 */
export default function AvisoGeral({
  pendente,
  onVisto,
}: {
  pendente: boolean;
  onVisto: () => void;
}) {
  if (!pendente) return null;
  return (
    <div
      role="status"
      data-mf-aviso-geral=""
      className="flex flex-wrap items-start gap-3 rounded-xl border border-[#DCE6F2] bg-[#EDF2F8] px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.06] dark:text-gray-200"
    >
      <p className="min-w-0 flex-1">
        <b className="font-semibold text-mf-seguranca dark:text-white/90">
          Seus orçados anteriores estão em Geral.
        </b>{' '}
        O valor que cada categoria tinha foi para a subcategoria Geral dela. Distribua entre as
        subcategorias quando quiser — o total da categoria continua o mesmo.
      </p>
      <button
        type="button"
        onClick={onVisto}
        className="rounded-lg bg-mf-patrimonio px-3 py-1.5 text-xs font-semibold text-white hover:bg-mf-seguranca"
      >
        Entendi
      </button>
    </div>
  );
}
