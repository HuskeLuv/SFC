/**
 * Componente genérico de card de métrica reutilizável
 * Usado em todas as tabs da carteira
 */

interface MetricCardProps {
  title: string;
  value: string;
  color?: 'primary' | 'success' | 'warning' | 'error';
  change?: string;
  /**
   * "up" → verde, "down" → vermelho, "neutral" → cinza (sem conotação de alta).
   * Use "neutral" quando a variação é nula/zero/indisponível.
   */
  changeDirection?: 'up' | 'down' | 'neutral';
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  color = 'primary',
  change,
  changeDirection,
}) => {
  // Paleta My Finance PARTE 2 (ticket 21/08/2026): os cards saem dos pastéis
  // verde/amarelo/azul genéricos e entram na família de azuis da marca —
  // outside (#0079F2), patrimonio (#396CAA) e escolha (#EAEAEA) como tints;
  // texto no azul segurança (#314666). 'error' continua vermelho (semântico,
  // ex.: Patrimônio Líquido negativo).
  const colorClasses = {
    primary: 'bg-[#0079F2]/10 text-[#314666] dark:bg-[#0079F2]/20 dark:text-blue-100',
    success: 'bg-[#396CAA]/15 text-[#314666] dark:bg-[#396CAA]/25 dark:text-blue-100',
    warning: 'bg-[#EAEAEA] text-[#2D2D2D] dark:bg-white/10 dark:text-gray-100',
    error: 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium opacity-80 mb-1">{title}</p>
      <p className="text-xl font-semibold">{value}</p>
      {change ? (
        <p
          className={`mt-1 text-xs font-semibold ${
            changeDirection === 'down'
              ? 'text-red-600 dark:text-red-400'
              : changeDirection === 'neutral'
                ? 'text-gray-500 dark:text-gray-400'
                : 'text-green-700 dark:text-green-400'
          }`}
        >
          {change}
        </p>
      ) : null}
    </div>
  );
};

export default MetricCard;
