'use client';

import React, { useEffect, useRef } from 'react';
import Button from '@/components/ui/button/Button';
import {
  isCategoriaCaixaRf,
  rotuloCategoria,
  rotuloSubgrupo,
  type CategoriaMovivel,
  type DestinoOpcao,
  type MoverOpcoesResponse,
} from '@/lib/carteiraMover';
import { calcularEfeitosMover } from '@/lib/moverEfeitos';
import type { MoverAlvo } from '@/types/carteiraMover';
import { EfeitosMoverList, useEfeitosMover } from './EfeitosMoverList';

/**
 * Confirmação curta ao soltar numa aba sem seção para escolher (mover fase 2, out/2026 — D4):
 * Reservas não têm seções e a seção da Renda Fixa vem do título, então no lugar dos chips de
 * seção da fase 1 aparece "Mover para <aba>?" com a lista "O que muda" (S, !, A, F, §, =).
 * Nada é gravado até "Mover". Fica dentro do EscolherSecaoPopover (posição, Esc, clique fora);
 * 380px, raio 14px, botões de 44px, foco inicial em "Mover".
 */

export const CONFIRMAR_LARGURA = 380;

/** Selo da seção derivada: "Pós-fixada · pelo indexador" / "Pré-fixada · pelo tipo do título". */
export function textoSeloSecao(secao: NonNullable<DestinoOpcao['secaoAutomatica']>): string {
  return `${secao.label} · ${secao.via === 'titulo' ? 'pelo tipo do título' : 'pelo indexador'}`;
}

export function SeloSecaoAutomatica({
  secao,
}: {
  secao: NonNullable<DestinoOpcao['secaoAutomatica']>;
}) {
  return (
    <span
      data-mf-selo-secao=""
      className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[12.5px] font-medium text-gray-800 dark:bg-white/[0.08] dark:text-white/90"
    >
      {textoSeloSecao(secao)}
    </span>
  );
}

/** "Renda Fixa › Pós-fixada" (com seção) ou só "Reserva Emergência". */
const ondeEsta = (categoria: CategoriaMovivel, secao: string | null | undefined): string => {
  const aba = rotuloCategoria(categoria);
  const rotulo = secao ? rotuloSubgrupo(categoria, secao) : null;
  return rotulo ? `${aba} › ${rotulo}` : aba;
};

export interface ConfirmarMoverCardProps {
  alvo: MoverAlvo;
  destino: CategoriaMovivel;
  /** GET /mover (chega depois do soltar; até lá a Saúde mostra a frase fixa). */
  opcoes?: MoverOpcoesResponse;
  tituloId: string;
  verificando: boolean;
  recusado: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmarMoverCard({
  alvo,
  destino,
  opcoes,
  tituloId,
  verificando,
  recusado,
  onConfirm,
  onCancel,
}: ConfirmarMoverCardProps) {
  const aba = rotuloCategoria(destino);
  const opcaoDestino = opcoes?.destinos.find((d) => d.categoria === destino);
  const efeitosDasOpcoes = useEfeitosMover(opcoes, destino);
  // Sem as opções ainda: os efeitos do trio com o que a linha já diz (Saúde → frase fixa).
  const efeitos =
    efeitosDasOpcoes.length > 0 || opcoes
      ? efeitosDasOpcoes
      : isCategoriaCaixaRf(alvo.categoria) && isCategoriaCaixaRf(destino)
        ? calcularEfeitosMover({ origem: alvo.categoria, destino, valorItem: Number.NaN })
        : [];

  // Foco no primário ao abrir — ou assim que ele habilita (as opções chegam depois do soltar).
  // Uma vez só: não rouba o foco de quem já foi para "Cancelar".
  const focouRef = useRef(false);
  const desabilitado = verificando || recusado;
  useEffect(() => {
    if (focouRef.current || desabilitado) return;
    const botao = document.querySelector<HTMLButtonElement>(
      `[data-mf-confirmar-mover="${CSS.escape(tituloId)}"] [data-mf-confirmar-ok] button`,
    );
    if (!botao) return;
    focouRef.current = true;
    botao.focus();
  }, [desabilitado, tituloId]);

  return (
    <div className="flex flex-col gap-2.5" data-mf-confirmar-mover={tituloId}>
      <h4 id={tituloId} className="text-[15px] font-semibold text-gray-900 dark:text-white">
        Mover para {aba}?
      </h4>
      <p className="text-[13px] text-gray-600 dark:text-gray-300">
        {alvo.label} sai de {ondeEsta(alvo.categoria, alvo.secaoAtual)}.
        {destino !== 'rendaFixaFundos' && ' A Reserva não tem seções.'}
      </p>
      {destino === 'rendaFixaFundos' && opcaoDestino?.secaoAutomatica && (
        <p className="text-[13px] text-gray-600 dark:text-gray-300">
          Entra em <SeloSecaoAutomatica secao={opcaoDestino.secaoAutomatica} />
        </p>
      )}
      <EfeitosMoverList efeitos={efeitos} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="min-h-11" onClick={onCancel}>
          Cancelar
        </Button>
        <span data-mf-confirmar-ok="" className="contents">
          <Button size="sm" className="min-h-11" onClick={onConfirm} disabled={desabilitado}>
            {verificando ? 'Verificando…' : 'Mover'}
          </Button>
        </span>
      </div>
    </div>
  );
}

export default ConfirmarMoverCard;
