'use client';

import dynamic from 'next/dynamic';
import { temAcesso } from '@/lib/planos';
import { fP } from '../formato';
import { useFormato, type Formato } from '../FormatoProvider';
import type { PropsSecao } from '../tipos';
import { Cadeado } from '../ui/Cadeado';
import { Callout } from '../ui/Callout';
import { Pagina } from '../ui/Pagina';
import { poupancaDosFechados } from './apoio';
import { SaudeFicticia } from './ficticio/SaudeFicticia';

// Corpo real só por import dinâmico: o texto dele não vai para o chunk de quem vê o cadeado.
const SaudeReal = dynamic(() => import('./real/SaudeReal'), { ssr: false });

/** Gancho com o índice de poupança, que o Basic e o Pro já têm pelo orçamento. */
function ganchoSaude(relatorio: PropsSecao['relatorio'], fR0: Formato['fR0']): string {
  const poupanca = poupancaDosFechados(relatorio.orcamento);
  if (poupanca != null) {
    return `Já sabemos um dos seis: seu índice de poupança nos meses fechados do período foi ${fP(poupanca)}. Veja os outros cinco e a sua nota.`;
  }
  const sobra = relatorio.orcamento.referenciaFechada.sobraMesAnterior;
  if (sobra != null) {
    return `Já sabemos por onde começar: no mês passado sobraram ${fR0(sobra)}. Veja os seis indicadores e a sua nota.`;
  }
  return 'Veja os seis indicadores com meta e a sua nota de 0 a 100.';
}

/** Seção 7: Saúde financeira (Advanced). */
export function SecaoSaude({ relatorio }: PropsSecao) {
  const { saude } = relatorio;
  const { fR0 } = useFormato();
  let corpo;
  if (temAcesso(relatorio.plano, 'adv')) {
    corpo = saude ? (
      <SaudeReal relatorio={relatorio} saude={saude} />
    ) : (
      <Callout>A saúde financeira não pôde ser carregada agora.</Callout>
    );
  } else {
    corpo = (
      <Cadeado
        plano="adv"
        titulo="Saúde financeira"
        descricao="Sua nota de 0 a 100, seis indicadores com meta e o balanço patrimonial completo."
        gancho={ganchoSaude(relatorio, fR0)}
        referencia={new Date(relatorio.geradoEm)}
      >
        <SaudeFicticia meses={relatorio.periodo.meses} />
      </Cadeado>
    );
  }
  return (
    <Pagina
      numero={7}
      titulo="Saúde financeira"
      lead="Como suas finanças estão, em uma nota e seis indicadores."
      relatorio={relatorio}
    >
      {corpo}
    </Pagina>
  );
}
