// Camada de persistência — IndexedDB puro, sem biblioteca (offline garantido,
// nada pra falhar em rede). Um "object store" por entidade, espelhando o
// modelo da especificação. Tudo aqui é Promise-based.

const DB_NAME = 'wards';
const DB_VERSION = 4; // v4: adiciona o store "vitalSigns" (sinais vitais viraram aba própria)

const STORES = [
  'patients', 'comorbidades', 'admissions', 'problemas',
  'diagnosisCategories', 'roundEntries', 'exams', 'opinions', 'planItems',
  'attachments', 'vitalSigns',
];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const nome of STORES) {
        if (!db.objectStoreNames.contains(nome)) {
          db.createObjectStore(nome, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Se uma versão nova precisar abrir (outra aba, outro momento), essa
      // conexão se fecha sozinha em vez de travar a outra aba pra sempre
      // esperando — sem isso, duas abas abertas ao mesmo tempo podem
      // travar indefinidamente numa atualização de versão do banco.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      console.warn('IndexedDB bloqueado — feche outras abas do app abertas e recarregue.');
    };
  });
  return dbPromise;
}

function uuid() {
  return crypto.randomUUID();
}

async function tx(storeNames, mode) {
  const db = await openDB();
  return db.transaction(storeNames, mode);
}

const Store = {
  async put(storeName, obj) {
    const t = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = t.objectStore(storeName).put(obj);
      req.onsuccess = () => resolve(obj);
      req.onerror = () => reject(req.error);
    });
  },

  async get(storeName, id) {
    const t = await tx(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const req = t.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async all(storeName) {
    const t = await tx(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const req = t.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async where(storeName, predicate) {
    const items = await Store.all(storeName);
    return items.filter(predicate);
  },

  async remove(storeName, id) {
    const t = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = t.objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};

window.WardsDB = { Store, uuid, openDB };
