/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura. Stub: texto resumido; a 0b desenha as 10 barras/traços.
 */
import type { BarrasDezAnosProps } from '@/types/analiseAtivosApi';

export type { BarrasDezAnosProps };

export default function BarrasDezAnos(props: BarrasDezAnosProps) {
  const texto =
    props.modo === 'lucro'
      ? props.serie.map((p) => `${p.ano}`).join(' ')
      : String(props.quantidade ?? '—');
  return (
    <span data-stub="BarrasDezAnos" aria-label={props.ariaLabel} className={props.className}>
      {texto}
    </span>
  );
}
