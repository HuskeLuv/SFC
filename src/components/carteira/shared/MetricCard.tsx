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
import { ConteudoSensivel, TextoSensivel } from '@/components/common/valores/Sensivel';
import type { SensibilidadeValor } from '@/utils/valoresOcultos';

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
  /**
   * Esconder valores: como `value` reage ao olho. 'auto' (padrão) esconde só se tiver R$/US$;
   * 'sensivel' sempre; 'visivel' nunca (ex.: dólar de "Mercado hoje"). `change` esconde só os R$.
   */
  valor?: SensibilidadeValor;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  color = 'primary',
  change,
  changeDirection,
  valor = 'auto',
}) => {
  return (
    <div className={`${CARD_BASE_CLASS} ${CARD_COLOR_CLASSES[color]}`}>
      <div className={CARD_HEADER_CLASS}>
        <p className={CARD_TITLE_CLASS} title={title}>
          {title}
        </p>
      </div>
      <p className={CARD_VALUE_CLASS}>
        <ConteudoSensivel modo={valor}>{value}</ConteudoSensivel>
      </p>
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
          <TextoSensivel texto={change} />
        </p>
      ) : null}
    </div>
  );
};

export default MetricCard;
