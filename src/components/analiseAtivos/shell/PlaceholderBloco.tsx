/**
 * Placeholder dos STUBS da fatia 0a: um card com o título do bloco. Cada fatia dona troca o stub
 * pelo componente real e deixa de usar este arquivo. Sem "em breve" (decisão 7).
 */
export default function PlaceholderBloco({
  titulo,
  dono,
  children,
}: {
  titulo: string;
  /** nome do componente stub (data-stub, para os e2e da casca) */
  dono: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      data-stub={dono}
      className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-white/[0.03]"
    >
      <h2 className="text-base font-medium text-gray-800 dark:text-white/90">{titulo}</h2>
      {children}
    </section>
  );
}
