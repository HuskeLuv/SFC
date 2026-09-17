/**
 * Componente genérico de card de métrica reutilizável
 * Usado em todas as tabs da carteira. Estilo (cores, altura, título) vem de
 * `cardStyles` — compartilhado com o CaixaParaInvestirCard, que divide a
 * mesma grade.
 */
import {
  CARD_BASE_CLASS,
  CARD_COLOR_CLASSES,
  CARD_HEADER_CLASS,
  CARD_TITLE_CLASS,
  CARD_VALUE_CLASS,
  type CardColor,
} from './cardStyles';

interface MetricCardProps {
  title: string;
  value: string;
  color?: CardColor;
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
  return (
    <div className={`${CARD_BASE_CLASS} ${CARD_COLOR_CLASSES[color]}`}>
      <div className={CARD_HEADER_CLASS}>
        <p className={CARD_TITLE_CLASS} title={title}>
          {title}
        </p>
      </div>
      <p className={CARD_VALUE_CLASS}>{value}</p>
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
