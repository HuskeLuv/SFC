/**
 * Mock de next/dynamic para os testes de render das seções 4 a 8: React.lazy + Suspense, e anota
 * cada módulo que o corpo dinâmico chegou a carregar (para provar que o Basic/Pro não carrega
 * real/* nem adv/*).
 *
 * Uso: vi.mock('next/dynamic', () => import('./dynamicMock')).
 */
import React from 'react';

/** Corpos dinâmicos renderizados (texto do loader, que contém o caminho do import). */
export const carregados: string[] = [];

type Loader = () => Promise<{ default: React.ComponentType<object> }>;

export default function dynamic(loader: Loader) {
  const Lazy = React.lazy(async () => {
    const m = await loader();
    return { default: m.default };
  });
  function Dinamico(props: object) {
    // Anotado a cada render (o React.lazy guarda o módulo entre os testes do arquivo).
    carregados.push(String(loader));
    return (
      <React.Suspense fallback={null}>
        <Lazy {...props} />
      </React.Suspense>
    );
  }
  return Dinamico;
}
