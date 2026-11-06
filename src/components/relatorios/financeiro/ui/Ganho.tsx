import type { ReactNode } from 'react';

export interface GanhoProps {
  /** Linha em caixa alta (.gl). */
  rotulo: ReactNode;
  /** Valor já formatado (ex.: '+ R$ 6.151'). */
  valor: ReactNode;
  /** Prefixo pequeno do valor (padrão 'até'). */
  prefixo?: ReactNode;
  /** Linha de apoio (.gs). */
  sub?: ReactNode;
  /** Selo do prazo (.tag). */
  selo?: ReactNode;
}

/** Destaque de ganho (.gain) do cartão de cadeado da seção 8. */
export function Ganho({ rotulo, valor, prefixo = 'até', sub, selo }: GanhoProps) {
  return (
    <div className="gain">
      <span className="gl">{rotulo}</span>
      <b>
        {prefixo ? <small>{prefixo}</small> : null}
        {valor}
      </b>
      {sub ? <span className="gs">{sub}</span> : null}
      {selo ? <span className="tag">{selo}</span> : null}
    </div>
  );
}
