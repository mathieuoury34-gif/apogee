// Accès minimal à IndexedDB : une table d'enregistrements (`collection/id` → valeur) et une table de métadonnées.
// IndexedDB plutôt que localStorage : les séries cardio d'une saison dépassent vite les ~5 Mo de localStorage.
const DB = 'quadra';
const OLD_DB = 'ironapp'; // ancien nom de la base : reprise unique, la base d'origine n'est jamais supprimée
const VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    let created = false;
    req.onupgradeneeded = () => {
      created = true;
      const db = req.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => {
      const db = req.result;
      if (created) importOld(db).then(() => resolve(db), () => resolve(db));
      else resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

/** Première ouverture de la base « quadra » : recopie les données de l'ancienne base « ironapp » si elle existe. */
async function importOld(db: IDBDatabase): Promise<void> {
  const idb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
  if (idb.databases) {
    const list = await idb.databases();
    if (!list.some((d) => d.name === OLD_DB)) return;
  }
  const old = await new Promise<IDBDatabase | null>((resolve) => {
    const r = indexedDB.open(OLD_DB);
    // Si la base n'existait pas, on annule la création : elle ne doit pas apparaître.
    r.onupgradeneeded = () => { r.transaction?.abort(); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
  if (!old) return;
  try {
    if (!old.objectStoreNames.contains('records') || !old.objectStoreNames.contains('meta')) return;
    const grab = (name: string) => new Promise<[IDBValidKey[], unknown[]]>((resolve, reject) => {
      const st = old.transaction(name, 'readonly').objectStore(name);
      const k = st.getAllKeys();
      const v = st.getAll();
      v.onsuccess = () => resolve([k.result, v.result]);
      v.onerror = () => reject(v.error);
    });
    const [rk, rv] = await grab('records');
    const [mk, mv] = await grab('meta');
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['records', 'meta'], 'readwrite');
      rk.forEach((k, i) => tx.objectStore('records').put(rv[i], k));
      mk.forEach((k, i) => tx.objectStore('meta').put(mv[i], k));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    old.close();
  }
}

export async function readAll(): Promise<{ key: string; value: unknown }[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const store = tx.objectStore('records');
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    tx.oncomplete = () => resolve((keysReq.result as string[]).map((key, i) => ({ key, value: valsReq.result[i] })));
    tx.onerror = () => reject(tx.error);
  });
}

export async function writeMany(puts: [string, unknown][], deletes: string[] = []): Promise<void> {
  if (!puts.length && !deletes.length) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    for (const [k, v] of puts) store.put(v, k);
    for (const k of deletes) store.delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearRecords(): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['records', 'meta'], 'readwrite');
    tx.objectStore('records').clear();
    tx.objectStore('meta').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta', 'readonly').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
