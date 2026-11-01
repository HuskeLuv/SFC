import '@testing-library/jest-dom/vitest';

// O BroadcastChannel do Node atravessa os workers do vitest: o clique no olho de um arquivo de teste
// mudava o ValoresOcultosProvider de outro (falha intermitente). O navegador o tem; nos testes, quem
// precisa dele põe um falso em memória (vi.stubGlobal), e vi.unstubAllGlobals volta a este valor.
Object.defineProperty(globalThis, 'BroadcastChannel', {
  value: undefined,
  writable: true,
  configurable: true,
});
