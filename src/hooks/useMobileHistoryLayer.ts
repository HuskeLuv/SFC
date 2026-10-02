'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * "Voltar" do sistema fecha um painel por cima da página no celular (BottomSheet, busca em tela
 * cheia) em vez de sair dela. Mesma mecânica do `useMobileHistoryView` (entrada própria no
 * histórico, marcada no history.state; fechar pelo app faz history.back() da entrada que empilhou),
 * mas SEM parâmetro na URL: painéis de telas cujo estado já mora na query (o Quadro reescreve a
 * URL inteira a cada filtro/ordem) e que não precisam de deep link.
 *
 * - `enabled=false` (desktop): nada toca no history.
 * - Abrir (`aberto` vira true): pushState na MESMA URL com uma marca única no state.
 * - Voltar do sistema (popstate tirando a nossa entrada): chama `onFechar`.
 * - Fechar pelo app (X, fundo, Esc, `aberto` vira false): history.back() da entrada que empilhou,
 *   para não deixar entrada órfã (o próximo "voltar" sairia da página só na segunda vez).
 * - `fecharEntao(acao)`: fecha e roda `acao` DEPOIS que o back terminou (popstate). Para ações que
 *   mexem na URL (router.replace da ordem/filtro, router.push para outra página): feitas antes do
 *   back, seriam desfeitas por ele ou cairiam na entrada errada.
 * - Desmontar com a entrada empilhada não volta (a página pode estar saindo por um link).
 */

const STATE_KEY = '__mfCamada';

let seq = 0;

export function useMobileHistoryLayer(
  aberto: boolean,
  onFechar: () => void,
  enabled: boolean,
): { fecharEntao(acao: () => void): void } {
  const pushedRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const pendenteRef = useRef<(() => void) | null>(null);
  const onFecharRef = useRef(onFechar);
  useEffect(() => {
    onFecharRef.current = onFechar;
  }, [onFechar]);

  // Abrir empilha; fechar pelo app volta pela entrada empilhada (mesmo que o desktop tenha
  // chegado no meio do caminho: a entrada já existe).
  useEffect(() => {
    if (!aberto && pushedRef.current) {
      pushedRef.current = false;
      const acao = pendenteRef.current;
      pendenteRef.current = null;
      if (acao) window.addEventListener('popstate', () => acao(), { once: true });
      window.history.back();
      return;
    }
    if (!enabled || !aberto || pushedRef.current) return;
    seq += 1;
    const token = `${Date.now().toString(36)}-${seq}`;
    const prev = (window.history.state as Record<string, unknown> | null) ?? {};
    window.history.pushState({ ...prev, [STATE_KEY]: token }, '', window.location.href);
    tokenRef.current = token;
    pushedRef.current = true;
  }, [aberto, enabled]);

  // Voltar do sistema com o painel aberto. O ouvinte sai antes do back do fechamento pelo app
  // (a limpeza deste efeito roda antes do efeito acima), então não confunde os dois.
  useEffect(() => {
    if (!enabled || !aberto) return;
    const onPop = () => {
      if (!pushedRef.current) return;
      const state = window.history.state as Record<string, unknown> | null;
      // painel empilhado por cima deste: o voltar tirou só o de cima
      if (state?.[STATE_KEY] === tokenRef.current) return;
      pushedRef.current = false;
      onFecharRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [enabled, aberto]);

  const fecharEntao = useCallback((acao: () => void) => {
    if (pushedRef.current) {
      pendenteRef.current = acao;
      onFecharRef.current();
      return;
    }
    onFecharRef.current();
    acao();
  }, []);

  return { fecharEntao };
}

export default useMobileHistoryLayer;
