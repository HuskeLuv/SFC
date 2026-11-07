'use client';

import React from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { usePlano } from '@/hooks/usePlano';
import type { PlanoPago } from '@/lib/planos';
import CadeadoPlano, { type CadeadoPlanoProps } from './CadeadoPlano';

export interface GatePlanoProps extends Omit<CadeadoPlanoProps, 'need'> {
  need: PlanoPago;
  children: React.ReactNode;
  /** O que mostrar enquanto o /me não respondeu (padrão: spinner). */
  carregando?: React.ReactNode;
}

/**
 * Gate de página/aba por plano. Chave desligada, 404 ou erro no /me = sempre os filhos (plano
 * 'adv', app como hoje). Com a chave ligada e sem o plano, os filhos NEM MONTAM: os hooks de
 * dentro não disparam e não há 403 nem erro genérico nas telas; no lugar entra o CadeadoPlano.
 * Enquanto a primeira resposta do /me não chega, segura os filhos pelo mesmo motivo.
 */
export default function GatePlano({ need, children, carregando, ...cadeado }: GatePlanoProps) {
  const { libera, carregando: buscando } = usePlano();
  if (buscando) return <>{carregando ?? <LoadingSpinner />}</>;
  if (libera(need)) return <>{children}</>;
  return <CadeadoPlano need={need} {...cadeado} />;
}
