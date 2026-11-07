import type { ReactNode } from 'react';
import { NOME_PLANO, OFERTAS_PLANOS, ofertaVigente, type Plano } from '@/lib/planos';
import { IconeCadeado } from '../marca/IconeCadeado';

export interface CadeadoProps {
  /** Plano que libera o bloco. */
  plano: Exclude<Plano, 'basic'>;
  titulo: ReactNode;
  /** O que o bloco mostra (.lock-in p). Sem palavras proibidas no plano que vê o cadeado. */
  descricao: ReactNode;
  /** Gancho com dado que o plano já tem (.hook); omitido = sem gancho. */
  gancho?: ReactNode;
  /** Destaque .gain (<Ganho>), entre a descrição e o gancho. */
  ganho?: ReactNode;
  /** Altura máxima do corpo desfocado: 'short' 240, padrão 420, 'tall' 520 (600 no mobile). */
  tamanho?: 'short' | 'tall';
  /** Corpo FICTÍCIO (nunca dado real), desenhado desfocado por baixo do cartão. */
  children: ReactNode;
  /** Instante para a validade da oferta (padrão: agora). */
  referencia?: Date;
}

/**
 * Bloco bloqueado + cartão de upgrade: porte de lock(need, title, what, hook, inner, short, gain)
 * do protótipo. Com a oferta vigente: 'Liberar no {Plano} com {desconto} off' e a linha do
 * anual (cobrado de uma vez, sem '12x'); depois da validade (data em SP): só 'Conhecer o {Plano}'.
 */
export function Cadeado({
  plano,
  titulo,
  descricao,
  gancho,
  ganho,
  tamanho,
  children,
  referencia,
}: CadeadoProps) {
  const nome = NOME_PLANO[plano];
  const oferta = OFERTAS_PLANOS[plano];
  const vigente = ofertaVigente(referencia ?? new Date());
  return (
    <div className={`locked ${tamanho ?? ''}`}>
      <div className="blur" aria-hidden="true">
        {children}
      </div>
      <div className="lock-card">
        <div className="lock-in">
          <span className="ic" style={{ color: '#fff' }}>
            <IconeCadeado />
          </span>
          <h4>{titulo}</h4>
          <p>{descricao}</p>
          {ganho ?? null}
          {gancho ? <p className="hook">{gancho}</p> : null}
          <a className="cta" href={OFERTAS_PLANOS.url} target="_blank" rel="noopener">
            {vigente ? `Liberar no ${nome} com ${oferta.desconto} off` : `Conhecer o ${nome}`}
          </a>
          <span className="url">
            {vigente
              ? `Anual: ${oferta.anual}, equivale a ${oferta.equivalente} · Black Friday até 05/12 · ${OFERTAS_PLANOS.urlTexto}`
              : OFERTAS_PLANOS.urlTexto}
          </span>
        </div>
      </div>
    </div>
  );
}
