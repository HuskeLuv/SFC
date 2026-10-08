/**
 * Cache em memória com TTL E limite de chaves (LRU) — Bloco D da Análise de Ativos.
 *
 * O getTtlCache (simpleTtlCache.ts) não tem limite de tamanho: serve a chaves de universo pequeno
 * (um por usuário, um por ticker). O Raio-X (ticker × versão) e sobretudo o Comparador (conjuntos
 * de até 4 tickers: as combinações são muitas) precisam de teto, senão uma varredura de URLs
 * distintas cresce o processo sem limite.
 *
 * Funcionamento: um Map por namespace (ordem de inserção = ordem de uso). `get` de uma chave válida
 * a reinsere no fim (mais recente); `set` acima de maxKeys apaga a mais antiga; entrada vencida é
 * apagada no `get`. Nunca passa de maxKeys.
 *
 * Usos (spec do Bloco D, fatia 0):
 *   - 'analiseAtivosRaioX'   maxKeys 400  (fatia A)
 *   - 'analiseComparador'    maxKeys 300  (fatia C)
 *   - 'analiseCenariosBase'  maxKeys 400  (fatia B)
 * Os limites ficam em LIMITES_CACHE_BLOCO_D para as três fatias usarem o mesmo número.
 */

interface Entrada<T> {
  valor: T;
  expiraEm: number;
}

interface Store {
  maxKeys: number;
  mapa: Map<string, Entrada<unknown>>;
}

const stores = new Map<string, Store>();

export const LIMITES_CACHE_BLOCO_D = {
  analiseAtivosRaioX: 400,
  analiseComparador: 300,
  analiseCenariosBase: 400,
} as const;

export interface BoundedTtlCache<T> {
  get(chave: string): T | undefined;
  set(chave: string, valor: T, ttlMs: number): void;
  del(chave: string): void;
  /** Quantidade de chaves guardadas agora (inclui vencidas ainda não lidas). */
  tamanho(): number;
  /** Esvazia o namespace (testes, recálculo do Quadro). */
  limpar(): void;
}

/**
 * Devolve o cache do namespace. A 1ª chamada fixa o maxKeys; chamadas seguintes com outro valor
 * passam a usar o novo teto (e cortam o excesso no próximo set).
 */
export function getBoundedTtlCache<T>(
  namespace: string,
  opcoes: { maxKeys: number },
): BoundedTtlCache<T> {
  if (!Number.isInteger(opcoes.maxKeys) || opcoes.maxKeys < 1) {
    throw new Error(`maxKeys inválido para o cache ${namespace}: ${opcoes.maxKeys}`);
  }
  let store = stores.get(namespace);
  if (!store) {
    store = { maxKeys: opcoes.maxKeys, mapa: new Map() };
    stores.set(namespace, store);
  } else {
    store.maxKeys = opcoes.maxKeys;
  }
  const s = store;

  return {
    get(chave) {
      const e = s.mapa.get(chave) as Entrada<T> | undefined;
      if (!e) return undefined;
      if (Date.now() > e.expiraEm) {
        s.mapa.delete(chave);
        return undefined;
      }
      // LRU: a chave usada vai para o fim (mais recente)
      s.mapa.delete(chave);
      s.mapa.set(chave, e);
      return e.valor;
    },
    set(chave, valor, ttlMs) {
      s.mapa.delete(chave);
      s.mapa.set(chave, { valor, expiraEm: Date.now() + ttlMs });
      while (s.mapa.size > s.maxKeys) {
        const maisAntiga = s.mapa.keys().next().value as string;
        s.mapa.delete(maisAntiga);
      }
    },
    del(chave) {
      s.mapa.delete(chave);
    },
    tamanho() {
      return s.mapa.size;
    },
    limpar() {
      s.mapa.clear();
    },
  };
}
