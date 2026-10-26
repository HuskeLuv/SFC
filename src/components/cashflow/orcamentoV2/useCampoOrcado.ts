'use client';

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { SalvarOrcadoEntrada } from '@/hooks/useOrcamentoV2';
import { parsePctBR, parseValorBR } from '@/lib/orcamento/regras';
import type { SubcategoriaV2 } from '@/types/orcamentoV2';
import { formatNumber } from '@/utils/format';
import { num } from './apresentacao';

/** Texto do campo de orçado a partir do payload ('' = sem orçado). */
export function textoOrcado(sub: SubcategoriaV2): string {
  if (sub.pct !== null) return formatNumber(sub.pct, 1);
  return sub.valor !== null ? num(sub.valor) : '';
}

/**
 * Estado do campo de orçado de uma subcategoria (R-18, Q6), o mesmo contrato da linha do desktop:
 * Enter ou sair do campo confirma; inválido NÃO salva, mostra o erro e restaura o anterior; vazio
 * limpa; Esc desfaz. Em % só nas subs que já estão em % (o botão R$/% é da E2). A gravação é
 * otimista no hook (`salvarOrcado`); o erro do servidor volta para junto do campo.
 */
export function useCampoOrcado(
  sub: SubcategoriaV2,
  onSalvarOrcado: (entrada: SalvarOrcadoEntrada) => Promise<unknown>,
) {
  const emPct = sub.pct !== null;
  const [texto, setTexto] = useState(() => textoOrcado(sub));
  const [erro, setErro] = useState<string | null>(null);
  const focadoRef = useRef(false);
  const cancelarRef = useRef(false);

  // O payload muda (resposta do servidor, outra visão): o campo acompanha, menos durante a edição.
  const atual = textoOrcado(sub);
  useEffect(() => {
    if (!focadoRef.current) setTexto(atual);
  }, [atual]);

  const confirmar = () => {
    const t = texto.trim();
    let entrada: SalvarOrcadoEntrada | null = null;
    if (t === '') {
      if (sub.valor !== null || sub.pct !== null) entrada = { itemId: sub.id, valor: null };
    } else if (emPct) {
      const p = parsePctBR(t);
      if (p === null) {
        setErro('Use um percentual entre 0 e 100, com até 1 casa (ex.: 6,5).');
        setTexto(atual);
        return;
      }
      if (p !== sub.pct) entrada = { itemId: sub.id, pct: p };
    } else {
      const v = parseValorBR(t);
      if (v === null) {
        setErro('Valor inválido. Use o formato 1.500,00.');
        setTexto(atual);
        return;
      }
      if (v !== sub.valor) entrada = { itemId: sub.id, valor: v };
    }
    setErro(null);
    if (!entrada) {
      setTexto(atual);
      return;
    }
    onSalvarOrcado(entrada).catch((e: unknown) => {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o orçado.');
    });
  };

  /** Props do <input> (texto, foco, Enter/Esc, blur que confirma). */
  const inputProps = {
    type: 'text' as const,
    inputMode: 'decimal' as const,
    value: texto,
    placeholder: emPct ? '0,0' : '0,00',
    'aria-invalid': erro ? true : undefined,
    onFocus: () => {
      focadoRef.current = true;
    },
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setTexto(e.target.value);
      if (erro) setErro(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur();
      if (e.key === 'Escape') {
        cancelarRef.current = true;
        e.currentTarget.blur();
      }
    },
    onBlur: () => {
      focadoRef.current = false;
      if (cancelarRef.current) {
        cancelarRef.current = false;
        setErro(null);
        setTexto(atual);
        return;
      }
      confirmar();
    },
  };

  return { emPct, erro, inputProps };
}
