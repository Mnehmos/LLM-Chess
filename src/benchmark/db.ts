import type {
  AggregateHistorySnapshot,
  BenchmarkBatch,
  BenchmarkGameRecord,
  BenchmarkMoveRecord,
  ConditionAggregate,
  ExperimentProfile,
  Finding,
  GeneratedReport,
} from './types';

const DB_NAME = 'llm-chess-benchmark-v3';
const DB_VERSION = 1;

type StoreName =
  | 'profiles'
  | 'batches'
  | 'games'
  | 'moves'
  | 'aggregates'
  | 'reports'
  | 'findings'
  | 'aggregate_history';

interface StoreMap {
  profiles: ExperimentProfile;
  batches: BenchmarkBatch;
  games: BenchmarkGameRecord;
  moves: BenchmarkMoveRecord;
  aggregates: ConditionAggregate;
  reports: GeneratedReport;
  findings: Finding;
  aggregate_history: AggregateHistorySnapshot;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('profiles')) {
          db.createObjectStore('profiles', { keyPath: 'profileId' });
        }
        if (!db.objectStoreNames.contains('batches')) {
          db.createObjectStore('batches', { keyPath: 'batchId' });
        }
        if (!db.objectStoreNames.contains('games')) {
          const store = db.createObjectStore('games', { keyPath: 'benchmarkGameId' });
          store.createIndex('profileId', 'profileId', { unique: false });
          store.createIndex('conditionId', 'profileId', { unique: false });
        }
        if (!db.objectStoreNames.contains('moves')) {
          const store = db.createObjectStore('moves', { keyPath: 'benchmarkMoveId' });
          store.createIndex('benchmarkGameId', 'benchmarkGameId', { unique: false });
          store.createIndex('profileId', 'profileId', { unique: false });
        }
        if (!db.objectStoreNames.contains('aggregates')) {
          db.createObjectStore('aggregates', { keyPath: 'conditionId' });
        }
        if (!db.objectStoreNames.contains('reports')) {
          const store = db.createObjectStore('reports', { keyPath: 'reportId' });
          store.createIndex('type', 'type', { unique: false });
        }
        if (!db.objectStoreNames.contains('findings')) {
          db.createObjectStore('findings', { keyPath: 'findingId' });
        }
        if (!db.objectStoreNames.contains('aggregate_history')) {
          const store = db.createObjectStore('aggregate_history', { keyPath: 'snapshotId' });
          store.createIndex('conditionId', 'conditionId', { unique: false });
          store.createIndex('batchFamilyId', 'batchFamilyId', { unique: false });
        }
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to open benchmark database.'));
      request.onsuccess = () => resolve(request.result);
    });
  }
  return dbPromise;
}

function runTransaction<T>(
  storeNames: StoreName[],
  mode: IDBTransactionMode,
  executor: (tx: IDBTransaction, stores: { [K in StoreName]?: IDBObjectStore }) => Promise<T>,
): Promise<T> {
  return openDb().then((db) => {
    const tx = db.transaction(storeNames, mode);
    const stores: { [K in StoreName]?: IDBObjectStore } = {};
    for (const name of storeNames) {
      stores[name] = tx.objectStore(name);
    }
    return executor(tx, stores);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

export const benchmarkDb = {
  async getAll<K extends StoreName>(storeName: K): Promise<StoreMap[K][]> {
    return runTransaction([storeName], 'readonly', async (_tx, stores) =>
      requestToPromise(stores[storeName]!.getAll()) as Promise<StoreMap[K][]>,
    );
  },

  async put<K extends StoreName>(storeName: K, value: StoreMap[K]): Promise<void> {
    await runTransaction([storeName], 'readwrite', async (tx, stores) => {
      stores[storeName]!.put(value);
      await txDone(tx);
    });
  },

  async bulkPut<K extends StoreName>(storeName: K, values: StoreMap[K][]): Promise<void> {
    if (values.length === 0) return;
    await runTransaction([storeName], 'readwrite', async (tx, stores) => {
      for (const value of values) {
        stores[storeName]!.put(value);
      }
      await txDone(tx);
    });
  },

  async clearStore(storeName: StoreName): Promise<void> {
    await runTransaction([storeName], 'readwrite', async (tx, stores) => {
      stores[storeName]!.clear();
      await txDone(tx);
    });
  },

  async clearAll(): Promise<void> {
    await runTransaction(
      ['profiles', 'batches', 'games', 'moves', 'aggregates', 'reports', 'findings', 'aggregate_history'],
      'readwrite',
      async (tx, stores) => {
        for (const store of Object.values(stores)) {
          store?.clear();
        }
        await txDone(tx);
      },
    );
  },
};
