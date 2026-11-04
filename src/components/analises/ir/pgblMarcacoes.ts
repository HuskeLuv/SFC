'use client';
import { useCallback, useEffect, useState } from 'react';
import type { IRPlanoPrevidencia } from '@/hooks/useIR';

/**
 * Tipo de cada plano de previdência (PGBL × VGBL) escolhido pelo usuário na aba PGBL do IR.
 *
 * A carteira não grava o tipo (o fundo de previdência do catálogo CVM serve aos dois), então a
 * marcação fica neste navegador — só o id do ativo e o tipo, nenhum valor. Sem storage (aba
 * anônima, bloqueio), vale o palpite pelo nome.
 */

export type TipoPlanoMarcado = 'pgbl' | 'vgbl';

const CHAVE = 'mf-ir-pgbl-planos';
const EVENTO = 'mf-ir-pgbl-planos';

function ler(): Record<string, TipoPlanoMarcado> {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return {};
    const obj = JSON.parse(bruto) as Record<string, unknown>;
    const out: Record<string, TipoPlanoMarcado> = {};
    for (const [k, v] of Object.entries(obj)) if (v === 'pgbl' || v === 'vgbl') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function usePlanosMarcados() {
  const [marcas, setMarcas] = useState<Record<string, TipoPlanoMarcado>>({});

  useEffect(() => {
    setMarcas(ler());
    const sync = () => setMarcas(ler());
    window.addEventListener(EVENTO, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENTO, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const marcar = useCallback((assetId: string, tipo: TipoPlanoMarcado) => {
    const novo = { ...ler(), [assetId]: tipo };
    setMarcas(novo);
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify(novo));
      window.dispatchEvent(new Event(EVENTO));
    } catch {
      // sem storage: a marcação vale só nesta tela
    }
  }, []);

  return { marcas, marcar };
}

/** Tipo efetivo: a marcação do usuário, senão o palpite pelo nome (null = não sabemos). */
export function tipoDoPlano(
  plano: IRPlanoPrevidencia,
  marcas: Record<string, TipoPlanoMarcado>,
): TipoPlanoMarcado | null {
  return marcas[plano.assetId] ?? plano.tipoSugerido;
}
