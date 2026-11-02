'use client';

/**
 * Esconder valores (Fase 5) — frase de template (`formatarTexto`) com placeholders do USUÁRIO.
 *
 * As frases da Análise de Ativos misturam dado do usuário (quantidade, preço médio, valor da
 * posição, meta de renda) com dado de mercado (cotação, %), e o `TextoSensivel` só reconhece
 * R$/US$ — quantidades ("360 cotas") e números montados à mão passariam. Aqui cada placeholder
 * escolhe o modo:
 * - 'sensivel': `<Sensivel>` (dinheiro do usuário);
 * - 'curto': `<Sensivel curto>` (quantidade — decisão 6, a pílula curta não muda a altura);
 * - 'visivel': `<ValorVisivel>` (cotação de mercado ao lado de valores do usuário).
 * Placeholder sem modo fica como texto (%, nomes, datas).
 *
 * Olho aberto (ou chave desligada/tela não coberta): a MESMA string de `formatarTexto` — DOM
 * idêntico ao de hoje.
 */
import { Fragment } from 'react';
import { Sensivel, ValorVisivel } from '@/components/common/valores/Sensivel';
import { useValoresOcultos } from '@/context/ValoresOcultosContext';
import { formatarTexto } from '@/services/analiseAtivos/textos';

export type ModoPlaceholder = 'sensivel' | 'curto' | 'visivel';

export interface TextoComSensiveisProps {
  template: string;
  vars: Record<string, string | number>;
  modos: Partial<Record<string, ModoPlaceholder>>;
}

export default function TextoComSensiveis({ template, vars, modos }: TextoComSensiveisProps) {
  const { ativo } = useValoresOcultos();
  if (!ativo) return <>{formatarTexto(template, vars)}</>;
  const partes = template.split(/(\{\w+\})/);
  return (
    <>
      {partes.map((parte, i) => {
        const m = /^\{(\w+)\}$/.exec(parte);
        if (!m || !Object.prototype.hasOwnProperty.call(vars, m[1])) {
          return parte ? <Fragment key={i}>{parte}</Fragment> : null;
        }
        const valor = String(vars[m[1]]);
        switch (modos[m[1]]) {
          case 'sensivel':
            return <Sensivel key={i}>{valor}</Sensivel>;
          case 'curto':
            return (
              <Sensivel key={i} curto>
                {valor}
              </Sensivel>
            );
          case 'visivel':
            return <ValorVisivel key={i}>{valor}</ValorVisivel>;
          default:
            return <Fragment key={i}>{valor}</Fragment>;
        }
      })}
    </>
  );
}
