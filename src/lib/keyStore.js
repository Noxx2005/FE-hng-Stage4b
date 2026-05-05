import { openDB } from 'idb';

const DB_NAME = 'whisperbox-keys';
const STORE_NAME = 'keys';
const DB_VERSION = 1;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function storePrivateKey(userId, cryptoKey) {
  const db = await getDB();
  await db.put(STORE_NAME, cryptoKey, `privateKey:${userId}`);
}

export async function loadPrivateKey(userId) {
  const db = await getDB();
  return db.get(STORE_NAME, `privateKey:${userId}`);
}

export async function clearPrivateKey(userId) {
  const db = await getDB();
  await db.delete(STORE_NAME, `privateKey:${userId}`);
}
