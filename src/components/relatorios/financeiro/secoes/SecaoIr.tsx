'use client';

import dynamic from 'next/dynamic';
import type { IrGancho } from '@/types/relatorioFinanceiro';
import { temAcesso } from '@/lib/planos';
import { fR0 as fR0Cru } from '../formato';
import { useFormato } from '../FormatoProvider';
import type { PropsSecao } from '../tipos';
import { Cadeado } from '../ui/Cadeado';
import { Callout } from '../ui/Callout';
import { Ganho } from '../ui/Ganho';
import { Pagina } from '../ui/Pagina';
import { IrFicticio } from './ficticio/IrFicticio';

// A página inteira do Advanced (com a linha de apoio do título) só entra por import dinâmico:
// os textos dela não podem ir para o chunk do Basic/Pro (decisão 6).
const SecaoIrConteudo = dynamic(() => import('../adv/SecaoIrConteudo'), { ssr: false });

const TITULO = 'Declaração Imposto de Renda: IR a restituir';

/** Destaque .gain do cadeado: some com economia ≤ 0 ou com o ano encerrado. */
export function ganhoIr(gancho: IrGancho | null, lancadoAte: string, fR0 = fR0Cru) {
  if (!gancho || gancho.encerrado || !(gancho.economiaMaxima > 0)) return undefined;
  const renda = `${fR0(gancho.rendaTributavel)}${gancho.rendaOrigem === 'lancado' ? ` (lançado até ${lancadoAte})` : ''}`;
  return (
    <Ganho
      rotulo={`Sua restituição de IR ${gancho.ano} pode ser`}
      valor={`+ ${fR0(gancho.economiaMaxima)}`}
      sub={`maior, calculado com a sua renda de ${renda}.`}
      selo={
        gancho.diasAte3112 != null
          ? `Prazo para agir: 31/12 · faltam ${gancho.diasAte3112} ${gancho.diasAte3112 === 1 ? 'dia' : 'dias'}`
          : undefined
      }
    />
  );
}

/** Seção 8: Declaração Imposto de Renda: IR a restituir (Advanced). */
export function SecaoIr({ relatorio }: PropsSecao) {
  const { fR0 } = useFormato();
  if (temAcesso(relatorio.plano, 'adv')) {
    if (relatorio.ir) return <SecaoIrConteudo relatorio={relatorio} ir={relatorio.ir} />;
    return (
      <Pagina numero={8} titulo={TITULO} relatorio={relatorio}>
        <Callout>O IR a restituir não pôde ser calculado agora.</Callout>
      </Pagina>
    );
  }
  const gancho = relatorio.irGancho;
  const descricao = gancho?.encerrado
    ? `Descubra quanto do seu imposto pode voltar para o seu bolso no ano-calendário ${gancho.ano}, encerrado.`
    : 'Descubra quanto do seu imposto pode voltar para o seu bolso e o que fazer antes de 31/12 para não deixar dinheiro com a Receita.';
  return (
    <Pagina numero={8} titulo={TITULO} relatorio={relatorio}>
      <Cadeado
        plano="adv"
        titulo={TITULO}
        descricao={descricao}
        ganho={ganhoIr(gancho, relatorio.periodo.lancadoAte, fR0)}
        tamanho="tall"
        referencia={new Date(relatorio.geradoEm)}
      >
        <IrFicticio meses={relatorio.periodo.meses} />
      </Cadeado>
    </Pagina>
  );
}
