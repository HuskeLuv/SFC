'use client';

/**
 * "Reportar dado incorreto" (bloco C; props FINAIS da fatia 0 em BotaoReportarDadoProps,
 * implementação da fatia D).
 *
 * Variantes:
 * - 'link': renderiza o próprio gatilho ("Tem uma informação sobre isso? Reportar"), usado no fim
 *   do "Por quê?" de um campo em conferência; o foco volta ao gatilho ao fechar;
 * - 'controlado': sem gatilho; o formulário abre com `aberto` e chama `onFechar`. É como o
 *   MenuBlocoAtivo o usa (montado FORA do menu, para o formulário não desmontar com ele).
 *
 * O formulário (FormReportarDado) fica montado e começa limpo a cada abertura; fechado, não
 * renderiza nada nem busca nada. Ele não pode desmontar no mesmo render em que fecha: no celular
 * a camada do histórico (useMobileHistoryLayer) precisa do render "fechado" para voltar a entrada
 * que empilhou. Computador = modal de 560px; celular = sheet de tela cheia.
 */
import { useRef, useState } from 'react';
import FormReportarDado from '@/components/analiseAtivos/reporte/FormReportarDado';
import GatilhoReportar from '@/components/analiseAtivos/reporte/GatilhoReportar';
import type { BotaoReportarDadoProps } from '@/types/analiseAtivosCuradoria';

export type { BotaoReportarDadoProps };

export default function BotaoReportarDado({
  ticker,
  classe,
  bloco,
  contexto,
  campo,
  variante,
  aberto: abertoProp,
  onFechar,
  className,
}: BotaoReportarDadoProps) {
  const [abertoLocal, setAbertoLocal] = useState(false);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const controlado = variante === 'controlado';
  const aberto = controlado ? !!abertoProp : abertoLocal;
  // nova abertura = formulário novo (estado limpo)
  const [aberturas, setAberturas] = useState(0);
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) setAberturas((n) => n + 1);
  }
  const [montado, setMontado] = useState(aberto);
  if (aberto && !montado) setMontado(true);

  const fechar = () => {
    if (controlado) {
      onFechar?.();
      return;
    }
    setAbertoLocal(false);
    gatilhoRef.current?.focus();
  };

  return (
    <>
      {controlado ? null : (
        <GatilhoReportar
          ref={gatilhoRef}
          bloco={bloco}
          onClick={() => setAbertoLocal(true)}
          className={className}
        />
      )}
      {montado ? (
        <FormReportarDado
          key={aberturas}
          ticker={ticker.toUpperCase()}
          classe={classe}
          bloco={bloco}
          contexto={contexto}
          campo={campo}
          aberto={aberto}
          onFechar={fechar}
        />
      ) : null}
    </>
  );
}
