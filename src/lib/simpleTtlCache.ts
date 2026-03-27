type CacheEntry<T> = { value: T; expiresAt: number };

const stores = new Map<string, Map<string, CacheEntry<unknown>>>();

const getStore = (namespace: string): Map<string, CacheEntry<unknown>> => {
  let s = stores.get(namespace);
  if (!s) {
    s = new Map();
    stores.set(namespace, s);
  }
  return s;
};

export const getTtlCache = <T>(namespace: string) => {
  const store = getStore(namespace);

  const get = (key: string): T | undefined => {
    const row = store.get(key) as CacheEntry<T> | undefined;
    if (!row) return undefined;
    if (Date.now() > row.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return row.value;
  };

  const set = (key: string, value: T, ttlMs: number): void => {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  };

  const del = (key: string): void => {
    store.delete(key);
  };

  return { get, set, del };
};

/** Remove entradas cujo prefixo de chave coincide (ex.: invalidar cache do usuário). */
export const deleteTtlCacheKeyPrefix = (namespace: string, keyPrefix: string): void => {
  const store = stores.get(namespace);
  if (!store) return;
  for (const key of [...store.keys()]) {
    if (key.startsWith(keyPrefix)) {
      store.delete(key);
    }
  }
};
