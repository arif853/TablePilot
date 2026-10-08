import { openDB } from 'idb';

const DB_NAME = 'pos-offline-cache';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';
const STORE_QUEUE = 'order_queue';

async function getDb() {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_CACHE)) {
                db.createObjectStore(STORE_CACHE);
            }
            if (!db.objectStoreNames.contains(STORE_QUEUE)) {
                db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
            }
        },
    });
}

export async function cachePosData(key, payload) {
    const db = await getDb();
    await db.put(STORE_CACHE, {
        data: payload,
        cachedAt: new Date().toISOString(),
    }, key);
}

export async function getCachedPosData(key) {
    const db = await getDb();
    const value = await db.get(STORE_CACHE, key);
    return value?.data ?? null;
}

export async function queueOfflineOrder(payload) {
    const db = await getDb();
    await db.put(STORE_QUEUE, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        payload,
        createdAt: new Date().toISOString(),
    });
}

export async function listQueuedOrders() {
    const db = await getDb();
    return db.getAll(STORE_QUEUE);
}

export async function removeQueuedOrder(id) {
    const db = await getDb();
    await db.delete(STORE_QUEUE, id);
}

export async function syncQueuedOrders(createOrderFn) {
    if (!navigator.onLine) return { synced: 0, failed: 0 };

    const queued = await listQueuedOrders();
    let synced = 0;
    let failed = 0;

    for (const item of queued) {
        try {
            await createOrderFn(item.payload);
            await removeQueuedOrder(item.id);
            synced += 1;
        } catch {
            failed += 1;
        }
    }

    return { synced, failed };
}
