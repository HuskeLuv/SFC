/**
 * Chips de grupo do Valuation (fatia C): botões com aria-pressed num role="group". No celular o
 * trilho rola para o lado numa linha própria (min-h 50px, sem encolher) e cada chip tem 44px;
 * no computador quebram linha e têm 36px. Chip ativo em seguranca (claro) / tranquilidade (escuro).
 */
export interface ChipsGrupoProps {
  rotulo: string;
  opcoes: Array<{ codigo: string; rotulo: string }>;
  selecionado: string;
  onSelecionar: (codigo: string) => void;
}

export default function ChipsGrupo({ rotulo, opcoes, selecionado, onSelecionar }: ChipsGrupoProps) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      data-mf-scroll-x
      className="-mx-4 flex min-h-[50px] flex-none gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:min-h-0 lg:flex-wrap lg:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {opcoes.map((o) => {
        const ativo = o.codigo === selecionado;
        return (
          <button
            key={o.codigo}
            type="button"
            aria-pressed={ativo}
            onClick={() => onSelecionar(o.codigo)}
            className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-[13.5px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] lg:min-h-9 dark:focus-visible:ring-[#6E9DC4] ${
              ativo
                ? 'border-mf-seguranca bg-mf-seguranca text-white dark:border-mf-tranquilidade dark:bg-mf-tranquilidade/25 dark:text-white'
                : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-transparent dark:text-gray-300'
            }`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
